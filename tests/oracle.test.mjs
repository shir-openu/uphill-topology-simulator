// Independent small-graph oracle (spec section 17).
// For EVERY labelled simple graph on 0..5 vertices (1,100 graphs) and both
// comparison rules, the oracle decides openness from one-step allowed arcs
// alone, builds interior/closure/boundary from the open family, recovers
// N(x) as the intersection of opens containing x, and compares with the
// production engine. The oracle never calls the production reachability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph } from '../src/kernel/graph.js';
import { buildTopologyModel, equalDegreeComponents, neighbourSetsForTest } from './helpers.mjs';
import { enumerateOpens } from '../src/kernel/enumeration.js';

function* allGraphs(n) {
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  for (let m = 0; m < (1 << pairs.length); m++) yield pairs.filter((_, k) => (m >> k) & 1);
}

// ---------------------------------------------------------- the oracle
function oracle(n, edges, rule) {
  const deg = new Array(n).fill(0);
  for (const [u, v] of edges) { deg[u]++; deg[v]++; }
  const arcs = [];
  for (const [u, v] of edges) {
    if (rule === 'strict' ? deg[u] < deg[v] : deg[u] <= deg[v]) arcs.push([u, v]);
    if (rule === 'strict' ? deg[v] < deg[u] : deg[v] <= deg[u]) arcs.push([v, u]);
  }
  const full = (1 << n) - 1;
  const opens = [];
  for (let U = 0; U <= full; U++) if (arcs.every(([u, v]) => !((U >> u) & 1) || ((U >> v) & 1))) opens.push(U);
  const closeds = opens.map(U => full & ~U);
  const interior = A => opens.filter(U => (U & ~A) === 0).reduce((s, U) => s | U, 0);
  const closure = A => closeds.filter(F => (A & ~F) === 0).reduce((s, F) => s & F, full);
  const N = [];
  for (let x = 0; x < n; x++) N.push(opens.filter(U => (U >> x) & 1).reduce((s, U) => s & U, full));
  return { deg, opens, interior, closure, N, full };
}

const toMask = s => { let m = 0; for (let i = 0; i < s.length; i++) if (s[i]) m |= 1 << i; return m; };
const toSet = (m, n) => { const s = new Uint8Array(n); for (let i = 0; i < n; i++) s[i] = (m >> i) & 1; return s; };

function graphOf(n, edges) {
  const nodes = []; for (let i = 0; i < n; i++) nodes.push({ id: String(i), label: String(i) });
  return validateGraph({ kind: 'simple-undirected', nodes, edges: edges.map(([u, v], k) => ({ id: 'e' + k, source: String(u), target: String(v) })) }).graph;
}

let checkedGraphs = 0, checkedSubsets = 0;
test('oracle: all 1,100 labelled simple graphs on <= 5 vertices, both rules', () => {
  for (let n = 0; n <= 5; n++) {
    for (const edges of allGraphs(n)) {
      checkedGraphs++;
      const G = graphOf(n, edges);
      for (const [mode, rule] of [['uphill', 'non-strict'], ['strict', 'strict']]) {
        const O = oracle(n, edges, rule);
        const M = buildTopologyModel(G, mode, 'incident-edges');
        const T = M.topo;
        for (let x = 0; x < n; x++) assert.equal(toMask(T.N[x]), O.N[x], `N(${x}) n=${n} ${JSON.stringify(edges)} ${mode}`);
        const en = enumerateOpens(T);
        assert.deepEqual(en.opens.map(toMask).sort((a, b) => a - b), O.opens, `opens ${mode} ${JSON.stringify(edges)}`);
        for (let A = 0; A <= O.full; A++) {
          checkedSubsets++;
          const r = T.analyze(toSet(A, n));
          const I = O.interior(A), C = O.closure(A);
          assert.equal(toMask(r.interior), I);
          assert.equal(toMask(r.closure), C);
          assert.equal(toMask(r.boundary), C & ~I);
          assert.equal(r.open, I === A); assert.equal(r.closed, C === A);
        }
      }
      // finite weak patch: subbasis R(x), V\R(x) -> atoms -> Boolean family
      const O = oracle(n, edges, 'non-strict');
      const sig = [];
      for (let y = 0; y < n; y++) sig.push(O.N.map(R => (R >> y) & 1).join(''));
      const atoms = new Map();
      sig.forEach((s, y) => atoms.set(s, (atoms.get(s) || 0) | (1 << y)));
      const atomList = [...atoms.values()], family = new Set();
      for (let m = 0; m < (1 << atomList.length); m++) {
        let U = 0; atomList.forEach((a, i) => { if ((m >> i) & 1) U |= a; }); family.add(U);
      }
      const W = buildTopologyModel(G, 'weak-patch', 'incident-edges').topo;
      const got = enumerateOpens(W).opens.map(toMask).sort((a, b) => a - b);
      assert.deepEqual(got, [...family].sort((a, b) => a - b), `weak patch ${JSON.stringify(edges)}`);
      // SCCs = equal-degree connected components
      const M = buildTopologyModel(G, 'uphill', 'incident-edges');
      const comp = equalDegreeComponents(neighbourSetsForTest(G), M.degree);
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
        assert.equal(comp[x] === comp[y], M.topo.pointToClass[x] === M.topo.pointToClass[y]);
      }
    }
  }
  assert.equal(checkedGraphs, 1100);
  console.log(`oracle: ${checkedGraphs} graphs, ${checkedSubsets} (graph, rule, subset) triples`);
});
