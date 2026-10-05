// One help vocabulary serves real pointer/keyboard use and the introduction.
// This module describes controls only. It never dispatches their actions.
const controlHelpInstallations = new WeakMap();
const HELP_CONTROL_SELECTOR = 'button,input:not([type="hidden"]),select,textarea,summary,label.file-action';
const HELP_CHROME_SELECTOR = '[data-control-help-trigger],#control-help-popover,#control-help-triggers';

const HELP_IDS = {
  'watch-guide': ['Replay intro', 'Watch the real controls in action. Pause, change speed, or choose Explore whenever you are ready.'],
  'open-lessons': ['Visual lessons', 'Open six illustrated lessons about degrees, neighbourhoods and overlaps.'],
  'workspace-toggle': ['Full workbench', 'Show or hide the quotient, inspector, tables and graph editor. Your graph and selection stay the same.'],
  'theme-toggle': ['Bright or dark view', 'Switch the colour theme. The graph and all its sets stay the same.'],
  preset: ['Choose a graph', 'Open the list and choose a ready-made graph. Then click its vertices to compare their neighbourhoods.'],
  mode: ['Topology', 'Choose the rule that determines each vertex’s smallest open neighbourhood. The graph edges stay undirected.'],
  stat: ['Degree statistic', 'Choose whether degree counts incident edges or distinct neighbours. Parallel edges make these counts differ.'],
  undo: ['Undo', 'Restore the previous graph or selection change. An unavailable button means there is nothing to undo.'],
  redo: ['Redo', 'Reapply the last change you undid. A new edit starts a different history.'],
  imp: ['Import JSON', 'Choose a saved graph or experiment file from your computer. It is checked before replacing this experiment.'],
  'exp-json': ['Export JSON', 'Save a copy of the experiment, including graph, selection and settings. Import it later to continue.'],
  'exp-html': ['Export report', 'Save an HTML report with the current graph, sets and results. It opens offline in a browser.'],
  'exp-svg': ['Graph SVG', 'Save the current graph as a scalable image, including the visible colouring.'],
  'exp-qsvg': ['Quotient SVG', 'Save the current quotient drawing as a scalable image.'],
  help: ['Rules', 'Open the definitions and reading guide for the three topology modes.'],
  'preset-fan-toggle': ['Picture presets', 'Hover to open the stack of graphs. Move away to close it, or choose a picture to load that graph.'],
  'story-replay': ['Show construction steps', 'Optional: illustrate how the neighbourhood is reached in this finite graph. The full open set is already shown; these steps are not required to use or define it.'],
  'story-complete': ['Select the whole open set', 'Add the required vertices to A, so the selected set itself becomes open.'],
  'colour-mode': ['Graph colours', 'Choose between comparing vertex neighbourhoods and showing the interior, boundary and exterior of A.'],
  arcs: ['Uphill-step arrows', 'Show or hide the allowed-step overlay. These arrows explain the topology; the original edges are undirected.'],
  ccol: ['Class labels', 'Show or hide quotient-class labels on vertices. Vertices in one class have the same smallest neighbourhood.'],
  'layout-choice': ['Layout', 'Rearrange the drawing. Moving vertices changes neither edges nor open sets.'],
  qview: ['Quotient view', 'Choose how classes and their relations are drawn in the quotient.'],
  pp: ['Poset points', 'List every point of the finite order, including points that have no comparison.'],
  pa: ['Poset comparisons', 'Enter one comparison per line, such as a < b. The generator computes the implied comparisons.'],
  newv: ['New vertex ID', 'Enter a unique ID for the isolated vertex you want to add.'],
  eu: ['First endpoint', 'Choose the first endpoint of the edge to create with Connect.'],
  ev: ['Second endpoint', 'Choose a different second endpoint, then press Connect.'],
  el: ['Edge list', 'Write one pair of vertex IDs per line. Replace graph loads the graph described here.'],
  iso: ['Isolated vertices', 'List IDs for vertices with no edges. They will be included when you replace the graph from the edge list.'],
  gj: ['Graph JSON', 'Inspect or edit the graph data. Replace graph from JSON validates and loads this text.'],
  galF: ['Excluded indices', 'Enter the finite set of indices to exclude from this symbolic infinite example.'],
  'live-tour-back': ['Previous demonstration', 'Return to the preceding demonstration in the introduction.'],
  'live-tour-next': ['Next demonstration', 'Go directly to the next demonstration.'],
  'live-tour-pause': ['Pause or resume', 'Pause the introduction so you can read the help and inspect the example. Press again to continue.'],
  'live-tour-speed': ['Introduction speed', 'Choose a slower or faster pace. All the same controls and examples are demonstrated.'],
  'live-tour-replay': ['Replay introduction', 'Restart the introduction from the beginning.'],
  'live-tour-skip': ['Explore', 'Finish the introduction and return to your own graph and selection.'],
  'intro-close': ['Close visual lessons', 'Return to your graph without changing it.'],
  'intro-play': ['Pause or resume lesson', 'Pause the illustrated lesson, or resume its animation.'],
  'intro-replay': ['Replay lessons', 'Start the illustrated lessons again from the first scene.'],
  'intro-back': ['Previous lesson', 'Return to the preceding illustrated lesson.'],
  'intro-next': ['Next lesson', 'Continue to the next illustrated lesson.'],
  'intro-try': ['Try this graph', 'Close the lessons and load the demonstrated three-vertex path to explore yourself.'],
};

