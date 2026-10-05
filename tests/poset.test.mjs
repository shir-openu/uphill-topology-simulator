// Poset -> graph (spec section 12) and its independent certificate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePoset, realizeFinitePoset, estimateRealization } from '../src/kernel/poset.js';
import { buildTopologyModel } from '../src/kernel/topology.js';
import { countUpsets, Budget } from '../src/kernel/enumeration.js';

const TABLE = [
  ['empty', { points: [], arrows: [] }, 0, 0, [], 1],
  ['one point', { points: ['a'], arrows: [] }, 6, 9, [3], 2],
  ['two-element chain', { points: ['a', 'b'], arrows: [['a', 'b']] }, 14, 25, [3, 4], 3],
  ['four-point crown', { points: ['a', 'b', 'c', 'd'], arrows: [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']] }, 28, 50, [3, 4], 7],
  ['one below three', { points: ['o', 'x', 'y', 'z'], arrows: [['o', 'x'], ['o', 'y'], ['o', 'z']] }, 30, 57, [3, 4], 9],
  ['six-element chain', { points: ['1', '2', '3', '4', '5', '6'], arrows: [['1', '2'], ['2', '3'], ['3', '4'], ['4', '5'], ['5', '6']] }, 66, 199, [3, 4, 5, 6, 7, 8], 7],
];

for (const [name, input, V, E, degs, opens] of TABLE) {
  test(`realization: ${name}`, () => {
    const P = validatePoset(input);
    assert.ok(P.ok, P.errors && P.errors.join('; '));
    assert.deepEqual(estimateRealization(P), { vertices: V, edges: E });
    const R = realizeFinitePoset(P);
    assert.ok(R.ok, R.errors && R.errors.join('; '));
    assert.equal(R.graph.nodes.length, V);
    assert.equal(R.graph.edges.length, E);
    const M = buildTopologyModel(R.graph, 'uphill', 'incident-edges');
    assert.deepEqual([...new Set(M.degree)].sort((a, b) => a - b), degs);
    const c = countUpsets(M.topo.k, M.topo.up, M.topo.down, new Budget());
    assert.equal(c.value, BigInt(opens));
    assert.ok(R.certificate.pass, JSON.stringify(R.certificate.checks.filter(x => !x.pass)));
  });
}

test('a redundant transitive arrow gives the same canonical graph', () => {
  const a = realizeFinitePoset(validatePoset({ points: ['a', 'b', 'c'], arrows: [['a', 'b'], ['b', 'c']] }));
  const b = realizeFinitePoset(validatePoset({ points: ['a', 'b', 'c'], arrows: [['a', 'b'], ['b', 'c'], ['a', 'c']] }));
  assert.deepEqual(JSON.stringify(a.input), JSON.stringify(b.input));
});

test('a directed cycle is rejected; a bad matrix is rejected', () => {
  assert.equal(validatePoset({ points: ['a', 'b'], arrows: [['a', 'b'], ['b', 'a']] }).ok, false);
  assert.equal(validatePoset({ points: ['a', 'b'], matrix: [[1, 1], [1, 1]] }).ok, false);
  assert.equal(validatePoset({ points: ['a', 'b', 'c'], matrix: [[1, 1, 0], [0, 1, 1], [0, 0, 1]] }).ok, false);
  assert.equal(validatePoset({ points: ['a', 'b'], matrix: [[1, 1], [0, 1]] }).ok, true);
});

test('antichain, diamond, disconnected, high branching: certificate passes', () => {
  const inputs = [
    { points: ['a', 'b', 'c'], arrows: [] },
    { points: ['b', 't', 'x', 'y'], arrows: [['b', 'x'], ['b', 'y'], ['x', 't'], ['y', 't']] },
    { points: ['a', 'b', 'c', 'd'], arrows: [['a', 'b'], ['c', 'd']] },
    { points: ['r', '1', '2', '3', '4', '5', '6'], arrows: ['1', '2', '3', '4', '5', '6'].map(x => ['r', x]) },
  ];
  for (const inp of inputs) {
    const R = realizeFinitePoset(validatePoset(inp));
    assert.ok(R.ok && R.certificate.pass, JSON.stringify(inp) + JSON.stringify(R.certificate && R.certificate.checks.filter(x => !x.pass)));
  }
});

// random small forward-labelled DAGs: order derived independently
test('random forward DAGs: recovered quotient equals the input order', () => {
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  for (let t = 0; t < 40; t++) {
    const n = 1 + Math.floor(rnd() * 6);
    const pts = Array.from({ length: n }, (_, i) => 'p' + i), arrows = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < 0.35) arrows.push([pts[i], pts[j]]);
    // independent order: DFS reachability on the forward DAG
    const le = pts.map((_, i) => { const r = new Set([i]); const st = [i];
      while (st.length) { const x = st.pop(); for (const [a, b] of arrows) if (a === pts[x]) { const y = pts.indexOf(b); if (!r.has(y)) { r.add(y); st.push(y); } } }
      return r; });
    const R = realizeFinitePoset(validatePoset({ points: pts, arrows }));
    assert.ok(R.ok);
    const M = buildTopologyModel(R.graph, 'uphill', 'incident-edges'), T = M.topo;
    const cls = R.blocks.map(b => T.pointToClass[R.graph.index.get(b.vertices[0])]);
    const pIdx = R.blocks.map(b => pts.indexOf(b.point));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      assert.equal(T.le[cls[i]][cls[j]] === 1, le[pIdx[i]].has(pIdx[j]), `trial ${t} ${JSON.stringify(arrows)}`);
    }
  }
});

test('oversized request is refused before allocation', () => {
  const pts = Array.from({ length: 20 }, (_, i) => 'q' + i);
  const arrows = pts.slice(1).map((p, i) => [pts[i], p]);
  const R = realizeFinitePoset(validatePoset({ points: pts, arrows }), { maxVertices: 100, maxEdges: 1000 });
  assert.equal(R.ok, false);
  assert.match(R.errors[0], /too large/);
});
