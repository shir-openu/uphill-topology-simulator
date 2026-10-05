import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXTRA_PRESETS, PRESET_INFO } from '../src/presets.js';
import { validateGraph, graphToJSON } from '../src/kernel/graph.js';
import { buildTopologyModel } from '../src/kernel/topology.js';
import { degreeRowLayout } from '../src/ui/degree-layout.js';

const fixtures = JSON.parse(readFileSync(new URL('../fixtures/acceptance_fixtures_spec_v1.json', import.meta.url), 'utf8'));
function graphFor(id) {
  const graph = validateGraph(EXTRA_PRESETS[id] || fixtures.fixtures.find(fixture => fixture.id === id).graph).graph;
  const positions = PRESET_INFO.find(([key]) => key === id)?.[2];
  if (positions) graph.layout = Object.fromEntries(Object.entries(positions).map(([key, [x, y]]) => [key, { x, y }]));
  return graph;
}

function checkRows(graph, model, expectedDegree) {
  assert.deepEqual(Object.fromEntries(graph.nodes.map((node, i) => [node.id, model.degree[i]])), expectedDegree);
  const beforeGraph = graphToJSON(graph), beforeDegree = [...model.degree];
  const beforeNeighbourhoods = model.topo.N.map(mask => [...mask]);
  const layout = degreeRowLayout(graph, model.degree);
  assert.deepEqual(Object.keys(layout).sort(), graph.nodes.map(node => node.id).sort());
  const nodes = graph.nodes;
  for (let i = 0; i < nodes.length; i++) {
    const left = layout[nodes[i].id];
    assert.ok(Number.isFinite(left.x) && Number.isFinite(left.y));
    assert.notEqual(left, graph.layout[nodes[i].id], 'Coordinates must be newly allocated');
    for (let j = i + 1; j < nodes.length; j++) {
      const right = layout[nodes[j].id];
      assert.ok(Math.hypot(left.x - right.x, left.y - right.y) >= 119.99, 'Vertex discs and degree labels have room');
      if (model.degree[i] === model.degree[j]) {
        assert.equal(left.y, right.y, 'Equal degrees share a row');
        const oldLeft = graph.layout[nodes[i].id], oldRight = graph.layout[nodes[j].id];
        if (oldLeft && oldRight && oldLeft.x !== oldRight.x) {
          assert.equal(Math.sign(left.x - right.x), Math.sign(oldLeft.x - oldRight.x), 'Earlier left-to-right order is retained');
        }
      } else {
        assert.equal(Math.sign(left.y - right.y), -Math.sign(model.degree[i] - model.degree[j]), 'A strictly larger degree is physically higher');
        assert.ok(Math.abs(left.y - right.y) >= 129.99, 'Distinct degree rows have vertical clearance');
      }
    }
  }
  assert.deepEqual(degreeRowLayout(graph, model.degree), layout, 'Repeated calls are deterministic');
  assert.deepEqual(graphToJSON(graph), beforeGraph, 'Drawing does not mutate graph or prior layout');
  assert.deepEqual([...model.degree], beforeDegree);
  assert.deepEqual(model.topo.N.map(mask => [...mask]), beforeNeighbourhoods, 'Every neighbourhood is preserved');
  return layout;
}

test('intro path3 rises to its middle degree-two vertex without changing either overlapping neighbourhood', () => {
  const graph = graphFor('path3'), model = buildTopologyModel(graph, 'uphill');
  const layout = checkRows(graph, model, { a: 1, b: 2, c: 1 });
  assert.deepEqual(model.topo.ids(model.topo.N[graph.index.get('a')]), ['a', 'b']);
  assert.deepEqual(model.topo.ids(model.topo.N[graph.index.get('c')]), ['b', 'c']);
  assert.equal(layout.a.y, layout.c.y);
  assert.ok(layout.a.x < layout.b.x && layout.b.x < layout.c.x, 'The high vertex is centred between the lower endpoints');
});

test('intro hard19 has five correctly ordered degree rows, readable ties and its unchanged overlapping sets', () => {
  const graph = graphFor('hard19'), model = buildTopologyModel(graph, 'uphill');
  const layout = checkRows(graph, model, { a:3,b:3,c:3,d:3,e:4,f:4,g:4,h:3,i:1,j:3,k:2,l:2,m:2,n:1,p:1,q:2,r:2,s:1,t:0 });
  assert.equal(new Set(Object.values(layout).map(position => position.y)).size, 5);
  assert.deepEqual(model.topo.ids(model.topo.N[graph.index.get('i')]), ['e', 'f', 'g', 'i']);
  assert.deepEqual(model.topo.ids(model.topo.N[graph.index.get('a')]), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  assert.ok(layout.t.y > layout.i.y, 'The isolated vertex stays visible in the bottom row');
});

test('degree rows use the chosen multigraph statistic rather than metadata or edge direction', () => {
  const graph = validateGraph({ kind: 'loopless-multigraph', nodes: ['a', 'b', 'c', 'd'].map(id => ({ id, degree: 999 })), edges: [
    { source: 'a', target: 'b' }, { source: 'a', target: 'b' }, { source: 'a', target: 'b' },
    { source: 'b', target: 'c' }, { source: 'c', target: 'd' },
  ] }).graph;
  const incident = checkRows(graph, buildTopologyModel(graph, 'uphill', 'incident-edges'), { a: 3, b: 4, c: 2, d: 1 });
  const distinct = checkRows(graph, buildTopologyModel(graph, 'uphill', 'distinct-neighbours'), { a: 1, b: 2, c: 2, d: 1 });
  assert.ok(incident.b.y < incident.a.y && incident.a.y < incident.c.y);
  assert.equal(distinct.b.y, distinct.c.y);
  assert.equal(distinct.a.y, distinct.d.y);
});

test('disconnected equal-degree rows have stable numeric ID ties and explicit prior-position ordering', () => {
  const graph = validateGraph({ nodes: ['10', 'z', '2', 'a'].map(id => ({ id })), edges: [] }).graph;
  const model = buildTopologyModel(graph);
  const layout = checkRows(graph, model, { '10': 0, z: 0, '2': 0, a: 0 });
  const leftToRight = positions => Object.keys(positions).sort((a, b) => positions[a].x - positions[b].x);
  assert.deepEqual(leftToRight(layout), ['2', '10', 'a', 'z']);
  const previous = { a: { x: 40, y: 25 }, z: { x: -20, y: 10 }, '10': { x: 40, y: 15 } };
  const before = structuredClone(previous);
  assert.deepEqual(leftToRight(degreeRowLayout(graph, model.degree, previous)), ['z', '10', 'a', '2']);
  assert.deepEqual(previous, before, 'An explicitly supplied prior layout is read only');
});

test('empty and singleton drawings remain valid, and incomplete degree data cannot create invalid positions', () => {
  const empty = validateGraph({ nodes: [], edges: [] }).graph;
  assert.deepEqual(degreeRowLayout(empty, []), {});
  const singleton = validateGraph({ nodes: [{ id: '__proto__' }], edges: [] }).graph;
  const layout = degreeRowLayout(singleton, new Uint32Array([0]));
  assert.equal(Object.keys(layout).length, 1);
  assert.deepEqual(layout.__proto__, { x: 300, y: 180 });
  for (const invalid of [[], [NaN], [-1], [0.5], [0, 1]]) {
    assert.throws(() => degreeRowLayout(singleton, invalid), /one non-negative integer/);
  }
});