const HELP_TOOLS = {
  select: ['Select vertices', 'Click a vertex: its full neighbourhood blinks three times, then stays coloured. Choose more vertices to compare their sets and overlaps. Click a selected vertex again to remove it.'],
  neighbourhood: ['Explore neighbourhoods', 'Click a vertex to trace its neighbourhood without changing A. Wine marks the start; turquoise marks the reached vertices.'],
  'add-vertex': ['Add vertex', 'Choose this tool, then click an empty place in the graph. A new isolated vertex appears there.'],
  'add-edge': ['Add edge', 'Choose this tool, then click the two endpoints. You can also drag from one vertex to another.'],
  move: ['Move', 'Drag a vertex to arrange the drawing. Its edges, degree and neighbourhood stay the same.'],
  delete: ['Delete', 'Click a vertex or edge to delete it. Deleting a vertex also removes its edges. Undo restores the previous graph.'],
  focus: ['Explain a vertex', 'Click a vertex to inspect its neighbourhood and its membership in the interior and closure of A.'],
};

const HELP_ACTS = {
  clearA: ['Clear selection', 'Remove every selected vertex from A. The graph remains in place.'],
  saturate: ['Select touched classes', 'Whenever A touches a quotient class, add every other vertex in that class.'],
  'show-arc': ['Highlight an escaping step', 'Highlight an allowed step from A to a vertex outside A. This explains why A is not open.'],
  'show-path': ['Highlight a reaching path', 'Show the path that witnesses this relation in the graph. Your selection stays unchanged.'],
  'clear-trace': ['Clear highlight', 'Remove the temporary explanation highlight while keeping your graph and selection.'],
  enum: ['List open sets', 'Start listing open sets within the displayed limits. Large topologies may need more than one run.'],
  'enum-more': ['Continue listing', 'Continue the bounded search and keep the open sets already found.'],
  'cancel-enum': ['Cancel listing', 'Stop the current search. Any open sets already found remain available as an incomplete list.'],
  'enum-page': ['Open-set pages', 'Move to another page of the open sets already found.'],
  preview: ['Preview an open set', 'Temporarily highlight this open set without replacing A.'],
  useA: ['Use as A', 'Make this listed open set the selected set A.'],
  'trace-nbhd': ['Highlight this neighbourhood', 'Highlight the full smallest open neighbourhood in this row. A stays unchanged.'],
  'trace-class': ['Highlight this class up-set', 'Highlight the vertices reached from this quotient class. A stays unchanged.'],
  'trace-cover': ['Highlight a cover', 'Highlight this immediate relation between quotient classes.'],
  'trace-arc': ['Highlight an allowed step', 'Show the corresponding step in the graph. It is derived from the chosen topology rule.'],
  'trace-relation': ['Inspect this relation', 'Show whether the row vertex reaches the column vertex under the active topology. A stays unchanged.'],
  'sub-from-A': ['Use A as the carrier', 'Choose the selected vertices as S for the subspace comparison.'],
  'sub-all': ['Use all vertices', 'Include every vertex in the carrier S.'],
  'sub-none': ['Empty carrier', 'Remove all vertices from the carrier S.'],
  subv: ['Include in S', 'Include or remove this vertex in the carrier used for the subspace comparison.'],
  selv: ['Include in A', 'Select or deselect this vertex. Its neighbourhood colouring follows the same rule as clicking it in the graph.'],
  'poset-gen': ['Generate and certify', 'Construct a graph from this finite order and check the construction’s finite certificate.'],
  'poset-load': ['Load generated graph', 'Generate the graph for this order and load it into the workbench with uphill topology.'],
  'poset-preset': ['Order example', 'Fill the points and comparisons with this example order. Generate and certify shows its construction.'],
  rename: ['Vertex label', 'Change the displayed label. The vertex ID, edges and topology remain unchanged.'],
  delv: ['Delete vertex', 'Remove this vertex and every edge attached to it. Undo restores the previous graph.'],
  addv: ['Add isolated vertex', 'Create the vertex named in the New vertex ID field, without any edges.'],
  dele: ['Delete edge', 'Remove this individual edge. Degrees and neighbourhoods are recomputed.'],
  adde: ['Connect endpoints', 'Add an undirected edge between the chosen endpoints. Degrees and neighbourhoods are recomputed.'],
  'to-multi': ['Allow parallel edges', 'Convert to a loopless multigraph so a pair of vertices may have more than one edge.'],
  'clear-graph': ['Clear graph', 'Remove every vertex and edge. Undo restores the previous graph.'],
  'import-el': ['Replace from edge list', 'Validate the edge list and isolated IDs, then load them as the new graph.'],
  'import-json': ['Replace from JSON', 'Validate the text above and load its graph or experiment. Invalid input leaves the current graph unchanged.'],
  'refresh-json': ['Show current graph', 'Replace the JSON text with the graph currently in the workbench.'],
  galF: ['Show symbolic example', 'Redraw this infinite-family example using the excluded indices entered above.'],
};

