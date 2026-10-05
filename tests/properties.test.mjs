// Structural properties, comparisons, validation, BigInt and round trips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateGraph, parseEdgeList, graphToJSON } from '../src/kernel/graph.js';
import { buildTopologyModel, compareTopologies, openWitness, closureWitness, restrictTopology,
  members, setOf, subset, equal } from '../src/kernel/topology.js';
import { enumerateOpens, countUpsets, Budget } from '../src/kernel/enumeration.js';
import { exportExperiment, importExperiment } from '../src/kernel/serialization.js';

const F = JSON.parse(readFileSync(new URL('../fixtures/acceptance_fixtures_spec_v1.json', import.meta.url), 'utf8'));
const fx = id => validateGraph(F.fixtures.find(f => f.id === id).graph).graph;
const ids = (T, s) => T.ids(s).sort();

let seed = 7;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
function randomGraph(n, p) {
  const nodes = [], edges = [];
  for (let i = 0; i < n; i++) nodes.push({ id: 'v' + i });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < p) edges.push({ id: `e${edges.length}`, source: 'v' + i, target: 'v' + j });
  return validateGraph({ nodes, edges }).graph;
}

test('Kuratowski laws on random graphs (n = 6..9), all three modes', () => {
  for (let t = 0; t < 60; t++) {
    const G = randomGraph(6 + (t % 4), 0.35);
    for (const mode of ['uphill', 'strict', 'weak-patch']) {
      const T = buildTopologyModel(G, mode).topo, n = T.n;
      for (let x = 0; x < n; x++) assert.equal(T.N[x][x], 1);
      for (let r = 0; r < 12; r++) {
        const A = setOf(n, [...Array(n).keys()].filter(() => rnd() < 0.4));
        const a = T.analyze(A), comp = A.map(v => 1 - v), ac = T.analyze(comp);
        assert.ok(subset(a.interior, A) && subset(A, a.closure));
        assert.ok(equal(T.analyze(a.interior).interior, a.interior));
        assert.ok(equal(T.analyze(a.closure).closure, a.closure));
        assert.ok(equal(a.interior, ac.closure.map(v => 1 - v)));
        assert.ok(equal(a.boundary, a.closure.map((v, i) => v && ac.closure[i] ? 1 : 0)));
        // partition: interior, boundary, exterior
        for (let i = 0; i < n; i++) assert.equal(a.interior[i] + a.boundary[i] + a.exterior[i], 1);
        assert.ok(T.isOpen(a.enlarge) && subset(A, a.enlarge));
      }
    }
  }
});

test('uphill in strict and in weak patch; neighbourhood test = family inclusion', () => {
  for (let t = 0; t < 40; t++) {
    const G = randomGraph(5 + (t % 3), 0.4);
    const U = buildTopologyModel(G, 'uphill').topo, S = buildTopologyModel(G, 'strict').topo, W = buildTopologyModel(G, 'weak-patch').topo;
    assert.ok(compareTopologies(U, S).firstInSecond);
    assert.ok(compareTopologies(U, W).firstInSecond);
    for (const [X, Y] of [[S, W], [W, S], [U, S], [S, U]]) {
      const fam = T => new Set(enumerateOpens(T).opens.map(o => members(o).join(',')));
      const fx_ = fam(X), fy = fam(Y);
      const byFamily = [...fx_].every(o => fy.has(o));
      assert.equal(compareTopologies(X, Y).firstInSecond, byFamily);
    }
  }
});

test('square: strict and weak patch are incomparable, witnesses {a} and {b}', () => {
  const G = fx('square_diagonal');
  const S = buildTopologyModel(G, 'strict').topo, W = buildTopologyModel(G, 'weak-patch').topo;
  const c = compareTopologies(S, W);
  assert.equal(c.firstInSecond, false); assert.equal(c.secondInFirst, false);
  assert.ok(S.isOpen(S.setFromIds(['a'])) && !W.isOpen(W.setFromIds(['a'])));
  assert.ok(W.isOpen(W.setFromIds(['b'])) && !S.isOpen(S.setFromIds(['b'])));
});

