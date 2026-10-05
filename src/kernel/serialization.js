// Reproducible inputs and recorded results. Cached results and certificates
// are checked against the current graph; they never replace computation.
import { validateGraph, graphToJSON } from './graph.js';
import { buildTopologyModel, restrictTopology, inducedGraph, members, MODES, STATISTICS } from './topology.js';
import { countUpsets, Budget, DEFAULT_LIMITS } from './enumeration.js';
import { recheckRealization, validatePoset } from './poset.js';

export const EXPERIMENT_SCHEMA = 'uphill-experiment/2';
export const APP_VERSION = '1.12.1';
export const KERNEL_VERSION = '1.1.0';
export const MANUSCRIPT_VERSION = 'UPHILL_MATHEMATICAL_MANUSCRIPT_v12_EDITABLE.html';
export const MANUSCRIPT_DATE = '2026-09-30';
export const IMPORT_LIMITS = Object.freeze({ ...DEFAULT_LIMITS, displayLimit: 100000,
  stateBudget: 10000000, timeBudgetMs: 60000, autoEnumerateMaxQuotient: 200 });
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const countJSON = c => ({ ...c, value: c.value == null ? null : c.value.toString() });
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const norm = x => JSON.stringify(x, (k, v) => Array.isArray(v) && v.every(t => typeof t === 'string') ? [...v].sort() : v);

// Stable labelled checksum; deliberately not an isomorphism invariant.
export function graphChecksum(graphJSON) {
  const canon = JSON.stringify({ kind: graphJSON.kind,
    nodes: [...graphJSON.nodes].map(n => [n.id, n.label]).sort(),
    edges: [...graphJSON.edges].map(e => [e.id, ...[e.source, e.target].sort()]).sort() });
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < canon.length; i++) {
    const c = canon.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c * 31 + i), 2246822519) >>> 0;
  }
  return 'fnv64:' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function topologyResults(T, degrees, selectedIds, limits) {
  const allowed = new Set(T.points.map(p => p.id));
  const A = T.setFromIds(selectedIds.filter(id => allowed.has(id))), r = T.analyze(A);
  const cnt = countUpsets(T.k, T.up, T.down, new Budget(limits));
  return { degrees, classes: T.classes.map(c => c.map(i => T.points[i].id)),
    leastNeighbourhoods: Object.fromEntries(T.points.map((p, i) => [p.id, T.ids(T.N[i])])),
    selection: { selected: T.ids(A), open: r.open, closed: r.closed, dense: r.dense,
      interior: T.ids(r.interior), closure: T.ids(r.closure), boundary: T.ids(r.boundary),
      exterior: T.ids(r.exterior), leastOpenEnlargement: T.ids(r.enlarge) },
    openCount: { status: cnt.status, value: cnt.value === null ? null : cnt.value.toString() } };
}

// Optional subspace argument remains for callers of the v1 kernel API.
// The selected subset is always intersected with the requested carrier.
export function computeResults(graph, mode, statistic, selectedIds = [], subspaceIds = null, limits = {}) {
  const M = buildTopologyModel(graph, mode, statistic);
  const T = subspaceIds === null ? M.topo : restrictTopology(M.topo, M.topo.setFromIds(subspaceIds));
  const degrees = Object.fromEntries(graph.nodes.map((p, i) => [p.id, M.degree[i]]));
  return topologyResults(T, degrees, selectedIds, limits);
}

export function computeSubspaceComparison(graph, mode, statistic, selectedIds, subspaceIds, limits = {}) {
  if (subspaceIds == null) return null;
  const M = buildTopologyModel(graph, mode, statistic), S = M.topo.setFromIds(subspaceIds);
  const carrier = M.topo.ids(S), ids = new Set(carrier), selected = selectedIds.filter(id => ids.has(id));
  const inherited = restrictTopology(M.topo, S), G = inducedGraph(graph, S);
  return { schemaVersion: 'uphill-subspace-comparison/1', mode, statistic,
    subspaceVertexIds: carrier, selectedVertexIds: selected,
    inherited: { carrierVertexIds: carrier, degreeConvention: 'ambient graph',
      results: topologyResults(inherited, Object.fromEntries(graph.nodes.map((p, i) => [p.id, M.degree[i]])), selected, limits) },
    recomputed: { carrierVertexIds: carrier, degreeConvention: 'induced graph',
      results: computeResults(G, mode, statistic, selected, null, limits) } };
}