const HELP_OPS = {
  interior: ['Interior of A', 'Keep only vertices whose entire smallest neighbourhood is already inside A.'],
  closure: ['Closure of A', 'Select every vertex whose smallest neighbourhood meets A.'],
  boundary: ['Boundary of A', 'Select vertices whose smallest neighbourhood meets both A and its complement.'],
  complement: ['Complement of A', 'Select exactly the vertices outside A.'],
  enlarge: ['Complete A to an open set', 'Add every vertex required by the neighbourhoods of the selected vertices.'],
};

const HELP_TABS = {
  opens: 'List, preview and select open sets of the current topology.',
  nbhd: 'Read each smallest neighbourhood, quotient class and allowed relation; click a row to highlight it.',
  matrix: 'Read the reachability relation: a 1 means the column vertex belongs to the row vertex’s neighbourhood.',
  compare: 'Compare uphill, strict uphill and finite weak-patch topology on this same graph.',
  subspace: 'Compare the inherited topology on S with the topology recomputed on the induced graph.',
  poset: 'Build a graph from a finite order and check its construction certificate.',
  edit: 'Edit vertex labels, add or delete edges, and import graph descriptions.',
  gallery: 'Inspect a symbolic infinite-family example, separate from the finite graph workbench.',
  help: 'Read the topology definitions, controls and interpretation of colours.',
};

const HELP_MENU_CHOICES = {
  mode: {
    uphill: 'Follow edges to vertices of the same or higher degree. Every reachable vertex belongs to the starting neighbourhood.',
    strict: 'Follow edges only to strictly higher degree. Equal-degree edges do not create a step.',
    'weak-patch': 'The neighbourhood is the whole original uphill plateau containing the vertex. Open sets are unions of these plateaus.',
  },
  stat: {
    'incident-edges': 'Count each incident edge separately. Parallel edges each contribute to degree.',
    'distinct-neighbours': 'Count each neighbouring vertex once, even when several edges join the same pair.',
  },
  'layout-choice': {
    current: 'Keep the current arrangement of vertices.',
    network: 'Spread vertices into a relaxed network drawing. Edges and topology stay unchanged.',
    levels: 'Arrange vertices in horizontal levels by degree. The topology stays unchanged.',
    circle: 'Arrange vertices around a circle. Edges and topology stay unchanged.',
  },
  'colour-mode': {
    neighbourhoods: 'Show a distinct colour for each selected vertex’s neighbourhood and mixed regions for overlaps.',
    analysis: 'Use colours to distinguish the interior, boundary and exterior of the selected set A.',
  },
  qview: {
    hasse: 'Draw only immediate order relations between classes. A class greater in the order appears higher in the diagram.',
    condensation: 'Draw direct allowed arcs between distinct quotient classes.',
    discrete: 'Draw the weak-patch quotient as unrelated points. There are no strict order relations.',
    ghost: 'Show the original uphill order as a reference overlay; it is not the weak-patch order.',
  },
};

