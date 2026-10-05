// Live SVG navigation only: the mathematical graph and exported SVGs are untouched.
const graphViewportStates = new Map();
let expandedGraphViewport = null;
const VIEWPORT_MIN_ZOOM = 0.4;
const VIEWPORT_MAX_ZOOM = 8;

function viewportBox(svg) {
  const values = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
    ? { x: values[0], y: values[1], width: values[2], height: values[3] } : null;
}

function viewportWrite(state) {
  if (!state.svg || !state.view || !state.base) return;
  const b = state.view;
  state.svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
  const zoom = state.base.width / b.width;
  state.container.dataset.zoom = zoom.toFixed(4);
  state.scale.textContent = `${Math.round(zoom * 100)}%`;
  state.buttons['zoom-in'].disabled = zoom >= VIEWPORT_MAX_ZOOM - 0.0001;
  state.buttons['zoom-out'].disabled = zoom <= VIEWPORT_MIN_ZOOM + 0.0001;
}

function viewportFitBox(state) {
  const source = state.sourceBase;
  if (!source || state.container.id !== 'graph') return source;
  const drawing = state.svg.getBoundingClientRect(), toolbar = state.toolbar.getBoundingClientRect();
  // Explore places its controls over the drawing. Fit the complete original
  // figure, including potential start badges, beneath that live toolbar.
  // Exports and mathematical/layout coordinates keep their original bounds.
  if (!drawing.width || !drawing.height || !toolbar.width || !toolbar.height
    || toolbar.bottom <= drawing.top || toolbar.top >= drawing.bottom
    || toolbar.right <= drawing.left || toolbar.left >= drawing.right) return source;
  const headroom = Math.min(drawing.height * .45, Math.max(0, toolbar.bottom - drawing.top + 8));
  const availableHeight = drawing.height - headroom;
  const scale = Math.min(drawing.width / source.width, availableHeight / source.height);
  const width = drawing.width / scale, height = drawing.height / scale;
  return { x: source.x - (width - source.width) / 2,
    y: source.y - headroom / scale - (availableHeight / scale - source.height) / 2,
    width, height };
}

function viewportRefresh(state, reset = false) {
  const svg = state.container.querySelector('svg');
  if (!svg) { state.svg = null; return; }
  const previousFocus = state.focusedElement;
  const restoreFocus = svg !== state.svg && previousFocus && state.svg?.contains(previousFocus)
    && state.doc.activeElement === state.doc.body;
  if (svg !== state.svg) {
    state.svg = svg;
    const base = viewportBox(svg);
    if (!base) return;
    state.sourceBase = base;
  }
  state.base = viewportFitBox(state);
  if (!state.base) return;
  svg.dataset.baseViewbox = `${state.base.x} ${state.base.y} ${state.base.width} ${state.base.height}`;
  if (reset || !state.changed || !state.view) {
    state.view = { ...state.base };
    state.changed = false;
  }
  viewportWrite(state);
  if (restoreFocus) {
    const attribute = previousFocus.matches('.vtx') ? 'data-v' : 'data-c';
    const key = previousFocus.getAttribute(attribute);
    const replacement = [...svg.querySelectorAll(`[${attribute}]`)]
      .find(element => element.getAttribute(attribute) === key);
    (replacement || state.container).focus({ preventScroll: true });
  }
}

function viewportPoint(state, clientX, clientY) {
  const matrix = state.svg?.getScreenCTM();
  if (!matrix) return null;
  try {
    const inverse = matrix.inverse();
    return { x: inverse.a * clientX + inverse.c * clientY + inverse.e,
      y: inverse.b * clientX + inverse.d * clientY + inverse.f };
  } catch { return null; }
}