test('square, A = {a}: witness arc a->c, O(A) = {a,c}, closure V', () => {
  const G = fx('square_diagonal'), M = buildTopologyModel(G, 'uphill'), T = M.topo;
  const A = T.setFromIds(['a']), w = openWitness(M, A);
  assert.equal(w.kind, 'arc');
  assert.deepEqual([G.nodes[w.from].id, G.nodes[w.to].id], ['a', 'c']);
  const r = T.analyze(A);
  assert.deepEqual(ids(T, r.enlarge), ['a', 'c']);
  assert.deepEqual(ids(T, r.closure), ['a', 'b', 'c', 'd']);
  assert.equal(enumerateOpens(T).listedCount, 5);
  const cw = closureWitness(M, G.index.get('b'), A);
  assert.equal(cw.kind, 'path');
  assert.equal(G.nodes[cw.path[0]].id, 'b'); assert.equal(G.nodes[cw.path.at(-1)].id, 'a');
});

test('disjoint union: open counts multiply; relabelling permutes nothing essential', () => {
  for (let t = 0; t < 20; t++) {
    const A = randomGraph(4, 0.5), B = randomGraph(5, 0.4);
    const nodes = [...A.nodes.map(p => ({ id: 'A' + p.id })), ...B.nodes.map(p => ({ id: 'B' + p.id }))];
    const edges = [...A.edges.map(e => ({ source: 'A' + A.nodes[e.u].id, target: 'A' + A.nodes[e.v].id })),
      ...B.edges.map(e => ({ source: 'B' + B.nodes[e.u].id, target: 'B' + B.nodes[e.v].id }))];
    const U = validateGraph({ nodes, edges }).graph;
    for (const mode of ['uphill', 'strict', 'weak-patch']) {
      const c = G => countUpsets(buildTopologyModel(G, mode).topo.k, buildTopologyModel(G, mode).topo.up, buildTopologyModel(G, mode).topo.down, new Budget()).value;
      assert.equal(c(U), c(A) * c(B));
      // relabel: reverse the IDs
      const rev = validateGraph({ nodes: nodes.map(p => ({ id: 'z' + p.id.split('').reverse().join('') })),
        edges: edges.map(e => ({ source: 'z' + e.source.split('').reverse().join(''), target: 'z' + e.target.split('').reverse().join('') })) }).graph;
      assert.equal(c(rev), c(U));
    }
  }
});

test('connected regular graphs: base and weak patch indiscrete, strict discrete', () => {
  for (const id of ['cycle4', 'triangle3', 'edge2']) {
    const G = fx(id);
    assert.equal(buildTopologyModel(G, 'uphill').topo.k, 1);
    assert.equal(buildTopologyModel(G, 'weak-patch').topo.k, 1);
    const S = buildTopologyModel(G, 'strict').topo;
    assert.equal(countUpsets(S.k, S.up, S.down, new Budget()).value, 1n << BigInt(G.nodes.length));
  }
  const D = fx('disjoint_triangles');
  assert.equal(buildTopologyModel(D, 'uphill').topo.k, 2);
});

test('100 isolated vertices: exact 2^100 without listing, capped list labelled incomplete', () => {
  const nodes = Array.from({ length: 100 }, (_, i) => ({ id: 'i' + i }));
  const G = validateGraph({ nodes, edges: [] }).graph;
  const r = enumerateOpens(buildTopologyModel(G, 'uphill').topo);
  assert.equal(r.status, 'display-cap');
  assert.equal(r.listedCount, 4096);
  assert.equal(r.count.status, 'exact');
  assert.equal(r.count.value, 2n ** 100n);
  assert.equal(JSON.parse(JSON.stringify({ v: r.count.value.toString() })).v, '1267650600228229401496703205376');
});

