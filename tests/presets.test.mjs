// Hand-derived examples for the neighbourhood comparison playgrounds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESET_INFO, EXTRA_PRESETS } from '../src/presets.js';
import { validateGraph } from '../src/kernel/graph.js';
import { buildTopologyModel, STATISTICS } from '../src/kernel/topology.js';
import { enumerateOpens } from '../src/kernel/enumeration.js';

const examples = {
  hard19: {
    degree: { a:3,b:3,c:3,d:3,e:4,f:4,g:4,h:3,i:1,j:3,k:2,l:2,m:2,n:1,p:1,q:2,r:2,s:1,t:0 },
    uphill: { i:['e','f','g','i'], a:['a','b','c','d','e','f','g','h'], k:['e','f','g','j','k','l'], p:['p','q','r'], t:['t'] },
    strict: { i:['e','i'], a:['a','e'], h:['e','g','h'], k:['f','j','k'], p:['p','q'], t:['t'] },
    'weak-patch': { a:['a','b','c','d','h'], e:['e','f','g'], k:['k','l'], q:['q','r'], i:['i'], t:['t'] },
  },
  clb7: {
    degree: { a:2,b:2,c:3,d:3,e:2,f:1,g:1 },
    uphill: { a:['a','b','c','d'], f:['c','d','e','f'], g:['c','d','g'] },
    strict: { a:['a','c'], f:['d','e','f'], g:['d','g'] },
    'weak-patch': { a:['a','b'], c:['c','d'], e:['e'], f:['f'], g:['g'] },
  },
  cube11: {
    degree: { a: 6, b: 5, c: 4, d: 3, e: 3, f: 3, g: 3, h: 3, x: 1, y: 2, z: 3 },
    uphill: { x: ['a', 'x'], y: ['a', 'b', 'y'], z: ['a', 'b', 'c', 'z'] },
    strict: { x: ['a', 'x'], y: ['a', 'b', 'y'], z: ['a', 'b', 'c', 'z'] },
    'weak-patch': { x: ['x'], y: ['y'], z: ['z'], d: ['d', 'e', 'f', 'g', 'h'] },
  },
  overlap5: {
    degree: { a: 4, b: 2, c: 3, d: 2, e: 1 },
    uphill: { b: ['a', 'b', 'c'], d: ['a', 'c', 'd'] },
    strict: { b: ['a', 'b', 'c'], d: ['a', 'c', 'd'] },
    'weak-patch': { b: ['b'], d: ['d'] },
  },
  star5: {
    degree: { c: 4, a: 1, b: 1, d: 1, e: 1 },
    uphill: { a: ['a', 'c'], b: ['b', 'c'] },
    strict: { a: ['a', 'c'], b: ['b', 'c'] },
    'weak-patch': { a: ['a'], b: ['b'] },
  },
  path6: {
    degree: { a: 1, b: 2, c: 2, d: 2, e: 2, f: 1 },
    uphill: { a: ['a', 'b', 'c', 'd', 'e'], f: ['b', 'c', 'd', 'e', 'f'] },
    strict: { a: ['a', 'b'], f: ['e', 'f'] },
    'weak-patch': { a: ['a'], f: ['f'], b: ['b', 'c', 'd', 'e'] },
  },
  diamond8: {
    degree: { a: 2, b: 3, c: 3, d: 4, p: 1, q: 1, e: 1, f: 1 },
    uphill: { b: ['b', 'd'], c: ['c', 'd'], a: ['a', 'b', 'c', 'd'] },
    strict: { b: ['b', 'd'], c: ['c', 'd'], a: ['a', 'b', 'c', 'd'] },
    'weak-patch': { b: ['b'], c: ['c'], a: ['a'] },
  },
  disconnected7: {
    degree: { a: 1, b: 2, c: 1, d: 1, e: 2, f: 1, g: 0 },
    uphill: { a: ['a', 'b'], d: ['d', 'e'], g: ['g'] },
    strict: { a: ['a', 'b'], d: ['d', 'e'], g: ['g'] },
    'weak-patch': { a: ['a'], d: ['d'], g: ['g'] },
  },
  bowtie5: {
    degree: { a: 2, b: 2, c: 4, d: 2, e: 2 },
    uphill: { a: ['a', 'b', 'c'], d: ['c', 'd', 'e'] },
    strict: { a: ['a', 'c'], d: ['c', 'd'] },
    'weak-patch': { a: ['a', 'b'], d: ['d', 'e'] },
  },
};

test('Claude hard19 finite example retains its independently checked 370 uphill opens', () => {
  const graph = validateGraph(EXTRA_PRESETS.hard19).graph;
  assert.equal(graph.nodes.length, 19);
  assert.equal(graph.edges.length, 22);
  const model = buildTopologyModel(graph, 'uphill', 'incident-edges');
  assert.equal(model.topo.k, 11);
  assert.equal(enumerateOpens(model.topo).count.value, 370n);
  assert.deepEqual(model.topo.ids(model.topo.analyze(model.topo.setFromIds(['k'])).closure).sort(), ['k','l']);
  assert.deepEqual(model.topo.ids(model.topo.analyze(model.topo.setFromIds(['a','b','c','d','e','f','g'])).interior).sort(), ['e','f','g']);
});

test('playground presets extend every original fixture without duplicate IDs', () => {
  const original = JSON.parse(readFileSync(new URL('../fixtures/acceptance_fixtures_spec_v1.json', import.meta.url), 'utf8'));
  const ids = PRESET_INFO.map(([id]) => id);
  assert.equal(new Set(ids).size, ids.length);
  for (const fixture of original.fixtures) assert.ok(ids.includes(fixture.id), fixture.id);
  assert.deepEqual(Object.keys(EXTRA_PRESETS).sort(), [...Object.keys(examples), 'karate34'].sort());
  for (const id of Object.keys(EXTRA_PRESETS)) {
    assert.ok(ids.includes(id), id);
    assert.ok(!original.fixtures.some(f => f.id === id), `fixture ${id} is not overwritten`);
  }
});

for (const [id, expected] of Object.entries(examples)) {
  test(`playground ${id}: illustrative neighbourhoods in every topology and statistic`, () => {
    const result = validateGraph(EXTRA_PRESETS[id]);
    assert.ok(result.ok, result.errors.join('; '));
    assert.deepEqual(result.warnings, []);
    const graph = result.graph;
    const layout = PRESET_INFO.find(([key]) => key === id)[2];
    assert.deepEqual(Object.keys(layout).sort(), graph.nodes.map(n => n.id).sort());
    const positions = Object.values(layout);
    for (let i = 0; i < positions.length; i++) {
      assert.ok(positions[i].every(Number.isFinite));
      for (let j = i + 1; j < positions.length; j++) {
        assert.ok(Math.hypot(positions[i][0] - positions[j][0], positions[i][1] - positions[j][1]) >= 90, `${id}: readable initial vertex spacing`);
      }
    }
    for (const statistic of STATISTICS) {
      for (const mode of ['uphill', 'strict', 'weak-patch']) {
        const model = buildTopologyModel(graph, mode, statistic);
        assert.deepEqual(Object.fromEntries(graph.nodes.map((p, i) => [p.id, model.degree[i]])), expected.degree);
        for (const [point, ids] of Object.entries(expected[mode])) {
          const neighbourhood = model.topo.N[graph.index.get(point)];
          assert.deepEqual(model.topo.ids(neighbourhood).sort(), ids, `${id} ${mode}/${statistic} N(${point})`);
          assert.ok(model.topo.isOpen(neighbourhood));
        }
      }
    }
  });
}
