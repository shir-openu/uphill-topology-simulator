// Golden data extracted from the user-supplied manuscript SVG, independently
// of the preset literal. No test depends on a manuscript file being installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESET_INFO, EXTRA_PRESETS } from '../src/presets.js';
import { validateGraph } from '../src/kernel/graph.js';
import { buildTopologyModel, MODES, STATISTICS } from '../src/kernel/topology.js';

const reference = JSON.parse(readFileSync(new URL('./manuscript_reference_evidence.json', import.meta.url), 'utf8')).karate34;
const ordered = values => [...values].sort((a, b) => Number(a) - Number(b));
const edgeKey = ([a, b]) => ordered([a, b]).join(':');
const rawGraph = EXTRA_PRESETS.karate34;
const graph = validateGraph(EXTRA_PRESETS.karate34).graph;

test('manuscript figure 3 preset retains every labelled vertex, edge and drawing position', () => {
  const checked = validateGraph(EXTRA_PRESETS.karate34);
  assert.ok(checked.ok, checked.errors.join('; '));
  assert.deepEqual(checked.warnings, []);
  assert.equal(graph.nodes.length, 34);
  assert.equal(graph.edges.length, 78);
  assert.deepEqual(ordered(graph.nodes.map(n => n.id)), ordered(reference.nodes));
  assert.deepEqual(graph.nodes.map(n => n.label), graph.nodes.map(n => n.id));
  assert.deepEqual(rawGraph.edges.map(e => edgeKey([e.source, e.target])).sort(), reference.edges.map(edgeKey).sort());
  assert.equal(new Set(rawGraph.edges.map(e => edgeKey([e.source, e.target]))).size, 78);
  assert.deepEqual(PRESET_INFO.find(([id]) => id === 'karate34')[2], reference.layout);
});

test('karate-club degrees match all 34 independently labelled manuscript degrees', () => {
  const counted = Object.fromEntries(reference.nodes.map(id => [id, 0]));
  for (const e of rawGraph.edges) { counted[e.source]++; counted[e.target]++; }
  assert.deepEqual(counted, reference.expectedDegrees);
  assert.equal(Object.values(counted).reduce((a, b) => a + b, 0), 156);
  for (const statistic of STATISTICS) {
    const model = buildTopologyModel(graph, 'uphill', statistic);
    assert.deepEqual(Object.fromEntries(graph.nodes.map((n, i) => [n.id, model.degree[i]])), reference.expectedDegrees);
  }
});

test('karate-club neighbourhoods match direct adjacency walks in all three modes and both statistics', () => {
  const adjacent = Object.fromEntries(reference.nodes.map(id => [id, []]));
  for (const [a, b] of reference.edges) { adjacent[a].push(b); adjacent[b].push(a); }
  const degree = Object.fromEntries(reference.nodes.map(id => [id, adjacent[id].length]));
  for (const mode of MODES) for (const statistic of STATISTICS) {
    const model = buildTopologyModel(graph, mode, statistic);
    for (const source of reference.nodes) {
      const reached = new Set([source]), queue = [source];
      for (let head = 0; head < queue.length; head++) {
        const from = queue[head];
        for (const to of adjacent[from]) {
          const allowed = mode === 'strict' ? degree[from] < degree[to]
            : mode === 'weak-patch' ? degree[from] === degree[to] : degree[from] <= degree[to];
          if (allowed && !reached.has(to)) { reached.add(to); queue.push(to); }
        }
      }
      const neighbourhood = model.topo.N[graph.index.get(source)];
      assert.deepEqual(ordered(model.topo.ids(neighbourhood)), ordered(reached), `${mode}/${statistic}, vertex ${source}`);
      assert.ok(model.topo.isOpen(neighbourhood));
    }
  }
});

test('manuscript figure 3 selected open set reproduces its 26 boundary vertices and seven exterior vertices', () => {
  for (const statistic of STATISTICS) {
    const { topo } = buildTopologyModel(graph, 'uphill', statistic);
    const chosen = topo.setFromIds(reference.uphillOpen), analysis = topo.analyze(chosen);
    assert.ok(topo.isOpen(chosen));
    assert.deepEqual(ordered(topo.ids(analysis.interior)), ['34']);
    assert.deepEqual(ordered(topo.ids(analysis.boundary)), ordered(reference.uphillBoundary));
    assert.deepEqual(ordered(topo.ids(analysis.exterior)), ordered(reference.uphillExterior));
    assert.equal(topo.ids(analysis.closure).length, 27);
    assert.equal(topo.ids(analysis.boundary).length, 26);
  }
});
