// Uphill Topology Explorer - graph input, validation and degree statistics.
// Spec: UPHILL_CLAUDE_CODE_SIMULATOR_SPEC_v1_2026-09-30, sections 03, 07, 11.
//
// The graph is the ONLY mathematical input. Degrees are always recomputed
// from the edge instances; any "degree" metadata on a node is kept as
// metadata and reported if it disagrees, never used.

export const GRAPH_SCHEMA = 'uphill-graph/1';
export const KINDS = ['simple-undirected', 'loopless-multigraph'];

// Canonical order of stable IDs: numeric-aware, then plain string order,
// so "2" < "10" and the order never depends on insertion or layout.
export function compareIds(a, b) {
  const na = /^-?\d+$/.test(a), nb = /^-?\d+$/.test(b);
  if (na && nb) {
    const x = BigInt(a), y = BigInt(b);
    if (x !== y) return x < y ? -1 : 1;
  }
  if (na !== nb) return na ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export class GraphError extends Error {
  constructor(message, location) {
    super(location ? `${message} (at ${location})` : message);
    this.location = location || null;
  }
}

// validateGraph(input) -> { ok, graph, errors, warnings }
// The returned graph keeps the caller's node order for display, plus
// `order`: node indices sorted canonically by ID.
export function validateGraph(input, opts = {}) {
  const errors = [], warnings = [];
  const fail = (m, loc) => { errors.push(new GraphError(m, loc).message); };
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('graph must be a JSON object');
    return { ok: false, errors, warnings };
  }
  const kind = input.kind === undefined ? 'simple-undirected' : input.kind;
  if (!KINDS.includes(kind)) {
    if (typeof kind === 'string' && /direct|weight/i.test(kind)) {
      fail(`graph kind "${kind}" is not supported: this engine uses undirected, `
        + 'unweighted adjacency; convert explicitly', 'kind');
    } else fail(`unknown graph kind ${JSON.stringify(kind)}`, 'kind');
  }
  if (!Array.isArray(input.nodes)) fail('"nodes" must be an array (isolated vertices need it)', 'nodes');
  if (!Array.isArray(input.edges)) fail('"edges" must be an array', 'edges');
  if (errors.length) return { ok: false, errors, warnings };
  if (opts.maxVertices !== undefined && input.nodes.length > opts.maxVertices) fail(`graph has ${input.nodes.length} vertices; limit is ${opts.maxVertices}`, 'nodes');
  if (opts.maxEdges !== undefined && input.edges.length > opts.maxEdges) fail(`graph has ${input.edges.length} edges; limit is ${opts.maxEdges}`, 'edges');
  if (errors.length) return { ok: false, errors, warnings };

  const nodes = [], index = new Map();
  input.nodes.forEach((n, i) => {
    const loc = `nodes[${i}]`;
    if (n === null || typeof n !== 'object' || Array.isArray(n)) return fail('node must be an object', loc);
    if (typeof n.id !== 'string' || n.id.length === 0) return fail('node id must be a non-empty string', loc);
    if (index.has(n.id)) return fail(`repeated node id "${n.id}"`, loc);
    if (n.label !== null && typeof n.label === 'object') return fail('node label must be text or a scalar value', loc + '.label');
    const label = n.label === undefined ? n.id : String(n.label);
    const meta = {};
    for (const k of Object.keys(n)) if (k !== 'id' && k !== 'label') meta[k] = n[k];
    index.set(n.id, nodes.length);
    nodes.push({ id: n.id, label, meta });
  });
  const edges = [], edgeIds = new Set(), pairs = new Map();
  input.edges.forEach((e, i) => {
    const loc = `edges[${i}]`;
    if (e === null || typeof e !== 'object' || Array.isArray(e)) return fail('edge must be an object', loc);
    if (e.id !== null && typeof e.id === 'object') return fail('edge id must be text or a scalar value', loc + '.id');
    const id = e.id === undefined ? `e${i + 1}` : String(e.id);
    if (edgeIds.has(id)) return fail(`repeated edge id "${id}"`, loc);
    if (e.directed === true) return fail('directed edge: this engine is undirected; convert explicitly', loc);
    if (e.weight !== undefined && e.weight !== 1) warnings.push(`${loc}: weight ignored (unweighted engine)`);
    if (!index.has(e.source)) return fail(`unknown endpoint ${JSON.stringify(e.source)}`, loc + '.source');
    if (!index.has(e.target)) return fail(`unknown endpoint ${JSON.stringify(e.target)}`, loc + '.target');
    if (e.source === e.target) return fail(`loop at "${e.source}" is not allowed`, loc);
    const u = index.get(e.source), v = index.get(e.target);
    const key = u < v ? `${u},${v}` : `${v},${u}`;
    if (pairs.has(key) && kind === 'simple-undirected') {
      return fail(`duplicate edge {${e.source},${e.target}} in a simple graph `
        + `(also ${pairs.get(key)}); convert to loopless-multigraph or deduplicate explicitly`, loc);
    }
    pairs.set(key, pairs.has(key) ? pairs.get(key) : id);
    edgeIds.add(id);
    edges.push({ id, u, v });
  });
  if (errors.length) return { ok: false, errors, warnings };

  const layout = {};
  if (input.layout && typeof input.layout === 'object') {
    for (const [k, p] of Object.entries(input.layout)) {
      if (index.has(k) && p && Number.isFinite(p.x) && Number.isFinite(p.y)) layout[k] = { x: p.x, y: p.y };
    }
  }
  const order = nodes.map((_, i) => i).sort((a, b) => compareIds(nodes[a].id, nodes[b].id));
  const graph = { schemaVersion: GRAPH_SCHEMA, kind, nodes, edges, index, order, layout,
    meta: input.meta && typeof input.meta === 'object' ? input.meta : {} };
  // metadata that claims to be a degree is checked against the real one
  const dE = computeStatistic(graph, 'incident-edges');
  nodes.forEach((n, i) => {
    const claimedDegree = n.meta.degree;
    if (claimedDegree !== undefined && ((typeof claimedDegree !== 'number' && typeof claimedDegree !== 'string') || Number(claimedDegree) !== dE[i])) {
      warnings.push(`node "${n.id}": metadata degree ${JSON.stringify(claimedDegree)} ignored; actual degree is ${dE[i]}`);
    }
  });
  return { ok: true, graph, errors, warnings };
}

