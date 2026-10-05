// Ephemeral details for the live diagrams. All values come from the active model.
// User-provided labels are assigned with textContent, never interpreted as HTML.
const graphDetailInstallations = new WeakMap();

// Explain a one-point least neighbourhood from the active graph/statistic.
// In weak-patch mode the drawn uphill arrows are only reference arrows, so
// the stopping reason must use equal-degree adjacency instead of outdegree.
export function singletonNeighbourhoodReason(state, origin) {
  const { model, graph } = state;
  const mask = model?.topo?.N[origin];
  if (!mask || Array.from(mask).filter(Boolean).length !== 1) return '';
  const label = String(graph.nodes[origin].label), value = model.degree[origin];
  const neighbours = new Set();
  for (const edge of graph.edges) {
    const { u, v } = edge;
    if (u === origin) neighbours.add(v);
    if (v === origin) neighbours.add(u);
  }
  if (!neighbours.size) return `${label} has no neighbours, so no step can reach another vertex.`;
  const measure = state.statistic === 'distinct-neighbours' ? 'neighbour count' : 'degree';
  const values = [...new Set([...neighbours].map(i => model.degree[i]))].sort((a, b) => a - b);
  const list = values.slice(0, 8).join(', ') + (values.length > 8 ? ', …' : '');
  const evidence = `${label} has ${measure} ${value}; neighbouring ${measure} values: ${list}.`;
  const rule = state.mode === 'weak-patch' ? `This mode joins equal values only; no neighbour matches ${value}.`
    : state.mode === 'strict' ? 'A step needs a higher value; no neighbour has one.'
    : 'All neighbours have lower values, so no uphill step leaves this vertex.';
  return `${evidence} ${rule}`;
}

function graphDetailList(values) {
  if (!values.length) return { text: '∅', abbreviated: false };
  const shown = [], limit = 12;
  let length = 0, abbreviated = false;
  for (const value of values) {
    const full = String(value), label = full.length > 70 ? full.slice(0, 67) + '…' : full;
    if (shown.length >= limit || shown.length && length + label.length > 230) break;
    shown.push(label); length += label.length + 2;
    if (label !== full) abbreviated = true;
  }
  const omitted = values.length - shown.length;
  if (omitted) { shown.push(`… (${omitted} more)`); abbreviated = true; }
  return { text: '{' + shown.join(', ') + '}', abbreviated };
}

function graphDetailContent(state, node, quotient) {
  const model = state?.model, graph = state?.graph, topology = model?.topo;
  if (!topology || !graph) return null;
  const labels = indices => indices.map(i => graph.nodes[i].label);
  const indices = mask => Array.from(mask, (present, i) => present ? i : -1).filter(i => i >= 0);
  const statistic = state.statistic === 'distinct-neighbours' ? 'Distinct neighbours d_V' : 'Incident edges d_E';
  if (quotient) {
    const c = Number(node.dataset.c), members = topology.classes[c];
    if (!Number.isInteger(c) || !members) return null;
    const memberList = graphDetailList(labels(members));
    const above = indices(topology.le[c]), upSet = graphDetailList(above.map(i => `Q${i + 1}`));
    const selected = members.filter(i => state.A?.[i]).length;
    const degrees = [...new Set(members.map(i => model.degree[i]))].sort((a, b) => a - b);
    return {
      title: `Quotient point Q${c + 1}`,
      rows: [`Members (${members.length}): ${memberList.text}`, `Up-set (${above.length} ${above.length === 1 ? 'point' : 'points'}): ${upSet.text}`,
        `${statistic}: ${degrees.join(', ')}`,
        `In A: ${selected} of ${members.length} vertices (${selected === 0 ? 'none' : selected === members.length ? 'all' : 'partial'})`],
      note: memberList.abbreviated || upSet.abbreviated ? 'Abbreviated preview. Full labels and sets are in Minimal neighbourhoods.'
        : state.mode === 'weak-patch' ? 'Active quotient: equality order. Original uphill arrows are reference only.'
        : 'The up-set includes this point and every point above it.',
    };
  }
  const i = graph.index.get(node.dataset.v);
  if (!Number.isInteger(i) || !graph.nodes[i]) return null;
  const label = String(graph.nodes[i].label), c = topology.pointToClass[i];
  const neighbourhood = indices(topology.N[i]), list = graphDetailList(labels(neighbourhood));
  const classification = state.analysis?.interior?.[i] ? 'Interior of A'
    : state.analysis?.boundary?.[i] ? 'Boundary of A' : 'Exterior of A';
  const comparison = state.neighbourhoods;
  const starts = comparison?.memberships?.[i] || [];
  const containing = starts.map(start => `N(${graph.nodes[comparison.anchors[start]].label}) [Start ${start + 1}]`);
  const containingList = graphDetailList(containing);
  return {
    title: `Vertex ${label}`,
    rows: [`${statistic} = ${model.degree[i]}`, `Class Q${c + 1} (${topology.classes[c].length} ${topology.classes[c].length === 1 ? 'vertex' : 'vertices'})`,
      `N(${label}) = ${list.text}`,
      ...(comparison?.anchors.length ? [`Selected neighbourhoods containing ${label} (${starts.length}): ${containingList.text}`] : []),
      `In A: ${state.A?.[i] ? 'yes' : 'no'}`, `Region: ${classification}`],
    note: singletonNeighbourhoodReason(state, i) || (list.abbreviated || containingList.abbreviated ? 'Abbreviated preview. Expand the exact-set rows to read every selected neighbourhood; Minimal neighbourhoods lists every vertex.'
      : state.mode === 'weak-patch' ? 'The least neighbourhood is the whole original plateau.'
      : `Least neighbourhood: ${neighbourhood.length} ${neighbourhood.length === 1 ? 'vertex' : 'vertices'}, including this vertex.`),
  };
}

