// Uphill Topology Explorer - interface. Spec sections 05, 06, 07, 13, 15.
// The interface never computes topology itself: every number shown comes
// from the kernel (src/kernel), recomputed from the whole graph after each
// committed edit. Layout moves are not mathematical edits.
import { validateGraph, graphToJSON, parseEdgeList, compareIds } from '../kernel/graph.js';
import { buildTopologyModel, restrictTopology, inducedGraph, compareTopologies, openWitness,
  closureWitness, interiorFailWitness, pathInto, members, setOf } from '../kernel/topology.js';
import { enumerateOpens, countUpsets, Budget, describeEnumeration, DEFAULT_LIMITS, upsets } from '../kernel/enumeration.js';
import { validatePoset, realizeFinitePoset, estimateRealization } from '../kernel/poset.js';
import { exportExperiment, importExperiment, APP_VERSION, KERNEL_VERSION, MANUSCRIPT_VERSION } from '../kernel/serialization.js';
import { PRESET_INFO, EXTRA_PRESETS, isolatedPreset } from '../presets.js';
import { staticFigure, reportCSS, subspaceReport, loadedSetsReport } from './static-export.js';
import { neighbourhoodTrace, relationTrace } from './exploration.js';
import { installGraphViewports, resetGraphViewports } from './graph-viewport.js';
import { relaxedNetworkLayout } from './drawing-layout.js';
import { installGraphDetails } from './graph-details.js';
import { neighbourhoodComparison, NEIGHBOURHOOD_COLOURS } from './neighbourhood-colours.js';
import { installVisualExplorer } from './visual-explainer.js';
import { installIntroGuide } from './intro-guide.js';
import { installLiveTour } from './live-tour.js';
import { createTourAdapter } from './tour-adapter.js';
import { installControlMenus } from './control-menus.js';
import { installPresetFan } from './preset-fan.js';
import { installControlHelp } from './control-help.js';

// ------------------------------------------------------------ strings
const STR = {
  en: {
    title: 'Uphill Topology Explorer',
    uphill: 'uphill (non-strict)', strict: 'strict uphill', 'weak-patch': 'finite weak patch',
    'incident-edges': 'incident edges d_E', 'distinct-neighbours': 'distinct neighbours d_V',
    recomputing: 'Recomputing after edit…',
  },
};
const LANG = 'en';
const t = k => (STR[LANG][k] !== undefined ? STR[LANG][k] : k);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------ state
const S = {
  graph: null, presetId: null, mode: 'uphill', statistic: 'incident-edges',
  selected: new Set(), focus: null, focusClass: null, preview: null,
  showArcs: true, classColour: true, quotientView: 'hasse', tool: 'select', pendingConnect: null,
  undo: [], redo: [], rev: 0, model: null, analysis: null,
  enumeration: null, enumRev: -1, enumKey: null, enumReq: 0, enumRunning: false, enumPage: 0, limits: Object.assign({}, DEFAULT_LIMITS),
  sub: new Set(), tab: 'opens', generator: null, generatorRev: -1, messages: [], explain: null,
  randomSeed: null, trace: null, colourMode: 'neighbourhoods', workspace: 'explore',
};
let visualExplorer = null, introGuide = null, liveTour = null, controlMenus = null, presetFan = null, controlHelp = null;
let tourPreviewActive = false;
const FIXTURES = (typeof FIXTURE_GRAPHS !== 'undefined') ? FIXTURE_GRAPHS : {};

// ------------------------------------------------------------ helpers
const $ = sel => document.querySelector(sel);
const idx = id => S.graph.index.get(id);
const label = i => S.graph.nodes[i].label;
const setIds = s => members(s).map(i => S.graph.nodes[i].id);
const fmtSet = (T, s) => { const m = members(s); return m.length ? '{' + m.map(i => esc(T.points[i].label)).join(', ') + '}' : '∅'; };
const say = (m, kind = 'info') => { S.messages = [{ m, kind }]; };
const analyticalKey = () => `${S.rev}|${S.mode}|${S.statistic}`;
const currentEnumeration = () => S.enumKey === analyticalKey() ? S.enumeration : null;
function clearTransientAnalysis() { S.explain = null; S.preview = null; S.focusClass = null; S.pendingConnect = null; S.trace = null; }

function snapshot() {
  return { graph: graphToJSON(S.graph), selected: [...S.selected], sub: [...S.sub], presetId: S.presetId,
    mode: S.mode, statistic: S.statistic, limits: { ...S.limits }, randomSeed: S.randomSeed,
    generator: S.generator, generatorValid: S.generatorRev === S.rev };
}
function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 200) S.undo.shift(); S.redo = []; }
function restore(snap) {
  S.messages = []; // Notices describe the discarded state, not this restored experiment.
  const v = validateGraph(snap.graph); S.graph = v.graph;
  S.selected = new Set(snap.selected); S.sub = new Set(snap.sub); S.presetId = snap.presetId;
  S.mode = snap.mode; S.statistic = snap.statistic; S.limits = { ...snap.limits }; S.randomSeed = snap.randomSeed;
  S.generator = snap.generator; S.generatorRev = snap.generatorValid ? S.rev + 1 : -1;
  commit(true);
}

function loadGraph(input, presetId = null, keepUndo = true, target = {}) {
  const v = validateGraph(input, S.limits);
  if (!v.ok) { say('Rejected: ' + v.errors.join('; '), 'error'); render(); return false; }
  if (v.graph.nodes.length > S.limits.maxVertices || v.graph.edges.length > S.limits.maxEdges) {
    say(`Rejected: graph exceeds the interactive limit (${S.limits.maxVertices} vertices / ${S.limits.maxEdges} edges).`, 'error'); render(); return false;
  }
  if (keepUndo && S.graph) pushUndo();
  S.mode = target.mode || S.mode; S.statistic = target.statistic || S.statistic;
  S.graph = v.graph; S.presetId = presetId; ensureLayout(S.graph);
  if ($('#layout-choice')) $('#layout-choice').value = 'current';
  S.selected = new Set((target.selectedIds || []).filter(id => S.graph.index.has(id))); S.sub = new Set(); S.focus = null; S.focusClass = null; S.preview = null;
  S.generator = target.generator || null; S.generatorRev = S.generator ? S.rev + 1 : -1; S.randomSeed = null;
  if (v.warnings.length) say(v.warnings.join('; '), 'warn'); else S.messages = [];
  commit(true);
  return true;
}

// every committed edit: bump the revision, drop stale enumeration, recompute
function commit(graphChanged) {
  if (graphChanged) {
    S.rev++;
    cancelEnumeration();
    S.enumeration = null; S.enumKey = null; S.enumRev = -1; S.enumPage = 0;
    clearTransientAnalysis();
    fieldDrafts.clear();
    const ids = new Set(S.graph.nodes.map(n => n.id));
    const gone = [...S.selected].filter(x => !ids.has(x));
    if (gone.length) { gone.forEach(x => S.selected.delete(x)); say(`Removed from the selection (vertex deleted): ${gone.join(', ')}`, 'warn'); }
    [...S.sub].forEach(x => { if (!ids.has(x)) S.sub.delete(x); });
    if (S.focus !== null && !ids.has(S.focus)) S.focus = null;
  }
  recompute();
  render();
  if (graphChanged) resetGraphViewports();
  maybeAutoEnumerate();
}

function recompute() {
  S.model = buildTopologyModel(S.graph, S.mode, S.statistic);
  const T = S.model.topo;
  S.A = T.setFromIds([...S.selected]);
  S.analysis = T.analyze(S.A);
  S.neighbourhoods = neighbourhoodComparison(S.graph, T, S.selected);
}

// ------------------------------------------------------------ layout
function ensureLayout(g) {
  const n = g.nodes.length, missing = g.nodes.filter(p => !g.layout[p.id]);
  if (!missing.length) return;
  if (g.meta && g.meta.blockLayout) { Object.assign(g.layout, g.meta.blockLayout); if (g.nodes.every(p => g.layout[p.id])) return; }
  const cx = 180, cy = 170, r = Math.max(60, Math.min(150, 26 * n / Math.PI));
  g.nodes.forEach((p, i) => {
    if (!g.layout[p.id]) {
      const a = -Math.PI / 2 + 2 * Math.PI * i / Math.max(1, n);
      g.layout[p.id] = { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
    }
  });
}

function applyDrawingLayout(choice) {
  const g = S.graph, order = g.order;
  if (choice === 'network') {
    Object.assign(g.layout, relaxedNetworkLayout(g));
  } else if (choice === 'circle') {
    const r = Math.max(145, order.length * 13), centre = r + 50;
    order.forEach((i, j) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * j / Math.max(1, order.length);
      g.layout[g.nodes[i].id] = { x: Math.round(centre + r * Math.cos(angle)), y: Math.round(centre + r * Math.sin(angle)) };
    });
  } else if (choice === 'levels') {
    const levels = [...new Set(S.model.degree)].sort((a, b) => a - b);
    const groups = levels.map(d => order.filter(i => S.model.degree[i] === d));
    const width = Math.max(360, ...groups.map(row => row.length * 100));
    groups.forEach((row, level) => row.forEach((i, j) => {
      g.layout[g.nodes[i].id] = { x: Math.round(width * (j + 1) / (row.length + 1)), y: 55 + (groups.length - 1 - level) * 100 };
    }));
  } else { resetGraphViewports(); return; }
  say('Drawing arranged by ' + ({ levels: 'degree levels', circle: 'a circle', network: 'a relaxed network' }[choice]) + '. The graph, A and topology are unchanged.');
  render(); resetGraphViewports();
}

// ------------------------------------------------------------ graph SVG
const COL = { interior: '#7544a4', boundary: '#c44591', exterior: '#faf3f8', teal: '#147f87', wine: '#76234b', ink: '#332338', grey: '#b6a9b5' };