function viewportZoom(state, multiplier, clientX, clientY) {
  viewportRefresh(state);
  if (!state.view || !state.svg) return;
  const oldZoom = state.base.width / state.view.width;
  const newZoom = Math.max(VIEWPORT_MIN_ZOOM, Math.min(VIEWPORT_MAX_ZOOM, oldZoom * multiplier));
  const factor = oldZoom / newZoom;
  const b = state.view;
  const anchor = Number.isFinite(clientX) && Number.isFinite(clientY)
    ? viewportPoint(state, clientX, clientY) : null;
  const point = anchor || { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  state.view = { x: point.x - (point.x - b.x) * factor, y: point.y - (point.y - b.y) * factor,
    width: b.width * factor, height: b.height * factor };
  state.changed = true;
  viewportWrite(state);
}

function viewportPanMode(state, enabled) {
  state.pan = enabled;
  state.container.dataset.pan = String(enabled);
  state.buttons.pan.setAttribute('aria-pressed', String(enabled));
}

function viewportDockDetails(state) {
  if (state.container.id !== 'quot' || state.detailDock) return;
  const panel = state.doc.getElementById('vertex-detail-panel');
  if (!panel) return;
  const stage = state.doc.createElement('div');
  stage.className = 'quotient-detail-stage';
  state.detailDock = { panel, stage, parent: panel.parentNode, next: panel.nextSibling };
  state.container.parentNode.insertBefore(stage, state.container);
  // Move the one live panel, retaining its content and event/ARIA identity.
  stage.append(state.container, panel);
}

function viewportUndockDetails(state) {
  const dock = state.detailDock;
  if (!dock) return;
  dock.stage.parentNode.insertBefore(state.container, dock.stage);
  dock.parent.insertBefore(dock.panel, dock.next?.parentNode === dock.parent ? dock.next : null);
  dock.stage.remove(); state.detailDock = null;
}

function viewportCloseExpanded(state) {
  if (expandedGraphViewport !== state) return;
  state.pane.classList.remove('viewport-expanded');
  state.doc.body.classList.remove('viewport-open');
  state.backdrop?.remove();
  state.backdrop = null;
  for (const [element, inert] of state.inertElements || []) element.inert = inert;
  state.inertElements = [];
  viewportUndockDetails(state);
  for (const [name, value] of Object.entries(state.paneAttributes || {})) {
    if (value === null) state.pane.removeAttribute(name);
    else state.pane.setAttribute(name, value);
  }
  state.buttons.expand.textContent = 'Expand';
  state.buttons.expand.setAttribute('aria-expanded', 'false');
  state.buttons.expand.setAttribute('aria-label', `Expand ${state.label.toLowerCase()} view`);
  expandedGraphViewport = null;
  if (state.previousFocus?.isConnected) state.previousFocus.focus({ preventScroll: true });
}

function viewportExpand(state) {
  if (expandedGraphViewport === state) { viewportCloseExpanded(state); return; }
  if (expandedGraphViewport) viewportCloseExpanded(expandedGraphViewport);
  expandedGraphViewport = state;
  state.previousFocus = state.doc.activeElement;
  state.paneAttributes = { role: state.pane.getAttribute('role'), 'aria-modal': state.pane.getAttribute('aria-modal') };
  state.pane.setAttribute('role', 'dialog');
  state.pane.setAttribute('aria-modal', 'true');
  state.pane.classList.add('viewport-expanded');
  state.doc.body.classList.add('viewport-open');
  viewportDockDetails(state);
  state.backdrop = state.doc.createElement('div');
  state.backdrop.className = 'viewport-backdrop';
  state.backdrop.setAttribute('aria-hidden', 'true');
  state.backdrop.addEventListener('click', () => viewportCloseExpanded(state));
  state.doc.body.appendChild(state.backdrop);
  state.inertElements = [];
  for (let branch = state.pane; branch && branch !== state.doc.body; branch = branch.parentElement) {
    for (const sibling of branch.parentElement?.children || []) {
      if (sibling === branch || sibling === state.backdrop || sibling.tagName === 'SCRIPT') continue;
      state.inertElements.push([sibling, sibling.inert]);
      sibling.inert = true;
    }
  }
  state.buttons.expand.textContent = 'Close expanded view';
  state.buttons.expand.setAttribute('aria-expanded', 'true');
  state.buttons.expand.setAttribute('aria-label', `Close expanded ${state.label.toLowerCase()} view`);
  state.buttons.expand.focus({ preventScroll: true });
}

function viewportInstall(container) {
  const doc = container.ownerDocument, drawingPane = container.closest('.pane') || container.parentElement;
  const pane = container.id === 'graph' ? container.closest('.graph-pane') || drawingPane : drawingPane;
  const label = container.id === 'quot' ? 'Quotient' : 'Graph';
  const toolbar = doc.createElement('div');
  toolbar.className = 'viewport-toolbar';
  toolbar.dataset.viewportFor = container.id;
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', `${label} view controls`);
  const state = { container, doc, pane, label, toolbar, buttons: {}, svg: null, sourceBase: null, base: null, view: null,
    changed: false, pan: false, drag: null, suppressClick: false, listeners: [] };
  const controls = [
    ['zoom-in', '+', `Zoom in on ${label.toLowerCase()}`],
    ['zoom-out', '−', `Zoom out of ${label.toLowerCase()}`],
    ['fit', 'Fit', `Fit the complete ${label.toLowerCase()} in the view`],
    ['pan', 'Pan', `Pan ${label.toLowerCase()} view; drawing and selection are unchanged`],
    ['expand', 'Expand', `Expand ${label.toLowerCase()} view`],
  ];
  for (const [action, text, description] of controls) {
    const button = doc.createElement('button');
    button.type = 'button'; button.id = `${container.id}-${action}`;
    button.dataset.viewportAction = action;
    button.textContent = text; button.title = description;
    button.setAttribute('aria-label', description);
    if (action === 'pan') button.setAttribute('aria-pressed', 'false');
    if (action === 'expand') { button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', container.id); }
    toolbar.appendChild(button); state.buttons[action] = button;
  }
  state.scale = doc.createElement('output');
  state.scale.className = 'viewport-scale'; state.scale.textContent = '100%';
  state.scale.setAttribute('aria-label', `${label} zoom level`);
  toolbar.appendChild(state.scale);
  state.help = doc.createElement('p'); state.help.className = 'viewport-help';
  state.help.id = `${container.id}-viewport-help`;
  state.help.textContent = 'Zoom: + / − or Ctrl + wheel. Move view: Pan or middle drag. Expand for more room; Esc closes.';
  drawingPane.insertBefore(toolbar, container); drawingPane.insertBefore(state.help, container);
  container.tabIndex = 0;
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', `${label} interactive viewport`);
  container.setAttribute('aria-describedby', state.help.id);
  viewportPanMode(state, false);

  const listen = (target, name, listener, options) => {
    target.addEventListener(name, listener, options);
    state.listeners.push(() => target.removeEventListener(name, listener, options));
  };
  listen(doc, 'focusin', event => {
    state.focusedElement = container.contains(event.target) && event.target.matches('.vtx, .qn')
      ? event.target : null;
  }, true);
  listen(toolbar, 'click', event => {
    const action = event.target.closest('[data-viewport-action]')?.dataset.viewportAction;
    if (action === 'zoom-in') viewportZoom(state, 1.3);
    else if (action === 'zoom-out') viewportZoom(state, 1 / 1.3);
    else if (action === 'fit') viewportRefresh(state, true);
    else if (action === 'pan') viewportPanMode(state, !state.pan);
    else if (action === 'expand') viewportExpand(state);
  });
  listen(container, 'wheel', event => {
    if (!event.ctrlKey || !event.target.closest('svg')) return;
    event.preventDefault(); event.stopPropagation();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
    viewportZoom(state, Math.exp(Math.max(-0.35, Math.min(0.35, -delta * 0.002))), event.clientX, event.clientY);
  }, { passive: false });
  listen(doc, 'pointerdown', event => {
    // A window-capture tour interruption can restore and redraw this SVG
    // before this document-capture listener receives the same real gesture.
    // Preserve its semantic target, then fall back to its screen position.
    let target = event.target;
    if (!target?.isConnected) {
      const vertex = target?.closest?.('.vtx')?.dataset.v;
      const quotient = target?.closest?.('.qn')?.dataset.c;
      const edge = target?.closest?.('[data-e]')?.dataset.e;
      target = (vertex !== undefined && container.id === 'graph'
        ? [...container.querySelectorAll('.vtx')].find(node => node.dataset.v === vertex) : null)
        || (quotient !== undefined && container.id === 'quot'
          ? [...container.querySelectorAll('.qn')].find(node => node.dataset.c === quotient) : null)
        || (edge !== undefined && container.id === 'graph'
          ? [...container.querySelectorAll('[data-e]')].find(node => node.dataset.e === edge) : null)
        || doc.elementFromPoint(event.clientX, event.clientY);
    }
    if (!target || !container.contains(target) || !target.closest?.('svg')) return;
    state.suppressClick = false;
    if (!(event.button === 1 || event.button === 0 && state.pan)) return;
    viewportRefresh(state);
    const matrix = state.svg?.getScreenCTM();
    if (!matrix) return;
    let inverse; try { inverse = matrix.inverse(); } catch { return; }
    event.preventDefault(); event.stopImmediatePropagation();
    state.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, inverse, view: { ...state.view } };
    state.suppressClick = true;
    container.dataset.draggingView = 'true';
    try { container.setPointerCapture(event.pointerId); } catch { /* Synthetic test events may not own a pointer. */ }
  }, true);
  listen(doc, 'pointermove', event => {
    const drag = state.drag;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y, m = drag.inverse;
    state.view = { ...drag.view, x: drag.view.x - dx * m.a - dy * m.c,
      y: drag.view.y - dx * m.b - dy * m.d };
    state.changed = true;
    viewportWrite(state);
  }, true);
  const endDrag = event => {
    if (!state.drag || state.drag.id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    state.drag = null; delete container.dataset.draggingView;
    try { if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId); } catch { /* Pointer may already be released. */ }
  };
  listen(doc, 'pointerup', endDrag, true);
  listen(doc, 'pointercancel', endDrag, true);
  listen(container, 'lostpointercapture', () => { state.drag = null; delete container.dataset.draggingView; });
  listen(container, 'click', event => {
    if (event.detail > 0 && (state.pan || state.suppressClick)) {
      event.preventDefault(); event.stopImmediatePropagation(); state.suppressClick = false;
    }
  }, true);
  listen(container, 'auxclick', event => { if (event.button === 1) event.preventDefault(); });
  listen(pane, 'click', event => {
    // Choosing an editing tool clearly returns the graph to editing gestures.
    if (event.target.closest('[data-tool]')) viewportPanMode(state, false);
  }, true);
  listen(container, 'keydown', event => {
    if (event.target !== container && event.target !== state.svg) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); viewportZoom(state, 1.3); }
    else if (event.key === '-') { event.preventDefault(); viewportZoom(state, 1 / 1.3); }
    else if (event.key === '0') { event.preventDefault(); viewportRefresh(state, true); }
  });
  listen(doc, 'keydown', event => {
    if (expandedGraphViewport !== state) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); viewportCloseExpanded(state);
    } else if (event.key === 'Tab') {
      const tour = doc.querySelector('#live-tour[data-active="true"] .live-tour-bar');
      const controls = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"], a[href]';
      const focusable = [...pane.querySelectorAll(controls), ...(tour ? tour.querySelectorAll(controls) : [])]
        .filter(element => element.getClientRects().length && !element.closest('[inert]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      const inside = pane.contains(doc.activeElement) || tour?.contains(doc.activeElement);
      if (first && event.shiftKey && (doc.activeElement === first || !inside)) {
        event.preventDefault(); last.focus();
      } else if (first && !event.shiftKey && (doc.activeElement === last || !inside)) {
        event.preventDefault(); first.focus();
      }
    }
  }, true);
  state.observer = new doc.defaultView.MutationObserver(() => viewportRefresh(state));
  state.observer.observe(container, { childList: true });
  state.resizeObserver = new doc.defaultView.ResizeObserver(() => viewportRefresh(state));
  state.resizeObserver.observe(container);
  graphViewportStates.set(container, state);
  viewportRefresh(state);
  return state;
}

