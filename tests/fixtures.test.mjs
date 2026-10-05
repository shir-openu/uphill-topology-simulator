// The 12 fixed graphs / 39 mode-statistic cases of the specification,
// checked against the production kernel. Expected values come from the
// spec's embedded JSON (verified there by exhaustive enumeration) - never
// from a snapshot of this implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateGraph } from '../src/kernel/graph.js';
import { buildTopologyModel, members, restrictTopology, inducedGraph } from '../src/kernel/topology.js';
import { enumerateOpens, countUpsets, Budget } from '../src/kernel/enumeration.js';

const F = JSON.parse(readFileSync(new URL('../fixtures/acceptance_fixtures_spec_v1.json', import.meta.url), 'utf8'));
const sortIds = a => [...a].map(String).sort();
const sortClasses = cs => cs.map(sortIds).map(c => c.join(',')).sort();

let cases = 0;
for (const fx of F.fixtures) {
  test(`fixture ${fx.id}`, () => {
    const v = validateGraph(fx.graph);
    assert.ok(v.ok, v.errors && v.errors.join('; '));
    const G = v.graph;
    for (const e of fx.expected) {
      cases++;
      const tag = `${fx.id} ${e.mode}/${e.statistic}`;
      const M = buildTopologyModel(G, e.mode, e.statistic);
      const T = M.topo;
      const deg = Object.fromEntries(G.nodes.map((p, i) => [p.id, M.degree[i]]));
      assert.deepEqual(deg, e.degrees, tag + ' degrees');
      assert.deepEqual(sortClasses(T.classes.map(c => c.map(i => G.nodes[i].id))), sortClasses(e.classes), tag + ' classes');
      for (const [x, nb] of Object.entries(e.leastNeighbourhoods)) {
        assert.deepEqual(sortIds(T.ids(T.N[G.index.get(x)])), sortIds(nb), `${tag} N(${x})`);
      }
      const cnt = countUpsets(T.k, T.up, T.down, new Budget());
      assert.equal(cnt.value.toString(), e.openCount, tag + ' open count');
      const en = enumerateOpens(T);
      assert.equal(en.status, 'complete', tag);
      assert.equal(String(en.listedCount), e.openCount, tag + ' listed opens');
      for (const s of e.selections) {
        const A = T.setFromIds(s.selected);
        const r = T.analyze(A);
        const w = `${tag} A=${JSON.stringify(s.selected)}`;
        assert.equal(r.open, s.open, w + ' open');
        assert.equal(r.closed, s.closed, w + ' closed');
        assert.deepEqual(sortIds(T.ids(r.interior)), sortIds(s.interior), w + ' interior');
        assert.deepEqual(sortIds(T.ids(r.closure)), sortIds(s.closure), w + ' closure');
        assert.deepEqual(sortIds(T.ids(r.boundary)), sortIds(s.boundary), w + ' boundary');
        assert.deepEqual(sortIds(T.ids(r.exterior)), sortIds(s.exterior), w + ' exterior');
      }
    }
  });
}

test('39 mode/statistic cases were checked', () => {
  const n = F.fixtures.reduce((s, f) => s + f.expected.length, 0);
  assert.equal(n, 39);
});

// Section 10 / embedded subspaceComparisons
const byId = Object.fromEntries(F.fixtures.map(f => [f.id, f]));
const SUBFIX = { path3_ab: 'path3', tree_ac: 'subspace_intermediate' };
for (const [name, sc] of Object.entries(F.subspaceComparisons)) {
  test(`subspace comparison ${name}`, () => {
    const G = validateGraph(byId[SUBFIX[name]].graph).graph;
    const M = buildTopologyModel(G, 'uphill', 'incident-edges');
    const S = M.topo.setFromIds(sc.W);
    const R = restrictTopology(M.topo, S);
    const a = sc.ambient_restricted;
    const ops = enumerateOpens(R);
    assert.equal(ops.listedCount, a.open_count, 'inherited count');
    assert.deepEqual(ops.opens.map(o => sortIds(R.ids(o)).join(',')).sort(), a.opens.map(o => sortIds(o).join(',')).sort());
    const A = R.setFromIds(sc.selected), r = R.analyze(A);
    assert.deepEqual(sortIds(R.ids(r.interior)), sortIds(a.interior));
    assert.deepEqual(sortIds(R.ids(r.closure)), sortIds(a.closure));
    assert.deepEqual(sortIds(R.ids(r.boundary)), sortIds(a.boundary));
    const H = inducedGraph(G, S), MH = buildTopologyModel(H, 'uphill', 'incident-edges');
    const b = sc.induced_recomputed;
    assert.deepEqual(Object.fromEntries(H.nodes.map((p, i) => [p.id, MH.degree[i]])), b.degrees);
    assert.equal(enumerateOpens(MH.topo).listedCount, b.open_count, 'induced count');
    const rb = MH.topo.analyze(MH.topo.setFromIds(sc.selected));
    assert.equal(rb.open, b.selection.open); assert.equal(rb.closed, b.selection.closed);
    assert.deepEqual(sortIds(MH.topo.ids(rb.boundary)), sortIds(b.selection.boundary));
  });
}