function graphSVG(opts = {}) {
  const g = S.graph, M = S.model, T = M.topo, a = S.analysis;
  const comparison = S.neighbourhoods, showNeighbourhoods = S.colourMode === 'neighbourhoods';
  const manyNeighbourhoods = comparison.anchors.length > 2;
  const simple = !opts.static && S.workspace === 'explore';
  const fillDescription = showNeighbourhoods
    ? manyNeighbourhoods
      ? 'Every selected start has its own neighbourhood colour. A solid vertex belongs to one selected neighbourhood; coloured sectors show every selected neighbourhood containing a shared vertex. Numbered starts match the colour key. Light vertices are outside all selected neighbourhoods. Interior, boundary and exterior of A are reported separately in the inspector.'
      : 'Fill: wine is N(v1) only, turquoise is N(v2) only, purple is their intersection, light is outside both. Numbered badges identify the selected starts. With one selection its entire least open neighbourhood is wine. Interior, boundary and exterior of A are reported separately in the inspector.'
    : 'Fill: interior of A purple, boundary pink (hatched), exterior light.';
  const trace = !opts.static && S.trace;
  const showArcs = S.showArcs && (opts.static || S.workspace === 'workbench' || S.mode !== 'weak-patch');
  const traceArcs = new Set(trace ? trace.arcs.map(([u, v]) => `${u}>${v}`) : []);
  const pos = g.nodes.map(p => g.layout[p.id]);
  const xs = pos.map(p => p.x), ys = pos.map(p => p.y);
  const minX = Math.min(0, ...xs) - 40, minY = Math.min(0, ...ys) - (simple ? 60 : 40);
  const maxX = Math.max(360, ...xs) + 40;
  const legendColumns = Math.max(1, Math.floor((maxX - minX - 20) / 125));
  const legendRows = manyNeighbourhoods ? Math.ceil((comparison.anchors.length + 1) / legendColumns) : 1;
  const maxY = Math.max(340, ...ys) + (opts.legend && !simple ? 95 + (legendRows - 1) * 20 : 55);
  const W = maxX - minX, H = maxY - minY;
  const hl = new Set(), hlNodes = new Set();
  if (!opts.static && S.explain && S.explain.path) {
    const p = S.explain.path;
    p.forEach(v => hlNodes.add(v));
    for (let i = 0; i + 1 < p.length; i++) hl.add(p[i] < p[i + 1] ? `${p[i]}|${p[i + 1]}` : `${p[i + 1]}|${p[i]}`);
  }
  if (!opts.static && S.explain && S.explain.arc) {
    const [u, v] = S.explain.arc; hl.add(u < v ? `${u}|${v}` : `${v}|${u}`); hlNodes.add(u); hlNodes.add(v);
  }
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${W} ${H}" role="img" `
    + (opts.static ? `aria-labelledby="gt gd"` : `aria-label="Graph: ${g.nodes.length} vertices, ${g.edges.length} edges, mode ${esc(t(S.mode))}" aria-describedby="gd"`) + ` class="gsvg">`,
  opts.static ? `<title id="gt">Graph: ${g.nodes.length} vertices, ${g.edges.length} edges, mode ${esc(t(S.mode))}</title>` : '',
  `<desc id="gd">The input graph has undirected edges. Arrowheads are a derived step overlay, not directions on the input edges. Each vertex shows its label and its ${esc(t(S.statistic))} value. ${fillDescription} Thick outline: vertex in A. ${comparison.anchors.map((v, i) => `v${i + 1} = ${esc(label(v))}.`).join(' ')} ${S.mode === 'weak-patch' ? 'Original uphill relation — reference only: arrows do not test weak-patch openness, which means a union of whole original plateaus.' : `Arrows show allowed ${esc(t(S.mode))} steps.`}</desc>`,
  '<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">'
    + '<path d="M0,0 L10,5 L0,10 z" fill="#776575"/></marker>'
    + `<marker id="trace-arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${COL.teal}"/></marker>`
    + `<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fbe3f7"/><line x1="0" y1="0" x2="0" y2="6" stroke="${COL.boundary}" stroke-width="2.5"/></pattern>`
    + (showNeighbourhoods && manyNeighbourhoods ? comparison.memberships.map((starts, vertex) => starts.length < 2 ? ''
      : `<pattern id="neighbourhood-sectors-${vertex}" patternUnits="objectBoundingBox" width="1" height="1" viewBox="-1 -1 2 2">`
        + starts.map((start, part) => {
          const from = -Math.PI / 2 + 2 * Math.PI * part / starts.length, to = from + 2 * Math.PI / starts.length;
          return `<path data-neighbourhood-sector="${start}" d="M0,0 L${Math.cos(from)},${Math.sin(from)} A1,1 0 ${starts.length === 2 ? 1 : 0},1 ${Math.cos(to)},${Math.sin(to)} Z" fill="${comparison.colours[start]}"/>`;
        }).join('') + '</pattern>').join('') : '') + '</defs>'];
  // edges, parallel instances offset
  const groups = new Map();
  g.edges.forEach(e => { const k = e.u < e.v ? `${e.u}|${e.v}` : `${e.v}|${e.u}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
  const arcSet = new Set(M.arcs.map(([u, v]) => `${u}>${v}`));
  for (const [k, es] of groups) {
    const [u, v] = k.split('|').map(Number), P = pos[u], Q = pos[v];
    const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const hot = hl.has(k) || traceArcs.has(`${u}>${v}`) || traceArcs.has(`${v}>${u}`);
    const noStep = !arcSet.has(`${u}>${v}`) && !arcSet.has(`${v}>${u}`);
    es.forEach((e, i) => {
      const off = (i - (es.length - 1) / 2) * 16;
      const mx = (P.x + Q.x) / 2 + nx * off * 2, my = (P.y + Q.y) / 2 + ny * off * 2;
      out.push(`<path data-edge-u="${u}" data-edge-v="${v}" d="M${P.x},${P.y} Q${mx},${my} ${Q.x},${Q.y}" fill="none" stroke="${hot ? COL.teal : noStep ? COL.grey : '#b6a5b6'}" `
        + `stroke-width="${hot ? 2.6 : 1.15}"${noStep ? ' stroke-dasharray="5 4"' : ''}><title>edge ${esc(e.id)}: ${esc(label(u))}—${esc(label(v))}${noStep ? ' (no allowed step in this mode)' : ''}</title></path>`
        + `<path class="ehit" data-e="${esc(e.id)}" d="M${P.x},${P.y} Q${mx},${my} ${Q.x},${Q.y}"><title>edge ${esc(label(u))}—${esc(label(v))}</title></path>`);
    });
    if (showArcs || traceArcs.has(`${u}>${v}`) || traceArcs.has(`${v}>${u}`)) {
      const mid = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 };
      const both = arcSet.has(`${u}>${v}`) && arcSet.has(`${v}>${u}`);
      const arrow = (from, to, shift) => {
        const marked = traceArcs.has(`${from}>${to}`);
        if (!showArcs && !marked) return '';
        const A = pos[from], B = pos[to], ddx = B.x - A.x, ddy = B.y - A.y, LL = Math.hypot(ddx, ddy) || 1;
        const sx = mid.x + ddx / LL * shift - ddx / LL * 9, sy = mid.y + ddy / LL * shift - ddy / LL * 9;
        return `<line ${marked ? 'class="trace-edge"' : ''} data-from="${from}" data-to="${to}" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${(sx + ddx / LL * 12).toFixed(1)}" y2="${(sy + ddy / LL * 12).toFixed(1)}" stroke="${marked ? COL.teal : '#776575'}" stroke-width="${marked ? 2.6 : 1.6}" marker-end="url(#${marked ? 'trace-arr' : 'arr'})"/>`;
      };
      if (both) { out.push(arrow(u, v, 10)); out.push(arrow(v, u, 10)); }
      else if (arcSet.has(`${u}>${v}`)) out.push(arrow(u, v, 0));
      else if (arcSet.has(`${v}>${u}`)) out.push(arrow(v, u, 0));
    }
  }
  // vertices
  const focusCls = S.focus !== null ? T.pointToClass[idx(S.focus)] : S.focusClass;
  g.nodes.forEach((p, i) => {
    const q = pos[i];
    const region = comparison.regions[i], anchor = comparison.anchors.indexOf(i) + 1;
    const memberships = comparison.memberships[i];
    const neighbourhoodFill = manyNeighbourhoods && memberships.length
      ? memberships.length > 1 ? `url(#neighbourhood-sectors-${i})` : comparison.colours[memberships[0]]
      : NEIGHBOURHOOD_COLOURS[region];
    const fill = showNeighbourhoods ? neighbourhoodFill : a.interior[i] ? COL.interior : a.boundary[i] ? 'url(#hatch)' : COL.exterior;
    const inA = S.A[i], inPrev = !opts.static && S.preview && S.preview[i];
    const marked = trace && trace.mask[i], origin = marked && trace.origin === i;
    const focusRing = !opts.static && !simple && !trace && ((focusCls !== null && focusCls !== undefined && T.pointToClass[i] === focusCls) || hlNodes.has(i));
    const txt = (showNeighbourhoods ? region !== 'outside' : a.interior[i]) ? '#fff' : COL.ink;
    const regionDescription = manyNeighbourhoods
      ? memberships.length ? 'in ' + memberships.map(start => `N(${label(comparison.anchors[start])}), Start ${start + 1}`).join('; ') : 'outside all selected neighbourhoods'
      : { first: 'in N(v1) only', second: 'in N(v2) only', intersection: 'in both neighbourhoods', outside: 'outside the compared neighbourhoods' }[region];
    out.push(`<g class="vtx${marked ? ' trace-node' : ''}${origin ? ' trace-origin' : ''}" data-v="${esc(p.id)}" data-neighbourhood-region="${region}" data-neighbourhood-memberships="${esc(JSON.stringify(memberships))}" data-neighbourhood-start-ids="${esc(JSON.stringify(memberships.map(start => g.nodes[comparison.anchors[start]].id)))}"${anchor ? ` data-neighbourhood-anchor="${anchor}"` : ''} tabindex="0" role="button" aria-pressed="${Boolean(inA)}" aria-label="vertex ${esc(p.label)}, ${S.statistic === 'incident-edges' ? 'degree' : 'neighbours'} ${M.degree[i]}${inA ? ', in A' : ''}${a.interior[i] ? ', interior of A' : a.boundary[i] ? ', boundary of A' : ', exterior of A'}${showNeighbourhoods ? ', ' + esc(regionDescription) : ''}${anchor ? ', comparison vertex ' + anchor : ''}${marked ? origin ? ', exploration origin' : ', highlighted in exploration' : ''}">`);
    if (marked) out.push(`<circle class="trace-ring" cx="${q.x}" cy="${q.y}" r="28" fill="${origin ? '#76234b12' : '#147f8714'}" stroke="${origin ? COL.wine : COL.teal}" stroke-width="${origin ? 4 : 3}"${origin ? '' : ' stroke-dasharray="5 3"'}/>`);
    if (focusRing) out.push(`<circle cx="${q.x}" cy="${q.y}" r="27" fill="none" stroke="${COL.teal}" stroke-width="4"/>`);
    if (!opts.static && S.pendingConnect === p.id) out.push(`<circle cx="${q.x}" cy="${q.y}" r="30" fill="none" stroke="${COL.wine}" stroke-width="3"/>`);
    if (inPrev) out.push(`<circle cx="${q.x}" cy="${q.y}" r="24" fill="none" stroke="${COL.wine}" stroke-width="3" stroke-dasharray="4 3"/>`);
    out.push(`<circle class="vertex-fill" data-selected="${Boolean(inA)}" cx="${q.x}" cy="${q.y}" r="${simple ? 22 : 19}" fill="${fill}" stroke="${inA ? simple ? '#f2bddb' : COL.ink : '#888'}" stroke-width="${inA ? 4.5 : 1.2}"/>`);
    out.push(`<text x="${q.x}" y="${q.y + 4}" text-anchor="middle" class="vl" fill="${txt}"${showNeighbourhoods && manyNeighbourhoods && memberships.length > 1 ? ' stroke="#38253f" stroke-width="2" stroke-linejoin="round" paint-order="stroke"' : ''}>${esc(p.label)}</text>`);
    if (showNeighbourhoods && anchor) out.push(simple
      ? `<g class="neighbourhood-anchor named-anchor"><rect x="${q.x - 38}" y="${q.y - 52}" width="76" height="24" rx="9" fill="${comparison.colours[anchor - 1]}"/><text x="${q.x}" y="${q.y - 35}" text-anchor="middle" fill="#fff" font-size="16" font-weight="bold">Start ${anchor}</text></g>`
      : `<g class="neighbourhood-anchor"><circle cx="${q.x + 18}" cy="${q.y - 19}" r="8" fill="#fff" stroke="${comparison.colours[anchor - 1]}" stroke-width="2"/><text x="${q.x + 18}" y="${q.y - 16}" text-anchor="middle" fill="${COL.ink}" font-size="9" font-weight="bold">${anchor}</text></g>`);
    out.push(`<text x="${q.x}" y="${q.y + (simple ? 43 : 35)}" text-anchor="middle" class="vd">${simple ? S.statistic === 'incident-edges' ? 'Degree: ' : 'Neighbours: ' : S.statistic === 'incident-edges' ? 'd=' : 'n='}${M.degree[i]}${S.classColour && (opts.static || S.workspace === 'workbench') && g.nodes.length <= 16 ? ` · Q${T.pointToClass[i] + 1}` : ''}</text>`);
    out.push('</g>');
  });
  if (opts.legend && showNeighbourhoods) {
    const entries = manyNeighbourhoods ? comparison.anchors.map((origin, start) => [comparison.colours[start], `Start ${start + 1}: ${label(origin)}`]).concat([[NEIGHBOURHOOD_COLOURS.outside, 'Outside all']]) : (comparison.anchors.length > 1
      ? [['first', 'N(v1) only'], ['second', 'N(v2) only'], ['intersection', 'Intersection'], ['outside', 'Outside']]
      : [['first', 'N(v1)'], ['outside', 'Outside']]).map(([key, name]) => [NEIGHBOURHOOD_COLOURS[key], name]);
    out.push(`<g transform="translate(${minX + 8},${maxY - 30 - (legendRows - 1) * 20})" class="leg neighbourhood-legend">`
      + entries.map(([colour, name], i) => {
        const x = manyNeighbourhoods ? i % legendColumns * 125 : i * 95, y = manyNeighbourhoods ? Math.floor(i / legendColumns) * 20 : 0;
        const shown = name.length > 19 ? name.slice(0, 17) + '…' : name;
        return `<g transform="translate(${x},${y})"><title>${esc(name)}</title><rect width="12" height="12" fill="${colour}" stroke="#888"/><text x="16" y="10">${esc(shown)}</text></g>`;
      }).join('')
      + `<text x="0" y="-8">${manyNeighbourhoods ? 'Coloured sectors show membership in every matching set' : 'Smallest open neighbourhoods · badges identify the starts'}</text>`
      + `<text x="0" y="${legendRows * 20 + 7}">${comparison.anchors.length ? 'Thick outline: in A' : 'Select vertices to colour their neighbourhoods'}${S.mode === 'weak-patch' && showArcs ? ' · Arrows: reference only' : ''}</text></g>`);
  } else if (opts.legend) {
    out.push(`<g transform="translate(${minX + 8},${maxY - 30})" class="leg"><rect width="12" height="12" fill="${COL.interior}"/><text x="16" y="10">interior</text>`
      + `<rect x="80" width="12" height="12" fill="url(#hatch)"/><text x="96" y="10">boundary</text>`
      + `<rect x="170" width="12" height="12" fill="${COL.exterior}" stroke="#888"/><text x="186" y="10">exterior</text>`
      + `<circle cx="256" cy="6" r="6" fill="#fff" stroke="${COL.ink}" stroke-width="3"/><text x="266" y="10">in A</text>`
      + `<text x="0" y="-8">${esc(t(S.mode))} · ${esc(t(S.statistic))} · carrier: vertices</text>`
      + (S.mode === 'weak-patch' && S.showArcs ? '<text x="0" y="28">Original uphill relation — reference only</text>' : '') + '</g>');
  }
  out.push('</svg>');
  return out.join('');
}

// ------------------------------------------------------------ quotient SVG
function quotientSVG(opts = {}) {
  const M = S.model, T = M.topo, k = T.k;
  const trace = !opts.static && S.trace;
  const traceClasses = new Set(trace ? [...trace.classes, ...(S.quotientView === 'hasse' ? trace.quotientPath || [] : [])] : []);
  const tracePairs = new Set(trace && !trace.referenceOnly ? trace.arcs.map(([u, v]) => `${T.pointToClass[u]}>${T.pointToClass[v]}`) : []);
  const traceCovers = new Set(trace?.quotientPath ? trace.quotientPath.slice(1).map((c, i) => `${trace.quotientPath[i]}>${c}`) : []);
  const edgeMarked = (i, j) => Boolean(trace && !trace.referenceOnly && (
    ['neighbourhood', 'class'].includes(trace.kind) ? traceClasses.has(i) && traceClasses.has(j) :
    S.quotientView === 'hasse' ? traceCovers.has(`${i}>${j}`) : tracePairs.has(`${i}>${j}`)));
  if (k === 0) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 100" role="img" aria-labelledby="qt qd" class="qsvg"><title id="qt">Empty quotient</title><desc id="qd">The quotient has no points and one open set, the empty set.</desc><text x="16" y="48" class="ql">Empty quotient: no points; one open set, ∅.</text></svg>';
  const rank = new Array(k).fill(0);
  for (let pass = 0; pass < k; pass++) for (const [i, j] of T.covers) rank[j] = Math.max(rank[j], rank[i] + 1);
  const layers = [];
  for (let i = 0; i < k; i++) (layers[rank[i]] = layers[rank[i]] || []).push(i);
  const W = Math.max(360, 110 * Math.max(...layers.map(l => l.length))), gap = 90, H = 70 + gap * (layers.length);
  const P = new Array(k);
  layers.forEach((l, r) => l.forEach((c, i) => { P[c] = { x: W * (i + 1) / (l.length + 1), y: H - 50 - gap * r }; }));
  const discrete = S.mode === 'weak-patch';
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" ${opts.static ? 'aria-labelledby="qt qd"' : `aria-label="Active quotient: ${k} points, mode ${esc(t(S.mode))}" aria-describedby="qd"`} class="qsvg">`,
    opts.static ? `<title id="qt">Active quotient: ${k} points, mode ${esc(t(S.mode))}</title>` : '',
    `<desc id="qd">${discrete ? 'Finite weak patch: the quotient has the equality order, with no strict comparabilities. Any dashed original uphill order is reference only.' : S.quotientView === 'hasse' ? 'Hasse diagram, covers drawn upward.' : 'Condensation graph: direct arcs between classes.'}</desc>`,
    '<defs><marker id="qarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>'];
  const ref = discrete ? M.baseOrder : null;
  if (!discrete) {
    if (S.quotientView === 'hasse') {
      for (const [i, j] of T.covers) {
        const marked = edgeMarked(i, j);
        out.push(`<line ${marked ? 'class="trace-edge"' : ''} data-from="${i}" data-to="${j}" x1="${P[i].x}" y1="${P[i].y - 18}" x2="${P[j].x}" y2="${P[j].y + 18}" stroke="${marked ? COL.teal : '#92788f'}" stroke-width="${marked ? 3.4 : 1.6}"/>`);
      }
    } else {
      const seen = new Set();
      for (const [u, v] of M.arcs) {
        const i = T.pointToClass[u], j = T.pointToClass[v];
        if (i === j || seen.has(`${i}>${j}`)) continue; seen.add(`${i}>${j}`);
        const marked = edgeMarked(i, j);
        out.push(`<line ${marked ? 'class="trace-edge"' : ''} data-from="${i}" data-to="${j}" x1="${P[i].x}" y1="${P[i].y - 18}" x2="${P[j].x}" y2="${P[j].y + 20}" stroke="${marked ? COL.teal : '#92788f'}" stroke-width="${marked ? 3.4 : 1.4}" marker-end="url(#qarr)"/>`);
      }
    }
  } else if (S.quotientView === 'ghost' && ref) {
    for (const [i, j] of ref.covers) {
      const a = ref.classes[i][0], b = ref.classes[j][0], ci = T.pointToClass[a], cj = T.pointToClass[b];
      out.push(`<line x1="${P[ci].x}" y1="${P[ci].y}" x2="${P[cj].x}" y2="${P[cj].y}" stroke="#bbb" stroke-dasharray="3 4"/>`);
    }
  }
  for (let c = 0; c < k; c++) {
    const mem = T.classes[c], nSel = mem.filter(x => S.A[x]).length;
    const status = nSel === 0 ? 'none' : nSel === mem.length ? 'all' : 'partial';
    const fill = status === 'all' ? '#e8d6f5' : status === 'partial' ? 'url(#qpart)' : '#fff';
    const degs = [...new Set(mem.map(x => M.degree[x]))];
    const foc = !opts.static && !trace && ((S.focusClass === c) || (S.focus !== null && T.pointToClass[idx(S.focus)] === c));
    const marked = traceClasses.has(c), origin = marked && T.pointToClass[trace.origin] === c;
    out.push(`<g class="qn${marked ? ' trace-node' : ''}${origin ? ' trace-origin' : ''}" data-c="${c}" tabindex="0" role="button" aria-label="quotient point Q${c + 1}, members ${mem.map(x => esc(label(x))).join(', ')}, selection ${status}; explore its up-set">`
      + (marked ? `<rect class="trace-ring" x="${P[c].x - 49}" y="${P[c].y - 23}" width="98" height="46" rx="12" fill="none" stroke="${origin ? COL.wine : COL.teal}" stroke-width="3"${origin ? '' : ' stroke-dasharray="5 3"'}/>` : '')
      + `<rect x="${P[c].x - 44}" y="${P[c].y - 18}" width="88" height="36" rx="9" fill="${fill}" stroke="${foc ? COL.teal : '#92788f'}" stroke-width="${foc ? 4 : 1.4}"/>`
      + `<text x="${P[c].x}" y="${P[c].y - 2}" text-anchor="middle" class="ql">Q${c + 1} · ${mem.length}v${degs.length === 1 ? ' · ' + (S.statistic === 'incident-edges' ? 'd' : 'n') + '=' + degs[0] : ''}</text>`
      + `<text x="${P[c].x}" y="${P[c].y + 12}" text-anchor="middle" class="qs">${mem.length <= 3 ? mem.map(x => esc(label(x))).join(', ') + ' · ' : ''}${status}</text></g>`);
  }
  out.splice(3, 0, '<defs><pattern id="qpart" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#fff"/><rect width="4" height="8" fill="#e8d6f5"/></pattern></defs>');
  if (discrete && S.quotientView === 'ghost') out.push(`<text x="8" y="${H - 8}" class="qs">dashed: original uphill order — reference only</text>`);
  out.push('</svg>');
  return out.join('');
}

