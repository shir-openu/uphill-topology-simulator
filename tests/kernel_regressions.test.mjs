import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareIds, graphToJSON, parseEdgeList, validateGraph } from '../src/kernel/graph.js';
import { buildTopologyModel } from '../src/kernel/topology.js';
import { Budget, DEFAULT_LIMITS, countUpsets, enumerateOpens } from '../src/kernel/enumeration.js';
import { exportExperiment, importExperiment, computeResults, computeSubspaceComparison } from '../src/kernel/serialization.js';
import { certify, realizeFinitePoset, recheckRealization, validatePoset } from '../src/kernel/poset.js';

const clone = x => JSON.parse(JSON.stringify(x));
const graph = (edges, isolates = '') => {
  const r = parseEdgeList(edges, isolates);
  assert.ok(r.ok, r.errors?.join('; '));
  return r.graph;
};
const experiment = (g, overrides = {}) => exportExperiment({ graph: g, mode: 'uphill', statistic: 'incident-edges', selectedIds: [], ...overrides });
const roundtrip = ex => { const r = importExperiment(clone(ex)); assert.ok(r.ok, r.errors?.join('; ')); return r; };
const crownInput = { points: ['a', 'b', 'c', 'd'], arrows: [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']] };

test('edge text preserves signed IDs: two disjoint edges have four uphill opens', () => {
  const g = graph('-1 2\n1 3'), T = buildTopologyModel(g).topo;
  assert.equal(g.nodes.length, 4);
  assert.deepEqual(g.nodes.map(n => n.id), ['-1', '2', '1', '3']);
  assert.deepEqual(g.edges.map(e => [g.nodes[e.u].id, g.nodes[e.v].id]), [['-1', '2'], ['1', '3']]);
  assert.equal(enumerateOpens(T).count.value, 4n);
});

test('edge text preserves leading zeros, Unicode, hyphens in explicit tokens and isolates', () => {
  const g = graph('01,1\n-0 0\nα β\na-b c-d\nx-y', 'isolated 孤');
  assert.deepEqual(g.nodes.map(n => n.id), ['isolated', '孤', '01', '1', '-0', '0', 'α', 'β', 'a-b', 'c-d', 'x', 'y']);
  for (const text of ['-1-2', '1-2', 'a-b-c', 'a b c', 'a - b', 'a,', ',b']) {
    const r = parseEdgeList(text); assert.equal(r.ok, false, text); assert.match(r.errors[0], /two whitespace\/comma-separated/);
  }
  assert.equal(parseEdgeList('a b\nb a').ok, false);
  assert.equal(parseEdgeList('a b\nb a', '', 'loopless-multigraph').graph.edges.length, 2);
  assert.equal(parseEdgeList(42).ok, false);
});

test('numeric-equal but distinct IDs have deterministic original-string tie breaking', () => {
  assert.notEqual(compareIds('01', '1'), 0);
  assert.notEqual(compareIds('-0', '0'), 0);
  const first = ['01', '1', '-0', '0', '10', '2'];
  assert.deepEqual(first.toSorted(compareIds), first.toReversed().toSorted(compareIds));
  assert.deepEqual(first.toSorted(compareIds), ['-0', '0', '01', '1', '2', '10']);
});

test('graph metadata, literal labels, configured limits and random seed survive a file roundtrip', () => {
  const input = graphToJSON(graph('a b'));
  input.meta = { source: 'Example source', nested: { label: '<script>literal</script>' } };
  input.nodes[0].label = '<img src=x onerror=alert(1)>';
  input.nodes[0].degree = 999;
  const checked = validateGraph(input);
  assert.ok(checked.warnings.some(w => w.includes('actual degree is 1')));
  const ex = experiment(checked.graph, { limits: { displayLimit: 17, timeBudgetMs: 1234 }, randomSeed: 123 });
  const back = roundtrip(ex);
  assert.deepEqual(graphToJSON(back.state.graph).meta, input.meta);
  assert.equal(back.state.graph.nodes[0].label, input.nodes[0].label);
  assert.equal(back.results.degrees.a, 1);
  assert.equal(back.state.limits.displayLimit, 17);
  assert.equal(back.state.limits.timeBudgetMs, 1234);
  assert.equal(back.state.randomSeed, 123);
});

test('malformed complete experiment shapes reject cleanly without mutating their input', () => {
  const base = experiment(graph('a b\nb c'), { selectedIds: ['a'], subspaceIds: ['a', 'b'] });
  const mutations = [
    d => { d.analysis = []; }, d => { d.analysis = 42; },
    d => { d.analysis.selectedVertexIds = 42; }, d => { d.analysis.selectedVertexIds = {}; },
    d => { d.analysis.selectedVertexIds = ['unknown']; }, d => { d.analysis.selectedVertexIds = ['a', 'a']; },
    d => { d.analysis.selectedVertexIds = [{ toString: 42 }, 'a']; },
    d => { d.analysis.subspaceVertexIds = {}; }, d => { d.analysis.subspaceVertexIds = ['a']; },
    d => { d.analysis.mode = 'other'; }, d => { d.analysis.statistic = 'weighted'; },
    d => { d.subspaceComparison = []; }, d => { d.subspaceComparison.subspaceVertexIds = 42; },
    d => { d.subspaceComparison.subspaceVertexIds = [{ toString: 42 }, 'a']; },
    d => { d.subspaceComparison.selectedVertexIds = ['c']; },
    d => { d.subspaceComparison.inherited.carrierVertexIds = ['a']; },
    d => { d.subspaceComparison.recomputed = null; },
    d => { d.results = []; }, d => { d.results.selection = 42; },
    d => { d.results.leastNeighbourhoods.a = {}; }, d => { d.results.openCount.value = 5; },
    d => { d.provenance = []; }, d => { d.provenance.randomSeed = {}; },
    d => { d.limits = []; }, d => { d.limits.displayLimit = 100001; },
    d => { d.generator = { input: { points: ['a'], arrows: [null] } }; },
    d => { d.graph.nodes[0].label = { toString: 42 }; },
    d => { d.graph.edges[0].id = { toString: 42 }; },
    d => { d.graph.edges[0].source = { toString: 42 }; },
  ];
  for (const change of mutations) {
    const bad = clone(base); change(bad); const before = JSON.stringify(bad);
    let r; assert.doesNotThrow(() => { r = importExperiment(bad); });
    assert.equal(r.ok, false, change.toString()); assert.ok(r.errors.length);
    assert.equal(JSON.stringify(bad), before);
  }
  assert.deepEqual(roundtrip(base).mismatches, []);
  const badDegree = clone(base); badDegree.graph.nodes[0].degree = { toString: 42 };
  const ignored = roundtrip(badDegree);
  assert.equal(ignored.results.degrees.a, 1);
  assert.ok(ignored.warnings.some(w => w.includes('metadata degree')));
});

test('path subspace comparison preserves ambient A, carriers and the inherited/induced 3/2 counts', () => {
  const g = graph('a b\nb c');
  const ex = experiment(g, { selectedIds: ['a', 'c'], subspaceIds: ['a', 'b'] });
  assert.deepEqual(ex.results.selection.selected, ['a', 'c']);
  assert.equal(ex.analysis.carrier, 'vertices');
  assert.deepEqual(ex.subspaceComparison.selectedVertexIds, ['a']);
  assert.equal(ex.subspaceComparison.inherited.results.openCount.value, '3');
  assert.equal(ex.subspaceComparison.recomputed.results.openCount.value, '2');
  assert.equal(ex.subspaceComparison.inherited.results.selection.open, false);
  assert.deepEqual(ex.subspaceComparison.inherited.results.selection.closure, ['a']);
  assert.deepEqual(ex.subspaceComparison.recomputed.results.selection.closure, ['a', 'b']);
  const r = roundtrip(ex);
  assert.deepEqual(r.state.subspaceIds, ['a', 'b']);
  assert.deepEqual(r.state.selectedIds, ['a', 'c']);
  assert.deepEqual(r.mismatches, []);
});

test('tree comparison retains ambient-path 3/4 counts and empty/all/partial-plateau carriers', () => {
  const tree = graph('a b\nb c\nc d\nc e');
  const ex = experiment(tree, { selectedIds: ['a'], subspaceIds: ['a', 'c'] });
  const c = roundtrip(ex).subspaceComparison;
  assert.equal(c.inherited.results.openCount.value, '3');
  assert.equal(c.recomputed.results.openCount.value, '4');
  assert.deepEqual(c.inherited.results.leastNeighbourhoods.a, ['a', 'c']);
  const g = graph('a b\nb c\nc a');
  for (const mode of ['uphill', 'strict', 'weak-patch']) for (const S of [[], ['a'], ['a', 'b', 'c']]) {
    const r = roundtrip(experiment(g, { mode, selectedIds: ['a', 'c'], subspaceIds: S }));
    assert.deepEqual(r.state.subspaceIds, S);
    assert.deepEqual(r.subspaceComparison.selectedVertexIds, ['a', 'c'].filter(x => S.includes(x)));
    assert.deepEqual(r.mismatches, []);
    if (!S.length) assert.equal(r.subspaceComparison.inherited.results.openCount.value, '1');
  }
});

test('legacy v1 subspace imports migrate to explicit comparison with fresh ambient results', () => {
  const g = graph('a b\nb c'), ex = experiment(g, { selectedIds: ['a'], subspaceIds: null });
  ex.schemaVersion = 'uphill-experiment/1'; delete ex.subspaceComparison;
  ex.analysis.carrier = 'subspace'; ex.analysis.subspaceVertexIds = ['a', 'b'];
  ex.results = computeResults(g, 'uphill', 'incident-edges', ['a'], ['a', 'b']);
  const r = roundtrip(ex);
  assert.deepEqual(r.state.subspaceIds, ['a', 'b']); assert.equal(r.results.openCount.value, '5');
  assert.equal(r.subspaceComparison.inherited.results.openCount.value, '3');
  assert.deepEqual(r.mismatches, []); assert.ok(r.warnings.some(w => w.includes('Legacy')));
});

test('100 isolates export all 4096 loaded masks, canonical mapping and exact decimal 2^100', () => {
  const g = graph('', Array.from({ length: 100 }, (_, i) => String(i)).join(' '));
  const T = buildTopologyModel(g).topo, enumeration = enumerateOpens(T);
  const ex = experiment(g, { enumeration });
  assert.equal(ex.enumeration.status, 'display-cap');
  assert.equal(ex.enumeration.count.value, '1267650600228229401496703205376');
  assert.equal(ex.enumeration.upsetMasks.length, 4096);
  assert.equal(ex.enumeration.quotientClasses.length, 100);
  const r = roundtrip(ex), restored = r.state.enumeration;
  assert.equal(restored.status, 'display-cap'); assert.equal(restored.listedCount, 4096);
  assert.equal(restored.count.value, 2n ** 100n);
  for (let i = 0; i < 4096; i++) assert.deepEqual(restored.opens[i], enumeration.opens[i]);
});

test('loaded enumeration rejects mismatched mapping, topology, non-open masks and false completeness', () => {
  const g = graph('a b\nb c'), T = buildTopologyModel(g).topo;
  const ex = experiment(g, { enumeration: enumerateOpens(T) });
  for (const change of [
    d => { d.enumeration.quotientClasses.reverse(); },
    d => { d.enumeration.mode = 'weak-patch'; },
    d => { d.enumeration.upsetMasks[0] = '1'; },
    d => { d.enumeration.upsetMasks[0] = '999'; },
    d => { d.enumeration.upsetMasks[0] = d.enumeration.upsetMasks[1]; },
    d => { d.enumeration.count.value = '999'; },
    d => { d.enumeration.listedCount--; },
  ]) {
    const bad = clone(ex); change(bad); assert.equal(importExperiment(bad).ok, false, change.toString());
  }
  assert.deepEqual(roundtrip(ex).mismatches, []);
});

test('budget and cancellation records retain honest lower bounds and running imports become interrupted', () => {
  const g = graph('a b\nb c'), T = buildTopologyModel(g).topo;
  const enumeration = enumerateOpens(T, { stateBudget: 0 });
  assert.equal(enumeration.status, 'interrupted');
  assert.equal(enumeration.count.status, 'not-computed');
  const ex = experiment(g, { enumeration, limits: { stateBudget: 0 } });
  const back = roundtrip(ex);
  assert.equal(back.state.enumeration.count.value, null);
  assert.equal(back.state.enumeration.lowerBound, 0n);
  const cancelled = enumerateOpens(T, { isCancelled: () => true });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.listedCount, 0);
  const running = experiment(g, { enumeration: { ...cancelled, status: 'running' } });
  assert.equal(roundtrip(running).state.enumeration.status, 'interrupted');
});

test('effective enumeration budgets and recorded engine survive independently of requested settings', () => {
  const g = graph('a b\nb c'), T = buildTopologyModel(g).topo;
  const enumeration = enumerateOpens(T, { timeBudgetMs: 1500, stateBudget: 0, isCancelled: () => false });
  enumeration.engine = 'main-thread fallback';
  const ex = experiment(g, { enumeration, limits: { timeBudgetMs: 5000, stateBudget: 1000000 } });
  assert.equal(ex.limits.timeBudgetMs, 5000);
  assert.equal(ex.enumeration.limits.timeBudgetMs, 1500);
  assert.equal(ex.enumeration.limits.stateBudget, 0);
  assert.equal('isCancelled' in ex.enumeration.limits, false);
  const r = roundtrip(ex);
  assert.equal(r.state.limits.timeBudgetMs, 5000);
  assert.equal(r.state.enumeration.limits.timeBudgetMs, 1500);
  assert.equal(r.state.enumeration.engine, 'main-thread fallback');
  assert.equal(r.state.enumeration.count.status, 'not-computed');
  assert.equal(r.state.enumeration.count.value, null);
  for (const change of [
    d => { d.enumeration.limits = []; },
    d => { d.enumeration.limits.timeBudgetMs = 60001; },
    d => { d.enumeration.limits.stateBudget = {}; },
    d => { d.enumeration.limits.displayLimit = 1; },
    d => { d.enumeration.engine = { toString: 42 }; },
  ]) {
    const bad = clone(ex); change(bad); const rejected = importExperiment(bad);
    assert.equal(rejected.ok, false, change.toString());
  }
  const older = clone(ex); delete older.enumeration.limits; delete older.enumeration.engine;
  const compatible = roundtrip(older);
  assert.equal(compatible.state.enumeration.limits.timeBudgetMs, 5000);
  assert.equal(compatible.state.enumeration.engine, null);
});

test('poset malformed arrows reject before destructuring and certificates retain unavailable count status', () => {
  for (const arrows of [42, {}, [null], [['a']], [['a', 'b', 'c']], [{ source: 'a', target: 'b' }]]) {
    let r; assert.doesNotThrow(() => { r = validatePoset({ points: ['a', 'b'], arrows }); });
    assert.equal(r.ok, false); assert.ok(r.errors.length);
  }
  const P = validatePoset(crownInput), R = realizeFinitePoset(P, { ...DEFAULT_LIMITS, stateBudget: 0 });
  assert.ok(R.ok && R.certificate.pass);
  assert.equal(R.certificate.opens, null);
  assert.equal(R.certificate.openCount.status, 'not-computed');
  const ex = experiment(R.graph, { generator: { input: crownInput }, limits: { stateBudget: 0 } });
  assert.equal(ex.generator.certificate.openCount.status, 'not-computed');
  assert.equal(ex.generator.certificate.openCount.value, null);
});

test('generator certificates are recomputed from saved input and current graph, never trusted booleans', () => {
  const R = realizeFinitePoset(validatePoset(crownInput));
  const ex = experiment(R.graph, { generator: { input: crownInput, pass: false } });
  assert.equal(ex.generator.certificatePass, true);
  const back = roundtrip(ex); assert.equal(back.state.generator.pass, true);
  assert.equal(back.state.generator.certificate.openCount.value, 7n);
  const tampered = clone(ex); tampered.generator.certificatePass = true; tampered.graph.edges.pop();
  const r = roundtrip(tampered);
  assert.equal(r.state.generator.pass, false); assert.equal(r.state.generator.appliesToCurrentGraph, false);
  assert.ok(r.mismatches.includes('generator.certificatePass'));
  const otherCarrier = recheckRealization(crownInput, graph('x y'), DEFAULT_LIMITS);
  assert.ok(otherCarrier.ok); assert.equal(otherCarrier.pass, false);
});

test('import and graph validation enforce meaningful size and budget limits before model construction', () => {
  const tooLarge = { nodes: Array.from({ length: 201 }, (_, i) => ({ id: String(i) })), edges: [] };
  const v = validateGraph(tooLarge, DEFAULT_LIMITS); assert.equal(v.ok, false); assert.match(v.errors[0], /limit/);
  const ex = experiment(graph('a b')); ex.graph = tooLarge;
  assert.equal(importExperiment(ex).ok, false);
  ex.limits.maxVertices = 201; assert.equal(importExperiment(ex).ok, false);
  const empty = experiment(graph('')); empty.limits.stateBudget = 10000001;
  assert.equal(importExperiment(empty).ok, false);
});