function enumerationJSON(record, T, mode, statistic, requestedLimits) {
  if (!record) return null;
  const masks = record.upsetMasks || (record.opens || []).map(A => T.classMask(A));
  // Retain actual execution budgets separately from requested session
  // settings. Select scalar keys only; kernel callbacks are not provenance.
  const effectiveLimits = Object.fromEntries(Object.keys(DEFAULT_LIMITS).map(key =>
    [key, record.limits?.[key] ?? requestedLimits[key]]));
  effectiveLimits.displayLimit = record.displayLimit;
  return { schemaVersion: 'uphill-enumeration/1', kernelVersion: KERNEL_VERSION,
    mode, statistic, carrier: 'vertices', quotientClasses: T.classes.map(c => c.map(i => T.points[i].id)),
    upsetMasks: masks.map(String), status: record.status, listedCount: masks.length,
    displayLimit: record.displayLimit, count: countJSON(record.count),
    limits: effectiveLimits, engine: record.engine ?? null,
    lowerBound: record.lowerBound == null ? null : String(record.lowerBound) };
}

function generatorJSON(generator, graph, mode, statistic, limits) {
  if (!generator) return null;
  const checked = recheckRealization(generator.input, graph, limits);
  if (!checked.ok) return { input: generator.input, certificatePass: false,
    appliesToCurrentGraph: false, errors: checked.errors };
  const c = checked.certificate;
  return { input: checked.input, certificatePass: c.pass,
    appliesToCurrentGraph: c.pass && mode === 'uphill' && statistic === 'incident-edges',
    certificate: { pass: c.pass, checks: c.checks, openCount: countJSON(c.openCount),
      scope: 'Checks this finite construction; not a proof of Theorem 4.1.' } };
}

export function exportExperiment(state) {
  const g = graphToJSON(state.graph), selected = [...(state.selectedIds || [])];
  const limits = { ...DEFAULT_LIMITS, ...state.limits };
  const T = buildTopologyModel(state.graph, state.mode, state.statistic).topo;
  return { schemaVersion: EXPERIMENT_SCHEMA,
    appVersion: APP_VERSION, kernelVersion: KERNEL_VERSION, manuscriptVersion: MANUSCRIPT_VERSION, manuscriptDate: MANUSCRIPT_DATE,
    timestamp: new Date().toISOString(), graph: g, graphChecksum: graphChecksum(g),
    analysis: { mode: state.mode, statistic: state.statistic, carrier: 'vertices',
      selectedVertexIds: selected, subspaceVertexIds: null },
    subspaceComparison: computeSubspaceComparison(state.graph, state.mode, state.statistic, selected, state.subspaceIds ?? null, limits),
    generator: generatorJSON(state.generator, state.graph, state.mode, state.statistic, limits),
    enumeration: enumerationJSON(state.enumeration, T, state.mode, state.statistic, limits), limits,
    results: computeResults(state.graph, state.mode, state.statistic, selected, null, limits),
    provenance: { presetId: state.presetId || null, randomSeed: state.randomSeed ?? null } };
}

function validateIds(value, name, ids, errors, optional = false) {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) { errors.push(`${name} must be an array of string vertex IDs`); return []; }
  const seen = new Set();
  for (const id of value) {
    if (typeof id !== 'string' || !ids.has(id)) errors.push(`${name}: unknown vertex ID ${JSON.stringify(id)}`);
    else if (seen.has(id)) errors.push(`${name}: repeated vertex ID ${JSON.stringify(id)}`);
    seen.add(id);
  }
  // Continue collecting shape errors using only safe IDs: later carrier
  // comparisons must never coerce an invalid object while sorting.
  return value.filter(id => typeof id === 'string' && ids.has(id));
}

function validateCount(c, name, errors) {
  if (!object(c) || !['exact', 'not-computed'].includes(c.status)
    || (c.status === 'exact' ? typeof c.value !== 'string' || !/^(0|[1-9]\d*)$/.test(c.value) || c.value.length > 1000 : c.value !== null)) {
    errors.push(`${name} must have status exact with a nonnegative decimal string, or not-computed with null`);
  }
}

