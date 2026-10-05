// Temporary demonstrations use a separate graph and history. The original
// experiment is restored when the user explicitly stops the introduction.
import { graphToJSON, validateGraph } from '../kernel/graph.js';
import { exportExperiment } from '../kernel/serialization.js';
import { neighbourhoodTrace } from './exploration.js';
import { degreeRowLayout } from './degree-layout.js';
import { captureGraphViewports, restoreGraphViewports, previewGraphViewport, refreshGraphViewports } from './graph-viewport.js';

// Prefer useful contrasts without inventing overlaps in topologies whose
// neighbourhoods are equal or disjoint. An isolated vertex should not hide
// the connected example at the beginning of the introduction.
export function tourDemoAnchorIds(graph, model) {
  const order = [...graph.order].sort((a, b) => model.degree[a] - model.degree[b]);
  if (!order.length) return [];
  const masks = model.topo.N;
  const count = mask => mask.reduce((sum, bit) => sum + bit, 0);
  const relation = (left, right) => {
    let both = 0, onlyLeft = 0, onlyRight = 0;
    for (let i = 0; i < left.length; i++) {
      if (left[i] && right[i]) both++;
      else if (left[i]) onlyLeft++;
      else if (right[i]) onlyRight++;
    }
    return { both, onlyLeft, onlyRight };
  };
  const first = order.find(a => order.some(b => {
    const r = relation(masks[a], masks[b]);
    return r.both && r.onlyLeft && r.onlyRight;
  })) ?? order.find(index => count(masks[index]) > 1) ?? order[0];
  const second = order.filter(index => index !== first).map(index => {
    const r = relation(masks[first], masks[index]);
    return { index, score: (r.both && r.onlyLeft && r.onlyRight ? 1000 : 0)
      + (r.onlyLeft || r.onlyRight ? 100 : 0) + 2 * r.both + r.onlyLeft + r.onlyRight };
  }).sort((a, b) => b.score - a.score)[0]?.index;
  const rest = order.filter(index => index !== first && index !== second);
  const combined = masks[first].map((bit, i) => bit || (second === undefined ? 0 : masks[second][i]));
  const third = rest.find(index => {
    const r = relation(combined, masks[index]); return r.both && r.onlyRight;
  }) ?? rest.find(index => relation(combined, masks[index]).onlyRight) ?? rest[0];
  return [first, second, third].filter(index => index !== undefined).map(index => graph.nodes[index].id);
}

