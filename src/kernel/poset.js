// Uphill Topology Explorer - "Poset -> graph" (Theorem 4.1 of UPHILL v12).
// Spec section 12. The construction is followed literally; the resulting
// graph is then re-analysed by the ORDINARY graph engine and certified.
import { validateGraph, compareIds } from './graph.js';
import { buildTopologyModel } from './topology.js';
import { countUpsets, Budget } from './enumeration.js';

// input: {points:[id...], arrows:[[p,q],...]} meaning p < q (generating)
// or {points, matrix} with matrix[i][j] = 1 iff points[i] <= points[j].
export function validatePoset(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.points)) return { ok: false, errors: ['"points" must be an array'] };
  if (input.points.length > 200) return { ok: false, errors: ['poset exceeds the 200-point input limit'] };
  if (input.points.some(p => typeof p !== 'string' || !p.length)) return { ok: false, errors: ['poset points must be non-empty string IDs'] };
  const pts = [...input.points];
  const pos = new Map();
  pts.forEach((p, i) => { if (pos.has(p)) errors.push(`repeated point "${p}"`); pos.set(p, i); });
  const n = pts.length;
  const le = Array.from({ length: n }, (_, i) => { const r = new Uint8Array(n); r[i] = 1; return r; });
  if (input.matrix !== undefined) {
    const M = input.matrix;
    if (!Array.isArray(M) || M.length !== n || M.some(r => !Array.isArray(r) || r.length !== n)) {
      return { ok: false, errors: ['matrix must be n x n'] };
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = M[i][j];
      if (v !== 0 && v !== 1) errors.push(`matrix[${i}][${j}] must be 0 or 1`);
      le[i][j] = v ? 1 : 0;
    }
    for (let i = 0; i < n; i++) if (!le[i][i]) errors.push(`not reflexive at "${pts[i]}"`);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i !== j && le[i][j] && le[j][i]) errors.push(`not antisymmetric: "${pts[i]}" and "${pts[j]}"`);
      for (let k = 0; k < n; k++) if (le[i][j] && le[j][k] && !le[i][k]) {
        errors.push(`not transitive: ${pts[i]} <= ${pts[j]} <= ${pts[k]}`);
      }
    }
  } else {
    if (input.arrows !== undefined && !Array.isArray(input.arrows)) return { ok: false, errors: ['"arrows" must be an array of two-endpoint arrays'] };
    if ((input.arrows || []).length > 40000) return { ok: false, errors: ['poset exceeds the 40000-arrow input limit'] };
    for (const [i, arrow] of (input.arrows || []).entries()) {
      if (!Array.isArray(arrow) || arrow.length !== 2 || arrow.some(p => typeof p !== 'string')) { errors.push(`arrows[${i}] must be an array of exactly two string endpoints`); continue; }
      const [a, b] = arrow;
      if (!pos.has(String(a)) || !pos.has(String(b))) { errors.push(`arrow ${a} -> ${b}: unknown point`); continue; }
      if (String(a) === String(b)) { errors.push(`arrow ${a} -> ${a} is a loop`); continue; }
      le[pos.get(String(a))][pos.get(String(b))] = 1;
    }
    // reflexive-transitive closure (Warshall), then reject cycles
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (le[i][k]) for (let j = 0; j < n; j++) if (le[k][j]) le[i][j] = 1;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (le[i][j] && le[j][i]) errors.push(`directed cycle through "${pts[i]}" and "${pts[j]}"`);
    }
  }
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  const covers = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j || !le[i][j]) continue;
    let cov = true;
    for (let k = 0; k < n && cov; k++) if (k !== i && k !== j && le[i][k] && le[k][j]) cov = false;
    if (cov) covers.push([i, j]);
  }
  return { ok: true, points: pts, le, covers };
}

// sizes before building (budget check)
export function estimateRealization(P) {
  const { m, D } = parameters(P);
  let V = 0, E = 0;
  P.points.forEach((_, p) => { V += 2 * m[p]; E += m[p] * D[p]; });
  return { vertices: V, edges: E };
}

function parameters(P) {
  const n = P.points.length;
  const below = Array.from({ length: n }, () => []);
  for (const [a, b] of P.covers) below[b].push(a);
  const r = new Array(n).fill(-1);
  const rank = p => {
    if (r[p] >= 0) return r[p];
    let v = 0;
    for (const q of below[p]) v = Math.max(v, rank(q) + 1);
    return (r[p] = v);
  };
  for (let p = 0; p < n; p++) rank(p);
  const c = new Array(n).fill(0);
  for (const [a, b] of P.covers) { c[a]++; c[b]++; }
  const D = r.map(x => x + 3);
  const m = D.map((d, p) => Math.max(d, c[p]));
  const h = n ? Math.max(...r) + 1 : 0;
  return { r, c, D, m, h };
}