function validateResults(r, name, ids, errors, degreeIds = ids) {
  if (!object(r)) { errors.push(`${name} must be an object`); return; }
  if ('degrees' in r && (!object(r.degrees) || Object.entries(r.degrees).some(([id, d]) => !degreeIds.has(id) || !Number.isSafeInteger(d) || d < 0))) errors.push(`${name}.degrees must map known IDs to nonnegative integers`);
  if ('classes' in r) {
    if (!Array.isArray(r.classes)) errors.push(`${name}.classes must be an array`);
    else r.classes.forEach((c, i) => validateIds(c, `${name}.classes[${i}]`, ids, errors));
  }
  if ('leastNeighbourhoods' in r) {
    if (!object(r.leastNeighbourhoods)) errors.push(`${name}.leastNeighbourhoods must be an object`);
    else for (const [id, values] of Object.entries(r.leastNeighbourhoods)) {
      if (!ids.has(id)) errors.push(`${name}.leastNeighbourhoods: unknown vertex ${id}`);
      validateIds(values, `${name}.leastNeighbourhoods.${id}`, ids, errors);
    }
  }
  if ('selection' in r) {
    if (!object(r.selection)) errors.push(`${name}.selection must be an object`);
    else {
      for (const key of ['open', 'closed', 'dense']) if (key in r.selection && typeof r.selection[key] !== 'boolean') errors.push(`${name}.selection.${key} must be boolean`);
      for (const key of ['selected', 'interior', 'closure', 'boundary', 'exterior', 'leastOpenEnlargement']) if (key in r.selection) validateIds(r.selection[key], `${name}.selection.${key}`, ids, errors);
    }
  }
  if ('openCount' in r) validateCount(r.openCount, `${name}.openCount`, errors);
}

function importEnumeration(record, T, mode, statistic, limits, legacy, errors, mismatches) {
  if (record == null) return null;
  if (!object(record)) { errors.push('enumeration must be an object or null'); return null; }
  const effectiveLimits = { ...limits, displayLimit: record.displayLimit };
  if (record.limits !== undefined) {
    if (!object(record.limits)) errors.push('enumeration.limits must be an object');
    else for (const [key, value] of Object.entries(record.limits)) {
      if (!Object.hasOwn(IMPORT_LIMITS, key) || !Number.isSafeInteger(value) || value < 0 || value > IMPORT_LIMITS[key]) errors.push(`enumeration.limits.${key} must be a supported nonnegative integer within the import limit`);
      else effectiveLimits[key] = value;
    }
  }
  if (effectiveLimits.displayLimit !== record.displayLimit) errors.push('enumeration.limits.displayLimit must match enumeration.displayLimit');
  if (record.engine != null && (typeof record.engine !== 'string' || !record.engine.length || record.engine.length > 100)) errors.push('enumeration.engine must be a nonempty string of at most 100 characters or null');
  if (!['complete', 'display-cap', 'interrupted', 'cancelled', 'running'].includes(record.status)) errors.push('unknown enumeration status');
  if (!Number.isSafeInteger(record.listedCount) || record.listedCount < 0 || record.listedCount > IMPORT_LIMITS.displayLimit) errors.push('invalid enumeration listedCount');
  if (!Number.isSafeInteger(record.displayLimit) || record.displayLimit < 0 || record.displayLimit > IMPORT_LIMITS.displayLimit || record.listedCount > record.displayLimit) errors.push('invalid enumeration displayLimit');
  validateCount(record.count, 'enumeration.count', errors);
  if (legacy && record.upsetMasks === undefined) return null; // v1 did not save the loaded family.
  if (record.schemaVersion !== 'uphill-enumeration/1' || record.mode !== mode || record.statistic !== statistic || record.carrier !== 'vertices') errors.push('enumeration version/mode/statistic/carrier does not match analysis');
  const mapping = T.classes.map(c => c.map(i => T.points[i].id));
  if (JSON.stringify(record.quotientClasses) !== JSON.stringify(mapping)) errors.push('enumeration quotientClasses do not match canonical current classes');
  if (!Array.isArray(record.upsetMasks) || record.upsetMasks.length !== record.listedCount || record.upsetMasks.length > IMPORT_LIMITS.displayLimit) errors.push('enumeration upsetMasks must contain exactly listedCount entries');
  if (errors.length) return null;
  const masks = [], seen = new Set(), max = (1n << BigInt(T.k)) - 1n;
  for (const text of record.upsetMasks) {
    if (typeof text !== 'string' || !/^(0|[1-9]\d*)$/.test(text) || text.length > 1000) { errors.push('enumeration masks must be nonnegative decimal strings'); break; }
    const mask = BigInt(text);
    const open = !T.up.some((up, i) => (mask & (1n << BigInt(i))) && (up & ~mask));
    if (mask > max || seen.has(text) || !open) { errors.push('enumeration contains a repeated, out-of-range or non-open mask'); break; }
    seen.add(text); masks.push(mask);
  }
  if (record.lowerBound != null && (typeof record.lowerBound !== 'string' || !/^(0|[1-9]\d*)$/.test(record.lowerBound) || record.lowerBound !== String(masks.length))) errors.push('enumeration lowerBound must equal the number of loaded sets');
  if (errors.length) return null;
  const fresh = countUpsets(T.k, T.up, T.down, new Budget(effectiveLimits));
  const saved = record.count.value === null ? null : BigInt(record.count.value);
  if (saved !== null && saved < BigInt(masks.length)) errors.push('enumeration count is smaller than its loaded list');
  if (record.status === 'complete' && (record.count.status !== 'exact' || saved !== BigInt(masks.length))) errors.push('complete enumeration must have exact count equal to loaded list');
  if (fresh.status === 'exact' && saved !== null && fresh.value !== saved) errors.push('enumeration exact count disagrees with recomputation');
  if (errors.length) return null;
  const count = fresh.status === 'exact' ? fresh : { status: 'not-computed', value: null, method: fresh.method };
  let status = record.status === 'running' ? 'interrupted' : record.status;
  if (status === 'complete' && fresh.status !== 'exact') {
    status = 'interrupted'; mismatches.push('enumeration completeness not verified within current budget');
  }
  return { status, listedCount: masks.length, displayLimit: record.displayLimit,
    upsetMasks: masks, opens: masks.map(m => T.lift(m)), count,
    lowerBound: count.status === 'exact' ? null : BigInt(masks.length), limits: effectiveLimits,
    engine: record.engine ?? null };
}