function viewportContainers(root) {
  const containers = [...root.querySelectorAll('#graph, #quot')];
  if (root.matches?.('#graph, #quot')) containers.unshift(root);
  return containers;
}

/** Install once; SVG replacements automatically inherit the current live view. */
export function installGraphViewports(root = document) {
  for (const container of viewportContainers(root)) {
    if (!graphViewportStates.has(container)) viewportInstall(container);
    else viewportRefresh(graphViewportStates.get(container));
  }
  return {
    refresh: options => refreshGraphViewports(root, options),
    reset: () => resetGraphViewports(root),
    destroy: () => {
      for (const container of viewportContainers(root)) {
        const state = graphViewportStates.get(container);
        if (!state) continue;
        viewportCloseExpanded(state); state.observer.disconnect(); state.resizeObserver.disconnect();
        for (const remove of state.listeners) remove();
        state.toolbar.remove(); state.help.remove();
        if (state.svg && state.base) { state.view = { ...state.base }; viewportWrite(state); }
        for (const name of ['data-zoom', 'data-pan', 'data-dragging-view', 'tabindex', 'role', 'aria-label', 'aria-describedby']) container.removeAttribute(name);
        graphViewportStates.delete(container);
      }
    },
  };
}

/** Call synchronously after a render when later code immediately reads SVG coordinates. */
export function refreshGraphViewports(root = document, { reset = false } = {}) {
  for (const container of viewportContainers(root)) {
    const state = graphViewportStates.get(container);
    if (state) viewportRefresh(state, reset);
  }
}