// realizeFinitePoset(P) -> {graph, blocks, ports, switches, params, certificate}
export function realizeFinitePoset(P, limits = { maxVertices: 20000, maxEdges: 200000 }) {
  limits = { maxVertices: 20000, maxEdges: 200000, ...limits };
  const n = P.points.length;
  const est = estimateRealization(P);
  if (est.vertices > limits.maxVertices || est.edges > limits.maxEdges) {
    return { ok: false, errors: [`output too large: ${est.vertices} vertices, ${est.edges} edges`], estimate: est };
  }
  const { r, c, D, m, h } = parameters(P);
  const order = P.points.map((_, i) => i).sort((a, b) => compareIds(P.points[a], P.points[b]));
  const nodes = [], edgeSet = new Map(), protectedEdges = new Set();
  const L = (p, j) => `L:${P.points[p]}:${j}`, R = (p, j) => `R:${P.points[p]}:${j}`;
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const addEdge = (a, b) => { const k = key(a, b); if (edgeSet.has(k)) throw new Error(`repeated edge ${k}`); edgeSet.set(k, [a, b]); };
  const delEdge = (a, b) => { const k = key(a, b); if (!edgeSet.has(k)) throw new Error(`missing edge ${k}`); if (protectedEdges.has(k)) throw new Error(`protected edge ${k} removed`); edgeSet.delete(k); };
  const blocks = [];
  for (const p of order) {
    const block = { point: P.points[p], rank: r[p], D: D[p], m: m[p], vertices: [] };
    for (let j = 0; j < m[p]; j++) { nodes.push({ id: L(p, j), label: `L${P.points[p]}.${j}` }); block.vertices.push(L(p, j)); }
    for (let j = 0; j < m[p]; j++) { nodes.push({ id: R(p, j), label: `R${P.points[p]}.${j}` }); block.vertices.push(R(p, j)); }
    for (let j = 0; j < m[p]; j++) for (let t = 0; t < D[p]; t++) {
      addEdge(L(p, j), R(p, (j + t) % m[p]));
      if (t === 0 || t === 1) protectedEdges.add(key(L(p, j), R(p, (j + t) % m[p])));
    }
    blocks.push(block);
  }
  // ports: kth incident cover of p (sorted) uses the shift-2 edge L(p,k)R(p,k+2)
  const coverName = ([a, b]) => `${P.points[a]}<${P.points[b]}`;
  const sortedCovers = [...P.covers].sort((x, y) =>
    compareIds(P.points[x[0]], P.points[y[0]]) || compareIds(P.points[x[1]], P.points[y[1]]));
  const port = new Map();
  for (let p = 0; p < n; p++) {
    const inc = sortedCovers.filter(([a, b]) => a === p || b === p);
    inc.forEach((e, k) => port.set(`${p}#${coverName(e)}`, [L(p, k), R(p, (k + 2) % m[p])]));
  }
  const switches = [];
  for (const e of sortedCovers) {
    const [p, q] = e;
    const [a, b] = port.get(`${p}#${coverName(e)}`), [cc, d] = port.get(`${q}#${coverName(e)}`);
    delEdge(a, b); delEdge(cc, d); addEdge(a, d); addEdge(cc, b);
    switches.push({ cover: coverName(e), removed: [[a, b], [cc, d]], added: [[a, d], [cc, b]] });
  }
  const edges = [...edgeSet.values()].map(([a, b], i) => ({ id: `g${i + 1}`, source: a, target: b }));
  const input = { schemaVersion: 'uphill-graph/1', kind: 'simple-undirected', nodes, edges,
    meta: { generator: 'poset-realization (UPHILL v12 Theorem 4.1)' } };
  const v = validateGraph(input);
  if (!v.ok) return { ok: false, errors: v.errors };
  const blockOf = new Map();
  blocks.forEach((b, i) => b.vertices.forEach(id => blockOf.set(id, i)));
  const cert = certify(P, v.graph, blocks, blockOf, { r, c, D, m, h }, limits);
  return { ok: true, input, graph: v.graph, blocks, ports: Object.fromEntries(port), switches,
    params: { r, c, D, m, h }, certificate: cert, estimate: est };
}