// Every shape is checked before use. Failure never mutates a caller's state.
export function importExperiment(data) {
  const errors = [], mismatches = [], warnings = [];
  if (!object(data) || ![EXPERIMENT_SCHEMA, 'uphill-experiment/1'].includes(data.schemaVersion)) return { ok: false, errors: ['not a supported uphill-experiment/1 or /2 file'] };
  const legacy = data.schemaVersion === 'uphill-experiment/1';
  const limits = { ...DEFAULT_LIMITS };
  if (data.limits !== undefined) {
    if (!object(data.limits)) errors.push('limits must be an object');
    else for (const [key, value] of Object.entries(data.limits)) {
      if (!Object.hasOwn(IMPORT_LIMITS, key) || !Number.isSafeInteger(value) || value < 0 || value > IMPORT_LIMITS[key]) errors.push(`limits.${key} must be an integer from 0 to ${IMPORT_LIMITS[key] ?? 'a supported limit'}`);
      else limits[key] = value;
    }
  }
  const v = validateGraph(data.graph, { maxVertices: Math.min(limits.maxVertices, IMPORT_LIMITS.maxVertices), maxEdges: Math.min(limits.maxEdges, IMPORT_LIMITS.maxEdges) });
  if (!v.ok) errors.push(...v.errors);
  if (!object(data.analysis)) errors.push('analysis must be an object');
  if (errors.length) return { ok: false, errors };
  const a = data.analysis, ids = new Set(v.graph.nodes.map(n => n.id));
  if (!MODES.includes(a.mode)) errors.push(`unknown mode ${JSON.stringify(a.mode)}`);
  if (!STATISTICS.includes(a.statistic)) errors.push(`unknown statistic ${JSON.stringify(a.statistic)}`);
  const selected = validateIds(a.selectedVertexIds, 'analysis.selectedVertexIds', ids, errors, legacy);
  const oldSub = a.subspaceVertexIds == null ? null : validateIds(a.subspaceVertexIds, 'analysis.subspaceVertexIds', ids, errors);
  if (!['vertices', 'subspace'].includes(a.carrier)) errors.push('analysis.carrier must be vertices or subspace');
  if ((a.carrier === 'subspace') !== (oldSub !== null)) errors.push('analysis carrier and subspaceVertexIds are inconsistent');
  if (!legacy && a.carrier !== 'vertices') errors.push('v2 main analysis must use vertices; use subspaceComparison for S');
  let subspaceIds = oldSub;
  const sc = data.subspaceComparison;
  if (sc != null) {
    if (!object(sc)) errors.push('subspaceComparison must be an object or null');
    else {
      if (sc.schemaVersion !== 'uphill-subspace-comparison/1' || sc.mode !== a.mode || sc.statistic !== a.statistic) errors.push('subspaceComparison version/mode/statistic must match analysis');
      subspaceIds = validateIds(sc.subspaceVertexIds, 'subspaceComparison.subspaceVertexIds', ids, errors);
      const subIds = new Set(subspaceIds), intersection = selected.filter(id => subIds.has(id));
      const subA = validateIds(sc.selectedVertexIds, 'subspaceComparison.selectedVertexIds', subIds, errors);
      if (!sameSet(subA, intersection)) errors.push('subspaceComparison selection must equal ambient A intersect S');
      for (const key of ['inherited', 'recomputed']) {
        const c = sc[key];
        if (!object(c)) { errors.push(`subspaceComparison.${key} must be an object`); continue; }
        const carrier = validateIds(c.carrierVertexIds, `subspaceComparison.${key}.carrierVertexIds`, subIds, errors);
        if (!sameSet(carrier, subspaceIds)) errors.push(`subspaceComparison.${key} carrier must equal S`);
        if (c.degreeConvention !== (key === 'inherited' ? 'ambient graph' : 'induced graph')) errors.push(`subspaceComparison.${key} has inconsistent degreeConvention`);
        validateResults(c.results, `subspaceComparison.${key}.results`, subIds, errors, key === 'inherited' ? ids : subIds);
      }
    }
  }
  if (data.results !== undefined) validateResults(data.results, 'results', legacy && oldSub !== null ? new Set(oldSub) : ids, errors, ids);
  if (data.graphChecksum !== undefined && typeof data.graphChecksum !== 'string') errors.push('graphChecksum must be a string');
  if (data.provenance != null && !object(data.provenance)) errors.push('provenance must be an object');
  const provenance = object(data.provenance) ? data.provenance : {};
  if (provenance.presetId != null && typeof provenance.presetId !== 'string') errors.push('provenance.presetId must be a string or null');
  if (provenance.randomSeed != null && typeof provenance.randomSeed !== 'string' && !Number.isSafeInteger(provenance.randomSeed)) errors.push('provenance.randomSeed must be a string, safe integer or null');
  if (data.generator != null) {
    if (!object(data.generator)) errors.push('generator must be an object or null');
    else {
      const P = validatePoset(data.generator.input);
      if (!P.ok) errors.push(...P.errors.map(e => `generator.input: ${e}`));
    }
  }
  if (errors.length) return { ok: false, errors };
  const state = { graph: v.graph, mode: a.mode, statistic: a.statistic, selectedIds: [...selected], subspaceIds,
    generator: null, limits, randomSeed: provenance.randomSeed ?? null, presetId: provenance.presetId ?? null };
  const fresh = computeResults(v.graph, a.mode, a.statistic, selected, null, limits);
  const cachedContext = legacy && oldSub !== null ? computeResults(v.graph, a.mode, a.statistic, selected, oldSub, limits) : fresh;
  if (data.results) for (const key of Object.keys(cachedContext)) if (key in data.results && norm(cachedContext[key]) !== norm(data.results[key])) mismatches.push(key);
  const comparison = computeSubspaceComparison(v.graph, a.mode, a.statistic, selected, subspaceIds, limits);
  if (sc) for (const key of ['inherited', 'recomputed']) if (norm(sc[key].results) !== norm(comparison[key].results)) mismatches.push(`subspaceComparison.${key}`);
  if (data.graphChecksum && data.graphChecksum !== graphChecksum(data.graph)) mismatches.push('graphChecksum');
  state.enumeration = importEnumeration(data.enumeration, buildTopologyModel(v.graph, a.mode, a.statistic).topo, a.mode, a.statistic, limits, legacy, errors, mismatches);
  if (data.generator) {
    const checked = recheckRealization(data.generator.input, v.graph, limits);
    if (!checked.ok) errors.push(...checked.errors.map(e => `generator: ${e}`));
    else {
      checked.appliesToCurrentGraph = checked.pass && a.mode === 'uphill' && a.statistic === 'incident-edges';
      state.generator = checked;
      if (data.generator.certificatePass !== undefined && data.generator.certificatePass !== checked.pass) mismatches.push('generator.certificatePass');
    }
  }
  if (errors.length) return { ok: false, errors };
  if (legacy && oldSub !== null) warnings.push('Legacy subspace analysis restored as an explicit comparison; primary analysis uses ambient vertices.');
  return { ok: true, state, results: fresh, subspaceComparison: comparison, mismatches, errors: [], warnings: [...v.warnings, ...warnings] };
}

export { members };