/** Fit newly loaded graphs or layouts without changing any mathematical state. */
export function resetGraphViewports(root = document) {
  refreshGraphViewports(root, { reset: true });
}

// Reversible viewport demonstrations use the same camera state as the controls.
export function captureGraphViewports() {
  return [...graphViewportStates.values()].map(state => ({ id: state.container.id,
    view: state.view ? { ...state.view } : null, changed: state.changed, pan: state.pan,
    expanded: expandedGraphViewport === state }));
}

export function previewGraphViewport(kind, values = {}) {
  const state = graphViewportStates.get(document.getElementById(values.id || 'graph'));
  if (!state) return null;
  viewportRefresh(state);
  if (kind === 'capture') return { ...state.view };
  if (kind === 'set' && values.box) {
    state.view = { ...values.box }; state.changed = true; viewportWrite(state);
  } else if (kind === 'fit') viewportRefresh(state, true);
  else if (kind === 'pan') viewportPanMode(state, Boolean(values.value));
  else if (kind === 'expand' && Boolean(values.value) !== (expandedGraphViewport === state)) {
    viewportExpand(state);
    // The demonstration's controls remain reachable above the expanded graph.
    const tour = document.getElementById('live-tour'); if (tour) tour.inert = false;
  }
  return state.view ? { ...state.view } : null;
}

export function restoreGraphViewports(saved) {
  if (expandedGraphViewport) viewportCloseExpanded(expandedGraphViewport);
  for (const item of saved || []) {
    const state = graphViewportStates.get(document.getElementById(item.id));
    if (!state) continue;
    viewportRefresh(state);
    state.view = item.view ? { ...item.view } : { ...state.base };
    state.changed = item.changed; viewportPanMode(state, item.pan); viewportWrite(state);
    if (item.expanded) viewportExpand(state);
  }
}