test('budget interruption is a lower bound, never an exact total', () => {
  const G = randomGraph(40, 0.08);
  const T = buildTopologyModel(G, 'strict').topo;
  const r = enumerateOpens(T, { stateBudget: 50, displayLimit: 1e9 });
  assert.notEqual(r.status, 'complete');
  assert.ok(r.count.status === 'not-computed' || r.count.status === 'exact');
  if (r.count.status === 'not-computed') assert.equal(r.count.value, null);
});

test('cancellation stops enumeration', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => ({ id: 'i' + i }));
  const T = buildTopologyModel(validateGraph({ nodes, edges: [] }).graph, 'uphill').topo;
  let calls = 0;
  const r = enumerateOpens(T, { displayLimit: 1e9, isCancelled: () => ++calls > 2 });
  assert.equal(r.status, 'cancelled');
});

test('validation: loops, unknown endpoints, repeated IDs, duplicates, malformed, directed', () => {
  const bad = [
    { nodes: [{ id: 'a' }], edges: [{ source: 'a', target: 'a' }] },
    { nodes: [{ id: 'a' }], edges: [{ source: 'a', target: 'b' }] },
    { nodes: [{ id: 'a' }, { id: 'a' }], edges: [] },
    { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }] },
    { nodes: 'x', edges: [] },
    { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b', directed: true }] },
    { kind: 'directed', nodes: [], edges: [] },
  ];
  for (const g of bad) { const v = validateGraph(g); assert.equal(v.ok, false, JSON.stringify(g)); assert.ok(v.errors[0].length > 5); }
  const multi = validateGraph({ kind: 'loopless-multigraph', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }] });
  assert.ok(multi.ok);
  const meta = validateGraph({ nodes: [{ id: 'a', degree: 5 }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }] });
  assert.ok(meta.ok && meta.warnings.some(w => /metadata degree 5 ignored/.test(w)));
  const el = parseEdgeList('a b\nb-c\n# comment', 'z');
  assert.ok(el.ok); assert.equal(el.graph.nodes.length, 4); assert.equal(el.graph.edges.length, 2);
});

test('Unicode / HTML-like labels survive a round trip as data', () => {
  const g = validateGraph({ nodes: [{ id: 'x', label: '<img src=x onerror=alert(1)>' }, { id: 'y', label: 'שלום ∂' }], edges: [{ source: 'x', target: 'y' }] }).graph;
  const back = validateGraph(graphToJSON(g)).graph;
  assert.equal(back.nodes[0].label, '<img src=x onerror=alert(1)>');
  assert.equal(back.nodes[1].label, 'שלום ∂');
});

test('experiment export / reimport reproduces the results', () => {
  const G = fx('konigsberg');
  for (const statistic of ['incident-edges', 'distinct-neighbours']) {
    for (const mode of ['uphill', 'strict', 'weak-patch']) {
      const ex = exportExperiment({ graph: G, mode, statistic, selectedIds: ['A', 'D'], subspaceIds: null, presetId: 'konigsberg' });
      const back = importExperiment(JSON.parse(JSON.stringify(ex)));
      assert.ok(back.ok); assert.deepEqual(back.mismatches, []);
      const tampered = JSON.parse(JSON.stringify(ex)); tampered.results.openCount.value = '999';
      assert.deepEqual(importExperiment(tampered).mismatches, ['openCount']);
    }
  }
});

test('inherited subspace: S = empty, S = V, partial plateau; restricted family = {U cap S}', () => {
  for (let t = 0; t < 30; t++) {
    const G = randomGraph(6, 0.4);
    for (const mode of ['uphill', 'strict', 'weak-patch']) {
      const T = buildTopologyModel(G, mode).topo;
      const opens = enumerateOpens(T).opens;
      for (const Sm of [[], [0, 1, 2, 3, 4, 5], [0, 2, 3], [1, 4]]) {
        const S = setOf(6, Sm), R = restrictTopology(T, S);
        const want = new Set(opens.map(U => Sm.filter(x => U[x]).map(x => T.points[x].id).join(',')));
        const got = new Set(enumerateOpens(R).opens.map(o => R.ids(o).join(',')));
        assert.deepEqual([...got].sort(), [...want].sort());
      }
    }
  }
});