const HELP_PRESETS = {
  path3: 'A three-vertex path: start at an endpoint and see why its centre joins the neighbourhood.',
  cycle4: 'Four vertices of equal degree: compare what equal-degree steps mean in each topology.',
  hard19: 'A cube, a triangle, branches and islands: compare neighbourhoods inside and across its three components.',
  karate34: 'The karate-club network from manuscript figure 3: 34 vertices and 78 edges. Choose vertices of different degrees to compare their neighbourhoods and overlaps.',
  cube11: 'A cube with three extra vertices of degree 1, 2 and 3. Click several starts to compare their reached sets.',
  clb7: 'A triangle with branching paths. Look for shared destinations from different starting vertices.',
  konigsberg: 'A multigraph with parallel bridges. Compare incident-edge degree with distinct-neighbour degree.',
  isolated3: 'Three isolated vertices: each smallest neighbourhood contains only its starting vertex.',
  isolated100: 'One hundred isolated vertices: try a topology with very many open sets.',
  square_diagonal: 'A square with one diagonal. Its two degree levels produce contrasting neighbourhoods.',
  crown7: 'A seven-vertex crown for exploring overlapping neighbourhoods and quotient classes.',
  disjoint_triangles: 'Two separate equal-degree triangles. No neighbourhood reaches the other component.',
  triangle3: 'Three mutually connected vertices of equal degree. Compare uphill and strict uphill.',
  edge2: 'One edge between two vertices. Compare the effect of an equal-degree step.',
  empty0: 'An empty graph, with no vertices and just the empty open set.',
  subspace_intermediate: 'A branching tree for comparing inherited subspaces with recomputed induced graphs.',
  joined_triangles: 'Two triangles joined through a path. Explore how degree changes affect passage between them.',
  overlap5: 'A five-vertex overlap example. Select b and d to compare their neighbourhoods.',
  star5: 'Four leaves meet one centre. Select different leaves to see their common destination.',
  path6: 'A six-vertex path. Start at opposite endpoints and compare the reached vertices.',
  diamond8: 'A diamond with attached leaves. Compare the two branches and their shared destinations.',
  disconnected7: 'Two separate paths and an isolated vertex. Neighbourhoods remain inside their components.',
  bowtie5: 'Two triangles share a centre. Select starts on opposite sides to compare their neighbourhoods.',
};