// neighbour sets (distinct), from edge instances
export function neighbourSets(graph) {
  const nb = graph.nodes.map(() => new Set());
  for (const e of graph.edges) { nb[e.u].add(e.v); nb[e.v].add(e.u); }
  return nb;
}

// computeStatistic(graph, 'incident-edges' | 'distinct-neighbours') -> Int array
export function computeStatistic(graph, statistic) {
  const n = graph.nodes.length;
  if (statistic === 'incident-edges') {
    const d = new Array(n).fill(0);
    for (const e of graph.edges) { d[e.u] += 1; d[e.v] += 1; }
    return d;
  }
  if (statistic === 'distinct-neighbours') return neighbourSets(graph).map(s => s.size);
  throw new GraphError(`unknown statistic "${statistic}"`);
}

// Serialize back to the interchange format (IDs, labels, edges, layout).
export function graphToJSON(graph) {
  return {
    schemaVersion: GRAPH_SCHEMA,
    kind: graph.kind,
    nodes: graph.nodes.map(n => Object.assign({ id: n.id, label: n.label }, n.meta)),
    edges: graph.edges.map(e => ({ id: e.id, source: graph.nodes[e.u].id, target: graph.nodes[e.v].id })),
    layout: JSON.parse(JSON.stringify(graph.layout || {})),
    meta: JSON.parse(JSON.stringify(graph.meta || {})),
  };
}

// Two whitespace/comma-delimited IDs are authoritative. The legacy a-b
// shorthand is supported only for unsigned ASCII letter/underscore names.
// Signed, numeric, Unicode and hyphen-bearing IDs use two explicit tokens.
export function parseEdgeList(text, isolatesText = '', kind = 'simple-undirected') {
  const nodes = [], seen = new Set(), edges = [], errors = [];
  if (typeof text !== 'string' || typeof isolatesText !== 'string') return { ok: false, errors: ['edge list and isolates must be text'], warnings: [] };
  const addNode = id => { if (!seen.has(id)) { seen.add(id); nodes.push({ id, label: id }); } };
  (isolatesText || '').split(/[\s,]+/).filter(Boolean).forEach(addNode);
  (text || '').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim().replace(/\s+#.*/, '');
    if (t.startsWith('#')) return;
    if (!t) return;
    let m = t.split(/[\s,]+/);
    if (m.length === 1 && /^[A-Za-z_][A-Za-z_0-9]*-[A-Za-z_][A-Za-z_0-9]*$/.test(t)) m = t.split('-');
    if (m.length !== 2 || m.some(id => !id || id === '-')) { errors.push(`line ${i + 1}: expected two whitespace/comma-separated vertex IDs; use "-1 2" for signed IDs, or JSON for arbitrary IDs (got "${t}")`); return; }
    addNode(m[0]); addNode(m[1]);
    edges.push({ id: `e${edges.length + 1}`, source: m[0], target: m[1] });
  });
  if (errors.length) return { ok: false, errors, warnings: [] };
  return validateGraph({ schemaVersion: GRAPH_SCHEMA, kind, nodes, edges });
}