// Independent certificate on the COMPLETED graph (spec section 12 table).
export function certify(P, graph, blocks, blockOf, params, limits = {}) {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
  const { D, m, h } = params;
  const n = P.points.length;
  const sumM = m.reduce((s, x) => s + x, 0), sumMD = m.reduce((s, x, i) => s + x * D[i], 0);
  ok('size |V| = 2 sum m_p', graph.nodes.length === 2 * sumM, `${graph.nodes.length} vs ${2 * sumM}`);
  ok('size |E| = sum m_p D_p', graph.edges.length === sumMD, `${graph.edges.length} vs ${sumMD}`);
  const model = buildTopologyModel(graph, 'uphill', 'incident-edges');
  const pointOfBlock = blocks.map(b => P.points.indexOf(b.point));
  let degOk = true;
  graph.nodes.forEach((nd, i) => { if (model.degree[i] !== D[pointOfBlock[blockOf.get(nd.id)]]) degOk = false; });
  ok('every vertex of block p has degree D_p', degOk);
  // plateaus = blocks
  const T = model.topo;
  let platOk = T.k === blocks.length;
  const classOfBlock = blocks.map(b => T.pointToClass[graph.index.get(b.vertices[0])]);
  blocks.forEach((b, i) => b.vertices.forEach(id => { if (T.pointToClass[graph.index.get(id)] !== classOfBlock[i]) platOk = false; }));
  if (new Set(classOfBlock).size !== blocks.length) platOk = false;
  ok('each block is exactly one recovered plateau', platOk, `${T.k} plateaus, ${blocks.length} blocks`);
  // quotient order = input order
  let ordOk = platOk;
  if (platOk) {
    for (let i = 0; i < blocks.length; i++) for (let j = 0; j < blocks.length; j++) {
      const want = P.le[pointOfBlock[i]][pointOfBlock[j]] === 1;
      const got = T.le[classOfBlock[i]][classOfBlock[j]] === 1;
      if (want !== got) ordOk = false;
    }
  }
  ok('recovered reachability equals the input order on every pair', ordOk);
  // bipartite L/R and components
  const bip = graph.edges.every(e => graph.nodes[e.u].id[0] !== graph.nodes[e.v].id[0]);
  ok('all edges cross L/R', bip);
  const comp = components(graph);
  const coverComp = components({ nodes: P.points.map(p => ({ id: p })), edges: P.covers.map(([a, b]) => ({ u: a, v: b })) });
  ok('component count = cover-graph component count', comp === coverComp, `${comp} vs ${coverComp}`);
  if (n > 0) {
    const spectrum = [...new Set(model.degree)].sort((a, b) => a - b);
    const want = []; for (let d = 3; d <= h + 2; d++) want.push(d);
    ok('degree spectrum {3..h+2}, exactly h values', JSON.stringify(spectrum) === JSON.stringify(want), JSON.stringify(spectrum));
    const cdeg = new Array(n).fill(0); P.covers.forEach(([a, b]) => { cdeg[a]++; cdeg[b]++; });
    const bound = 2 * n * Math.max(h + 2, Math.max(...cdeg));
    ok('|V| <= 2|P| max(h+2, cover degree)', graph.nodes.length <= bound, `${graph.nodes.length} <= ${bound}`);
  }
  const openCount = countUpsets(T.k, T.up, T.down, new Budget(limits));
  return { pass: checks.every(c => c.pass), checks, opens: openCount.value, openCount, model };
}

// Saved booleans are historical data. Rebuild the specified construction and
// check the CURRENT labelled graph before presenting a current certificate.
export function recheckRealization(input, graph, limits = {}) {
  const P = validatePoset(input);
  if (!P.ok) return { ok: false, errors: P.errors };
  const R = realizeFinitePoset(P, limits);
  if (!R.ok) return R;
  const pairs = G => G.edges.map(e => [G.nodes[e.u].id, G.nodes[e.v].id].sort()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const nodeIds = G => G.nodes.map(n => n.id).sort(compareIds);
  const matches = graph.kind === R.graph.kind && JSON.stringify(nodeIds(graph)) === JSON.stringify(nodeIds(R.graph))
    && JSON.stringify(pairs(graph)) === JSON.stringify(pairs(R.graph));
  const blockOf = new Map();
  R.blocks.forEach((b, i) => b.vertices.forEach(id => blockOf.set(id, i)));
  // certify expects every construction vertex to exist. A changed carrier is
  // already a definitive failed construction check; do not index absent IDs.
  let certificate = { pass: false, checks: [], opens: null,
    openCount: { status: 'not-computed', value: null, method: 'changed construction carrier' } };
  if (JSON.stringify(nodeIds(graph)) === JSON.stringify(nodeIds(R.graph))) certificate = certify(P, graph, R.blocks, blockOf, R.params, limits);
  certificate.checks.push({ name: 'current graph matches the saved deterministic construction', pass: matches });
  certificate.pass = matches && certificate.checks.every(c => c.pass);
  return { ok: true, P, input, pass: certificate.pass, certificate, appliesToCurrentGraph: certificate.pass };
}

function components(g) {
  const n = g.nodes.length, adj = g.nodes.map(() => []);
  for (const e of g.edges) { adj[e.u].push(e.v); adj[e.v].push(e.u); }
  const seen = new Uint8Array(n); let c = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue; c++; seen[s] = 1; const q = [s];
    for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (!seen[v]) { seen[v] = 1; q.push(v); }
  }
  return c;
}
