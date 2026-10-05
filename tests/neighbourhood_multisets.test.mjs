import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph } from '../src/kernel/graph.js';
import { buildTopologyModel } from '../src/kernel/topology.js';
import { neighbourhoodComparison, neighbourhoodColour } from '../src/ui/neighbourhood-colours.js';

// Independent reachability from raw undirected edges; never read topology.N.
function oracle(raw, mode, statistic) {
  const ids = raw.nodes.map(node => node.id), degree = ids.map(() => 0);
  const adjacent = ids.map(() => new Set());
  for (const edge of raw.edges) {
    const u = ids.indexOf(edge.source), v = ids.indexOf(edge.target);
    degree[u]++; degree[v]++; adjacent[u].add(v); adjacent[v].add(u);
  }
  if (statistic === 'distinct-neighbours') adjacent.forEach((row, i) => { degree[i] = row.size; });
  return ids.map((_, origin) => {
    const reached = new Set([origin]), queue = [origin];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const from = queue[cursor];
      for (const to of adjacent[from]) {
        const allowed = mode === 'strict' ? degree[to] > degree[from]
          : mode === 'weak-patch' ? degree[to] === degree[from] : degree[to] >= degree[from];
        if (allowed && !reached.has(to)) { reached.add(to); queue.push(to); }
      }
    }
    return ids.map((_, i) => Number(reached.has(i)));
  });
}

function compare(raw, mode, statistic, selected) {
  const graph = validateGraph(raw).graph, model = buildTopologyModel(graph, mode, statistic);
  const expected = oracle(raw, mode, statistic), before = model.topo.N.map(mask => [...mask]);
  const comparison = neighbourhoodComparison(graph, model.topo, selected);
  const anchors = [...new Set(selected)].filter(id => graph.index.has(id)).map(id => graph.index.get(id));
  assert.deepEqual(comparison.anchors, anchors);
  assert.deepEqual(comparison.masks.map(mask => [...mask]), anchors.map(origin => expected[origin]));
  for (let vertex = 0; vertex < graph.nodes.length; vertex++) {
    const starts = anchors.flatMap((origin, start) => expected[origin][vertex] ? [start] : []);
    assert.deepEqual(comparison.memberships[vertex], starts);
    assert.equal(comparison.union[vertex], Number(starts.length > 0));
    assert.equal(comparison.shared[vertex], Number(starts.length > 1));
    assert.equal(comparison.regions[vertex] === 'outside', starts.length === 0);
  }
  assert.equal(new Set(comparison.colours).size, anchors.length);
  assert.deepEqual(model.topo.N.map(mask => [...mask]), before, 'Presentation mutated a kernel set');
  return comparison;
}

const star = {
  nodes: ['c', 'a', 'b', 'd', 'e', 'island'].map(id => ({ id })),
  edges: ['a', 'b', 'd', 'e'].map((source, i) => ({ id: `e${i}`, source, target: 'c' })),
};

test('one and two starts retain wine/turquoise/purple pair regions', () => {
  const one = compare(star, 'uphill', 'incident-edges', ['a']);
  assert.deepEqual(one.colours, ['#86264f']);
  assert.deepEqual(one.regions, ['first', 'first', 'outside', 'outside', 'outside', 'outside']);
  const two = compare(star, 'uphill', 'incident-edges', ['a', 'b']);
  assert.deepEqual(two.colours, ['#86264f', '#147f87']);
  assert.deepEqual(two.regions, ['intersection', 'first', 'second', 'outside', 'outside', 'outside']);
});

test('three through six starts keep every set, overlaps and an isolated start', () => {
  for (const mode of ['uphill', 'strict', 'weak-patch']) for (const count of [3, 4, 5, 6]) {
    const selected = ['a', 'b', 'd', 'e', 'island', 'c'].slice(0, count);
    const result = compare(star, mode, 'incident-edges', selected);
    assert.equal(result.anchors.length, count);
    assert.equal(result.colours[2], '#2563eb'); // Third start stays distinct from wine/pink.
    assert.deepEqual(result.memberships[0], mode === 'weak-patch' ? count === 6 ? [5] : [] : selected.flatMap((id, i) => id === 'island' ? [] : [i]));
  }
});

test('removing and readding a middle start recomputes all memberships in selection order', () => {
  const selected = new Set(['a', 'b', 'd', 'island']);
  compare(star, 'uphill', 'incident-edges', selected);
  selected.delete('b');
  const removed = compare(star, 'uphill', 'incident-edges', selected);
  assert.deepEqual(removed.memberships[0], [0, 1]);
  selected.add('b');
  const restored = compare(star, 'uphill', 'incident-edges', selected);
  assert.deepEqual(restored.memberships[0], [0, 1, 3]);
});

test('parallel edges and the selected statistic govern every displayed neighbourhood', () => {
  const raw = { kind: 'loopless-multigraph', nodes: ['a', 'b', 'c', 'd'].map(id => ({ id })),
    edges: [['a', 'b'], ['a', 'b'], ['b', 'c'], ['c', 'd']].map(([source, target], i) => ({ id: `e${i}`, source, target })) };
  for (const mode of ['uphill', 'strict', 'weak-patch']) for (const statistic of ['incident-edges', 'distinct-neighbours']) {
    compare(raw, mode, statistic, ['d', 'a', 'b', 'c']);
  }
});

test('every four-vertex simple graph and selection matches independent memberships in all modes', () => {
  const ids = ['a', 'b', 'c', 'd'], pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  for (let edges = 0; edges < 64; edges++) {
    const raw = { nodes: ids.map(id => ({ id })), edges: pairs.flatMap(([source, target], i) => edges & 1 << i ? [{ id: `e${i}`, source, target }] : []) };
    for (const mode of ['uphill', 'strict', 'weak-patch']) for (let selection = 0; selection < 16; selection++) {
      compare(raw, mode, 'incident-edges', ids.filter((_, i) => selection & 1 << i).reverse());
    }
  }
});

test('large selections receive uncapped distinct keys without enumerating intersections', () => {
  const raw = { nodes: Array.from({ length: 100 }, (_, i) => ({ id: `v${i}` })), edges: [] };
  const result = compare(raw, 'weak-patch', 'incident-edges', raw.nodes.map(node => node.id));
  assert.equal(result.anchors.length, 100);
  assert.deepEqual(result.memberships[99], [99]);
  assert.equal(new Set(Array.from({ length: 500 }, (_, i) => neighbourhoodColour(i))).size, 500);
  const clean = compare(star, 'uphill', 'incident-edges', ['a', 'missing', 'a', 'b', 'd']);
  assert.equal(clean.anchors.length, 3);
});