/** Persistent hover/focus details live beside the drawing, never over it. */
export function installGraphDetails(getState, root = document) {
  if (typeof getState !== 'function') throw new TypeError('Graph details require a state getter.');
  const existing = graphDetailInstallations.get(root);
  if (existing) { existing.getState = getState; return existing.controls; }
  const doc = root.ownerDocument || root, win = doc.defaultView;
  const panel = root.querySelector('#vertex-detail-panel');
  if (!panel) throw new Error('Missing vertex details panel.');
  const placeholder = panel.querySelector('.graph-detail-prompt');
  const installation = { getState, states: [], listeners: [], pointerHeld: false, active: null, identity: null, signature: '', flash: null };
  const listen = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    installation.listeners.push(() => target.removeEventListener(name, handler, options));
  };
  const detach = state => {
    if (state.target?.isConnected) {
      if (state.previousDescription === null) state.target.removeAttribute('aria-describedby');
      else state.target.setAttribute('aria-describedby', state.previousDescription);
    }
    state.target = null; state.previousDescription = null;
  };
  const hideAll = () => {
    installation.states.forEach(state => { detach(state); state.tip.hidden = true; });
    installation.active = null; installation.identity = null; installation.signature = '';
    placeholder.hidden = false; panel.dataset.activeCarrier = '';
    installation.flash?.cancel();
  };
  const flash = () => {
    panel.dataset.updateCount = String(Number(panel.dataset.updateCount || 0) + 1);
    installation.flash?.cancel();
    if (!win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      installation.flash = panel.animate([
        { boxShadow: '0 0 0 2px #ffd986, 0 0 24px #ffc26788', borderColor: '#ffe4a0' },
        { boxShadow: '0 0 0 0 transparent, 0 0 0 transparent', borderColor: '#ba8b50' },
      ], { duration: 1050, easing: 'ease-out' });
    }
  };
  const show = (state, node, force = false) => {
    if (!node?.isConnected || (!force && (installation.pointerHeld || state.dismissedTarget === node))) return;
    const content = graphDetailContent(installation.getState(), node, state.quotient);
    if (!content) { hideAll(); return; }
    for (const other of installation.states) {
      if (other !== state) { detach(other); other.tip.hidden = true; }
    }
    if (state.target !== node) {
      detach(state); state.target = node; state.previousDescription = node.getAttribute('aria-describedby');
    }
    const signature = JSON.stringify([state.container.id, content]);
    const tip = state.tip;
    if (signature !== installation.signature) {
      tip.replaceChildren();
      const title = doc.createElement('strong'); title.className = 'graph-tooltip-title'; title.textContent = content.title;
      tip.appendChild(title);
      for (const text of content.rows) {
        const row = doc.createElement('div'); row.className = 'graph-tooltip-row'; row.textContent = text;
        tip.appendChild(row);
      }
      const note = doc.createElement('small'); note.className = 'graph-tooltip-note'; note.textContent = content.note;
      tip.appendChild(note);
      installation.signature = signature; flash();
    }
    node.setAttribute('aria-describedby', [state.previousDescription, tip.id].filter(Boolean).join(' '));
    tip.hidden = false; placeholder.hidden = true;
    installation.active = state;
    installation.identity = state.quotient ? node.dataset.c : node.dataset.v;
    panel.dataset.activeCarrier = state.container.id;
  };
  const refresh = () => {
    const state = installation.active;
    if (!state) return;
    const node = [...state.container.querySelectorAll(state.quotient ? '.qn' : '.vtx')]
      .find(node => (state.quotient ? node.dataset.c : node.dataset.v) === installation.identity);
    if (node) show(state, node, true); else hideAll();
  };
  for (const container of root.querySelectorAll('#graph, #quot')) {
    const tip = doc.createElement('div');
    tip.id = `${container.id}-details`; tip.className = 'graph-detail-content';
    tip.setAttribute('role', 'region'); tip.setAttribute('aria-label', container.id === 'quot' ? 'Quotient point details' : 'Vertex details');
    tip.hidden = true; panel.appendChild(tip);
    const state = { container, quotient: container.id === 'quot', tip, target: null, previousDescription: null, dismissedTarget: null };
    installation.states.push(state);
    const nodeFrom = target => {
      const node = target?.closest?.(state.quotient ? '.qn' : '.vtx');
      return node && container.contains(node) ? node : null;
    };
    const hover = event => {
      if (event.buttons || installation.pointerHeld) return;
      const node = nodeFrom(event.target);
      if (!node) return;
      if (state.dismissedTarget && state.dismissedTarget !== node) state.dismissedTarget = null;
      show(state, node);
    };
    listen(container, 'pointerover', hover);
    listen(container, 'pointermove', hover);
    // Leave the last information visible long enough to read it in the sidebar.
    listen(container, 'pointerleave', () => { state.dismissedTarget = null; });
    listen(container, 'focusin', event => {
      const node = nodeFrom(event.target);
      if (node) { state.dismissedTarget = null; show(state, node); }
    });
    state.observer = new win.MutationObserver(refresh);
    state.observer.observe(container, { childList: true });
  }
  listen(win, 'pointerdown', () => { installation.pointerHeld = true; }, true);
  const releasePointer = event => {
    installation.pointerHeld = false;
    const state = installation.states.find(state => state.container.contains(event.target));
    const node = event.target?.closest?.(state?.quotient ? '.qn' : '.vtx');
    if (state && node) show(state, node, true); else refresh();
  };
  listen(win, 'pointerup', releasePointer, true);
  listen(win, 'pointercancel', () => { installation.pointerHeld = false; }, true);
  listen(win, 'keydown', event => {
    if (event.key !== 'Escape') return;
    for (const state of installation.states) state.dismissedTarget = state.target;
    hideAll();
  }, true);
  listen(win, 'blur', () => { installation.pointerHeld = false; });
  installation.controls = {
    hide: hideAll, refresh,
    showVertex: id => {
      const state = installation.states.find(state => !state.quotient);
      const node = [...state.container.querySelectorAll('.vtx')].find(node => node.dataset.v === id);
      show(state, node, true);
    },
    capture: () => ({ carrier: installation.active?.container.id, identity: installation.identity }),
    restore: value => {
      const state = installation.states.find(state => state.container.id === value?.carrier);
      if (!state) { hideAll(); return; }
      installation.active = state; installation.identity = value.identity; refresh();
    },
    destroy: () => {
      hideAll();
      for (const remove of installation.listeners) remove();
      for (const state of installation.states) { state.observer.disconnect(); state.tip.remove(); }
      graphDetailInstallations.delete(root);
    },
  };
  graphDetailInstallations.set(root, installation);
  return installation.controls;
}
