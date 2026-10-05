// Uphill Topology Explorer - the topology kernel.
// Spec sections 03 (default topology), 04 (three modes), 05 (subset
// analysis), 06 (quotient), 08 (engine), 10 (subspaces).
//
// Everything here is exact and deterministic. A finite topology is carried
// by its LEAST NEIGHBOURHOODS N(x); every other notion (open, closed,
// interior, closure, boundary, classes, quotient order) is derived from N.
import { computeStatistic, neighbourSets, compareIds } from './graph.js';

export const MODES = ['uphill', 'strict', 'weak-patch'];
export const STATISTICS = ['incident-edges', 'distinct-neighbours'];

// ------------------------------------------------------------------ sets
export const setOf = (n, idxs) => { const s = new Uint8Array(n); for (const i of idxs) s[i] = 1; return s; };
export const members = s => { const out = []; for (let i = 0; i < s.length; i++) if (s[i]) out.push(i); return out; };
export const subset = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] && !b[i]) return false; return true; };
export const meets = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] && b[i]) return true; return false; };
export const equal = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
export const sizeOf = s => { let c = 0; for (let i = 0; i < s.length; i++) c += s[i]; return c; };

// ------------------------------------------------ generic finite topology
// points: [{id,label}], N: Uint8Array[] with N[x][x] = 1.
export class FiniteTopology {
  constructor(points, N, info = {}) {
    this.points = points;
    this.n = points.length;
    this.N = N;
    this.info = info;
    for (let x = 0; x < this.n; x++) {
      if (!N[x][x]) throw new Error(`least neighbourhood of ${points[x].id} misses its point`);
    }
    this._classes();
    this._order();
  }

  // indistinguishable points: equal least neighbourhoods
  _classes() {
    const byKey = new Map();
    const canon = this.points.map((_, i) => i).sort((a, b) => compareIds(this.points[a].id, this.points[b].id));
    this.canonRank = new Array(this.n);
    canon.forEach((x, r) => { this.canonRank[x] = r; });
    for (const x of canon) {
      const key = members(this.N[x]).join(',');
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(x);
    }
    this.classes = [...byKey.values()];            // in canonical order of first member
    this.pointToClass = new Array(this.n);
    this.classes.forEach((c, i) => c.forEach(x => { this.pointToClass[x] = i; }));
  }

  // quotient order: C <= D iff a point of D is in N(point of C)
  _order() {
    const k = this.classes.length;
    this.k = k;
    this.le = [];
    for (let i = 0; i < k; i++) {
      const row = new Uint8Array(k), Ni = this.N[this.classes[i][0]];
      for (let j = 0; j < k; j++) row[j] = Ni[this.classes[j][0]] ? 1 : 0;
      this.le.push(row);
    }
    this.up = this.le.map(row => maskOf(members(row)));
    this.down = [];
    for (let j = 0; j < k; j++) {
      const col = []; for (let i = 0; i < k; i++) if (this.le[i][j]) col.push(i);
      this.down.push(maskOf(col));
    }
    // Hasse covers: C < D with no Z, C < Z < D
    this.covers = [];
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      if (i === j || !this.le[i][j]) continue;
      let cover = true;
      for (let z = 0; z < k && cover; z++) {
        if (z !== i && z !== j && this.le[i][z] && this.le[z][j]) cover = false;
      }
      if (cover) this.covers.push([i, j]);
    }
  }

  isOpen(A) { for (let x = 0; x < this.n; x++) if (A[x] && !subset(this.N[x], A)) return false; return true; }

  analyze(A) { return analyzeSubset(this, A); }

  classMask(A) { let m = 0n; for (let x = 0; x < this.n; x++) if (A[x]) m |= 1n << BigInt(this.pointToClass[x]); return m; }

  lift(mask) {
    const s = new Uint8Array(this.n);
    for (let i = 0; i < this.k; i++) if ((mask >> BigInt(i)) & 1n) for (const x of this.classes[i]) s[x] = 1;
    return s;
  }

  ids(A) { return members(A).map(i => this.points[i].id); }

  setFromIds(ids) {
    const s = new Uint8Array(this.n), pos = new Map(this.points.map((p, i) => [p.id, i]));
    for (const id of ids) { if (!pos.has(id)) throw new Error(`unknown point "${id}"`); s[pos.get(id)] = 1; }
    return s;
  }
}

export const maskOf = idxs => { let m = 0n; for (const i of idxs) m |= 1n << BigInt(i); return m; };