// ------------------------------------------------------------ inspector
function inspectorHTML() {
  const T = S.model.topo, a = S.analysis, M = S.model;
  const carrier = `${T.n} vertices / ${T.k} quotient points`;
  const rows = [
    ['A', fmtSet(T, S.A)], ['int(A)', fmtSet(T, a.interior)], ['cl(A)', fmtSet(T, a.closure)],
    ['∂A', fmtSet(T, a.boundary)], ['ext(A)', fmtSet(T, a.exterior)], ['O(A), least open set ⊇ A', fmtSet(T, a.enlarge)],
  ];
  // the direct answer to "is my set open?", with its reason
  const w0 = openWitness(M, S.A);
  let answer = `<div class="answer ${a.open ? 'yes' : 'no'}" role="status" aria-live="polite">Is A = ${fmtSet(T, S.A)} open? <span class="big">${a.open ? 'Yes' : 'No'}</span><br>`;
  if (a.open) answer += S.mode === 'weak-patch' ? 'A is a union of whole original plateaus.' : 'No allowed step leaves A.';
  else if (w0 && w0.kind === 'arc') answer += `The allowed step <b>${esc(label(w0.from))} → ${esc(label(w0.to))}</b> leaves A (${esc(label(w0.to))} is missing). Smallest open set containing A: ${fmtSet(T, a.enlarge)}.`;
  else if (w0) answer += `Class Q${T.pointToClass[w0.inside] + 1} is split: ${esc(label(w0.inside))} is in A, ${esc(label(w0.outside))} is not. Smallest open set containing A: ${fmtSet(T, a.enlarge)}.`;
  answer += `<br>Closed? <b>${a.closed ? 'yes' : 'no'}</b> · Dense? <b>${a.dense ? 'yes' : 'no'}</b></div>`;
  let html = answer + `<div class="carrier">${carrier} · ${esc(t(S.mode))} · ${esc(t(S.statistic))}</div><table class="insp">`
    + rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') + '</table>';
  const w = openWitness(M, S.A);
  html += `<p><b>Open?</b> ${a.open ? 'yes' : 'no'}`;
  if (!a.open && w) {
    if (w.kind === 'arc') html += ` — allowed arc <b>${esc(label(w.from))} → ${esc(label(w.to))}</b> leaves A (${S.statistic === 'incident-edges' ? 'd' : 'n'}(${esc(label(w.from))}) = ${M.degree[w.from]} ${S.mode === 'strict' ? '&lt;' : '≤'} ${M.degree[w.to]} = ${S.statistic === 'incident-edges' ? 'd' : 'n'}(${esc(label(w.to))})).`
      + ` <button data-act="show-arc" data-u="${w.from}" data-v="${w.to}">highlight</button>`;
    else html += ` — class Q${T.pointToClass[w.inside] + 1} is split: ${esc(label(w.inside))} ∈ A, ${esc(label(w.outside))} ∉ A.`;
  }
  html += '</p>';
  html += `<p><b>Closed?</b> ${a.closed ? 'yes' : 'no'}`;
  if (!a.closed) {
    const x = members(a.closure).find(i => !S.A[i]);
    const cw = x !== undefined ? closureWitness(M, x, S.A) : null;
    if (cw && cw.kind === 'path') html += ` — ${esc(label(x))} ∉ A reaches A: ${cw.path.map(i => esc(label(i))).join(' → ')} <button data-act="show-path" data-path="${cw.path.join(',')}">highlight</button>`;
    else if (cw) html += ` — ${esc(label(x))} ∉ A shares class Q${T.pointToClass[x] + 1} with ${esc(label(cw.point))} ∈ A.`;
  }
  html += '</p>';
  html += `<p><b>Dense?</b> ${a.dense ? 'yes' : 'no'}`;
  if (!a.dense) { const x = members(a.exterior)[0]; html += ` — N(${esc(label(x))}) = ${fmtSet(T, T.N[x])} misses A.`; }
  html += '</p>';
  html += '<div class="acts" role="group" aria-label="set operations">'
    + ['interior', 'closure', 'boundary', 'complement', 'enlarge'].map(op =>
      `<button data-act="op" data-op="${op}">${{ interior: 'A := int(A)', closure: 'A := cl(A)', boundary: 'A := ∂A', complement: 'A := V∖A', enlarge: 'A := O(A) (complete to open)' }[op]}</button>`).join('')
    + '<button data-act="saturate">Select all vertices in touched classes</button><button data-act="clearA">Clear A</button></div>';
  // membership explanation for the focused vertex
  if (S.focus !== null && idx(S.focus) !== undefined) {
    const x = idx(S.focus);
    html += `<div class="explain"><b>Focused vertex ${esc(label(x))}</b>: N(${esc(label(x))}) = ${fmtSet(T, T.N[x])}. `;
    if (a.closure[x]) {
      const cw = closureWitness(M, x, S.A);
      html += cw && cw.kind === 'path' ? `In cl(A): path ${cw.path.map(i => esc(label(i))).join(' → ')} into A. ` : cw ? `In cl(A): shares class with ${esc(label(cw.point))} ∈ A. ` : '';
    } else html += 'Not in cl(A): N(x) misses A. ';
    if (a.interior[x]) html += `In int(A): N(${esc(label(x))}) ⊆ A.`;
    else { const iw = interiorFailWitness(M, x, S.A); if (iw) html += iw.kind === 'path' ? `Not in int(A): it reaches ${esc(label(iw.path.at(-1)))} ∉ A via ${iw.path.map(i => esc(label(i))).join(' → ')}.` : `Not in int(A): ${esc(label(iw.point))} ∉ A is in its class.`; }
    html += '</div>';
  }
  return html;
}

// ------------------------------------------------------------ tabs
const TABS = [['opens', 'Open sets'], ['nbhd', 'Minimal neighbourhoods'], ['matrix', 'Relation matrix'],
  ['compare', 'Compare topologies'], ['subspace', 'Subspace vs induced'], ['poset', 'Poset → graph'],
  ['edit', 'Edit graph'], ['gallery', 'Infinite gallery'], ['help', 'Rules']];

function tabHTML() {
  switch (S.tab) {
    case 'opens': return opensHTML();
    case 'nbhd': return nbhdHTML();
    case 'matrix': return matrixHTML();
    case 'compare': return compareHTML();
    case 'subspace': return subspaceHTML();
    case 'poset': return posetHTML();
    case 'edit': return editHTML();
    case 'gallery': return galleryHTML();
    default: return helpHTML();
  }
}

function opensHTML() {
  const T = S.model.topo;
  const r = currentEnumeration();
  let h = `<p class="muted">Opens are enumerated as upsets of the ${T.k}-point active quotient and lifted to vertices. `
    + `Limits: list ≤ ${S.limits.displayLimit.toLocaleString('en')} sets, ${S.limits.timeBudgetMs / 1000} s or ${S.limits.stateBudget.toLocaleString('en')} search states; `
    + `automatic listing when the quotient has ≤ ${S.limits.autoEnumerateMaxQuotient} points.</p>`;
  const cnt = exactCount(T);
  h += `<p><b>Count:</b> ${cnt.status === 'exact' ? 'Exactly ' + cnt.value.toString() + (cnt.value > 99999n ? ` (≈ 2^${(cnt.value.toString(2).length - 1)})` : '') + ` open sets (${esc(cnt.method)})` : 'total not computed within the budget'}.</p>`;
  if (S.enumRunning) h += `<p role="status">Listing… ${S.enumeration ? S.enumeration.listedCount : 0} found. <button data-act="cancel-enum">Cancel</button></p>`;
  if (!r && !S.enumRunning) h += `<p><button data-act="enum">List open sets</button></p>`;
  if (r) {
    h += `<p role="status"><b>${esc(describeEnumeration(r))}</b> · status: <code>${r.status}</code> · ${r.restoredFromFile ? 'recorded engine (list revalidated on import)' : 'computed in'}: ${esc(r.engine || 'main thread')}</p>`;
    if (r.limits && r.limits.timeBudgetMs !== S.limits.timeBudgetMs) h += `<p class="muted">Effective listing time budget: ${r.limits.timeBudgetMs / 1000} s.</p>`;
    if (r.status !== 'complete') h += '<p><button data-act="enum-more">Continue (bounded)</button></p>';
    const pageSize = 600, pages = Math.max(1, Math.ceil(r.opens.length / pageSize));
    S.enumPage = Math.min(S.enumPage, pages - 1);
    const first = S.enumPage * pageSize;
    if (pages > 1) h += `<p>Loaded entries ${first + 1}–${Math.min(first + pageSize, r.opens.length)} of ${r.opens.length}. `
      + `<button data-act="enum-page" data-page="${S.enumPage - 1}" ${S.enumPage === 0 ? 'disabled' : ''}>Previous page</button> `
      + `<button data-act="enum-page" data-page="${S.enumPage + 1}" ${S.enumPage + 1 === pages ? 'disabled' : ''}>Next page</button> Every loaded entry is included in JSON/report export; an incomplete list is not the full topology.</p>`;
    h += '<div class="olist" role="list">' + r.opens.slice(first, first + pageSize).map((o, offset) => {
      const i = first + offset;
      return `<div role="listitem"><button data-act="preview" data-i="${i}" aria-label="preview open set ${i + 1}">${fmtSet(T, o)}</button> <button data-act="useA" data-i="${i}">Use as A</button></div>`;
    }).join('') + '</div>';
  }
  return h;
}

const countCache = { key: null, val: null };
function exactCount(T) {
  const key = `${S.rev}|${S.mode}|${S.statistic}`;
  if (countCache.key !== key) { countCache.key = key; countCache.val = countUpsets(T.k, T.up, T.down, new Budget({ timeBudgetMs: 800, stateBudget: 300000 })); }
  return countCache.val;
}

function nbhdHTML(opts = {}) {
  const T = S.model.topo, M = S.model;
  const link = (text, act, data, key) => opts.static ? text : `<button class="table-link" data-act="${act}" ${data} data-trace-key="${key}" aria-pressed="false">${text}</button>`;
  return (opts.static ? '' : '<p class="muted">Select a neighbourhood, quotient up-set, or relation to highlight it in both drawings. Wine marks the starting point; turquoise marks reached points and steps. A stays unchanged.</p>')
    + '<table class="tbl"><tr><th>vertex</th><th>' + (S.statistic === 'incident-edges' ? 'd_E' : 'd_V') + '</th><th>class</th><th>least neighbourhood N(x)</th></tr>'
    + S.graph.order.map(i => `<tr class="linked-row" data-trace-key="vertex:${i}"><td>${esc(label(i))}</td><td>${M.degree[i]}</td><td>Q${T.pointToClass[i] + 1}</td><td>${link(fmtSet(T, T.N[i]), 'trace-nbhd', `data-v="${esc(S.graph.nodes[i].id)}"`, `vertex:${i}`)}</td></tr>`).join('') + '</table>'
    + '<h4>Quotient points</h4><table class="tbl"><tr><th>point</th><th>members</th><th>up-set (points above or equal)</th></tr>'
    + T.classes.map((c, i) => `<tr class="linked-row" data-trace-key="class:${i}"><td>Q${i + 1}</td><td>{${c.map(x => esc(label(x))).join(', ')}}</td><td>${link('{' + members(T.le[i]).map(j => 'Q' + (j + 1)).join(', ') + '}', 'trace-class', `data-c="${i}"`, `class:${i}`)}</td></tr>`).join('') + '</table>'
    + `<h4>Hasse covers (${T.covers.length})</h4><p class="relation-chips">${T.covers.map(([i, j]) => link(`Q${i + 1} ⋖ Q${j + 1}`, 'trace-cover', `data-from="${i}" data-to="${j}"`, `cover:${i}:${j}`)).join(opts.static ? ' · ' : ' ') || 'none'}</p>`
    + `<h4>${S.mode === 'weak-patch' ? 'Original uphill relation — reference only' : 'Allowed arcs'} (${M.arcs.length})</h4><p class="relation-chips">${M.arcs.map(([u, v]) => link(`${esc(label(u))}→${esc(label(v))}`, 'trace-arc', `data-from="${u}" data-to="${v}"`, `arc:${u}:${v}`)).join(opts.static ? ' · ' : ' ') || 'none'}</p>`
    + (S.mode === 'weak-patch' ? '<p>Each active least neighbourhood is the original plateau containing the vertex. A is open exactly when it is a union of whole original plateaus; the quotient has only equality comparisons.</p>' : '');
}

