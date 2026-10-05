import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA_PRESETS } from '../src/presets.js';
import { validateGraph } from '../src/kernel/graph.js';
import { buildTopologyModel } from '../src/kernel/topology.js';
import { tourDemoAnchorIds } from '../src/ui/tour-adapter.js';

test('the complex preset starts with three distinct overlapping neighbourhoods instead of the isolated vertex', () => {
  const graph = validateGraph(EXTRA_PRESETS.hard19).graph;
  const model = buildTopologyModel(graph, 'uphill');
  const anchors = tourDemoAnchorIds(graph, model);
  assert.deepEqual(anchors, ['i', 'a', 'n']);
  const sets = anchors.map(id => new Set(graph.nodes.filter((_, i) => model.topo.N[graph.index.get(id)][i]).map(node => node.id)));
  assert.deepEqual([...sets[0]].filter(id => sets.every(set => set.has(id))).sort(), ['e', 'f', 'g']);
  for (let i = 0; i < sets.length; i++) {
    assert.ok([...sets[i]].some(id => sets.every((other, j) => i === j || !other.has(id))), 'Each chosen neighbourhood has its own visible region');
  }
});

test('intro anchors are existing unique vertices in every finite mode, including equal and disjoint neighbourhoods', () => {
  const graph = validateGraph(EXTRA_PRESETS.hard19).graph;
  for (const mode of ['uphill', 'strict', 'weak-patch']) {
    const anchors = tourDemoAnchorIds(graph, buildTopologyModel(graph, mode));
    assert.equal(anchors.length, 3);
    assert.equal(new Set(anchors).size, 3);
    assert.ok(anchors.every(id => graph.index.has(id)));
    assert.notEqual(anchors[0], 't', 'The isolated vertex should not obscure the connected example');
  }
});

test('small and empty graphs keep valid introductory choices', () => {
  for (const nodes of [[], ['z'], ['a', 'b'], ['a', 'b', 'c']]) {
    const graph = validateGraph({ kind: 'simple-undirected', nodes: nodes.map(id => ({ id })), edges: [] }).graph;
    assert.deepEqual(tourDemoAnchorIds(graph, buildTopologyModel(graph)), nodes);
  }
  const graph = validateGraph({ kind: 'simple-undirected', nodes: ['a', 'b', 'c'].map(id => ({ id })), edges: [
    { id: 'ab', source: 'a', target: 'b' }, { id: 'bc', source: 'b', target: 'c' },
  ] }).graph;
  assert.deepEqual(tourDemoAnchorIds(graph, buildTopologyModel(graph, 'strict')), ['a', 'c', 'b']);
});