// ------------------------------------------------------ subset analysis
// int, cl, bd, ext, least open enlargement O(A), open/closed/dense.
export function analyzeSubset(T, A) {
  const n = T.n, interior = new Uint8Array(n), closure = new Uint8Array(n);
  const enlarge = new Uint8Array(n);
  for (let x = 0; x < n; x++) {
    if (subset(T.N[x], A)) interior[x] = 1;
    if (meets(T.N[x], A)) closure[x] = 1;
    if (A[x]) for (let y = 0; y < n; y++) if (T.N[x][y]) enlarge[y] = 1;
  }
  const boundary = new Uint8Array(n), exterior = new Uint8Array(n);
  for (let x = 0; x < n; x++) { boundary[x] = closure[x] && !interior[x] ? 1 : 0; exterior[x] = closure[x] ? 0 : 1; }
  const all = new Uint8Array(n).fill(1);
  return {
    interior, closure, boundary, exterior, enlarge,
    open: equal(A, interior), closed: equal(A, closure), dense: equal(closure, all),
  };
}

// ------------------------------------------------------ graph models
// buildTopologyModel(graph, mode, statistic) - the three topologies on V.
export function buildTopologyModel(graph, mode = 'uphill', statistic = 'incident-edges') {
  if (!MODES.includes(mode)) throw new Error(`unknown mode "${mode}"`);
  if (!STATISTICS.includes(statistic)) throw new Error(`unknown statistic "${statistic}"`);
  const n = graph.nodes.length;
  const degree = computeStatistic(graph, statistic);
  const nb = neighbourSets(graph);
  const rule = mode === 'strict' ? 'strict' : 'non-strict';
  const allowed = buildAllowedDigraph(nb, degree, rule);
  const reach = computeReachability(allowed.succ);
  const base = rule === 'non-strict' ? reach : computeReachability(buildAllowedDigraph(nb, degree, 'non-strict').succ);
  let N;
  if (mode === 'weak-patch') {
    // finite weak patch: least neighbourhood = the NON-STRICT plateau of x
    N = [];
    for (let x = 0; x < n; x++) {
      const s = new Uint8Array(n);
      for (let y = 0; y < n; y++) if (base[x][y] && base[y][x]) s[y] = 1;
      N.push(s);
    }
  } else N = reach;
  const points = graph.nodes.map(p => ({ id: p.id, label: p.label }));
  const topo = new FiniteTopology(points, N, { mode, statistic, carrier: 'vertices' });
  // the original (non-strict) plateaus, kept for reference colouring
  const plateauTopo = mode === 'uphill' ? topo : new FiniteTopology(points, base, { mode: 'uphill', statistic });
  return {
    graph, mode, statistic, rule, degree, nb,
    arcs: allowed.arcs, succ: allowed.succ, pred: allowed.pred,
    reach, topo, plateaus: plateauTopo.classes, plateauOf: plateauTopo.pointToClass,
    baseOrder: plateauTopo,
  };
}

// allowed arcs: u->v iff d(u) <= d(v) (non-strict) / d(u) < d(v) (strict)
export function buildAllowedDigraph(nb, degree, rule) {
  const n = nb.length, succ = nb.map(() => []), pred = nb.map(() => []), arcs = [];
  for (let u = 0; u < n; u++) {
    for (const v of [...nb[u]].sort((a, b) => a - b)) {
      const ok = rule === 'strict' ? degree[u] < degree[v] : degree[u] <= degree[v];
      if (ok) { succ[u].push(v); pred[v].push(u); arcs.push([u, v]); }
    }
  }
  return { succ, pred, arcs };
}

// reflexive-transitive closure by BFS from every vertex (reference method)
export function computeReachability(succ) {
  const n = succ.length, R = [];
  for (let x = 0; x < n; x++) {
    const seen = new Uint8Array(n); seen[x] = 1;
    const q = [x];
    for (let h = 0; h < q.length; h++) for (const v of succ[q[h]]) if (!seen[v]) { seen[v] = 1; q.push(v); }
    R.push(seen);
  }
  return R;
}

// plateaus as equal-degree connected components (must equal the SCCs)
export function equalDegreeComponents(nb, degree) {
  const n = nb.length, comp = new Array(n).fill(-1);
  let c = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    comp[s] = c; const q = [s];
    for (let h = 0; h < q.length; h++) {
      for (const v of nb[q[h]]) if (comp[v] < 0 && degree[v] === degree[q[h]]) { comp[v] = c; q.push(v); }
    }
    c++;
  }
  return comp;
}