function matrixHTML() {
  const T = S.model.topo, o = S.graph.order;
  if (T.n > 40) return '<p class="muted">Matrix shown for up to 40 vertices; use the neighbourhood table.</p>';
  return '<p class="muted">Row x, column y: 1 when y ∈ N(x), i.e. x ≼ y. Select a cell to inspect the relation and its path.</p><div class="table-scroll"><table class="tbl mat"><tr><th></th>' + o.map(j => `<th>${esc(label(j))}</th>`).join('') + '</tr>'
    + o.map(i => `<tr><th>${esc(label(i))}</th>` + o.map(j => `<td><button class="table-link" data-act="trace-relation" data-from="${i}" data-to="${j}" data-trace-key="relation:${i}:${j}" aria-pressed="false" aria-label="${esc(label(i))} precedes ${esc(label(j))}: ${T.N[i][j] ? 'yes' : 'no'}">${T.N[i][j] ? '1' : '·'}</button></td>`).join('') + '</tr>').join('') + '</table></div>';
}

// Explanations are drawing state; neither the selected set nor the model changes.
function tracePanelHTML() {
  const r = S.trace, T = S.model.topo;
  if (!r) return '<strong>Explore the table in the drawings</strong><span>Open Minimal neighbourhoods and select a set, or choose Explore neighbourhoods and click a vertex.</span>';
  const name = esc(label(r.origin));
  let title, detail;
  if (r.kind === 'neighbourhood' || r.kind === 'class') {
    title = r.kind === 'class' ? `Up-set of Q${r.classIndex + 1}: {${r.classes.map(c => 'Q' + (c + 1)).join(', ')}}` : `N(${name}) = ${fmtSet(T, r.mask)}`;
    detail = `${r.kind === 'class' ? 'Lifted vertices: ' + fmtSet(T, r.mask) + '. ' : ''}${S.mode === 'weak-patch' ? 'The whole original plateau is highlighted; original uphill arrows are reference only.' : 'Highlighted vertices are exactly this least neighbourhood. Turquoise arrows show allowed steps within it.'}`;
  } else {
    const target = esc(label(r.target));
    title = r.kind === 'cover' ? `Hasse cover Q${r.from + 1} ⋖ Q${r.to + 1}` : r.kind === 'arc' ? `${name} → ${target}${r.referenceOnly ? ' — reference only' : ' · allowed step'}` : `${target} ${r.holds ? '∈' : '∉'} N(${name})`;
    detail = r.referenceOnly ? 'This original uphill step does not assert a relation in the active weak-patch topology.'
      : !r.holds ? 'There is no active specialization relation in this direction. Only the two endpoints are marked.'
      : S.mode === 'weak-patch' ? 'These vertices belong to the same original plateau.'
      : `Witness path: ${(r.path || [r.origin]).map(i => esc(label(i))).join(' → ')}${r.path?.length === 1 ? ' (zero-length path)' : ''}.${r.quotientPath?.length > 2 ? ' The Hasse drawing shows a chain of covers: ' + r.quotientPath.map(c => 'Q' + (c + 1)).join(' → ') + '.' : ''}`;
  }
  return `<div><strong>${title}</strong><span>${detail}</span><small>Rings: wine origin · turquoise exploration. ${S.colourMode === 'neighbourhoods' ? 'Fills compare the selected vertices’ neighbourhoods.' : 'Fills describe the interior, boundary and exterior of A.'} A is unchanged.</small></div><button data-act="clear-trace">Clear highlight</button>`;
}
function syncTraceRows() {
  document.querySelectorAll('[data-trace-key]').forEach(el => {
    const active = Boolean(S.trace && el.dataset.traceKey === S.trace.key);
    el.classList.toggle('is-active', active);
    if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(active));
  });
}
function renderExploration() {
  $('#graph').innerHTML = graphSVG({ legend: true });
  $('#quot').innerHTML = quotientSVG();
  $('#insp').innerHTML = inspectorHTML();
  renderTracePanel();
  syncTraceRows();
}
function showTrace(trace) {
  S.trace = trace; S.explain = null; S.preview = null;
  S.focus = trace && trace.kind !== 'class' ? S.graph.nodes[trace.origin].id : null;
  S.focusClass = trace?.kind === 'class' ? trace.classIndex : null;
  renderExploration();
}
function renderTracePanel() {
  const panel = $('#trace-panel');
  if (!panel) return;
  panel.innerHTML = tracePanelHTML();
  panel.classList.toggle('is-idle', !S.trace);
}
function renderSelectionSummary() {
  const summary = $('#selection-summary');
  if (!summary) return;
  summary.innerHTML = `<strong>A = ${fmtSet(S.model.topo, S.A)}</strong>`
    + ['open', 'closed', 'dense'].map(key => `<span>${key[0].toUpperCase() + key.slice(1)}? <b data-result="${key}" class="${S.analysis[key] ? 'result-yes' : 'result-no'}">${S.analysis[key] ? 'Yes' : 'No'}</b></span>`).join('');
}

function neighbourhoodSummaryHTML() {
  const c = S.neighbourhoods, T = S.model.topo;
  if (!c.anchors.length) return '<p class="neighbourhood-instruction">Click vertices to add their smallest open neighbourhoods. Every selected start keeps its full set coloured; click it again to remove that set.</p>';
  if (c.anchors.length > 2) return '<p class="neighbourhood-instruction">Each start has its own colour. A shared vertex shows a sector for every neighbourhood containing it. Expand a row for its complete set.</p>'
    + c.anchors.map((origin, start) => `<details class="neighbourhood-set" data-neighbourhood-set="start-${start + 1}" data-neighbourhood-start-id="${esc(S.graph.nodes[origin].id)}" data-neighbourhood-colour="${c.colours[start]}" data-member-ids="${esc(JSON.stringify(setIds(c.masks[start])))}" style="border-color:${c.colours[start]}"><summary><i aria-hidden="true" style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${c.colours[start]}"></i> Start ${start + 1}: N(${esc(label(origin))}) · ${c.masks[start].reduce((n, bit) => n + bit, 0)} vertices</summary><span class="neighbourhood-members">${fmtSet(T, c.masks[start])}</span></details>`).join('');
  const card = (key, title, mask, detail) => `<div class="neighbourhood-set" data-neighbourhood-set="${key}" data-member-ids="${esc(JSON.stringify(setIds(mask)))}" style="border-color:${NEIGHBOURHOOD_COLOURS[key]}"><strong style="color:${NEIGHBOURHOOD_COLOURS[key]}">${title}</strong><span class="neighbourhood-members">${fmtSet(T, mask)}</span>${detail ? `<small>${detail}</small>` : ''}</div>`;
  let html = card('first', `v1 = ${esc(label(c.anchors[0]))} · N(v1)`, c.first,
    c.anchors.length > 1 ? `Wine only: ${fmtSet(T, c.firstOnly)}` : 'Wine: the entire neighbourhood');
  if (c.anchors.length > 1) {
    html += card('second', `v2 = ${esc(label(c.anchors[1]))} · N(v2)`, c.second, `Turquoise only: ${fmtSet(T, c.secondOnly)}`)
      + card('intersection', 'N(v1) ∩ N(v2)', c.intersection, 'Purple: belongs to both neighbourhoods');
  }
  return html;
}

function renderNeighbourhoodSummary() {
  const overlay = $('#neighbourhood-overlay');
  overlay.dataset.anchorCount = String(S.neighbourhoods.anchors.length);
  overlay.dataset.colourMode = S.colourMode;
  $('#colour-mode').value = S.colourMode;
  $('#neighbourhood-summary').innerHTML = neighbourhoodSummaryHTML();
  $('#neighbourhood-display-note').textContent = S.colourMode === 'neighbourhoods'
    ? S.neighbourhoods.anchors.length > 2
      ? 'Every selected start has a colour. Shared vertices contain coloured sectors for every set they belong to; the numbered starts match the key.'
      : 'Colours show set membership. With two starts the shared part is purple; numbered badges identify the starts.'
    : 'Graph colours show interior / boundary / exterior of A. The neighbourhood sets below are still current.';
}

function compareHTML() {
  const models = ['uphill', 'strict', 'weak-patch'].map(m => buildTopologyModel(S.graph, m, S.statistic));
  let h = '<p class="muted">Same carrier V; A is kept. Inclusion is tested by least neighbourhoods: T₁ ⊆ T₂ iff N₂(x) ⊆ N₁(x) for all x.</p><table class="tbl"><tr><th></th>'
    + models.map(M => `<th>${esc(t(M.mode))}</th>`).join('') + '</tr>';
  const rows = [['open sets', M => { const c = countUpsets(M.topo.k, M.topo.up, M.topo.down, new Budget({ timeBudgetMs: 500 })); return c.status === 'exact' ? c.value.toString() : 'not computed'; }],
    ['quotient points', M => M.topo.k],
    ['int(A)', M => fmtSet(M.topo, M.topo.analyze(M.topo.setFromIds([...S.selected])).interior)],
    ['cl(A)', M => fmtSet(M.topo, M.topo.analyze(M.topo.setFromIds([...S.selected])).closure)],
    ['∂A', M => fmtSet(M.topo, M.topo.analyze(M.topo.setFromIds([...S.selected])).boundary)],
    ['A open?', M => M.topo.analyze(M.topo.setFromIds([...S.selected])).open ? 'yes' : 'no']];
  h += rows.map(([k, f]) => `<tr><th>${k}</th>${models.map(M => `<td>${f(M)}</td>`).join('')}</tr>`).join('') + '</table><h4>Inclusions</h4><ul>';
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === j) continue;
    const c = compareTopologies(models[i].topo, models[j].topo);
    const w = c.witnessFirstNotSecond;
    h += `<li>${esc(t(models[i].mode))} ⊆ ${esc(t(models[j].mode))}: <b>${c.firstInSecond ? 'yes' : 'no'}</b>${w ? ` — witness ${fmtSet(models[i].topo, w.set)} is ${esc(t(models[i].mode))}-open, not ${esc(t(models[j].mode))}-open` : ''}</li>`;
  }
  return h + '</ul><p class="muted">Strict and finite weak patch are generally incomparable; they are not drawn as a chain.</p>';
}

function subspaceHTML() {
  const g = S.graph;
  let h = '<p class="muted">Choose the carrier S. Left: the inherited topology N_S(x) = N_G(x) ∩ S (ambient degrees, paths may leave S). Right: the topology of the induced graph G[S], recomputed from scratch.</p>'
    + '<fieldset><legend>Carrier S</legend>' + g.order.map(i => `<label class="chk"><input type="checkbox" data-act="subv" data-v="${esc(g.nodes[i].id)}" ${S.sub.has(g.nodes[i].id) ? 'checked' : ''}> ${esc(label(i))}</label>`).join('')
    + ' <button data-act="sub-from-A">S := A</button> <button data-act="sub-all">S := V</button> <button data-act="sub-none">S := ∅</button></fieldset>';
  const M = S.model, Sset = M.topo.setFromIds([...S.sub]);
  const R = restrictTopology(M.topo, Sset);
  const H = inducedGraph(g, Sset), MH = buildTopologyModel(H, S.mode, S.statistic);
  const Asub = [...S.selected].filter(x => S.sub.has(x));
  const outside = [...S.selected].filter(x => !S.sub.has(x));
  const rA = R.analyze(R.setFromIds(Asub)), hA = MH.topo.analyze(MH.topo.setFromIds(Asub));
  const famR = enumerateOpens(R, { displayLimit: 4096, timeBudgetMs: 800 }), famH = enumerateOpens(MH.topo, { displayLimit: 4096, timeBudgetMs: 800 });
  const key = (T, o) => JSON.stringify(T.ids(o).sort(compareIds));
  let witness = '';
  if (famR.status === 'complete' && famH.status === 'complete') {
    const kr = new Set(famR.opens.map(o => key(R, o))), kh = new Set(famH.opens.map(o => key(MH.topo, o)));
    const a = [...kr].find(x => !kh.has(x)), b = [...kh].find(x => !kr.has(x));
    const display = a => '{' + JSON.parse(a).map(esc).join(', ') + '}';
    witness = a !== undefined ? `${display(a)} is inherited-open but not open in G[S]` : b !== undefined ? `${display(b)} is open in G[S] but not inherited-open` : 'the two families are equal';
  }
  // inherited relations realised only through vertices outside S
  const via = [];
  for (const x of members(Sset)) for (const y of members(Sset)) {
    if (x === y || !M.topo.N[x][y]) continue;
    const p = pathInto(M, x, setOf(g.nodes.length, [y]));
    if (p && p.some(v => !Sset[v])) via.push(p);
  }
  h += `<p>A ∩ S = {${Asub.map(esc).join(', ')}}${outside.length ? ` <span class="warn">(A has ${outside.length} vertex(es) outside S, ignored here: ${outside.map(esc).join(', ')})</span>` : ''}</p>`;
  h += `<div class="two"><div><h4>Inherited ${esc(t(S.mode))} topology on S</h4>`
    + `<p>${R.n} points / ${R.k} classes / <b>${famR.count.status === 'exact' ? famR.count.value : '≥' + famR.listedCount}</b> open sets</p>`
    + `<p>Classes: ${R.classes.map(c => '{' + c.map(i => esc(R.points[i].label)).join(', ') + '}').join(' ') || '∅'}</p>`
    + `<p>Ambient degrees: ${members(Sset).map(i => `${esc(label(i))}=${M.degree[i]}`).join(', ')}</p>`
    + `<p>int = ${fmtSet(R, rA.interior)}, cl = ${fmtSet(R, rA.closure)}, ∂ = ${fmtSet(R, rA.boundary)}</p>`
    + (via.length ? '<p><b>Relations realised through omitted vertices:</b> ' + via.map(p => `<button data-act="show-path" data-path="${p.join(',')}">${p.map(v => (Sset[v] ? '' : '[') + esc(label(v)) + (Sset[v] ? '' : ']')).join(' → ')}</button>`).join(' ') + ' ([ ] = outside S)</p>' : '')
    + `</div><div><h4>${esc(t(S.mode))} topology of G[S] (recomputed)</h4>`
    + `<p>${MH.topo.n} vertices / ${MH.topo.k} classes / <b>${famH.count.status === 'exact' ? famH.count.value : '≥' + famH.listedCount}</b> open sets</p>`
    + `<p>Classes: ${MH.topo.classes.map(c => '{' + c.map(i => esc(H.nodes[i].label)).join(', ') + '}').join(' ') || '∅'}</p>`
    + `<p>Induced degrees: ${H.nodes.map((p, i) => `${esc(p.label)}=${MH.degree[i]}`).join(', ') || '—'}</p>`
    + `<p>int = ${fmtSet(MH.topo, hA.interior)}, cl = ${fmtSet(MH.topo, hA.closure)}, ∂ = ${fmtSet(MH.topo, hA.boundary)}</p></div></div>`
    + `<p><b>Comparison witness:</b> ${witness || 'families too large to compare here'}</p>`;
  return h;
}

