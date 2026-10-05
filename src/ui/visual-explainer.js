// Visual reading aids only. The active kernel supplies all sets and degrees.
import { singletonNeighbourhoodReason } from './graph-details.js';
export function propagationLayers(model, origin) {
  const T = model.topo;
  if (!Number.isInteger(origin) || origin < 0 || origin >= T.n) return [];
  const mask = T.N[origin], distances = new Map([[origin, 0]]), queue = [origin];
  const outgoing = Array.from({ length: T.n }, () => []);
  for (const [from, to] of model.arcs) if (mask[from] && mask[to]) outgoing[from].push(to);
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head];
    for (const to of outgoing[from]) if (!distances.has(to)) {
      distances.set(to, distances.get(from) + 1); queue.push(to);
    }
  }
  // Weak-patch masks restrict this walk to the original equal-degree plateau.
  const layers = [];
  for (const [vertex, distance] of distances) (layers[distance] ||= []).push(vertex);
  return layers;
}

const VISUAL_PRESETS = [
  ['path3', 'First steps', 'Follow one allowed step'],
  ['cycle4', 'Equal degrees', 'Compare all three topologies'],
  ['hard19', 'Cube, branches & islands', '19 vertices, three components'],
  ['cube11', 'Cube + 3 vertices', 'Added degrees 1, 2 and 3'],
  ['clb7', 'Triangle & branches', 'Shared uphill destinations'],
  ['konigsberg', 'Parallel bridges', 'Compare the two degree counts'],
  ['karate34', 'Karate-club network', 'Manuscript figure 3 · 34 vertices'],
  ['crown7', 'Crown plateaus', 'Manuscript figure 1 · compare 0 and 1'],
  ['joined_triangles', 'Two triangles & a bridge', 'Manuscript figure 2 · compare a and c'],
];
const visualEscape = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function presetThumbnail(graph, layout) {
  const points = graph.nodes.map((node, i) => {
    const xy = layout?.[node.id];
    return xy ? { x: xy[0], y: xy[1] } : { x: 100 + 75 * Math.cos(i * 2 * Math.PI / graph.nodes.length), y: 90 + 70 * Math.sin(i * 2 * Math.PI / graph.nodes.length) };
  });
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xmin = Math.min(...xs), ymin = Math.min(...ys), width = Math.max(...xs) - xmin || 1, height = Math.max(...ys) - ymin || 1;
  const positions = new Map(graph.nodes.map((node, i) => [node.id, { x: 20 + (points[i].x - xmin) * 110 / width, y: 12 + (points[i].y - ymin) * 48 / height }]));
  return '<svg class="preset-thumb" viewBox="0 0 150 74" aria-hidden="true">'
    + graph.edges.map(edge => { const a = positions.get(edge.source), b = positions.get(edge.target); return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="currentColor" stroke-width="2" opacity=".55"/>`; }).join('')
    + [...positions.values()].map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${['#b94179', '#28bcc2', '#9a6be0'][i % 3]}" stroke="currentColor" stroke-width="1"/>`).join('') + '</svg>';
}

export function installVisualExplorer(api) {
  const gallery = document.getElementById('preset-gallery'), story = document.getElementById('visual-explanation');
  const replay = document.getElementById('story-replay'), canvas = document.getElementById('graph');
  const reading = document.getElementById('canvas-reading');
  let animationFrame = null, sequence = [], frame = 0, playing = false, paused = false, latestKey = null, lastSvg = null;
  let frameElapsed = 0, previousTick = 0, generation = 0, lastPaintKey = '', limited = false;
  let routeSvg = null, routeFrame = -1, routeLayer = null, routes = [], paintedSvg = null;
  // Construction is an optional explanation, never a consequence of selecting.
  let blinkLayer = null, blinkMembers = [], blinkGeneration = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const nodeName = (state, i) => state.graph.nodes[i].label;
  const memberIds = (state, mask) => state.graph.nodes.filter((_, i) => mask[i]).map(n => n.id);
  const members = mask => Array.from(mask).flatMap((bit, i) => bit ? [i] : []);
  const setText = (state, indices, cap = 12) => '{' + indices.slice(0, cap).map(i => nodeName(state, i)).join(', ') + (indices.length > cap ? `, … +${indices.length - cap}` : '') + '}';
  const chip = (state, i) => `<span class="member-chip" data-member-id="${visualEscape(state.graph.nodes[i].id)}" title="Vertex ID: ${visualEscape(state.graph.nodes[i].id)}">${visualEscape(nodeName(state, i))}</span>`;
  gallery.innerHTML = VISUAL_PRESETS.map(([id, name, hint]) => {
    const preset = api.getPreset(id);
    return `<button class="preset-card" data-playground="${id}" aria-pressed="false" aria-label="${visualEscape(name + ': ' + hint)}">${presetThumbnail(preset.graph, preset.layout)}<span class="preset-name">${name}</span><span class="preset-hint">${hint}</span></button>`;
  }).join('');
  gallery.addEventListener('click', event => {
    const button = event.target.closest('[data-playground]');
    if (!button) return;
    const preset = VISUAL_PRESETS.find(item => item[0] === button.dataset.playground);
    // The user's first click must choose Start 1. Preselected examples made a
    // click appear to do nothing because comparison still showed two old starts.
    api.loadPlayground(preset[0], []);
  });
  // Retained only for older tour snapshot adapters. They cannot re-enable
  // automatic construction: every new selection always shows complete sets.
  function setAutomatic() { stop(); finalReading(); }
  function cancelBlink(reason = 'cancelled') {
    blinkGeneration++;
    if (blinkLayer) {
      blinkLayer.remove(); blinkLayer = null;
      canvas.dataset.blinkState = reason;
    }
    blinkMembers.forEach(node => {
      node.removeAttribute('data-neighbourhood-blinking');
      node.style.removeProperty('--neighbourhood-blink-colour');
    });
    blinkMembers = [];
    canvas.style.removeProperty('--neighbourhood-blink-play-state');
    canvas.dataset.blinkPlaying = 'false';
    canvas.dataset.blinkPaused = 'false';
  }
  function blinkSelection(id) {
    // The mathematical state is complete immediately, but the drawing first
    // isolates the NEW neighbourhood in its own colour. Purple/sector fills
    // underneath are hidden for both the ON and OFF portions of all 3 blinks.
    stop();
    const state = api.getState(), origin = state.graph.index.get(id);
    const branch = state.neighbourhoods.anchors.indexOf(origin);
    if (branch < 0 || state.colourMode !== 'neighbourhoods') return;
    const svg = canvas.querySelector('svg'), mask = state.model.topo.N[origin];
    if (!svg || !mask) return;
    const ns = 'http://www.w3.org/2000/svg', layer = document.createElementNS(ns, 'g');
    layer.setAttribute('class', 'neighbourhood-blink-layer');
    layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('pointer-events', 'none');
    layer.dataset.blinkOrigin = id;
    const colour = state.neighbourhoods.colours[branch];
    canvas.querySelectorAll('.vtx').forEach(node => {
      if (!mask[state.graph.index.get(node.dataset.v)]) return;
      const fill = node.querySelector('.vertex-fill');
      if (!fill) return;
      const halo = document.createElementNS(ns, 'circle');
      halo.setAttribute('cx', fill.getAttribute('cx')); halo.setAttribute('cy', fill.getAttribute('cy'));
      halo.setAttribute('r', String(Number(fill.getAttribute('r')) + 6));
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', colour); halo.setAttribute('stroke-width', '4');
      halo.dataset.blinkMember = node.dataset.v;
      layer.append(halo);
      node.style.setProperty('--neighbourhood-blink-colour', colour);
      node.dataset.neighbourhoodBlinking = id;
      blinkMembers.push(node);
    });
    blinkLayer = layer;
    canvas.dataset.blinkOrigin = id;
    canvas.dataset.blinkMembers = JSON.stringify(memberIds(state, mask));
    canvas.dataset.blinkCount = '0';
    canvas.dataset.blinkState = 'playing';
    canvas.dataset.blinkPlaying = 'true';
    canvas.dataset.blinkPaused = 'false';
    canvas.style.setProperty('--neighbourhood-blink-play-state', 'running');
    // This deliberately requested colour-only sequence also works when OS
    // motion is disabled. It is slow (<1 cycle/second), with no moving shapes.
    const token = blinkGeneration;
    layer.addEventListener('animationiteration', event => {
      if (event.target !== layer || token !== blinkGeneration) return;
      canvas.dataset.blinkCount = String(Number(canvas.dataset.blinkCount) + 1);
      finalReading();
    });
    layer.addEventListener('animationend', event => {
      if (event.target !== layer || token !== blinkGeneration) return;
      canvas.dataset.blinkCount = '3'; cancelBlink('complete'); finalReading();
    }, { once: true });
    svg.append(layer);
    finalReading();
  }
  function keyHTML(state) {
    const measure = state.statistic === 'distinct-neighbours' ? 'neighbours' : 'edges';
    return `<div class="meaning-key"><span><i class="key-ring" aria-hidden="true"></i> Pink ring = you clicked</span><span><i class="key-fill" aria-hidden="true"></i> Fill = belongs to a selected neighbourhood</span><span>Edges = undirected</span><span><i class="key-arrow" aria-hidden="true">→</i> ${state.mode === 'weak-patch' ? 'Equal-degree group only' : 'Arrow = allowed step overlay'}</span><span>${state.statistic === 'distinct-neighbours' ? 'Neighbours = distinct neighbours' : `Degree = attached ${measure}`}</span></div>`;
  }
  function setReading(text, phase = '') {
    if (!reading) return;
    const state = api.getState();
    if (state.colourMode === 'analysis') {
      reading.innerHTML = '<strong class="reading-caption">Graph fills show the interior, boundary and exterior of A.</strong><div class="meaning-key">Purple: interior · Pink hatch: boundary · Pale: exterior · Thick ring: selected in A. Switch Graph colours to compare neighbourhoods.</div>';
      return;
    }
    const editHint = state.tool === 'add-edge' ? (state.pendingConnect ? `First vertex: ${state.pendingConnect}. Now click the second vertex to connect them.` : 'Add edge: click the first vertex, then the second. Or drag between them.')
      : state.tool === 'add-vertex' ? 'Add vertex: click an empty place in the graph.' : '';
    reading.innerHTML = `<strong class="reading-caption">${visualEscape(editHint || text)}</strong>${phase ? `<span class="reading-phase">${visualEscape(phase)}</span>` : ''}` + keyHTML(state);
  }
  function finalReading() {
    const state = api.getState(), c = state.neighbourhoods;
    if (blinkLayer) {
      const origin = state.graph.index.get(canvas.dataset.blinkOrigin);
      if (origin !== undefined) {
        setReading(`N(${nodeName(state, origin)}) = ${setText(state, members(state.model.topo.N[origin]))}`,
          `Whole neighbourhood · blink ${Math.min(3, Number(canvas.dataset.blinkCount) + 1)} of 3 in its own colour. Intersection colours appear afterwards.`);
        return;
      }
    }
    if (!c.anchors.length) {
      if (!playing) document.getElementById('story-progress')?.replaceChildren();
      setReading('Click a vertex to see its smallest open neighbourhood.'); return;
    }
    if (c.anchors.length > 2) {
      setReading(`${c.anchors.length} full open neighbourhoods are coloured.`, 'Every start has a colour. Shared vertices show all their set colours as sectors. Click a selected start again to remove its set.');
      return;
    }
    const sets = c.anchors.map((v, i) => `N(${nodeName(state, v)}) = ${setText(state, members(c.masks[i]))}`).join(' · ');
    if (c.anchors.length === 1) {
      const reason = singletonNeighbourhoodReason(state, c.anchors[0]);
      if (reason) {
        setReading(`${sets} — the whole smallest open neighbourhood.`, `Only ${nodeName(state, c.anchors[0])} is coloured. ${reason}`);
        return;
      }
    }
    setReading(sets, c.anchors.length === 1 ? 'Colours stay. Click the same vertex again to remove this selection.'
      : `Purple = reachable from both starts: ${setText(state, members(c.intersection))}. Click a start again to remove it.`);
  }
  function clearStyles() {
    canvas.querySelectorAll('.reach-pending,.reach-arrived,.reach-edge').forEach(el => el.classList.remove('reach-pending', 'reach-arrived', 'reach-edge'));
    canvas.querySelectorAll('[data-edge-u],line[data-from]').forEach(el => el.style.removeProperty('stroke'));
    canvas.querySelectorAll('.reach-layer').forEach(el => el.remove());
    routeSvg = null; routeFrame = -1; routeLayer = null; routes = []; lastPaintKey = ''; paintedSvg = null;
  }
  function stop() {
    cancelBlink();
    generation++;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null; playing = false; paused = false;
    canvas.dataset.reachPlaying = 'false'; canvas.dataset.reachPaused = 'false'; canvas.dataset.reachProgress = '1'; clearStyles();
    const state = api.getState(), regions = state.neighbourhoods.regions;
    const reached = [];
    canvas.querySelectorAll('.vtx').forEach(node => {
      const inside = regions[state.graph.index.get(node.dataset.v)] !== 'outside';
      node.dataset.reachState = inside ? 'reached' : 'outside';
      if (inside) reached.push(node.dataset.v);
    });
    canvas.dataset.reachMembers = JSON.stringify(reached);
    replay.textContent = 'Show construction steps'; replay.setAttribute('aria-pressed', 'false');
    const construction = document.getElementById('construction-panel');
    if (construction) construction.hidden = true;
    document.getElementById('story-progress')?.replaceChildren();
  }
  function pause() {
    if (blinkLayer) { canvas.style.setProperty('--neighbourhood-blink-play-state', 'paused'); canvas.dataset.blinkPaused = 'true'; }
    if (!playing || paused) return;
    paused = true; generation++;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null; canvas.dataset.reachPaused = 'true';
  }
  function resume() {
    if (blinkLayer) { canvas.style.setProperty('--neighbourhood-blink-play-state', 'running'); canvas.dataset.blinkPaused = 'false'; }
    if (!playing || !paused) return;
    paused = false; canvas.dataset.reachPaused = 'false'; previousTick = performance.now();
    const token = generation;
    animationFrame = requestAnimationFrame(time => tick(time, token));
  }
  function frameReading(step, state, arrived) {
    const origin = nodeName(state, step.origin), included = setText(state, arrived ? step.reached : step.beforeReached);
    if (step.distance === 0) {
      const reason = singletonNeighbourhoodReason(state, step.origin);
      return reason ? [`N(${origin}) = {${origin}}: this neighbourhood has just one vertex.`, reason]
        : [`Start ${step.branch + 1}: ${origin} belongs to its own neighbourhood.`, `Begin with ${origin}.`];
    }
    const rule = state.mode === 'strict' ? '<' : state.mode === 'weak-patch' ? '=' : '≤';
    const paths = step.newVertices.slice(0, 3).map(v => {
      const from = step.parents.get(v);
      return from === undefined ? nodeName(state, v) : `${nodeName(state, from)} → ${nodeName(state, v)} (${state.model.degree[from]} ${rule} ${state.model.degree[v]})`;
    });
    return [`Start ${step.branch + 1}: ${paths.join(' · ')}${step.newVertices.length > 3 ? ` · +${step.newVertices.length - 3} more` : ''}`,
      `${arrived ? 'Arrived' : 'Following the allowed edges'} · Steps explained so far: ${included}. Full neighbourhood colours stay visible.`];
  }
  function prepareRoutes(step, state, svg) {
    canvas.querySelectorAll('.reach-layer').forEach(el => el.remove());
    routes = []; routeSvg = svg; routeFrame = frame;
    if (!svg || reduced.matches || step.distance === 0) return;
    const ns = 'http://www.w3.org/2000/svg';
    routeLayer = document.createElementNS(ns, 'g');
    routeLayer.setAttribute('class', 'reach-layer');
    routeLayer.setAttribute('aria-hidden', 'true');
    routeLayer.setAttribute('pointer-events', 'none');
    svg.append(routeLayer);
    const paths = [...svg.querySelectorAll('path[data-edge-u][data-edge-v]')];
    for (const to of step.newVertices) {
      const from = step.parents.get(to);
      if (from === undefined) continue;
      // Every route is a directed kernel arc whose endpoints are both in this
      // start's neighbourhood. In weak patch this stays on its own plateau.
      if (!state.model.topo.N[step.origin][from] || !state.model.topo.N[step.origin][to]
        || !state.model.arcs.some(([u, v]) => u === from && v === to)) continue;
      const path = paths.find(edge => (Number(edge.dataset.edgeU) === from && Number(edge.dataset.edgeV) === to)
        || (Number(edge.dataset.edgeU) === to && Number(edge.dataset.edgeV) === from));
      if (!path) continue;
      const length = path.getTotalLength();
      if (!Number.isFinite(length) || length <= 0) continue;
      const forward = Number(path.dataset.edgeU) === from;
      const point = fraction => path.getPointAtLength(length * (forward ? fraction : 1 - fraction));
      const trail = document.createElementNS(ns, 'path');
      trail.setAttribute('class', 'reach-route'); trail.setAttribute('fill', 'none');
      const routeColour = state.neighbourhoods.colours[step.branch];
      trail.setAttribute('stroke', routeColour);
      trail.setAttribute('stroke-width', '3.5'); trail.setAttribute('stroke-linecap', 'round');
      trail.setAttribute('opacity', '.8');
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('class', 'reach-traveller'); dot.setAttribute('r', '6');
      dot.setAttribute('fill', routeColour);
      dot.setAttribute('stroke', '#fff'); dot.setAttribute('stroke-width', '1.5');
      dot.style.filter = 'drop-shadow(0 0 5px ' + routeColour + ')';
      dot.dataset.from = String(from); dot.dataset.to = String(to);
      dot.dataset.fromId = state.graph.nodes[from].id; dot.dataset.toId = state.graph.nodes[to].id;
      dot.dataset.origin = String(step.origin); dot.dataset.branch = String(step.branch);
      routeLayer.append(trail, dot);
      routes.push({ dot, trail, point, samples: Array.from({ length: 33 }, (_, i) => point(i / 32)) });
    }
  }
  function paintRoutes(progress, step, state, svg) {
    if (svg !== routeSvg || frame !== routeFrame) prepareRoutes(step, state, svg);
    if (reduced.matches) return;
    for (const route of routes) {
      const point = route.point(progress);
      route.dot.setAttribute('cx', String(point.x)); route.dot.setAttribute('cy', String(point.y));
      route.dot.dataset.progress = progress.toFixed(5);
      // Fade onto and off the source/arrival so changing BFS layers never
      // visibly jumps a particle from the old destination back to a new start.
      route.dot.setAttribute('opacity', String(Math.min(1, progress / .05, (1 - progress) / .07)));
      const samples = route.samples.slice(0, Math.floor(progress * 32) + 1);
      route.trail.setAttribute('d', samples.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ` L${point.x},${point.y}`);
    }
  }
  function paintFrame() {
    const state = api.getState(), step = sequence[frame];
    if (!playing || !step) return;
    const rawProgress = step.distance === 0 ? 1 : Math.min(1, frameElapsed / step.travelDuration);
    // A gentle, time-based glide keeps the beginning and arrival legible. It
    // uses the real curved edge, including multigraph offsets, in its allowed direction.
    const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
    const arrived = progress >= 1;
    const svg = canvas.querySelector('svg');
    paintRoutes(progress, step, state, svg);
    canvas.dataset.reachFrame = String(frame);
    canvas.dataset.reachProgress = progress.toFixed(5);
    const paintKey = `${frame}:${arrived}`;
    if (paintKey === lastPaintKey && svg === paintedSvg) return;
    lastPaintKey = paintKey; paintedSvg = svg;
    const reached = new Set(arrived ? step.reached : step.beforeReached);
    canvas.querySelectorAll('.vtx').forEach(node => {
      const i = state.graph.index.get(node.dataset.v);
      node.dataset.reachState = reached.has(i) ? 'reached' : state.neighbourhoods.regions[i] === 'outside' ? 'outside' : 'pending';
      // Keep graphSVG's complete set colours and selection rings throughout.
      // Only the explanatory route advances: no grey flash or fading members.
      node.classList.remove('reach-pending');
      node.classList.toggle('reach-arrived', arrived && step.newVertices.includes(i));
    });
    canvas.querySelectorAll('[data-edge-u],line[data-from][data-to]').forEach(edge => {
      const u = Number(edge.dataset.edgeU ?? edge.dataset.from), v = Number(edge.dataset.edgeV ?? edge.dataset.to);
      const directed = edge.matches('line[data-from]');
      const active = step.newVertices.some(to => (step.parents.get(to) === u && to === v)
        || (!directed && step.parents.get(to) === v && to === u));
      edge.classList.toggle('reach-edge', active);
      edge.style.stroke = active ? state.neighbourhoods.colours[step.branch] : '';
    });
    canvas.dataset.reachMembers = JSON.stringify([...reached].map(i => state.graph.nodes[i].id));
    const [caption, detail] = frameReading(step, state, arrived);
    // Changing line lengths must not push the whole graph up and down. Keep
    // construction captions beside the drawing; its top reading key stays fixed.
    const progressText = document.getElementById('story-progress');
    if (progressText) {
      const heading = document.createElement('strong'), explanation = document.createElement('span');
      heading.textContent = `Step ${frame + 1} of ${sequence.length} · ${caption}`;
      explanation.textContent = detail; progressText.replaceChildren(heading, explanation);
    }
  }
  function tick(now, token) {
    if (!playing || paused || generation !== token) return;
    frameElapsed += Math.min(80, Math.max(0, now - previousTick)); previousTick = now;
    if (frameElapsed >= sequence[frame].duration) {
      if (frame + 1 < sequence.length) { frame++; frameElapsed = 0; lastPaintKey = ''; }
      else {
        stop(); finalReading();
        return;
      }
    }
    paintFrame();
    animationFrame = requestAnimationFrame(time => tick(time, token));
  }
  function animate() {
    stop();
    const state = api.getState(), c = state.neighbourhoods;
    if (!c.anchors.length) return;
    if (state.colourMode !== 'neighbourhoods') api.showNeighbourhoodColours();
    sequence = []; limited = false; const reached = new Set();
    // Keep every start in the explanation without letting many long routes
    // allocate an unbounded preview. This never restricts the complete fills.
    const layerLimit = Math.max(1, Math.min(12, Math.floor(120 / c.anchors.length)));
    const outgoing = Array.from({ length: state.model.topo.n }, () => []);
    for (const [from, to] of state.model.arcs) outgoing[from].push(to);
    c.anchors.forEach((origin, branch) => {
      const layers = propagationLayers(state.model, origin), parents = new Map(), seen = new Set([origin]);
      layers.forEach(layer => layer.forEach(from => outgoing[from].forEach(to => { if (c.masks[branch][to] && !seen.has(to)) { seen.add(to); parents.set(to, from); } })));
      // Preserve one layer per arrival. Combining distant layers let a child
      // appear at the same instant as its still-unreached parent.
      if (layers.length > layerLimit) limited = true;
      layers.slice(0, layerLimit).forEach((vertices, distance) => {
        const beforeReached = [...reached];
        vertices.forEach(vertex => reached.add(vertex));
        sequence.push({ reached: [...reached], beforeReached, newVertices: vertices, parents, origin, branch, distance });
      });
    });
    const duration = Math.max(420, Math.min(1400, 11000 / sequence.length));
    sequence.forEach(step => { step.duration = step.distance ? duration : Math.min(700, duration); step.travelDuration = step.duration * .76; });
    finalReading();
    frame = 0; frameElapsed = 0; previousTick = performance.now(); playing = true;
    canvas.dataset.reachLimited = String(limited);
    canvas.dataset.reachStartCount = String(c.anchors.length);
    canvas.dataset.reachLayerLimit = String(layerLimit);
    canvas.dataset.reachPlaying = 'true'; replay.textContent = 'Hide construction steps'; replay.setAttribute('aria-pressed', 'true');
    const construction = document.getElementById('construction-panel');
    if (construction) construction.hidden = false;
    paintFrame(); const token = generation; animationFrame = requestAnimationFrame(time => tick(time, token));
  }
  replay.addEventListener('click', () => { if (playing) { stop(); finalReading(); } else animate(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); finalReading(); } });
  reduced.addEventListener('change', () => { if (playing) { routeFrame = -1; paintFrame(); } });
  canvas.addEventListener('pointerdown', () => { stop(); finalReading(); }, true);
  function setCard(state, mask, role, title, rule) {
    const ids = memberIds(state, mask), indices = members(mask);
    const shown = indices.slice(0, 16), extra = indices.slice(16);
    return `<section class="neighbourhood-card story-${role}" data-story-set="${role}" data-member-ids="${visualEscape(JSON.stringify(ids))}"><div class="set-title">${visualEscape(title)}</div><div class="set-members">{ ${shown.map(i => chip(state, i)).join(' ')}${extra.length ? `<details><summary>+${extra.length} more</summary>${extra.map(i => chip(state, i)).join(' ')}</details>` : ''} }</div><p class="set-rule">${visualEscape(rule)}</p></section>`;
  }
  function why(state, origin) {
    const layers = propagationLayers(state.model, origin), degree = state.model.degree, comparison = state.mode === 'strict' ? '<' : state.mode === 'weak-patch' ? '=' : '≤';
    const lines = [];
    for (let layer = 1; layer < layers.length && lines.length < 3; layer++) for (const to of layers[layer]) {
      const from = state.model.arcs.find(([u, v]) => v === to && layers[layer - 1].includes(u))?.[0];
      if (from !== undefined) lines.push(`${nodeName(state, from)} → ${nodeName(state, to)}: ${degree[from]} ${comparison} ${degree[to]}`);
      if (lines.length === 3) break;
    }
    return lines.length ? lines.join(' · ') : `No step from ${nodeName(state, origin)} reaches another vertex in this rule.`;
  }
  function update() {
    const state = api.getState(), c = state.neighbourhoods;
    // Workspace/theme presentation can render between assigning a selection
    // and recomputing its neighbourhoods. Cache the derived anchors as well,
    // so the coherent follow-up render replaces the previous selection's story.
    const key = JSON.stringify([state.rev, state.mode, state.statistic, [...state.selected], c.anchors, state.colourMode]);
    const changed = key !== latestKey, svgChanged = canvas.querySelector('svg') !== lastSvg;
    lastSvg = canvas.querySelector('svg');
    const measure = state.statistic === 'distinct-neighbours' ? 'neighbour count' : 'degree';
    document.getElementById('mode-caption').textContent = {
      uphill: `Undirected edges; the arrow overlay permits steps to equal or higher ${measure}.`, strict: `Undirected edges; the arrow overlay permits steps only to higher ${measure}.`,
      'weak-patch': `Undirected edges; only connected vertices of equal ${measure} belong together.`,
    }[state.mode];
    gallery.querySelectorAll('[data-playground]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.playground === state.presetId)));
    replay.disabled = !c.anchors.length;
    const constructionHint = replay.parentNode.querySelector('.construction-hint');
    if (constructionHint) constructionHint.textContent = c.anchors.length
      ? 'Optional. The full open sets are already shown.' : 'Optional illustration after selecting a vertex.';
    if (!changed) {
      if (svgChanged) cancelBlink();
      if (playing && svgChanged) paintFrame(); else if (!playing) finalReading(); return;
    }
    stop(); latestKey = key;
    const names = c.anchors.map(v => nodeName(state, v));
    let content = `<strong class="story-caption">${visualEscape(names.length ? 'You clicked ' + names.join(' and ') + '.' : 'What will a click show?')}</strong>`;
    if (!names.length) content += '<p class="selection-vs-set">Click a vertex. Its pink ring marks your choice. Its full neighbourhood appears immediately and stays coloured. Click that vertex again to return to the unselected view.</p>';
    else {
      content += `<div class="story-selected"><i class="key-ring" aria-hidden="true"></i> Clicked vertices A = ${visualEscape(setText(state, [...state.selected].map(id => state.graph.index.get(id))))}</div>`;
      if (names.length <= 2) {
        content += setCard(state, c.first, 'first', `Start 1: ${names[0]} → neighbourhood N(${names[0]})`, why(state, c.anchors[0]));
        if (names.length > 1) content += setCard(state, c.second, 'second', `Start 2: ${names[1]} → neighbourhood N(${names[1]})`, why(state, c.anchors[1]));
        if (names.length > 1) content += setCard(state, c.intersection, 'intersection', 'Purple: reached from both starts', members(c.intersection).length ? 'These vertices belong to BOTH full neighbourhoods above.' : 'The two neighbourhoods have no vertex in common.');
        const regions = [ ['first-only', c.firstOnly, names.length > 1 ? `Wine: from ${names[0]} only` : `Wine: all of N(${names[0]})`, 'wine'],
          ...(names.length > 1 ? [['second-only', c.secondOnly, `Turquoise: from ${names[1]} only`, 'turquoise'], ['intersection', c.intersection, 'Purple: from both', 'purple']] : []),
          ['outside', c.union.map(bit => Number(!bit)), 'Grey: not reached', 'outside'] ];
        content += '<div class="story-region-key">' + regions.map(([role, mask, text, colour]) => `<div data-story-region="${role}" data-member-ids="${visualEscape(JSON.stringify(memberIds(state, mask)))}"><i class="region-${colour}" aria-hidden="true"></i><span>${visualEscape(text)} <b>${visualEscape(setText(state, members(mask), 8))}</b></span></div>`).join('') + '</div>';
      } else {
        content += '<div class="story-region-key">' + c.anchors.map((origin, start) => {
          const ids = memberIds(state, c.masks[start]);
          return `<div data-story-region="start-${start + 1}" data-neighbourhood-start-id="${visualEscape(state.graph.nodes[origin].id)}" data-neighbourhood-colour="${c.colours[start]}" data-member-ids="${visualEscape(JSON.stringify(ids))}"><i aria-hidden="true" style="display:inline-block;flex:0 0 18px;width:18px;height:18px;border:1px solid #d5c6e577;border-radius:5px;background:${c.colours[start]}"></i><details style="flex:1;min-width:0"><summary>Start ${start + 1}: N(${visualEscape(names[start])}) · ${ids.length} ${ids.length === 1 ? 'vertex' : 'vertices'}</summary><span class="set-members">{ ${members(c.masks[start]).map(i => chip(state, i)).join(' ')} }</span></details></div>`;
        }).join('') + '<div><span>Coloured sectors = belongs to every shown set colour. Grey = outside all selected neighbourhoods.</span></div></div>';
      }
      content += `<p class="selection-vs-set">Each full neighbourhood is open: ${state.mode === 'weak-patch' ? 'it is a whole equal-degree group.' : 'follow any allowed arrow inside it and you stay inside.'}</p>`;
      const missing = members(state.analysis.enlarge).filter(i => !state.A[i]);
      content += `<div class="story-openness"><span>${state.analysis.open ? 'Your clicked set A is also open.' : `The clicked set A is smaller. To make A open, also select ${visualEscape(setText(state, missing))}.`}</span>${state.analysis.open ? '' : '<button type="button" class="story-action" id="story-complete">Select the whole open set</button>'}</div>`;
    }
    story.innerHTML = content;
    document.getElementById('graph-story').scrollTop = 0;
    document.getElementById('story-complete')?.addEventListener('click', api.completeOpenSet);
    finalReading();
  }
  update();
  return { update, animate, stop, pause, resume, blinkSelection, isPaused: () => paused || canvas.dataset.blinkPaused === 'true', getAutomatic: () => false, setAutomatic };
}