export function createTourAdapter(env) {
  const S = env.S, $ = selector => document.querySelector(selector);
  let saved = null;
  const settle = () => { env.explorer().stop(); env.explorer().update(); };
  const ids = mask => S.graph.nodes.filter((_, i) => mask[i]).map(node => node.id);
  function resetDemo() {
    if (!saved) return;
    env.menus?.()?.closeAll(); env.fan?.()?.close(); env.guide().close();
    env.cancelEnumeration(); env.explorer().stop();
    const request = S.enumReq;
    Object.assign(S, saved.state, {
      graph: validateGraph(graphToJSON(saved.state.graph)).graph,
      selected: new Set(), sub: new Set(), undo: [], redo: [],
      limits: { ...saved.state.limits }, messages: [], enumeration: null,
      enumRunning: false, enumKey: null, enumRev: -1, enumReq: request,
      generator: saved.state.generator ? structuredClone(saved.state.generator) : null,
    });
    S.colourMode = 'neighbourhoods'; S.focus = null; env.clearTransientAnalysis();
    env.fields.clear();
    env.setWorkspace('explore'); env.setTheme(saved.theme, false);
    env.recompute(); env.render(); env.setTool('select');
    // Every introduction starts with a readable three-vertex example, even
    // when it was opened from a larger or custom experiment.
    restoreGraphViewports(saved.cameras.map(camera => ({ ...camera, expanded: false, pan: false })));
    env.loadPreset('path3', { mode: 'uphill', statistic: 'incident-edges' });
    S.undo = []; S.redo = [];
    settle();
  }
  function begin() {
    env.guide().close(); env.explorer().stop();
    saved = {
      state: { ...S, enumeration: S.enumeration ? structuredClone(S.enumeration) : null },
      theme: document.body.dataset.theme,
      cameras: captureGraphViewports(), fields: new Map(env.fields),
      drafts: env.captureDrafts(),
      details: [...document.querySelectorAll('details[id]')].map(node => [node.id, node.open]),
      layout: $('#layout-choice').value,
      automatic: env.explorer().getAutomatic?.() ?? true,
      menus: env.menus?.()?.capture(), fan: env.fan?.()?.capture(),
      focus: document.activeElement, detailsPanel: env.graphDetails.capture(),
    };
    env.setPreview(true); resetDemo();
  }
  function restore() {
    if (!saved) return;
    const original = saved; saved = null;
    const focusedVertex = document.activeElement?.closest?.('#graph .vtx')?.dataset.v;
    env.explorer().stop(); env.cancelEnumeration(); env.guide().close();
    const request = S.enumReq;
    // Restore presentation first, then the exact original mathematical state.
    env.setWorkspace(original.state.workspace); env.setTheme(original.theme, false);
    Object.assign(S, original.state, { enumReq: request + 1, enumRunning: false });
    env.fields.clear(); for (const [key, value] of original.fields) env.fields.set(key, value);
    env.restoreDrafts(original.drafts);
    env.setPreview(false); env.recompute(); env.render();
    document.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === S.tool)));
    env.restoreToolHint(); $('#graph').className = 'canvas tool-' + S.tool;
    $('#layout-choice').value = original.layout;
    for (const [id, open] of original.details) { const detail = document.getElementById(id); if (detail) detail.open = open; }
    $('#arcs').checked = S.showArcs; $('#ccol').checked = S.classColour; $('#colour-mode').value = S.colourMode;
    env.explorer().setAutomatic?.(original.automatic); settle();
    restoreGraphViewports(original.cameras);
    env.graphDetails.restore(original.detailsPanel);
    env.menus?.()?.restore(original.menus); env.fan?.()?.restore(original.fan);
    if (focusedVertex) [...document.querySelectorAll('#graph .vtx')].find(node => node.dataset.v === focusedVertex)?.focus({ preventScroll: true });
    else if (original.focus?.isConnected) original.focus.focus({ preventScroll: true });
    if (original.state.enumRunning) env.startEnumeration();
  }
  function select(selected) {
    const next = selected.filter(id => S.graph.index.has(id));
    const added = next.filter(id => !S.selected.has(id));
    env.setSelection(next, undefined, { blinkVertex: added.at(-1) });
  }
  function act(name, args = {}) {
    if (!saved) return null;
    switch (name) {
      case 'select': select(args.ids || []); break;
      case 'details': env.graphDetails.showVertex(args.id); break;
      case 'focus': S.focus=args.id;env.render();break;
      case 'clear': select([]); break;
      case 'complete': select(ids(S.analysis.enlarge)); break;
      case 'tool': env.setTool(args.value); break;
      case 'preset': env.loadPreset(args.id); break;
      case 'mode': case 'statistic':
        S[name === 'mode' ? 'mode' : 'statistic'] = args.value; S.messages = [];
        S.enumeration = null; S.enumKey = null; env.clearTransientAnalysis(); env.recompute(); env.render(); break;
      case 'theme': env.setTheme(args.value, false); break;
      case 'workspace': env.setWorkspace(args.value); break;
      case 'drawer': { const element = document.getElementById(args.id); if (element) element.open = Boolean(args.open); break; }
      case 'add-vertex': {
        let id = args.id || 'tour-v', suffix = 1; while (S.graph.index.has(id)) id = (args.id || 'tour-v') + '-' + suffix++;
        env.editGraph(graph => { graph.nodes.push({ id, label: id }); graph.layout[id] = { x: args.x, y: args.y }; });
        return id;
      }
      case 'edge-start': S.pendingConnect = args.id; env.render(); break;
      case 'edge-finish': {
        const from = S.pendingConnect; S.pendingConnect = null;
        if (from && from !== args.id && S.graph.index.has(from) && S.graph.index.has(args.id)) env.addEdge(from, args.id);
        break;
      }
      case 'delete': if (S.graph.index.has(args.id)) env.deleteVertex(args.id); break;
      case 'undo': env.doUndo(); break;
      case 'redo': env.doRedo(); break;
      case 'arcs': S.showArcs = Boolean(args.value); $('#arcs').checked = S.showArcs; env.render(); break;
      case 'class-labels': S.classColour = Boolean(args.value); $('#ccol').checked = S.classColour; env.render(); break;
      case 'colour-mode': S.colourMode = args.value; $('#colour-mode').value = args.value; env.render(); break;
      case 'quotient-view': S.quotientView = args.value; env.render(); break;
      case 'layout': env.applyDrawingLayout(args.value); $('#layout-choice').value = args.value; break;
      case 'tab': S.tab = args.value; env.renderTab(); break;
      case 'rules': S.tab = 'help'; env.setWorkspace('workbench'); break;
      case 'story-replay': env.explorer().animate(); break;
      case 'enumeration-example': {
        env.cancelEnumeration();
        S.limits={...saved.state.limits,autoEnumerateMaxQuotient:0,displayLimit:args.limit||32,timeBudgetMs:5000,stateBudget:1000000};
        env.editGraph(graph=>{
          graph.kind='simple-undirected';graph.nodes=Array.from({length:args.count||10},(_,i)=>({id:`n${i+1}`,label:`${i+1}`}));graph.edges=[];
          graph.layout=Object.fromEntries(graph.nodes.map((node,i)=>[node.id,{x:65+(i%7)*62,y:65+Math.floor(i/7)*62}]));
        });
        env.cancelEnumeration();S.enumeration=null;S.enumKey=null;S.enumPage=0;env.render();break;
      }
      case 'enumeration-limits': S.limits={...saved.state.limits};break;
      case 'import-example': {
        const graph=validateGraph({kind:'simple-undirected',nodes:['import-a','import-b','import-c'].map(id=>({id,label:id})),edges:[{id:'example-edge',source:'import-a',target:'import-b'}],layout:{'import-a':{x:75,y:110},'import-b':{x:245,y:110},'import-c':{x:410,y:210}}}).graph;
        const data=exportExperiment({graph,mode:'uphill',statistic:'incident-edges',selectedIds:['import-a'],limits:{...saved.state.limits}});
        // Reopen real production-format data in memory; no file picker is opened.
        const result=env.importData(data);
        window.dispatchEvent(new CustomEvent('uphill-tour-file-preview',{detail:{name:'in-memory experiment.json',text:JSON.stringify(data,null,2),type:'application/json'}}));
        return result;
      }
      case 'enumerate': env.startEnumeration(false, { paced: Boolean(args.paced) }); break;
      case 'cancel-enumeration': env.cancelEnumeration(); env.render(); break;
      case 'operation': {
        const mask = args.value === 'complement' ? S.A.map(bit => 1 - bit) : S.analysis[args.value];
        if (mask) select(ids(mask)); break;
      }
      case 'trace': if (S.graph.index.has(args.id)) env.showTrace(neighbourhoodTrace(S.model, S.graph.index.get(args.id))); break;
      case 'subspace': env.setSubspace(args.value === 'all' ? S.graph.nodes.map(node => node.id) : args.value === 'selection' ? [...S.selected] : []); break;
      default: return null;
    }
    refreshGraphViewports();
    return true;
  }
  function dragVertex(id, x, y) {
    if (!saved || !S.graph.index.has(id)) return;
    S.graph.layout[id] = { x, y };
    // Keep the camera fixed while the point and its incident edges move.
    const camera = previewGraphViewport('capture');
    $('#graph').innerHTML = env.graphSVG({ legend: true });
    refreshGraphViewports(); if (camera) previewGraphViewport('set', { box: camera });
  }
  function drawPositions(positions) {
    if (!saved) return;
    const camera = previewGraphViewport('capture');
    for (const [id, point] of Object.entries(positions)) {
      if (S.graph.index.has(id)) S.graph.layout[id] = { x: point.x, y: point.y };
    }
    $('#graph').innerHTML = env.graphSVG({ legend: true });
    refreshGraphViewports(); if (camera) previewGraphViewport('set', { box: camera });
  }
  function demoAnchors() {
    return tourDemoAnchorIds(S.graph, S.model);
  }
  return { begin, resetDemo, restore, act, dragVertex, viewport: previewGraphViewport,
    help: (operation, element, text) => {
      const help = env.help?.();
      if (operation === 'show') return help?.showFor(element, text, { source: 'tour' });
      if (operation === 'hide') return help?.hide('tour');
    },
    menu: (operation, id, value) => {
      const menus = env.menus?.();
      if (operation === 'open') return menus?.open(id, { focus: false });
      if (operation === 'close') return menus?.closeAll();
      if (operation === 'button') return menus?.button(id);
      if (operation === 'option') return menus?.option(id, value);
    },
    fan: operation => env.fan?.()?.[operation]?.(),
    getState: () => S, select, setTool: env.setTool, stopWave: settle, demoAnchors,
    drawPositions, degreePositions: () => degreeRowLayout(S.graph, S.model.degree),
    pauseWave: () => env.explorer().pause(), resumeWave: () => env.explorer().resume(),
    openLessons: () => env.guide().open({preview:true}), closeLessons: () => env.guide().close() };
}