// ---- poset -> graph
let posetText = 'a < c\na < d\nb < c\nb < d', posetPoints = 'a b c d', posetResult = null;
function posetHTML() {
  let h = '<p class="muted">Theorem 4.1 of UPHILL v12. Arrows are generating comparisons (transitively closed; covers recomputed). One per line: <code>p &lt; q</code>. List every point, including isolated ones.</p>'
    + `<label>Points <input id="pp" value="${esc(posetPoints)}" size="40"></label><br><label>Arrows<br><textarea id="pa" rows="5" cols="30">${esc(posetText)}</textarea></label><br>`
    + '<button data-act="poset-gen">Generate and certify</button> <button data-act="poset-load">Load graph into workbench</button>'
    + ' <button data-act="poset-preset" data-p="crown">four-point crown</button> <button data-act="poset-preset" data-p="chain6">six-chain</button> <button data-act="poset-preset" data-p="claw">one below three</button>';
  if (posetResult) {
    const r = posetResult;
    if (!r.ok) h += `<p class="err">${r.errors.map(esc).join('<br>')}</p>`;
    else {
      h += `<h4>Step 1 · blocks</h4><table class="tbl"><tr><th>point</th><th>rank r</th><th>D = r+3</th><th>cover degree c</th><th>m = max(D,c)</th><th>vertices</th></tr>`
        + r.blocks.map(b => { const p = r.P.points.indexOf(b.point); return `<tr><td>${esc(b.point)}</td><td>${b.rank}</td><td>${b.D}</td><td>${r.params.c[p]}</td><td>${b.m}</td><td>${2 * b.m}</td></tr>`; }).join('') + '</table>'
        + `<h4>Step 2 · protected cycles and ports</h4><p>Shifts 0 and 1 form the protected spanning cycle of each block; the k-th incident cover of p uses the shift-2 edge L(p,k)R(p,k+2).</p>`
        + `<p>${Object.entries(r.ports).map(([k, v]) => `${esc(k.replace(/^\d+#/, 'p' + k.split('#')[0] + ' · '))}: ${esc(v[0])}—${esc(v[1])}`).join('<br>')}</p>`
        + `<h4>Step 3 · switches (${r.switches.length})</h4><p>${r.switches.map(s => `${esc(s.cover)}: remove ${s.removed.map(e => e.map(esc).join('—')).join(', ')}; add ${s.added.map(e => e.map(esc).join('—')).join(', ')}`).join('<br>') || 'none'}</p>`
        + `<h4>Step 4 · recovered quotient and certificate — ${r.certificate.pass ? '<span class="ok">PASS</span>' : '<span class="err">FAIL</span>'}</h4><p>${r.graph.nodes.length} vertices, ${r.graph.edges.length} edges; uphill-open count: ${r.certificate.openCount?.status === 'exact' ? r.certificate.openCount.value.toString() : r.certificate.opens !== null && r.certificate.opens !== undefined ? r.certificate.opens.toString() : 'not computed'}.</p><ul>`
        + r.certificate.checks.map(c => `<li>${c.pass ? 'pass' : '<b class="err">FAIL</b>'} — ${esc(c.name)}${c.detail ? ' (' + esc(c.detail) + ')' : ''}</li>`).join('') + '</ul>'
        + '<p class="muted">The certificate checks this finite construction with non-strict uphill topology and incident-edge degree; it is not a proof of the theorem. After loading, switching to strict or weak patch recomputes and withdraws the claim.</p>';
    }
  }
  return h;
}

function parsePosetInput() {
  const points = posetPoints.split(/[\s,]+/).filter(Boolean), arrows = [], errors = [];
  posetText.split(/\r?\n/).forEach((ln, i) => {
    const s = ln.trim(); if (!s) return;
    const m = s.match(/^(\S+)\s*(?:<|->|\s)\s*(\S+)$/);
    if (!m) { errors.push(`line ${i + 1}: expected "p < q"`); return; }
    arrows.push([m[1], m[2]]);
  });
  return { points, arrows, errors };
}

function blockLayout(r) {
  const L = {}, byRank = new Map();
  r.blocks.forEach(b => { (byRank.get(b.rank) || byRank.set(b.rank, []).get(b.rank)).push(b); });
  const maxR = Math.max(0, ...r.blocks.map(b => b.rank));
  // one row per rank (higher rank higher up); blocks side by side with room
  // for their labels; L and R halves on two lines
  for (const [rk, bs] of byRank) {
    let cx = 60;
    const cy = 70 + (maxR - rk) * 190;
    bs.forEach(b => {
      for (let j = 0; j < b.m; j++) {
        L[`L:${b.point}:${j}`] = { x: cx + j * 48, y: cy };
        L[`R:${b.point}:${j}`] = { x: cx + j * 48 + 24, y: cy + 80 };
      }
      cx += b.m * 48 + 80;
    });
  }
  return L;
}

// ---- edit tab
let jsonDraft = null, edgeDraft = '', isoDraft = '';
const fieldDrafts = new Map();
function editHTML() {
  const g = S.graph;
  return '<div class="two"><div><h4>Vertices</h4><table class="tbl"><tr><th>ID</th><th>label</th><th>' + (S.statistic === 'incident-edges' ? 'd_E' : 'd_V') + '</th><th>in A</th><th></th></tr>'
    + g.order.map(i => `<tr><td><code>${esc(g.nodes[i].id)}</code></td><td><input data-act="rename" data-v="${esc(g.nodes[i].id)}" value="${esc(g.nodes[i].label)}" aria-label="label of ${esc(g.nodes[i].id)}" size="8"></td><td>${S.model.degree[i]}</td>`
      + `<td><input type="checkbox" data-act="selv" data-v="${esc(g.nodes[i].id)}" ${S.selected.has(g.nodes[i].id) ? 'checked' : ''} aria-label="${esc(g.nodes[i].label)} in A"></td><td><button data-act="delv" data-v="${esc(g.nodes[i].id)}">delete</button></td></tr>`).join('')
    + '</table><p><label>New vertex ID <input id="newv" size="8"></label> <button data-act="addv">Add isolated vertex</button></p></div>'
    + '<div><h4>Edges</h4><table class="tbl"><tr><th>ID</th><th>endpoints</th><th></th></tr>'
    + g.edges.map(e => `<tr><td><code>${esc(e.id)}</code></td><td>${esc(label(e.u))}—${esc(label(e.v))}</td><td><button data-act="dele" data-e="${esc(e.id)}">delete</button></td></tr>`).join('')
    + '</table><p><label>from <select id="eu">' + g.order.map(i => `<option value="${esc(g.nodes[i].id)}">${esc(label(i))}</option>`).join('') + '</select></label> '
    + '<label>to <select id="ev">' + g.order.map(i => `<option value="${esc(g.nodes[i].id)}">${esc(label(i))}</option>`).join('') + '</select></label> <button data-act="adde">Connect</button></p>'
    + `<p>Graph kind: <b>${esc(g.kind)}</b>${g.kind === 'simple-undirected' ? ' <button data-act="to-multi">convert to loopless multigraph</button>' : ''} <button data-act="clear-graph">Clear graph</button></p></div></div>`
    + '<h4>Edge list import</h4><p class="muted">One edge per line: two whitespace/comma-separated IDs, such as <code>-1 2</code> or <code>a,b</code>. Plain alphabetic <code>a-b</code> shorthand is also accepted. Use two separate tokens for signed or hyphenated IDs; <code>#</code> starts a comment. Isolated vertices go in the second field.</p>'
    + `<textarea id="el" rows="4" cols="30">${esc(edgeDraft)}</textarea> <input id="iso" placeholder="isolated vertices" value="${esc(isoDraft)}"> <button data-act="import-el">Replace graph</button>`
    + '<h4>JSON (authoritative)</h4><textarea id="gj" rows="8" cols="70" spellcheck="false">' + esc(jsonDraft ?? JSON.stringify(graphToJSON(g), null, 1)) + '</textarea><br><button data-act="import-json">Replace graph from JSON</button> <button data-act="refresh-json">Show current graph</button>';
}

// ---- infinite gallery (optional P2): symbolic, one example
let galleryF = '0, 1, -2';
function galleryHTML() {
  const F = new Set(galleryF.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isInteger));
  const win = []; for (let n = -6; n <= 6; n++) win.push(n);
  return '<div class="gal"><p><b>Infinite example — symbolic explanation; displayed window only.</b> Degree-four tree (UPHILL v12, Example 9.6): vertices vₙ, bₙ, ℓₙ,₁, ℓₙ,₂, ℓₙ,₃ for n ∈ ℤ; edges vₙvₙ₊₁, vₙbₙ, bₙℓₙ,ⱼ. Degrees (of the infinite graph, not of the window): d(vₙ) = 3, d(bₙ) = 4, d(ℓ) = 1. The whole spine is one plateau p; the quotient has p &lt; bₙ and ℓₙ,ⱼ &lt; bₙ.</p>'
    + `<p><label>Excluded finite index set F: <input id="galF" value="${esc(galleryF)}"></label> <button data-act="galF">Show</button></p>`
    + '<p>Weak-patch neighbourhood {p} ∪ {bₙ : n ∉ F}, window n = −6…6:</p><p class="mono">p, ' + win.filter(n => !F.has(n)).map(n => `b<sub>${n}</sub>`).join(', ') + ', … (continues for every n ∉ F)</p>'
    + '<p>No finite F isolates p: every such neighbourhood still contains infinitely many bₙ. The finite workbench cannot establish this by computing larger truncations; a finite cycle-spine model with the same local degrees has a discrete finite weak patch.</p></div>';
}

function helpHTML() {
  return '<div class="rules"><p><b>Neighbourhood colours.</b> Every selected vertex adds its full smallest open neighbourhood. Click a selected start again to remove its set. With one start its set is wine; with two, wine and turquoise mark the exclusive parts and purple marks their intersection. With three or more starts each has a distinct colour, and a shared vertex has one coloured sector for every containing neighbourhood. The key and expandable exact-set rows identify all starts. Colours follow the current selection order. N(v) is the smallest open set containing v; the largest is always the whole vertex set. Graph colours can also show interior / boundary / exterior of A. The quotient always keeps its A-analysis colours. Colour mode is a drawing preference, not a saved mathematical input.</p>'
    + '<p><b>Undirected graph and step arrows.</b> Input edges are undirected. The arrowheads are a derived overlay showing which direction permits a step under the active topology and degree statistic. They do not turn the input into a directed graph. Weak-patch reference arrows are described below.</p>'
    + '<p><b>Linked exploration.</b> Select a neighbourhood, quotient up-set, cover, arc or matrix cell to see it in the drawings. Explore neighbourhoods lets you start from a graph vertex; clicking a quotient point explores its up-set. Wine rings mark the origin and turquoise rings mark the exploration; fills follow Graph colours. These highlights do not change A. A direct graph step may appear as several covers in the Hasse drawing.</p>'
    + '<p><b>Drawing controls.</b> Use +/− or Ctrl + wheel to zoom, Pan or middle drag to move the view, Fit to show the whole drawing, and Expand for more room (Escape closes). Hover or focus a node for its details. Relaxed network, Degree levels and Circle arrange vertex positions only. JSON retains positions; live zoom, pan, tooltips, table-exploration rings and witness highlights are not exported. Graph SVG and HTML reports retain the chosen neighbourhood colours and numbered origins.</p>'
    + '<p><b>Non-strict/strict rule.</b> For every edge {u,v}: an allowed step u → v exactly when d(u) ≤ d(v) (strict mode: d(u) &lt; d(v)). d is the actual whole-graph degree (multigraph: incident edge instances d_E, or distinct neighbours d_V).</p>'
    + '<p><b>Non-strict/strict open sets</b> are the sets no allowed step leaves (upper Alexandrov topology). In these modes N(x), the least neighbourhood, is everything reachable from x, including x.</p>'
    + '<p><b>Original plateaus</b> are connected components of the equal-degree edges; they are the points of the non-strict quotient Q(G), ordered by uphill reachability. Strict-mode classes are singletons. The quotient is a different set from V: a four-vertex plateau is four vertices and one quotient point.</p>'
    + '<p><b>Every active mode:</b> int(A) = {x : N(x) ⊆ A}; cl(A) = {x : N(x) ∩ A ≠ ∅}; ∂A = cl(A) ∖ int(A); ext(A) = V ∖ cl(A). <b>Least open enlargement</b> O(A) = ⋃{N(a) : a ∈ A}, which is not the closure.</p>'
    + '<p><b>Finite weak patch</b> (of the non-strict topology): opens are exactly the unions of whole original plateaus, and N(x) is the original plateau containing x. Original uphill arrows and tables are reference only. The quotient is discrete with the equality order and no strict comparisons; the vertex space is discrete only if every plateau is a single vertex. Strict and weak patch both refine uphill and are generally incomparable.</p>'
    + `<p class="muted">Uphill Topology Explorer ${APP_VERSION}, kernel ${KERNEL_VERSION}, manuscript baseline ${MANUSCRIPT_VERSION}. The tool computes finite examples; it does not establish novelty or prove the manuscript.</p></div>`;
}

// ------------------------------------------------------------ enumeration (worker)
let worker = null, fallbackTimer = null;
function cancelEnumeration() {
  if (worker) { worker.terminate(); worker = null; }
  if (fallbackTimer !== null) { clearTimeout(fallbackTimer); fallbackTimer = null; }
  ++S.enumReq;
  if (S.enumRunning && currentEnumeration()) S.enumeration.status = 'cancelled';
  S.enumRunning = false;
}
function maybeAutoEnumerate() {
  if (tourPreviewActive) return;
  if (S.model.topo.k <= S.limits.autoEnumerateMaxQuotient && !currentEnumeration()) startEnumeration();
}
function startEnumeration(more = false, options = {}) {
  cancelEnumeration();
  if (more && currentEnumeration()) { S.limits.displayLimit = Math.min(100000, S.limits.displayLimit + DEFAULT_LIMITS.displayLimit); S.limits.stateBudget = Math.min(10000000, S.limits.stateBudget * 2); }
  const req = ++S.enumReq, rev = S.rev, mode = S.mode, stat = S.statistic, key = analyticalKey();
  const limits = { ...S.limits };
  // The Cancel demonstration intentionally yields between real batches so
  // readers can see and press its control before a fast worker finishes.
  // Ordinary enumerations and the mathematical generator are unchanged.
  const tutorialDelay = tourPreviewActive && options.paced ? 90 : 0;
  const T = S.model.topo;
  const src = document.getElementById('kernel-src');
  S.enumRunning = true; S.enumPage = 0;
  S.enumeration = { status: 'running', listedCount: 0, opens: [], upsetMasks: [], count: { status: 'not-computed', value: null }, displayLimit: limits.displayLimit, limits };
  S.enumRev = rev; S.enumKey = key;
  const fresh = () => req === S.enumReq && key === analyticalKey();
  const refreshListing = () => { if (S.tab === 'opens') renderTab(); renderStatus(); };
  let listingFrame = null;
  const scheduleListing = () => {
    if (listingFrame !== null) return;
    listingFrame = requestAnimationFrame(() => { listingFrame = null; if (fresh()) refreshListing(); });
  };
  const finish = rec => {
    if (listingFrame !== null) { cancelAnimationFrame(listingFrame); listingFrame = null; }
    if (!fresh()) {
      if (req === S.enumReq) { cancelEnumeration(); S.enumeration = null; S.enumKey = null; refreshListing(); maybeAutoEnumerate(); }
      return;
    }
    S.enumeration = rec; S.enumRunning = false; S.enumRev = rev; S.enumKey = key; refreshListing();
  };
  if (src && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      const body = src.textContent + '\n;(' + workerMain.toString() + ')();';
      const url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
      const ownWorker = new Worker(url); worker = ownWorker;
      S.enumeration.engine = 'worker';
      URL.revokeObjectURL(url);
      ownWorker.onmessage = ev => {
        const d = ev.data;
        if (d.req !== req) return;
        if (!fresh()) {
          ownWorker.terminate(); if (worker === ownWorker) worker = null;
          if (req === S.enumReq) finish(null);
          return;
        }
        if (d.type === 'batch') {
          const masks = d.masks.map(BigInt);
          S.enumeration.upsetMasks.push(...masks); S.enumeration.opens.push(...masks.map(m => T.lift(m)));
          S.enumeration.listedCount = S.enumeration.opens.length; S.enumeration.engine = 'worker';
          // Keep input responsive when several worker batches arrive before
          // the next paint. Every result is stored immediately; redraw once.
          scheduleListing(); return;
        }
        const rec = { status: d.status, listedCount: d.masks.length, displayLimit: d.displayLimit,
          upsetMasks: d.masks.map(BigInt), limits, count: { status: d.countStatus, value: d.countValue === null ? null : BigInt(d.countValue), method: d.countMethod } };
        rec.opens = rec.upsetMasks.map(m => T.lift(m)); rec.engine = 'worker';
        ownWorker.terminate(); if (worker === ownWorker) worker = null;
        finish(rec);
      };
      ownWorker.onerror = () => { ownWorker.terminate(); if (worker === ownWorker) worker = null; if (fresh()) fallback(); };
      ownWorker.postMessage({ req, graph: graphToJSON(S.graph), mode, statistic: stat, limits, tutorialDelay });
      refreshListing();
      return;
    } catch (e) { if (worker) worker.terminate(); worker = null; }
  }
  fallback();
  function fallback() {
    if (!fresh()) return;
    const effective = { ...limits, timeBudgetMs: Math.min(1500, limits.timeBudgetMs) };
    const budget = new Budget({ ...effective, isCancelled: () => !fresh() });
    const gen = upsets(T.k, T.up, T.down, budget), masks = [], opens = [];
    S.enumeration.engine = 'main-thread fallback'; S.enumeration.limits = effective;
    // Yield between small batches so real edits, mode changes and Cancel
    // can invalidate the work before it publishes another batch.
    function batch() {
      fallbackTimer = null;
      if (!fresh()) return;
      const began = Date.now();
      let status = null;
      for (let i = 0; i < 128 && Date.now() - began < 12; i++) {
        const next = gen.next();
        if (next.done) { status = budget.stop ? (budget.stop === 'cancelled' ? 'cancelled' : 'interrupted') : 'complete'; break; }
        if (masks.length >= effective.displayLimit) { status = 'display-cap'; break; }
        masks.push(next.value); opens.push(T.lift(next.value));
      }
      if (!fresh()) return;
      Object.assign(S.enumeration, { upsetMasks: masks.slice(), opens: opens.slice(), listedCount: masks.length });
      if (status) {
        const count = status === 'complete' ? { status: 'exact', value: BigInt(masks.length), method: 'complete listing' }
          : countUpsets(T.k, T.up, T.down, new Budget(effective));
        finish({ status, listedCount: masks.length, upsetMasks: masks, opens, count,
          lowerBound: count.status === 'exact' ? null : BigInt(masks.length), displayLimit: effective.displayLimit, limits: effective, engine: 'main-thread fallback' });
      } else {
        if (masks.length % 512 === 0) scheduleListing();
        fallbackTimer = setTimeout(batch, tutorialDelay);
      }
    }
    refreshListing(); fallbackTimer = setTimeout(batch, 0);
  }
}
// runs INSIDE the worker (kernel source is prepended)
function workerMain() {
  self.onmessage = async ev => {
    const { req, graph, mode, statistic, limits, tutorialDelay = 0 } = ev.data;
    const v = validateGraph(graph);
    const T = buildTopologyModel(v.graph, mode, statistic).topo;
    const budget = new Budget(limits);
    const masks = []; let status = 'complete';
    for (const m of upsets(T.k, T.up, T.down, budget)) {
      if (masks.length >= limits.displayLimit) { status = 'display-cap'; break; }
      masks.push(m.toString());
      if (masks.length % 512 === 0) {
        self.postMessage({ req, type: 'batch', masks: masks.slice(-512) });
        if (tutorialDelay) await new Promise(resolve => setTimeout(resolve, tutorialDelay));
      }
    }
    if (budget.stop) status = budget.stop === 'cancelled' ? 'cancelled' : 'interrupted';
    const c = status === 'complete' ? { status: 'exact', value: BigInt(masks.length), method: 'complete listing' }
      : countUpsets(T.k, T.up, T.down, new Budget(limits));
    self.postMessage({ req, type: 'done', status, masks, displayLimit: limits.displayLimit,
      countStatus: c.status, countValue: c.value === null ? null : c.value.toString(), countMethod: c.method });
  };
}

// ------------------------------------------------------------ exports
function download(name, text, type) {
  if (tourPreviewActive) {
    window.dispatchEvent(new CustomEvent('uphill-tour-file-preview', { detail: { name, text, type } }));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function experiment() {
  return exportExperiment({ graph: S.graph, mode: S.mode, statistic: S.statistic, selectedIds: [...S.selected],
    subspaceIds: [...S.sub], generator: S.generator ? { input: S.generator.input, certificatePass: S.generator.pass, appliesToCurrentGraph: S.generatorRev === S.rev && S.mode === 'uphill' && S.statistic === 'incident-edges' } : null,
    enumeration: currentEnumeration(), limits: S.limits, presetId: S.presetId, randomSeed: S.randomSeed });
}
function reportHTML() {
  const ex = experiment();
  const json = JSON.stringify(ex, null, 1).replace(/</g, '\\u003c');
  const g = S.graph;
  const assumptions = S.mode === 'weak-patch'
    ? 'A is open exactly when it is a union of whole original plateaus. Original uphill arrows are reference only; the active quotient has equality order (no strict comparisons).'
    : `An allowed step u→v follows an edge with d(u) ${S.mode === 'strict' ? '&lt;' : '≤'} d(v); reachability includes the zero-length path.`;
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Uphill experiment report</title>'
    + `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${reportCSS}</style></head><body>`
    + `<h1>Uphill experiment report</h1><p>${ex.timestamp} · app ${APP_VERSION} · kernel ${KERNEL_VERSION} · manuscript ${esc(MANUSCRIPT_VERSION)} (${esc(ex.manuscriptDate)}) · graph ${esc(ex.graphChecksum)}</p>`
    + `<h2>Assumptions</h2><p>Finite ${esc(g.kind)} graph; mode <b>${esc(t(S.mode))}</b>; statistic <b>${esc(t(S.statistic))}</b>; primary carrier: ambient vertices V. ${assumptions}</p>`
    + '<p>These are finite calculations. They do not prove the manuscript’s general or infinite theorems.</p>'
    + `<h2>Selected set on V</h2>${inspectorHTML().replace(/<button[^>]*>.*?<\/button>/g, '')}`
    + `<h2>Smallest open neighbourhoods</h2><p>The largest open set containing any vertex is V. The sets below are the smallest open neighbourhoods, using the active topology. Graph fills: ${S.colourMode === 'neighbourhoods' ? S.neighbourhoods.anchors.length > 2 ? 'one colour per selected start; shared vertices show every containing set as coloured sectors' : 'wine N(v1) only, turquoise N(v2) only, purple intersection' : 'interior / boundary / exterior of A'}.</p><div class="neighbourhood-summary">${neighbourhoodSummaryHTML()}</div>`
    + `<h2>Figures</h2><div class="figures"><div>${staticSVG(graphSVG({ legend: true, static: true }))}</div><div>${staticSVG(quotientSVG({ static: true }), true)}</div></div>`
    + '<h2>Subspace comparison</h2>' + subspaceReport(ex)
    + '<h2>Loaded open sets on V</h2>' + loadedSetsReport(ex)
    + `<h2>Input edge list</h2><p>${g.edges.map(e => `${esc(g.nodes[e.u].id)}—${esc(g.nodes[e.v].id)}`).join(', ') || 'no edges'}; vertices: ${g.nodes.map(n => esc(n.id)).join(', ') || 'none'}</p>`
    + '<h2>Degrees, classes and least neighbourhoods</h2>' + nbhdHTML({ static: true })
    + (ex.generator ? `<h2>Finite construction check</h2><p>${ex.generator.appliesToCurrentGraph ? 'PASS for the current non-strict graph and incident-edge statistic.' : 'The saved construction does not certify the active ordered space.'} The certificate checks this finite construction; it is not a proof of Theorem 4.1.</p>` : '')
    // the closing tag is split so this source can itself sit inside a <script>
    + `<details><summary>Experiment JSON and provenance (inert, reproducible data)</summary><script type="application/json" id="experiment">${json}<` + `/script><pre>${esc(JSON.stringify(ex, null, 1))}</pre></details>`
    + '</body></html>';
}
function staticSVG(svg, quotient = false) {
  return staticFigure(svg, { mode: t(S.mode), statistic: t(S.statistic),
    carrier: quotient ? 'quotient points' : 'vertices', quotient,
    relation: S.mode === 'weak-patch'
      ? 'Original uphill arrows/order are reference only; active quotient has equality order.'
      : S.mode === 'strict' ? 'Allowed steps use <.' : 'Allowed steps use ≤.' });
}
function svgStandalone(svg, quotient = false) { return '<?xml version="1.0" encoding="UTF-8"?>\n' + staticSVG(svg, quotient); }

// ------------------------------------------------------------ render
function render() {
  document.title = t('title');
  const referencePresets = document.querySelector('#preset [data-reference-presets]');
  if (referencePresets) referencePresets.hidden = S.workspace !== 'workbench';
  $('#preset').value = S.presetId || '';
  $('#mode').value = S.mode; $('#stat').value = S.statistic;
  $('#stat-note').textContent = S.graph.kind === 'simple-undirected' ? '(equal on simple graphs)' : '(multigraph: statistics differ)';
  $('#msgs').innerHTML = S.messages.map(m => `<div class="msg ${m.kind}" role="${m.kind === 'error' ? 'alert' : 'status'}">${esc(m.m)}</div>`).join('');
  $('#graph').innerHTML = graphSVG({ legend: true });
  $('#quot').innerHTML = quotientSVG();
  $('#qview').innerHTML = S.mode === 'weak-patch'
    ? '<option value="discrete">discrete points</option><option value="ghost">+ original order (reference only)</option>'
    : '<option value="hasse">Hasse diagram (covers)</option><option value="condensation">condensation (direct arcs)</option>';
  if (S.mode === 'weak-patch' && !['discrete', 'ghost'].includes(S.quotientView)) S.quotientView = 'discrete';
  if (S.mode !== 'weak-patch' && !['hasse', 'condensation'].includes(S.quotientView)) S.quotientView = 'hasse';
  $('#qview').value = S.quotientView;
  $('#quot').innerHTML = quotientSVG();
  $('#insp').innerHTML = inspectorHTML();
  $('#vlist').innerHTML = S.graph.order.map(i => `<label class="chk"><input type="checkbox" data-act="selv" data-v="${esc(S.graph.nodes[i].id)}" ${S.selected.has(S.graph.nodes[i].id) ? 'checked' : ''}> ${esc(label(i))}</label>`).join('') || '<span class="muted">no vertices</span>';
  $('#undo').disabled = !S.undo.length; $('#redo').disabled = !S.redo.length;
  $('#gen-banner').innerHTML = generatorBanner();
  renderStatus();
  renderTab();
  renderTracePanel();
  renderSelectionSummary();
  renderNeighbourhoodSummary();
  visualExplorer?.update();
  controlMenus?.sync();
}
function generatorBanner() {
  if (!S.generator) return '';
  const valid = S.generatorRev === S.rev && S.mode === 'uphill' && S.statistic === 'incident-edges';
  return valid ? `<div class="msg ${S.generator.pass ? 'ok' : 'warn'}">Generated from a ${(S.generator.P?.points || S.generator.input.points).length}-point poset: certificate ${S.generator.pass ? 'PASS — the active quotient equals the input order' : 'FAIL'}. This checks the finite construction; it does not prove the theorem.</div>`
    : '<div class="msg warn">Generated graph, but the current mode/statistic or an edit differs from the certified setting (non-strict, incident edges, unedited): the claim that the active quotient is the input poset is withdrawn.</div>';
}
function renderStatus() {
  const T = S.model.topo;
  const c = exactCount(T);
  $('#status').textContent = `${T.n} vertices / ${S.graph.edges.length} edges / ${T.k} quotient points / `
    + `${c.status === 'exact' ? c.value.toString() : '?'} ${t(S.mode)}-open sets`;
}
function renderTab() {
  const active = document.activeElement;
  const focus = active && $('#tabbody').contains(active) ? { id: active.id, vertex: active.dataset.v, act: active.dataset.act,
    start: active.selectionStart, end: active.selectionEnd } : null;
  $('#tabs').innerHTML = TABS.map(([k, v]) => `<button role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${v}</button>`).join('');
  $('#tabbody').innerHTML = tabHTML();
  syncTraceRows();
  $('#tabbody').querySelectorAll('input, textarea, select').forEach(el => {
    const key = el.dataset.act === 'rename' ? 'rename:' + el.dataset.v : el.id;
    if (fieldDrafts.has(key)) el.value = fieldDrafts.get(key);
    if (focus && ((focus.id && focus.id === el.id) || (focus.act === 'rename' && el.dataset.act === 'rename' && focus.vertex === el.dataset.v))) {
      el.focus({ preventScroll: true });
      if (focus.start !== null && typeof el.setSelectionRange === 'function') el.setSelectionRange(focus.start, focus.end);
    }
  });
}

// ------------------------------------------------------------ events
function setSelection(ids, why, options = {}) {
  const previous = S.selected, next = new Set(ids);
  const added = [...next].filter(id => !previous.has(id));
  pushUndo(); S.selected = next; if (why) say(why); else S.messages = []; clearTransientAnalysis(); recompute(); render();
  // Pointer, keyboard and table-checkbox selections all use this path. Bulk
  // operations show their complete result without playing several flashes.
  const origin = options.blinkVertex ?? (added.length === 1 ? added[0] : null);
  if (options.blink !== false && origin !== null && added.includes(origin)) visualExplorer?.blinkSelection(origin);
}

function setSubspace(ids) { pushUndo(); S.sub = new Set(ids); S.explain = null; render(); }

function onClick(ev) {
  const el = ev.target.closest('[data-act], [data-tool], .vtx, .qn');
  if (!el) return;
  const act = el.dataset.act;
  const T = S.model.topo;
  // mouse gestures on the canvas are handled by the pointer handlers; a
  // click with detail 0 comes from the keyboard (Enter / Space)
  if (el.classList.contains('vtx') && !act) { if (ev.detail === 0) vertexKey(el.dataset.v); return; }
  if (el.dataset.tool) { setTool(el.dataset.tool); return; }
  if (el.classList.contains('qn') && !act) { const c = +el.dataset.c; showTrace(neighbourhoodTrace(S.model, T.classes[c][0], c)); return; }
  switch (act) {
    case 'tab': S.tab = el.dataset.tab; renderTab(); break;
    case 'trace-nbhd': showTrace(neighbourhoodTrace(S.model, idx(el.dataset.v))); break;
    case 'trace-class': { const c = +el.dataset.c; showTrace(neighbourhoodTrace(S.model, T.classes[c][0], c)); break; }
    case 'trace-cover': case 'trace-arc': case 'trace-relation': showTrace(relationTrace(S.model, +el.dataset.from, +el.dataset.to, act.slice(6))); break;
    case 'clear-trace': showTrace(null); $('#graph').focus({ preventScroll: true }); break;
    case 'op': {
      const a = S.analysis, m = { interior: a.interior, closure: a.closure, boundary: a.boundary, enlarge: a.enlarge,
        complement: S.A.map(x => 1 - x) }[el.dataset.op];
      setSelection(setIds(m), `A replaced by ${el.textContent}`); break;
    }
    case 'saturate': {
      const add = []; T.classes.forEach(c => { if (c.some(x => S.A[x])) c.forEach(x => { if (!S.A[x]) add.push(S.graph.nodes[x].id); }); });
      setSelection([...S.selected, ...add], add.length ? `Added (saturation q⁻¹(q(A))): ${add.join(', ')}` : 'A was already a union of classes'); break;
    }
    case 'clearA': setSelection([], 'A cleared'); break;
    case 'show-arc': S.trace = null; S.explain = { arc: [+el.dataset.u, +el.dataset.v] }; renderExploration(); break;
    case 'show-path': S.trace = null; S.explain = { path: el.dataset.path.split(',').map(Number) }; renderExploration(); break;
    case 'enum': startEnumeration(); break;
    case 'enum-more': startEnumeration(true); break;
    case 'cancel-enum': cancelEnumeration(); say('Enumeration cancelled; any loaded entries remain available as an incomplete list.'); render(); break;
    case 'enum-page': S.enumPage = Math.max(0, +el.dataset.page); renderTab(); break;
    case 'preview': if (currentEnumeration()?.opens[+el.dataset.i]) { S.trace = null; S.preview = S.enumeration.opens[+el.dataset.i]; renderExploration(); } break;
    case 'useA': if (currentEnumeration()?.opens[+el.dataset.i]) setSelection(setIds(S.enumeration.opens[+el.dataset.i]), 'A := chosen open set'); break;
    case 'sub-from-A': setSubspace(S.selected); break;
    case 'sub-all': setSubspace(S.graph.nodes.map(n => n.id)); break;
    case 'sub-none': setSubspace([]); break;
    case 'poset-preset': {
      const P = { crown: ['a b c d', 'a < c\na < d\nb < c\nb < d'], chain6: ['1 2 3 4 5 6', '1 < 2\n2 < 3\n3 < 4\n4 < 5\n5 < 6'], claw: ['o x y z', 'o < x\no < y\no < z'] }[el.dataset.p];
      posetPoints = P[0]; posetText = P[1]; posetResult = null; renderTab(); break;
    }
    case 'poset-gen': case 'poset-load': {
      posetPoints = $('#pp').value; posetText = $('#pa').value;
      const inp = parsePosetInput();
      if (inp.errors.length) { posetResult = { ok: false, errors: inp.errors }; renderTab(); break; }
      const P = validatePoset(inp);
      if (!P.ok) { posetResult = { ok: false, errors: P.errors }; renderTab(); break; }
      const est = estimateRealization(P);
      if (est.vertices > S.limits.maxVertices || est.edges > S.limits.maxEdges) {
        posetResult = { ok: false, errors: [`output would have ${est.vertices} vertices and ${est.edges} edges — over the interactive limit (${S.limits.maxVertices} / ${S.limits.maxEdges})`] }; renderTab(); break;
      }
      const r = realizeFinitePoset(P); r.P = P; posetResult = r;
      if (act === 'poset-load' && r.ok) {
        const g = r.input; g.layout = blockLayout(r);
        loadGraph(g, null, true, { mode: 'uphill', statistic: 'incident-edges',
          generator: { P, input: { points: P.points, arrows: inp.arrows }, pass: r.certificate.pass, certificate: r.certificate } });
      } else renderTab();
      break;
    }
    case 'addv': {
      const id = $('#newv').value.trim();
      if (!id) { say('Give the new vertex an ID.', 'error'); render(); break; }
      editGraph(g => { g.nodes.push({ id, label: id }); }); break;
    }
    case 'delv': editGraph(g => { g.nodes = g.nodes.filter(n => n.id !== el.dataset.v); g.edges = g.edges.filter(e => e.source !== el.dataset.v && e.target !== el.dataset.v); delete g.layout[el.dataset.v]; }); break;
    case 'dele': editGraph(g => { g.edges = g.edges.filter(e => e.id !== el.dataset.e); }); break;
    case 'adde': addEdge($('#eu').value, $('#ev').value); break;
    case 'to-multi': editGraph(g => { g.kind = 'loopless-multigraph'; }); break;
    case 'clear-graph': editGraph(g => { g.nodes = []; g.edges = []; g.layout = {}; }); break;
    case 'import-el': {
      edgeDraft = $('#el').value; isoDraft = $('#iso').value;
      const v = parseEdgeList(edgeDraft, isoDraft);
      if (!v.ok) { say('Rejected (graph unchanged): ' + v.errors.join('; '), 'error'); render(); break; }
      loadGraph(graphToJSON(v.graph)); break;
    }
    case 'import-json': {
      jsonDraft = $('#gj').value;
      let d; try { d = JSON.parse(jsonDraft); } catch (e) { say('Malformed JSON (graph unchanged): ' + e.message, 'error'); render(); break; }
      if (importData(d)) { jsonDraft = null; renderTab(); } break;
    }
    case 'refresh-json': jsonDraft = null; renderTab(); break;
    case 'galF': galleryF = $('#galF').value; renderTab(); break;
    default: break;
  }
  if (act?.startsWith('trace-')) $('#trace-panel')?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

// keyboard (Enter/Space on a focused vertex): toggle it in A, or explain it
function vertexKey(id) {
  if (S.tool === 'select') {
    const s2 = new Set(S.selected); s2.has(id) ? s2.delete(id) : s2.add(id); setSelection([...s2]);
    [...document.querySelectorAll('#graph .vtx')].find(el => el.dataset.v === id)?.focus({ preventScroll: true });
    return;
  }
  if (S.tool === 'neighbourhood') { showTrace(neighbourhoodTrace(S.model, idx(id))); return; }
  S.focus = id; S.focusClass = null; S.explain = null; S.trace = null; render();
}

const TOOL_HINT = {
  select: 'Click one vertex for its smallest open neighbourhood; click a second for wine / turquoise / purple overlap. Click again to deselect. Selected vertices also form A. Drag a vertex to move it; drag empty space to add a box to A (Alt removes).',
  'add-vertex': 'Click on empty space to add a vertex there. Drag from one vertex to another to add an edge.',
  'add-edge': 'Drag from one vertex to another, or click the first vertex and then the second, to add an edge.',
  move: 'Drag a vertex to move it. Moving changes the drawing only, never the topology.',
  delete: 'Click a vertex to delete it with its edges, or click an edge to delete that edge. Undo restores it.',
  focus: 'Click a vertex to explain its neighbourhood and membership in int(A) and cl(A). Drag a vertex to move it.',
  neighbourhood: 'Click a vertex to highlight its neighbourhood in the drawings and table; drag to move it. A stays unchanged. Wine marks the origin; turquoise marks reached vertices.',
};
function setTool(t0) {
  S.tool = t0; S.pendingConnect = null;
  document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t0)));
  $('#toolhint').textContent = TOOL_HINT[t0];
  $('#graph').className = 'canvas tool-' + t0;
  $('#graph').innerHTML = graphSVG({ legend: true });
  visualExplorer?.stop(); visualExplorer?.update();
}

function nextVertexId() {
  const used = new Set(S.graph.nodes.map(n => n.id));
  for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!used.has(c)) return c;
  let k = 1; while (used.has('v' + k)) k++;
  return 'v' + k;
}