// ------------------------------------------------------ witnesses
// shortest allowed path from x into target set (self is a path)
export function pathInto(model, x, target) {
  if (target[x]) return [x];
  const n = model.graph.nodes.length, prev = new Array(n).fill(-1), seen = new Uint8Array(n);
  seen[x] = 1; const q = [x];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const v of model.succ[u]) {
      if (seen[v]) continue;
      seen[v] = 1; prev[v] = u;
      if (target[v]) { const p = [v]; for (let w = u; w !== -1; w = prev[w]) p.push(w); return p.reverse(); }
      q.push(v);
    }
  }
  return null;
}

// why A is (not) open, on the full graph
export function openWitness(model, A) {
  const T = model.topo;
  if (T.isOpen(A)) return null;
  if (model.mode === 'weak-patch') {
    for (const cls of T.classes) {
      const inA = cls.filter(x => A[x]), out = cls.filter(x => !A[x]);
      if (inA.length && out.length) return { kind: 'split-class', inside: inA[0], outside: out[0], cls };
    }
  }
  for (const [u, v] of model.arcs) if (A[u] && !A[v]) return { kind: 'arc', from: u, to: v };
  return null;
}

// why x is in cl(A): a path into A (or the shared plateau in weak patch)
export function closureWitness(model, x, A) {
  if (model.mode === 'weak-patch') {
    const cls = model.topo.classes[model.topo.pointToClass[x]];
    const a = cls.find(y => A[y]);
    return a === undefined ? null : { kind: 'same-class', point: a, cls };
  }
  const p = pathInto(model, x, A);
  return p ? { kind: 'path', path: p } : null;
}

// why x is not in int(A): a point of N(x) outside A, with its path
export function interiorFailWitness(model, x, A) {
  const out = new Uint8Array(A.length);
  for (let y = 0; y < A.length; y++) out[y] = model.topo.N[x][y] && !A[y] ? 1 : 0;
  if (!out.some(Boolean)) return null;
  if (model.mode === 'weak-patch') return { kind: 'same-class', point: members(out)[0] };
  return { kind: 'path', path: pathInto(model, x, out) };
}

// ------------------------------------------------------ comparison
// T1 subset of T2 (same labelled carrier) iff N2(x) subset of N1(x) for all x.
export function compareTopologies(T1, T2) {
  if (T1.n !== T2.n || T1.points.some((p, i) => p.id !== T2.points[i].id)) {
    throw new Error('topologies are on different carriers; give an explicit map');
  }
  const w12 = [], w21 = [];
  for (let x = 0; x < T1.n; x++) {
    if (!subset(T2.N[x], T1.N[x])) w12.push(x);   // N1(x) is T1-open, not T2-open
    if (!subset(T1.N[x], T2.N[x])) w21.push(x);
  }
  return {
    firstInSecond: w12.length === 0, secondInFirst: w21.length === 0,
    equal: !w12.length && !w21.length,
    witnessFirstNotSecond: w12.length ? { point: w12[0], set: T1.N[w12[0]] } : null,
    witnessSecondNotFirst: w21.length ? { point: w21[0], set: T2.N[w21[0]] } : null,
  };
}

// ------------------------------------------------------ subspaces
// inherited topology on S: N_S(x) = N(x) intersect S
export function restrictTopology(T, S) {
  const idx = members(S), pos = new Map(idx.map((x, i) => [x, i]));
  const points = idx.map(x => T.points[x]);
  const N = idx.map(x => { const s = new Uint8Array(idx.length); for (const y of idx) if (T.N[x][y]) s[pos.get(y)] = 1; return s; });
  const R = new FiniteTopology(points, N, Object.assign({}, T.info, { carrier: 'subspace' }));
  R.ambientIndex = idx;
  return R;
}

// the induced graph G[S], rebuilt from scratch (new degrees)
export function inducedGraph(graph, S) {
  const keep = members(S), pos = new Map(keep.map((x, i) => [x, i]));
  const nodes = keep.map(x => graph.nodes[x]);
  const edges = graph.edges.filter(e => S[e.u] && S[e.v]).map(e => ({ id: e.id, u: pos.get(e.u), v: pos.get(e.v) }));
  const index = new Map(nodes.map((p, i) => [p.id, i]));
  const order = nodes.map((_, i) => i).sort((a, b) => compareIds(nodes[a].id, nodes[b].id));
  const layout = {};
  for (const p of nodes) if (graph.layout && graph.layout[p.id]) layout[p.id] = graph.layout[p.id];
  return { schemaVersion: graph.schemaVersion, kind: graph.kind, nodes, edges, index, order, layout, meta: {} };
}

// a witness that an inherited relation x <= y in S uses a path through V
export function ambientPath(model, x, y) {
  const t = new Uint8Array(model.graph.nodes.length); t[y] = 1;
  return pathInto(model, x, t);
}