const helpPlainLabel = el => (el.querySelector?.('.control-menu-option-label,.preset-name,.control-menu-label')?.textContent
  || el.getAttribute?.('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
const helpRecord = (key, pair) => pair ? { key, title: pair[0], text: pair[1] } : null;

export function describeControlHelp(el) {
  if (!el?.matches || el.closest(HELP_CHROME_SELECTOR) || el.matches('.control-menu-native')) return null;
  const d = el.dataset, id = el.id || '', label = helpPlainLabel(el);
  if (d.menuId && d.menuValue !== undefined) {
    const text = d.menuId === 'preset' ? HELP_PRESETS[d.menuValue] : HELP_MENU_CHOICES[d.menuId]?.[d.menuValue];
    return text ? { key: `menu:${d.menuId}:${d.menuValue}`, title: label, text } : null;
  }
  if (id.endsWith('-menu-button')) return helpRecord(id.slice(0, -12), HELP_IDS[id.slice(0, -12)]);
  if (HELP_IDS[id]) return helpRecord(id, HELP_IDS[id]);
  if (d.tool) return helpRecord(`tool:${d.tool}`, HELP_TOOLS[d.tool]);
  if (d.viewportAction) {
    const which = id.startsWith('quot-') ? 'quotient' : 'graph';
    const pair = {
      'zoom-in': ['Zoom in', `See the ${which} more closely. Its vertices, relations and sets stay the same.`],
      'zoom-out': ['Zoom out', `See more of the ${which} in the available space.`],
      fit: ['Fit drawing', `Bring the complete ${which} back into view.`],
      pan: ['Pan view', `Turn on Pan, then drag empty space to move the ${which} view. Turn it off to resume selection.`],
      expand: [el.getAttribute('aria-expanded') === 'true' ? 'Close expanded view' : 'Expand view', `Give the ${which} more screen space, or return it to the normal layout.`],
    }[d.viewportAction];
    return helpRecord(`${which}:${d.viewportAction}`, pair);
  }
  if (d.act === 'op') return helpRecord(`op:${d.op}`, HELP_OPS[d.op]);
  if (d.act === 'tab') return helpRecord(`tab:${d.tab}`, [label, HELP_TABS[d.tab]]);
  if (d.act && HELP_ACTS[d.act]) return helpRecord(`act:${d.act}`, HELP_ACTS[d.act]);
  if (d.playground) return helpRecord(`preset:${d.playground}`, [label, HELP_PRESETS[d.playground]]);
  if (d.liveChapter) return helpRecord(`chapter:${d.liveChapter}`, [`${label} chapter`, `Jump to the ${label.toLowerCase()} demonstrations, using a temporary example. Your own experiment is restored when you leave.`]);
  if (d.scene !== undefined && el.closest('#intro-guide')) return helpRecord(`lesson:${d.scene}`, [label, 'Jump directly to this illustrated lesson.']);
  if (el.matches('label.file-action')) return helpRecord('imp', HELP_IDS.imp);
  if (el.matches('summary')) {
    if (el.parentElement.id === 'sets-drawer') return helpRecord('sets-drawer', ['See the exact sets', 'Expand the list of vertices in each coloured neighbourhood.']);
    if (el.parentElement.id === 'edit-drawer') return helpRecord('edit-drawer', ['Edit this graph and drawing', 'Reveal movement, deletion, layout, arrow display and the vertex-selection checkboxes.']);
    return helpRecord('set-members', ['Show all members', 'Expand or collapse the full list of vertices in this set.']);
  }
  return null;
}

export function installControlHelp(doc = document) {
  if (controlHelpInstallations.has(doc)) return controlHelpInstallations.get(doc);
  const win = doc.defaultView;
  const style = doc.createElement('style');
  style.dataset.controlHelpChrome = 'style';
  style.textContent = `
    button.control-help-space{padding-inline-end:38px!important;min-width:76px!important}
    .control-menu-button.control-help-space{padding-inline-end:43px!important}
    #control-help-triggers{position:fixed;inset:0;pointer-events:none;z-index:15010}
    #control-help-triggers [data-control-help-trigger]{position:fixed;display:grid;place-items:center;box-sizing:border-box;width:26px;height:30px;min-width:26px;min-height:30px;margin:0;padding:0;border:1px solid #d4b2f5aa;border-radius:50%;background:#744294aa;color:#fff4d7;font:700 17px/1 system-ui,sans-serif;pointer-events:auto;cursor:help;box-shadow:none;transform:none}
    #control-help-triggers [data-control-help-trigger]:hover{background:#9a54bddd;border-color:#ffe7bc}
    #control-help-triggers [data-control-help-trigger]:focus-visible{outline:3px solid #58e1dc;outline-offset:2px}
    #control-help-triggers [hidden],#control-help-popover[hidden]{display:none!important}
    #control-help-popover{position:fixed;z-index:15020;box-sizing:border-box;width:min(390px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:15px 43px 16px 18px;border:1px solid #d9b5f6cc;border-radius:15px;background:rgba(76,38,106,.93);backdrop-filter:blur(7px);box-shadow:0 12px 30px #16052355;color:#fff4dd;font:400 18px/1.48 system-ui,sans-serif;overflow-wrap:anywhere;pointer-events:auto}
    #control-help-popover [data-help-title]{display:block;margin:0 0 5px;color:#f3d4ff;font-size:19px;line-height:1.3;font-weight:750}
    #control-help-popover [data-help-text]{margin:0;color:inherit;font:inherit}
    #control-help-popover [data-help-close]{position:absolute;right:7px;top:7px;min-width:30px;min-height:30px;width:30px;height:30px;padding:0;border:0;border-radius:50%;background:#fff2;color:#fff4dd;font:24px/1 system-ui;cursor:pointer}
    #control-help-popover [data-help-close]:focus-visible{outline:3px solid #58e1dc}
    @media(prefers-reduced-transparency:reduce){#control-help-popover{background:#4c266a}}
    @media print{#control-help-triggers,#control-help-popover{display:none!important}}
  `;
  doc.head.append(style);
  const triggers = doc.createElement('div'); triggers.id = 'control-help-triggers'; triggers.dataset.controlHelpChrome = 'triggers';
  const popup = doc.createElement('aside'); popup.id = 'control-help-popover'; popup.hidden = true; popup.dataset.controlHelpChrome = 'popover';
  popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-modal', 'false'); popup.setAttribute('aria-labelledby', 'control-help-title');
  popup.innerHTML = '<strong id="control-help-title" data-help-title></strong><p id="control-help-text" data-help-text></p><button type="button" data-help-close aria-label="Close this explanation">×</button>';
  doc.body.append(triggers, popup);
  const title = popup.querySelector('[data-help-title]'), body = popup.querySelector('[data-help-text]');
  const entries = new Map(), byElement = new WeakMap();
  let nextToken = 0, frame = 0, closeTimer = 0, active = null, pinned = false, source = null, refreshNeeded = true, suppressFocusHelp = false;

  function contains(target) { return Boolean(target?.closest?.(HELP_CHROME_SELECTOR)); }
  function owner(target) {
    const trigger = target?.closest?.('[data-control-help-trigger]');
    if (trigger) return entries.get(trigger.dataset.helpFor)?.el || null;
    return target?.closest?.('[data-control-help]') || null;
  }
  function visibleRect(el, context) {
    if (!el.isConnected || el.closest('[hidden],[inert]')) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.bottom <= 0 || rect.top >= win.innerHeight || rect.right <= 0 || rect.left >= win.innerWidth) return null;
    const modal = context ? context.modal : doc.querySelector('dialog[open]');
    if (modal && !modal.contains(el)) return null;
    const list = el.closest('.control-menu-list,#preset-fan-list,.table-wrap');
    if (list) {
      let clip = context?.clips.get(list);
      if (!clip) { clip = list.getBoundingClientRect(); context?.clips.set(list, clip); }
      if (rect.bottom <= clip.top || rect.top >= clip.bottom || rect.left >= clip.right || rect.right <= clip.left) return null;
    }
    return rect;
  }
  function portalParent() {
    const parent = doc.querySelector('dialog[open]') || doc.querySelector('.viewport-expanded') || doc.body;
    if (triggers.parentElement !== parent) parent.append(triggers, popup);
    // Expanded panes temporarily mark their former siblings inert. Our own
    // chrome moves into the active pane, so it must regain interaction there.
    if (triggers.inert) triggers.inert = false;
    if (popup.inert) popup.inert = false;
  }
  function associate(el, on) {
    const tokens = new Set((el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    on ? tokens.add('control-help-text') : tokens.delete('control-help-text');
    const value = [...tokens].join(' ');
    if (value && el.getAttribute('aria-describedby') !== value) el.setAttribute('aria-describedby', value);
    else if (!value && el.hasAttribute('aria-describedby')) el.removeAttribute('aria-describedby');
  }
  function placePopup() {
    if (popup.hidden || !active) return;
    const rect = visibleRect(active);
    if (!rect) { hide('hidden-control'); return; }
    const width = popup.offsetWidth, height = popup.offsetHeight, gap = 12, margin = 12;
    const clampX = x => Math.max(margin, Math.min(x, win.innerWidth - width - margin));
    const clampY = y => Math.max(margin, Math.min(y, win.innerHeight - height - margin));
    const x = clampX(rect.left + rect.width / 2 - width / 2);
    const candidates = [
      ['above', x, rect.top - height - gap], ['below', x, rect.bottom + gap],
      ['right', rect.right + gap, rect.top], ['left', rect.left - width - gap, rect.top],
      ['top', win.innerWidth - width - margin, margin], ['top-left', margin, margin],
    ];
    const obstacles = [...doc.querySelectorAll('#graph svg,#quot svg,.control-menu-list:not([hidden]),#preset-fan-list:not([hidden]),#live-tour:not([hidden]) .live-tour-bar')]
      .filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect());
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const ranked = candidates.map(([placement, left, top], index) => {
      const finalLeft = clampX(left), finalTop = clampY(top), box = { left: finalLeft, top: finalTop, right: finalLeft + width, bottom: finalTop + height };
      const score = overlap(box, rect) * 10 + obstacles.reduce((sum, item) => sum + overlap(box, item), 0)
        + (Math.abs(finalLeft - left) + Math.abs(finalTop - top)) * 30 + index;
      return { placement, left: finalLeft, top: finalTop, score };
    }).sort((a, b) => a.score - b.score);
    const best = ranked[0], left = `${best.left}px`, top = `${best.top}px`;
    if (popup.style.left !== left) popup.style.left = left;
    if (popup.style.top !== top) popup.style.top = top;
    if (popup.dataset.placement !== best.placement) popup.dataset.placement = best.placement;
  }
  function showFor(el, textOverride, options = {}) {
    if (typeof el === 'string') el = doc.querySelector(el);
    if (el?.matches?.('[data-control-help-trigger]')) el = owner(el);
    if (!el || !visibleRect(el)) return false;
    const descriptor = describeControlHelp(el);
    if (!descriptor && !textOverride) return false;
    const requestedSource = options.source || 'tour';
    if (pinned && requestedSource === 'tour') return true;
    clearTimeout(closeTimer);
    if (active && active !== el) associate(active, false);
    active = el; source = requestedSource; pinned = requestedSource === 'question';
    const nextTitle = descriptor?.title || helpPlainLabel(el) || 'About this control', nextText = textOverride || descriptor.text;
    if (title.textContent !== nextTitle) title.textContent = nextTitle;
    if (body.textContent !== nextText) body.textContent = nextText;
    const data = { helpKey: descriptor?.key || 'demonstration', source, helpFor: byElement.get(el)?.token || el.dataset.helpToken || '' };
    for (const [name, value] of Object.entries(data)) if (popup.dataset[name] !== value) popup.dataset[name] = value;
    if (popup.hidden) popup.hidden = false;
    associate(el, true); portalParent(); placePopup();
    return true;
  }
  function hide(reason = 'dismiss') {
    clearTimeout(closeTimer);
    if (active) associate(active, false);
    for (const { trigger } of entries.values()) trigger?.setAttribute('aria-expanded', 'false');
    popup.hidden = true; popup.dataset.dismissReason = reason; active = null; source = null; pinned = false;
  }
  function dismissQuestion(reason) {
    const returnTo = active; hide(reason);
    // Restore the real control's keyboard route without immediately reopening
    // its passive focus help. A subsequent Escape can then close its menu.
    if (returnTo?.isConnected && !returnTo.disabled) {
      suppressFocusHelp = true;
      try { returnTo.focus({ preventScroll: true }); } finally { suppressFocusHelp = false; }
    }
  }
  function scheduleHide() {
    if (pinned || source === 'tour') return;
    clearTimeout(closeTimer);
    closeTimer = win.setTimeout(() => { if (!popup.matches(':hover') && !popup.contains(doc.activeElement)) hide('leave'); }, 160);
  }
  function wantsTrigger(el) {
    return el.matches('button') && !el.matches('.table-link,[data-act="tab"],.intro-dot')
      && !el.closest('#live-tour,.intro-playback,.intro-navigation,.intro-top');
  }
  function refresh() {
    refreshNeeded = false;
    for (const [token, entry] of entries) if (!entry.el.isConnected) {
      entry.trigger?.remove(); entries.delete(token); if (active === entry.el) hide('removed-control');
    }
    for (const el of doc.querySelectorAll(HELP_CONTROL_SELECTOR)) {
      const descriptor = describeControlHelp(el); if (!descriptor?.text) continue;
      el.dataset.controlHelp = descriptor.key;
      let entry = byElement.get(el);
      if (!entry) {
        const token = `help-${++nextToken}`;
        entry = { el, token, trigger: null, wantsTrigger: wantsTrigger(el) };
        byElement.set(el, entry); entries.set(token, entry); el.dataset.helpToken = token;
        // Reserve the space immediately, so scrolling a new row into view
        // never changes its layout when its independent question appears.
        if (entry.wantsTrigger) el.classList.add('control-help-space');
      }
      entry.label = `Explain: ${descriptor.title}`;
      if (entry.trigger && entry.trigger.getAttribute('aria-label') !== entry.label) entry.trigger.setAttribute('aria-label', entry.label);
    }
    positionAll();
  }
  function positionAll() {
    portalParent();
    const context = { modal: doc.querySelector('dialog[open]'), clips: new Map() }, positions = [];
    // Read all geometry before changing any positioned buttons. Large open-set
    // lists must not pay for a fresh layout between every read and write.
    for (const entry of entries.values()) {
      if (!entry.wantsTrigger) continue;
      const { el } = entry, rect = visibleRect(el, context);
      const position = { entry, hidden: !rect, left: null, top: null };
      if (rect) {
        const top = rect.top + (rect.height - 30) / 2, left = rect.right - 33;
        // A clipped row must not leave an unrelated floating question mark.
        const list = el.closest('.control-menu-list,#preset-fan-list');
        const clip = list ? context.clips.get(list) : null;
        position.hidden = Boolean(top < 0 || top + 30 > win.innerHeight || (clip && (top < clip.top || top + 30 > clip.bottom)));
        if (!position.hidden) {
          const front = doc.elementsFromPoint(left + 13, top + 15).find(item => !contains(item));
          if (!front || !el.contains(front)) position.hidden = true;
        }
        position.left = `${left}px`; position.top = `${top}px`;
      }
      positions.push(position);
    }
    for (const { entry, hidden, left, top } of positions) {
      // Offscreen controls already have hover/focus descriptions and padding.
      // Create their visible question only when scrolling first reveals them.
      if (!entry.trigger && !hidden) {
        const trigger = doc.createElement('button'); trigger.type = 'button'; trigger.textContent = '?';
        trigger.dataset.controlHelpTrigger = entry.token; trigger.dataset.helpFor = entry.token;
        trigger.setAttribute('aria-controls', popup.id); trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-label', entry.label); trigger.hidden = true;
        entry.trigger = trigger; triggers.append(trigger);
      }
      const trigger = entry.trigger;
      if (!trigger) continue;
      if (trigger.hidden !== hidden) trigger.hidden = hidden;
      if (left !== null && trigger.style.left !== left) trigger.style.left = left;
      if (top !== null && trigger.style.top !== top) trigger.style.top = top;
    }
    placePopup();
  }
  function schedule(needsRefresh = false) {
    refreshNeeded ||= needsRefresh;
    if (!frame) frame = win.requestAnimationFrame(() => { frame = 0; refreshNeeded ? refresh() : positionAll(); });
  }
  doc.addEventListener('pointerover', event => {
    if (popup.contains(event.target)) { clearTimeout(closeTimer); return; }
    if (event.pointerType === 'touch' || pinned) return;
    const el = owner(event.target); if (!el || el === owner(event.relatedTarget)) return;
    if (doc.querySelector('#live-tour[data-active="true"]') && source === 'tour') return;
    showFor(el, null, { source: 'hover' });
  });
  doc.addEventListener('pointerout', event => {
    if (popup.contains(event.relatedTarget) || owner(event.relatedTarget) === active) return;
    if (owner(event.target) === active || popup.contains(event.target)) scheduleHide();
  });
  doc.addEventListener('focusin', event => {
    if (suppressFocusHelp || popup.contains(event.target)) return;
    const el = owner(event.target);
    if (el) showFor(el, null, { source: event.target.matches?.('[data-control-help-trigger]') ? 'question' : 'focus' });
  });
  doc.addEventListener('focusout', event => {
    if (popup.contains(event.relatedTarget) || owner(event.relatedTarget) === active) return;
    scheduleHide();
  });
  doc.addEventListener('pointerdown', event => {
    if (!popup.hidden && !contains(event.target) && owner(event.target) !== active) hide('outside');
  }, true);
  doc.addEventListener('click', event => {
    const trigger = event.target.closest?.('[data-control-help-trigger]');
    if (trigger) {
      event.preventDefault(); event.stopPropagation(); const el = owner(trigger);
      showFor(el, null, { source: 'question' }); trigger.setAttribute('aria-expanded', 'true'); trigger.focus({ preventScroll: true });
    } else if (event.target.closest?.('[data-help-close]')) {
      event.preventDefault(); event.stopPropagation(); dismissQuestion('close');
    }
  }, true);
  win.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popup.hidden) {
      const explicitExplanation = source === 'question';
      explicitExplanation ? dismissQuestion('escape') : hide('escape');
      // Passive help accompanies the control's own Escape action. Only an
      // explicitly opened question/F1 explanation owns the first Escape.
      if (explicitExplanation) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    if (event.key === 'F1' && owner(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); showFor(owner(event.target), null, { source: 'question' }); }
  }, true);
  doc.addEventListener('scroll', () => schedule(), true); win.addEventListener('resize', () => schedule());
  const observer = new win.MutationObserver(records => {
    if (records.some(record => !record.target.closest?.('[data-control-help-chrome]')
      && (record.type === 'attributes' || record.target.closest?.(HELP_CONTROL_SELECTOR)
        || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1
          && (node.matches?.(HELP_CONTROL_SELECTOR) || node.querySelector?.(HELP_CONTROL_SELECTOR)))))) schedule(true);
  });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'aria-expanded', 'data-workspace'] });
  if (win.ResizeObserver) { const resize = new win.ResizeObserver(() => schedule()); resize.observe(doc.body); }
  const api = { showFor, hide, refresh, describe: describeControlHelp, contains };
  controlHelpInstallations.set(doc, api); refresh(); return api;
}