function deleteVertex(id) {
  if (editGraph(g => { g.nodes = g.nodes.filter(n => n.id !== id); g.edges = g.edges.filter(e => e.source !== id && e.target !== id); delete g.layout[id]; })) {
    say(`Vertex ${id} and its edges deleted. Everything recomputed.`); render();
  }
}

// ---- canvas gestures (pointer events on the graph pane)
let gest = null;
function svgPoint(svg, ev) {
  const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function vertexAt(ev) {
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const v = el && el.closest ? el.closest('#graph .vtx') : null;
  return v ? v.dataset.v : null;
}
function onPointerDown(ev) {
  // Stopping the live demonstration restores this same graph before the real
  // gesture. Its SVG can have been redrawn during the capture phase.
  const oldVertex = ev.target.closest?.('.vtx')?.dataset.v;
  const oldEdge = ev.target.closest?.('[data-e]')?.dataset.e;
  const target = ev.target.isConnected ? ev.target
    : (oldVertex !== undefined ? [...document.querySelectorAll('#graph .vtx')].find(node => node.dataset.v === oldVertex) : null)
      || (oldEdge !== undefined ? [...document.querySelectorAll('#graph [data-e]')].find(node => node.dataset.e === oldEdge) : null)
      || document.elementFromPoint(ev.clientX, ev.clientY);
  const svg = target?.closest && target.closest('#graph svg');
  if (!svg || ev.button !== 0) return;
  const p = svgPoint(svg, ev), vEl = target.closest('.vtx'), eEl = target.closest('[data-e]');
  gest = { tool: S.tool, svg, start: p, startClient: { x: ev.clientX, y: ev.clientY }, v: vEl ? vEl.dataset.v : null, e: eEl ? eEl.dataset.e : null, moved: false, alt: ev.altKey, overlay: null };
  ev.preventDefault();
}
function onPointerMove(ev) {
  if (!gest) return;
  const p = svgPoint(gest.svg, ev);
  if (Math.hypot(ev.clientX - gest.startClient.x, ev.clientY - gest.startClient.y) > 4) gest.moved = true;
  if (!gest.moved) return;
  const ns = 'http://www.w3.org/2000/svg';
  if (['move', 'select', 'neighbourhood', 'focus'].includes(gest.tool) && gest.v) {
    S.graph.layout[gest.v] = { x: Math.round(p.x), y: Math.round(p.y) };
    $('#graph').innerHTML = graphSVG({ legend: true }); gest.svg = $('#graph svg');
    return;
  }
  if (gest.tool === 'select' && !gest.v) {
    if (!gest.overlay) {
      gest.overlay = document.createElementNS(ns, 'rect');
      gest.overlay.setAttribute('fill', 'rgba(117,68,164,.10)'); gest.overlay.setAttribute('stroke', COL.interior);
      gest.overlay.setAttribute('stroke-dasharray', '5 3');  gest.overlay.setAttribute('pointer-events', 'none'); gest.svg.appendChild(gest.overlay);
    }
    gest.overlay.setAttribute('x', Math.min(p.x, gest.start.x)); gest.overlay.setAttribute('y', Math.min(p.y, gest.start.y));
    gest.overlay.setAttribute('width', Math.abs(p.x - gest.start.x)); gest.overlay.setAttribute('height', Math.abs(p.y - gest.start.y));
    return;
  }
  if ((gest.tool === 'add-edge' || gest.tool === 'add-vertex') && gest.v) {
    if (!gest.overlay) {
      gest.overlay = document.createElementNS(ns, 'line');
      gest.overlay.setAttribute('stroke', COL.wine); gest.overlay.setAttribute('stroke-width', '3');
      gest.overlay.setAttribute('stroke-dasharray', '6 4');  gest.overlay.setAttribute('pointer-events', 'none'); gest.svg.appendChild(gest.overlay);
    }
    const q = S.graph.layout[gest.v];
    gest.overlay.setAttribute('x1', q.x); gest.overlay.setAttribute('y1', q.y);
    gest.overlay.setAttribute('x2', p.x); gest.overlay.setAttribute('y2', p.y);
  }
}
function onPointerUp(ev) {
  if (!gest) return;
  const g0 = gest; gest = null;
  const p = svgPoint(g0.svg, ev), target = vertexAt(ev);
  if (g0.v && g0.moved && ['move', 'select', 'neighbourhood', 'focus'].includes(g0.tool)) $('#layout-choice').value = 'current';
  switch (g0.tool) {
    case 'neighbourhood':
      if (g0.v && !g0.moved) showTrace(neighbourhoodTrace(S.model, idx(g0.v)));
      else if (g0.v && g0.moved) { say(`Moved ${g0.v} (drawing only; A and topology are unchanged).`); render(); }
      break;
    case 'select':
      if (g0.v && !g0.moved) {
        const s2 = new Set(S.selected); s2.has(g0.v) ? s2.delete(g0.v) : s2.add(g0.v); setSelection([...s2]);
      } else if (g0.v && g0.moved) {
        say(`Moved ${g0.v} (drawing only; A and topology are unchanged).`); render();
      } else if (!g0.v && g0.moved) {
        const x0 = Math.min(p.x, g0.start.x), x1 = Math.max(p.x, g0.start.x), y0 = Math.min(p.y, g0.start.y), y1 = Math.max(p.y, g0.start.y);
        const inside = S.graph.nodes.filter(n => { const q = S.graph.layout[n.id]; return q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1; }).map(n => n.id);
        const s2 = new Set(S.selected); inside.forEach(id => (g0.alt ? s2.delete(id) : s2.add(id)));
        setSelection([...s2], inside.length ? `${g0.alt ? 'Removed from' : 'Added to'} A: ${inside.join(', ')}` : 'No vertex inside the box');
      }
      break;
    case 'add-vertex':
      if (!g0.v && !g0.moved) {
        const id = nextVertexId();
        if (editGraph(gr => { gr.nodes.push({ id, label: id }); gr.layout[id] = { x: Math.round(p.x), y: Math.round(p.y) }; })) {
          say(`Vertex ${id} added (isolated, degree 0). Everything recomputed.`); render();
        }
      } else if (g0.v && target && target !== g0.v) addEdge(g0.v, target);
      else if (g0.overlay) render();
      break;
    case 'add-edge':
      if (g0.v && g0.moved && target && target !== g0.v) addEdge(g0.v, target);
      else if (g0.v && !g0.moved) {
        if (!S.pendingConnect) { S.pendingConnect = g0.v; say(`Add edge: now click the second vertex (first: ${g0.v}).`); render(); }
        else if (S.pendingConnect === g0.v) { S.pendingConnect = null; say('Edge cancelled (same vertex twice; loops are not allowed).'); render(); }
        else { const a = S.pendingConnect; S.pendingConnect = null; addEdge(a, g0.v); }
      } else if (g0.overlay) render();
      break;
    case 'move':
      if (g0.v && g0.moved) say(`Moved ${g0.v} (drawing only; the topology is unchanged).`);
      render();
      break;
    case 'delete':
      if (g0.v) deleteVertex(g0.v);
      else if (g0.e) {
        const e = g0.e;
        if (editGraph(gr => { gr.edges = gr.edges.filter(x => x.id !== e); })) { say(`Edge ${e} deleted. Everything recomputed.`); render(); }
      }
      break;
    default:
      if (g0.v && g0.moved) { say(`Moved ${g0.v} (drawing only; A and topology are unchanged).`); render(); }
      else if (g0.v) { S.focus = g0.v; S.focusClass = null; S.explain = null; S.trace = null; render(); }
  }
}

function addEdge(a, b) {
  if (a === b) { say('Loops are not allowed.', 'error'); render(); return; }
  const before = S.model.degree.slice();
  const ok = editGraph(g => { let k = g.edges.length + 1; while (g.edges.some(e => e.id === 'e' + k)) k++; g.edges.push({ id: 'e' + k, source: a, target: b }); });
  if (ok) {
    const ch = S.graph.nodes.map((p, i) => [p.label, before[i], S.model.degree[i]]).filter(x => x[1] !== x[2]);
    say(`Edge ${a}—${b} added. Degree changes: ${ch.map(x => `${x[0]} ${x[1]}→${x[2]}`).join(', ')}. Everything recomputed.`);
    render();
  }
}

// every edit goes through validation; a rejected edit leaves the graph as it was
function editGraph(fn) {
  const j = graphToJSON(S.graph); fn(j);
  const v = validateGraph(j, S.limits);
  if (!v.ok) { say('Edit rejected (graph unchanged): ' + v.errors.join('; '), 'error'); render(); return false; }
  pushUndo(); S.graph = v.graph; ensureLayout(S.graph); S.messages = [];
  commit(true); return true;
}

function onInput(ev) {
  const el = ev.target;
  if (el.id === 'pp') posetPoints = el.value;
  else if (el.id === 'pa') posetText = el.value;
  else if (el.id === 'el') edgeDraft = el.value;
  else if (el.id === 'iso') isoDraft = el.value;
  else if (el.id === 'gj') jsonDraft = el.value;
  else if (el.id === 'galF') galleryF = el.value;
  else if (el.dataset.act === 'rename') fieldDrafts.set('rename:' + el.dataset.v, el.value);
  else if (['newv', 'eu', 'ev'].includes(el.id)) fieldDrafts.set(el.id, el.value);
}

function onChange(ev) {
  const el = ev.target, act = el.dataset.act;
  if (el.id === 'colour-mode') { S.colourMode = el.value === 'analysis' ? 'analysis' : 'neighbourhoods'; render(); return; }
  if (el.id === 'layout-choice') { applyDrawingLayout(el.value); return; }
  if (el.id === 'mode' || el.id === 'stat') {
    pushUndo(); cancelEnumeration(); S.messages = [];
    if (el.id === 'mode') S.mode = el.value; else S.statistic = el.value;
    clearTransientAnalysis(); S.enumRev = -1; S.enumKey = null; S.enumeration = null; S.enumPage = 0;
    commit(false); return;
  }
  if (el.id === 'qview') { S.quotientView = el.value; $('#quot').innerHTML = quotientSVG(); return; }
  if (el.id === 'arcs') { S.showArcs = el.checked; visualExplorer?.stop(); $('#graph').innerHTML = graphSVG({ legend: true }); visualExplorer?.update(); return; }
  if (el.id === 'ccol') { S.classColour = el.checked; visualExplorer?.stop(); $('#graph').innerHTML = graphSVG({ legend: true }); visualExplorer?.update(); return; }
  if (el.id === 'preset') { if (el.value) loadPreset(el.value); return; }
  if (el.id === 'imp') { importFile(el.files[0]); el.value = ''; return; }
  if (act === 'selv') { const s = new Set(S.selected); el.checked ? s.add(el.dataset.v) : s.delete(el.dataset.v); setSelection([...s]); return; }
  if (act === 'subv') { const sub = new Set(S.sub); el.checked ? sub.add(el.dataset.v) : sub.delete(el.dataset.v); setSubspace(sub); return; }
  if (act === 'rename') { const v = el.dataset.v, lab = el.value; editGraph(g => { g.nodes.find(n => n.id === v).label = lab; }); }
}

function loadPreset(id, target = {}) {
  if (id === 'isolated100') { loadGraph(isolatedPreset(100), 'isolated100', true, target); return; }
  const g = FIXTURES[id] || EXTRA_PRESETS[id];
  if (!g) { say(`Preset ${id} missing from this build.`, 'error'); render(); return; }
  const info = PRESET_INFO.find(p => p[0] === id);
  const copy = JSON.parse(JSON.stringify(g));
  if (info && info[2]) { copy.layout = {}; for (const [k, [x, y]] of Object.entries(info[2])) copy.layout[k] = { x, y }; }
  loadGraph(copy, id, true, target);
}

function importFile(file) {
  if (!file) return;
  if (file.size > 20e6) { say('File too large (> 20 MB).', 'error'); render(); return; }
  const rd = new FileReader();
  rd.onload = () => {
    let d; try { d = JSON.parse(rd.result); } catch (e) { say('Malformed JSON (current graph kept): ' + e.message, 'error'); render(); return; }
    importData(d);
  };
  rd.onerror = () => { say('Unable to read the file; the current experiment is unchanged.', 'error'); render(); };
  rd.readAsText(file);
}

function importData(d) {
  if (!(d && typeof d.schemaVersion === 'string' && d.schemaVersion.startsWith('uphill-experiment/'))) return loadGraph(d);
  let r;
  try { r = importExperiment(d); }
  catch (e) { say('Rejected (current experiment kept): unable to validate the experiment: ' + e.message, 'error'); render(); return false; }
  if (!r.ok) { say('Rejected (current experiment kept): ' + r.errors.join('; '), 'error'); render(); return false; }
  pushUndo(); S.graph = r.state.graph; ensureLayout(S.graph);
  if ($('#layout-choice')) $('#layout-choice').value = 'current';
  S.mode = r.state.mode; S.statistic = r.state.statistic; S.selected = new Set(r.state.selectedIds);
  S.sub = new Set(r.state.subspaceIds || []);
  S.limits = { ...DEFAULT_LIMITS, ...r.state.limits }; S.randomSeed = r.state.randomSeed ?? null;
  S.presetId = r.state.presetId || null; S.generator = r.state.generator;
  // The recomputed certificate belongs to this graph revision. Its display
  // separately checks the active topology/statistic, including after switches.
  S.generatorRev = S.generator?.pass ? S.rev + 1 : -1;
  S.focus = null;
  say(r.mismatches.length ? `Experiment reimported; recomputed results DIFFER from the cached ones in: ${r.mismatches.join(', ')}` : 'Experiment reimported; ambient and saved comparison results recomputed and match the exported data.', r.mismatches.length ? 'warn' : 'ok');
  commit(true);
  if (r.state.enumeration) {
    cancelEnumeration(); S.enumeration = r.state.enumeration; S.enumeration.restoredFromFile = true;
    S.enumKey = analyticalKey(); S.enumRev = S.rev; render();
  }
  return true;
}

function onKey(ev) {
  if (ev.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') || ev.target.isContentEditable) return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? doRedo() : doUndo(); }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); doRedo(); }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('.vtx, .qn')) {
    ev.preventDefault();
    const target = ev.target.isConnected ? ev.target
      : [...document.querySelectorAll('#graph .vtx')].find(node => node.dataset.v === ev.target.dataset.v);
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
}
function doUndo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
function doRedo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }

// Presentation preferences do not enter experiments or undo history.
function setWorkspace(workspace) {
  S.workspace = workspace === 'workbench' ? 'workbench' : 'explore';
  document.body.dataset.workspace = S.workspace;
  const advanced = S.workspace === 'workbench';
  $('#workspace-toggle').textContent = advanced ? '◉ Simple view' : '⊞ Full workbench';
  $('#workspace-toggle').setAttribute('aria-pressed', String(advanced));
  $('#edit-drawer').open = advanced;
  $('#sets-drawer').open = advanced;
  if (!advanced) S.colourMode = 'neighbourhoods';
  if (!advanced && !['select', 'neighbourhood'].includes(S.tool)) setTool('select');
  render();
}

function setTheme(theme, persist = true) {
  document.body.dataset.theme = theme === 'light' ? 'light' : 'dark';
  $('#theme-toggle').textContent = theme === 'light' ? '☾ Dark view' : '☀ Bright view';
  $('#theme-toggle').setAttribute('aria-label', theme === 'light' ? 'Switch to dark view' : 'Switch to bright view');
  $('#theme-toggle').title = theme === 'light' ? 'Switch to dark view' : 'Switch to bright view';
  $('#theme-toggle').setAttribute('aria-pressed', String(theme === 'light'));
  if (persist) try { localStorage.setItem('uphill-theme', document.body.dataset.theme); } catch { /* Offline storage is optional. */ }
}

// ------------------------------------------------------------ boot
function boot() {
  if ($('#app-version')) $('#app-version').textContent = APP_VERSION;
  const basic = ['path3', 'cycle4'];
  const featured = ['hard19', 'cube11', 'clb7', 'karate34', 'crown7', 'joined_triangles', 'konigsberg', 'overlap5', 'diamond8', 'bowtie5', 'disconnected7'];
  const options = ids => ids.map(id => { const info = PRESET_INFO.find(item => item[0] === id); return `<option value="${id}">${esc(info[1])}</option>`; }).join('');
  $('#preset').innerHTML = '<option value="" hidden>Custom graph</option>'
    + `<optgroup label="Start here">${options(basic)}</optgroup>`
    + `<optgroup label="Explore structure">${options(featured)}</optgroup>`
    + `<optgroup label="Reference cases" data-reference-presets hidden>${options(PRESET_INFO.map(item => item[0]).filter(id => !basic.includes(id) && !featured.includes(id)))}<option value="isolated100">100 isolated vertices</option></optgroup>`;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  $('#undo').onclick = doUndo; $('#redo').onclick = doRedo;
  $('#exp-json').onclick = () => download('uphill_experiment.json', JSON.stringify(experiment(), null, 1), 'application/json');
  $('#exp-html').onclick = () => download('uphill_report.html', reportHTML(), 'text/html');
  $('#exp-svg').onclick = () => download('uphill_graph.svg', svgStandalone(graphSVG({ legend: true, static: true })), 'image/svg+xml');
  $('#exp-qsvg').onclick = () => download('uphill_quotient.svg', svgStandalone(quotientSVG({ static: true }), true), 'image/svg+xml');
  $('#help').onclick = () => { S.tab = 'help'; setWorkspace('workbench'); $('#tabbody').scrollIntoView(); };
  $('#workspace-toggle').onclick = () => setWorkspace(S.workspace === 'workbench' ? 'explore' : 'workbench');
  $('#theme-toggle').onclick = () => setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
  let theme = 'dark';
  try { if (localStorage.getItem('uphill-theme') === 'light') theme = 'light'; } catch { /* No persistence required. */ }
  setTheme(theme);
  // The user's saved example invites exploration without preselected vertices.
  loadPreset('hard19');
  S.undo = [];
  render(); setTool('select');
  installGraphViewports();
  const graphDetails = installGraphDetails(() => S);
  const loadPlayground = (id, selectedIds, mode = S.mode) => {
    setTool('select'); loadPreset(id, { selectedIds, mode });
    $('#graph').closest('.graph-display')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  visualExplorer = installVisualExplorer({ getState: () => S,
    getPreset: id => ({ graph: FIXTURES[id] || EXTRA_PRESETS[id], layout: PRESET_INFO.find(info => info[0] === id)?.[2] }),
    loadPlayground,
    showNeighbourhoodColours: () => { S.colourMode = 'neighbourhoods'; render(); },
    completeOpenSet: () => setSelection(setIds(S.analysis.enlarge), 'Added the required vertices. A is now open.'),
  });
  controlMenus = installControlMenus();
  presetFan = installPresetFan();
  controlHelp = installControlHelp();
  introGuide = installIntroGuide({ getState: () => S, onTry: (id, selectedIds, mode) => {
    setWorkspace('explore'); S.colourMode = 'neighbourhoods'; loadPlayground(id, selectedIds, mode);
    $('#graph').closest('.graph-display')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  } });
  liveTour = installLiveTour(createTourAdapter({
    S, render, recompute, clearTransientAnalysis, cancelEnumeration, startEnumeration,
    setWorkspace, setTheme, setTool, setSelection, loadPreset, editGraph, addEdge, deleteVertex,
    doUndo, doRedo, setSubspace, showTrace, renderTab, applyDrawingLayout, graphSVG,
    graphDetails, explorer: () => visualExplorer, guide: () => introGuide, fields: fieldDrafts,
    menus: () => controlMenus, fan: () => presetFan, help: () => controlHelp,
    experiment, importExperiment, importData,
    setPreview: active => { tourPreviewActive = active; },
    restoreToolHint: () => { $('#toolhint').textContent = TOOL_HINT[S.tool]; },
    captureDrafts: () => ({ posetText, posetPoints, posetResult, jsonDraft, edgeDraft, isoDraft, galleryF }),
    restoreDrafts: values => { ({ posetText, posetPoints, posetResult, jsonDraft, edgeDraft, isoDraft, galleryF } = values); },
  }));
}

if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', boot);
// test hooks (headless acceptance run)
if (typeof window !== 'undefined') window.__uphill = { S, setTool, nextVertexId, loadPreset, setSelection, startEnumeration, experiment, reportHTML, graphSVG, quotientSVG, render, recompute, editGraph, doUndo, doRedo, importExperiment };
