// A visual, disposable demonstration. Watching never edits the live experiment.
import { validateGraph } from '../kernel/graph.js';
import { buildTopologyModel } from '../kernel/topology.js';

export function installIntroGuide({ getState, onTry } = {}) {
  // Optional detailed lessons complement the automatic in-place introduction.
  // OS reduced motion removes decoration, not the timed explanatory steps.
  const introReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const introGraph = ids => {
    const result = validateGraph({ nodes: ids.map(id => ({ id })),
      edges: ids.slice(1).map((id, i) => ({ source: ids[i], target: id })) });
    if (!result.ok) throw new Error(result.errors.join('; '));
    return result.graph;
  };
  const introPath = introGraph(['a', 'b', 'c']);
  const introPlateau = introGraph(['a', 'b', 'c', 'd']);
  const introModel = buildTopologyModel(introPath, 'uphill', 'incident-edges');
  const introModes = ['uphill', 'strict', 'weak-patch'].map(mode =>
    buildTopologyModel(introPlateau, mode, 'incident-edges'));
  const introSets = {
    a: introModel.topo.ids(introModel.topo.N[0]),
    c: introModel.topo.ids(introModel.topo.N[2]),
    intersection: introModel.topo.ids(introModel.topo.N[0]).filter(id =>
      introModel.topo.ids(introModel.topo.N[2]).includes(id)),
  };
  const introScenes = [
    ['First, count the edges', 'Degree means the number of edges touching a vertex.'],
    ['Follow the uphill arrows', 'An uphill step goes to an equal or higher degree; it never goes lower.'],
    ['Click a. See its whole open set.', 'The pink ring marks your click; wine fills the smallest open neighbourhood: {a, b}.'],
    ['Click c to compare two sets', 'The rings mark your two clicks; purple means the vertex belongs to both neighbourhoods.'],
    ['The same click, three rules', 'Start at a in every graph; only the topology rule changes.'],
    ['Is your selected set open?', 'Selecting a alone misses b; adding b includes the whole neighbourhood and makes the selection open.'],
  ];
  const introStyle = document.createElement('style');
  introStyle.id = 'intro-guide-style';
  introStyle.textContent = `
    #intro-guide{--intro-wine:#a33163;--intro-purple:#9163d4;--intro-teal:#159aa6;--intro-pink:#f469ad;
      width:min(1040px,calc(100vw - 28px));max-width:calc(100vw - 28px);max-height:calc(100dvh - 28px);padding:0;border:1px solid #3d325e;
      border-radius:25px;background:linear-gradient(145deg,#11172d,#100f23);color:#f2eaff;box-shadow:0 28px 100px #08031199;overflow:auto}
    #intro-guide::backdrop{background:#2c1a3f6b;backdrop-filter:blur(5px)}
    #intro-guide[data-tour-preview="true"]{position:fixed;inset:14px 0 auto;margin:0 auto;z-index:8100}
    #intro-guide *{box-sizing:border-box}
    #intro-guide button{font:inherit;font-size:18px;cursor:pointer;line-height:1.25;border:1px solid #dfd1e5;border-radius:12px;
      background:#20243e;color:#e0cef3;padding:12px 19px;min-height:48px;transition:background .18s,transform .18s;border-color:#544568}
    #intro-guide button:hover{background:#302747;transform:translateY(-1px)}
    #intro-guide button:focus-visible{outline:3px solid #4adeeb;outline-offset:3px}
    #intro-guide button:disabled{opacity:.42;cursor:default;transform:none}
    #intro-guide .intro-primary{background:linear-gradient(115deg,#a33163,#7852b0);color:#fff;border-color:transparent;font-weight:700}
    #intro-guide .intro-primary:hover{background:linear-gradient(115deg,#b94175,#8964c1)}
    #intro-guide .intro-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:19px 24px 0}
    #intro-guide .intro-eyebrow{font-size:16px;text-transform:uppercase;letter-spacing:.08em;color:#bda4d9;font-weight:750}
    #intro-guide .intro-close{border:0;background:transparent;padding:8px 12px;font-size:18px}
    #intro-guide .intro-heading{text-align:center;padding:11px 30px 0}
    #intro-guide h2{font-size:clamp(26px,3.7vw,38px);letter-spacing:-.025em;line-height:1.18;color:#f8edf9;margin:6px 0 12px}
    #intro-guide .intro-sentence{margin:0 auto;max-width:890px;font-size:20px;line-height:1.5;color:#d5c6e8;min-height:60px}
    #intro-guide .intro-stage{position:relative;margin:12px 22px 0;border-radius:21px;min-height:350px;overflow:hidden;
      background:radial-gradient(ellipse at 18% 65%,#b92a6236,transparent 55%),radial-gradient(ellipse at 85% 25%,#10b1be22,transparent 55%),#0a0e1a;
      border:1px solid #2b2848}
    #intro-guide .intro-canvas{width:100%;height:286px;display:block;overflow:visible}
    #intro-guide .intro-canvas text{font-family:inherit}
    #intro-guide .intro-edge{stroke:#645879;stroke-width:6;stroke-linecap:round}
    #intro-guide .intro-edge.intro-counted{stroke:#f58bbb;stroke-width:10}
    #intro-guide .intro-arc{stroke:#ba8af5;stroke-width:5;fill:none;stroke-linecap:round;stroke-dasharray:440;animation:intro-draw 1.3s ease both}
    #intro-guide .intro-vertex{stroke:#8e7aab;stroke-width:2.5;fill:#1b1d34;transition:fill .65s,stroke .65s}
    #intro-guide .intro-label{font-size:36px;font-weight:750;fill:#f3e8ff;dominant-baseline:central;text-anchor:middle}
    #intro-guide .intro-degree{font-size:30px;font-weight:650;fill:#d8c7eb;text-anchor:middle}
    #intro-guide .intro-start{font-size:30px;font-weight:750;fill:#ffadd2;text-anchor:middle}
    #intro-guide .intro-coloured .intro-label{fill:#fff}
    #intro-guide .intro-selected{stroke:#fa81bf;stroke-width:5;fill:none}
    #intro-guide .intro-pulse{fill:none;stroke:#f36eac;stroke-width:3;transform-box:fill-box;transform-origin:center;animation:intro-pulse 1.9s ease-out infinite}
    #intro-guide .intro-traveller{fill:var(--intro-pink);stroke:#fff;stroke-width:2;animation:intro-travel 2.6s ease-in-out infinite}
    #intro-guide .intro-traveller.intro-reverse{animation-name:intro-travel-reverse;animation-delay:.35s}
    #intro-guide .intro-math{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 12px 13px}
    #intro-guide .intro-pill{font-size:19px;font-weight:650;border:1px solid #41334f;background:#141c2e;border-radius:999px;padding:9px 15px;color:#e1d2f1}
    #intro-guide .intro-wine{color:#ff9fc8;border-color:#68334f;background:#a3316326}
    #intro-guide .intro-purple{color:#d4b2ff;border-color:#604483;background:#9163d426}
    #intro-guide .intro-teal{color:#60e1e9;border-color:#28545c;background:#159aa626}
    #intro-guide .intro-mode-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:17px 14px}
    #intro-guide .intro-mode-card{min-width:0;background:#17182bba;border:1px solid #41304f;border-radius:15px;text-align:center;overflow:hidden}
    #intro-guide .intro-mode-card h3{font-size:21px;margin:14px 0 0;color:#e6c8ff}
    #intro-guide .intro-mode-card .intro-canvas{height:220px}
    #intro-guide .intro-mode-card .intro-math{font-size:18px;padding:0 4px 11px;min-height:42px}
    #intro-guide .intro-mode-rule{margin:0;padding:4px 12px 14px;font-size:17px;line-height:1.35;color:#d5c5e4}
    #intro-guide .intro-caption{margin:0;text-align:center;padding:0 16px 17px;font-size:17px;color:#c4b0d7}
    #intro-guide .intro-footer{padding:18px 24px 23px}
    #intro-guide .intro-progress{display:flex;justify-content:center;gap:8px;margin:0 0 17px}
    #intro-guide .intro-dot{min-height:40px;width:40px;padding:0;border:0;background:transparent;border-radius:100%;position:relative}
    #intro-guide .intro-dot::after{content:'';position:absolute;width:11px;height:11px;top:14px;left:14px;border-radius:100%;background:#766085}
    #intro-guide .intro-dot[aria-current=step]::after{background:#c398fa;box-shadow:0 0 0 4px #c398fa25}
    #intro-guide .intro-actions{display:flex;justify-content:space-between;align-items:center;gap:12px}
    #intro-guide .intro-navigation,#intro-guide .intro-playback{display:flex;gap:8px;align-items:center}
    #intro-guide .intro-playback button{font-size:18px;background:#262138;border-color:#544568;padding:12px 16px}
    #intro-guide .intro-safe-note{text-align:center;font-size:16px;color:#c2b2d1;margin:13px 0 0}
    #intro-guide .intro-open-boundary{stroke:#ea76ac;stroke-width:2.5;stroke-dasharray:8 5;fill:#a331631c;transition:all .6s}
    #intro-guide .intro-cursor{fill:#f5dafa;stroke:#201126;stroke-width:1.7;filter:drop-shadow(0 3px 5px #0009);animation:intro-cursor 3.7s ease infinite}
    #intro-guide.intro-paused *,#intro-guide.intro-paused *::before,#intro-guide.intro-paused *::after{animation-play-state:paused!important}
    @keyframes intro-draw{from{stroke-dashoffset:440}to{stroke-dashoffset:0}}
    @keyframes intro-pulse{from{opacity:.85;transform:scale(1)}to{opacity:0;transform:scale(1.6)}}
    @keyframes intro-travel{0%,15%{transform:translateX(0);opacity:0}25%{opacity:1}75%{opacity:1}85%,100%{transform:translateX(170px);opacity:0}}
    @keyframes intro-travel-reverse{0%,15%{transform:translateX(0);opacity:0}25%{opacity:1}75%{opacity:1}85%,100%{transform:translateX(-170px);opacity:0}}
    @keyframes intro-cursor{0%{transform:translate(52px,35px);opacity:0}22%,37%{transform:translate(0,0);opacity:1}43%{transform:translate(0,0) scale(.94)}50%,67%{transform:translate(0,0);opacity:1}95%,100%{transform:translate(52px,35px);opacity:0}}
    @media(max-width:560px){#intro-guide{border-radius:18px;width:calc(100vw - 16px);max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}
      #intro-guide .intro-top{padding:12px 14px 0}#intro-guide .intro-heading{padding:5px 16px 0}
      #intro-guide .intro-eyebrow{font-size:16px;letter-spacing:0}#intro-guide .intro-sentence{font-size:18px;min-height:80px}
      #intro-guide .intro-stage{margin:5px 10px 0;min-height:280px}#intro-guide .intro-canvas{height:190px}
      #intro-guide .intro-pill{font-size:17px;padding:7px 10px}#intro-guide .intro-mode-grid{gap:12px;padding:12px 9px;grid-template-columns:1fr}
      #intro-guide .intro-mode-card h3{font-size:21px}#intro-guide .intro-mode-card .intro-canvas{height:220px}
      #intro-guide .intro-mode-card .intro-math{font-size:18px}#intro-guide .intro-mode-card .intro-pill{font-size:18px;padding:8px 12px}
      #intro-guide .intro-footer{padding:12px 13px 16px}
      #intro-guide .intro-progress{margin-bottom:9px}#intro-guide .intro-actions{gap:7px;flex-wrap:wrap}
      #intro-guide .intro-navigation{margin-left:auto}#intro-guide button{padding:10px 14px;font-size:17px}
      #intro-guide .intro-playback button{padding:10px 14px;font-size:17px}#intro-guide .intro-safe-note{font-size:16px}}
    @media(prefers-reduced-motion:reduce){#intro-guide *,#intro-guide *::before,#intro-guide *::after{animation:none!important;transition:none!important}}
  `;
  document.head.append(introStyle);
  const introDialog = document.createElement('dialog');
  introDialog.id = 'intro-guide';
  introDialog.setAttribute('aria-labelledby', 'intro-title');
  introDialog.setAttribute('aria-describedby', 'intro-description');
  introDialog.innerHTML = `<div class="intro-top"><span class="intro-eyebrow">A visual first look · <span id="intro-step-count">1 / 6</span></span><button class="intro-close" id="intro-close" aria-label="Close visual guide">Close ×</button></div>
    <div class="intro-heading"><h2 id="intro-title"></h2><p id="intro-description" class="intro-sentence"></p></div>
    <div id="intro-stage" class="intro-stage"></div>
    <div class="intro-footer"><nav class="intro-progress" aria-label="Guide scenes"></nav>
    <div class="intro-actions"><div class="intro-playback"><button id="intro-play" aria-label="Pause guide">Ⅱ Pause</button><button id="intro-replay" aria-label="Replay guide from beginning">↺ Replay</button></div>
    <div class="intro-navigation"><button id="intro-back">Back</button><button id="intro-next" class="intro-primary">Next →</button><button id="intro-try" class="intro-primary" hidden>Try this graph →</button></div></div>
    <p class="intro-safe-note">Pause at any time. Your own graph stays unchanged while you watch.</p></div>`;
  document.body.append(introDialog);
  const introFind = selector => introDialog.querySelector(selector);
  const introStage = introFind('#intro-stage');
  const introDots = introFind('.intro-progress');
  introScenes.forEach(([title], i) => {
    const button = document.createElement('button');
    button.className = 'intro-dot';
    button.dataset.scene = String(i);
    button.setAttribute('aria-label', `Scene ${i + 1}: ${title}`);
    button.addEventListener('click', () => introGo(i));
    introDots.append(button);
  });
  let introScene = 0, introElapsed = 0, introPhase = -1;
  let introPlaying = true, introTimer = null, introPreviousTick = 0;
  let introReturnFocus = null, introAutoOpen = null;
  const introColours = { wine: '#a33163', purple: '#8354ba', teal: '#14858f' };
  const introSetText = ids => `{${ids.join(', ')}}`;
  const introPill = (text, colour = '') => `<span class="intro-pill${colour ? ` intro-${colour}` : ''}">${text}</span>`;
  const introPoint = (x, y, id, degree, colour, selected = false, pulse = false, startLabel = '') =>
    `<g class="intro-node${colour ? ' intro-coloured' : ''}" data-node="${id}" data-region="${colour || 'outside'}">`
      + (pulse ? `<circle class="intro-pulse" cx="${x}" cy="${y}" r="41"/>` : '')
      + (selected ? `<circle class="intro-selected" cx="${x}" cy="${y}" r="44"/>` : '')
      + (startLabel ? `<text class="intro-start" x="${x}" y="${y - 64}">${startLabel}</text>` : '')
      + `<circle class="intro-vertex" cx="${x}" cy="${y}" r="35"${colour ? ` style="fill:${introColours[colour]};stroke:${introColours[colour]}"` : ''}/>`
      + `<text class="intro-label" x="${x}" y="${y}">${id}</text><text class="intro-degree" x="${x}" y="${y + 79}">Degree: ${degree}</text></g>`;
  const introPathSvg = ({ colours = [], selected = [], arrows = false, travellers = false, pulse = false, boundary = 0, countAt = -1, title = '' } = {}) => {
    const xs = [90, 310, 530], y = 116;
    let svg = `<svg class="intro-canvas" viewBox="0 0 620 230" role="img" aria-label="${title || 'Three-vertex path: a and c have degree 1; b has degree 2.'}"><defs><marker id="intro-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b283ef"/></marker></defs>`;
    if (boundary) svg += `<rect class="intro-open-boundary" x="37" y="59" width="${boundary === 1 ? 106 : 326}" height="114" rx="38"/>`;
    for (const edge of introPath.edges) svg += `<line class="intro-edge${edge.u === countAt || edge.v === countAt ? ' intro-counted' : ''}" x1="${xs[edge.u]}" y1="${y}" x2="${xs[edge.v]}" y2="${y}"/>`;
    if (arrows) for (const [u, v] of introModel.arcs) {
      const sign = Math.sign(xs[v] - xs[u]);
      svg += `<path class="intro-arc" d="M ${xs[u] + sign * 48} ${y} L ${xs[v] - sign * 49} ${y}" marker-end="url(#intro-arrow)"/>`;
    }
    if (travellers && !introReduced.matches) svg += `<circle class="intro-traveller" cx="136" cy="116" r="7"/><circle class="intro-traveller intro-reverse" cx="484" cy="116" r="7"/>`;
    introPath.nodes.forEach((point, i) => {
      const startIndex = selected.indexOf(point.id);
      svg += introPoint(xs[i], y, point.id, introModel.degree[i], colours[i], startIndex >= 0, pulse && startIndex >= 0,
        startIndex >= 0 ? `Start ${startIndex + 1}` : countAt === i ? 'Count here' : '');
    });
    if (pulse && !introReduced.matches) {
      const cursorX = selected.includes('c') ? 545 : 105;
      svg += `<g transform="translate(${cursorX} 135)"><path class="intro-cursor" d="M0 0 L0 29 L7 22 L14 35 L20 32 L13 19 L24 18 Z"/></g>`;
    }
    return svg + '</svg>';
  };
  const introModeCards = () => `<div class="intro-mode-grid">` + introModes.map((model, i) => {
    const names = ['Uphill', 'Strict', 'Weak patch'], coords = [[45, 45], [138, 45], [138, 150], [45, 150]];
    const rules = ['Go higher or stay level.', 'Go strictly higher.', 'Stay in your equal-degree component.'];
    const ids = model.topo.ids(model.topo.N[0]);
    let svg = `<svg class="intro-canvas" viewBox="0 0 190 205" role="img" aria-label="${names[i]}: N(a) = ${introSetText(ids)}. Vertices b and c both have degree 2.">`;
    svg += '<rect x="111" y="16" width="54" height="160" rx="26" fill="#a879dc18" stroke="#866b9f" stroke-dasharray="4 4"/>';
    for (const edge of introPlateau.edges) svg += `<line class="intro-edge" x1="${coords[edge.u][0]}" y1="${coords[edge.u][1]}" x2="${coords[edge.v][0]}" y2="${coords[edge.v][1]}"/>`;
    introPlateau.nodes.forEach((point, j) => {
      const [x, y] = coords[j], inside = !!model.topo.N[0][j];
      svg += `<g data-node="${point.id}" data-in-neighbourhood="${inside}">`
        + (j === 0 ? `<circle cx="${x}" cy="${y}" r="28" fill="none" stroke="#fa81bf" stroke-width="3"/><text x="${x}" y="12" text-anchor="middle" fill="#ffadd2" font-size="18" font-weight="700">Start 1</text>` : '')
        + `<circle cx="${x}" cy="${y}" r="22" fill="${inside ? introColours.wine : '#1b1d34'}" stroke="${inside ? introColours.wine : '#8e7aab'}" stroke-width="2"/>`
        + `<text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" fill="#f3e8ff" font-size="24" font-weight="700">${point.id}</text>`
        + `<text x="${x}" y="${y + 42}" text-anchor="middle" fill="#d8c7eb" font-size="16">Degree: ${model.degree[j]}</text></g>`;
    });
    return `<section class="intro-mode-card" data-intro-mode="${model.mode}"><h3>${names[i]}</h3>${svg}</svg><div class="intro-math">${introPill(`N(a) = ${introSetText(ids)}`, 'wine')}</div><p class="intro-mode-rule">${rules[i]}</p></section>`;
  }).join('') + '</div><p class="intro-caption">Pink ring = clicked vertex · wine = its whole smallest open neighbourhood.</p>';
  const introCurrentPhase = () => Math.min(2, Math.floor(introElapsed / (introScene === 0 ? 800 : 1600)));
  function introDraw() {
    introPhase = introCurrentPhase();
    introDialog.dataset.scene = String(introScene);
    introDialog.dataset.phase = String(introPhase);
    let drawing = '', math = '';
    if (introScene === 0) {
      const counting = introPhase;
      const vertex = introPath.nodes[counting].id, degree = introModel.degree[counting];
      drawing = introPathSvg({ countAt: counting });
      math = introPill(`${vertex}: ${degree} touching ${degree === 1 ? 'edge' : 'edges'}`, 'wine')
        + introPill(`Degree of ${vertex} = ${degree}`, 'purple');
    } else if (introScene === 1) {
      drawing = introPathSvg({ arrows: true, travellers: true });
      math = introPill('a → b ← c', 'purple') + introPill('degree never decreases');
    } else if (introScene === 2) {
      const lit = introPhase === 0 ? ['a'] : introSets.a;
      drawing = introPathSvg({ colours: introPath.nodes.map(p => lit.includes(p.id) ? 'wine' : ''), selected: ['a'], arrows: true, pulse: true,
        title: `Smallest open neighbourhood of a: ${introSetText(introSets.a)}.` });
      math = introPill('You clicked: {a}') + introPill(`Whole open neighbourhood N(a) = ${introSetText(introSets.a)}`, 'wine');
    } else if (introScene === 3) {
      const colours = introPath.nodes.map(p => {
        const a = introSets.a.includes(p.id), c = introPhase > 0 && introSets.c.includes(p.id);
        return a && c ? 'purple' : a ? 'wine' : c ? 'teal' : '';
      });
      drawing = introPathSvg({ colours, selected: ['a', 'c'], pulse: true, title: 'Wine: a only. Turquoise: c only. Purple intersection: b.' });
      math = introPill('You clicked: {a, c}') + introPill(`Start 1: N(a) = ${introSetText(introSets.a)}`, 'wine')
        + introPill(`Start 2: N(c) = ${introSetText(introSets.c)}`, 'teal')
        + introPill(`Both sets share ${introSetText(introSets.intersection)}`, 'purple');
    } else if (introScene === 4) {
      drawing = introModeCards();
    } else {
      const initial = introModel.topo.setFromIds(['a']);
      const enlarged = introModel.topo.analyze(initial).enlarge;
      const A = introPhase === 0 ? initial : enlarged;
      const ids = introModel.topo.ids(A), open = introModel.topo.isOpen(A);
      drawing = introPathSvg({ colours: introPath.nodes.map((_, i) => A[i] ? 'wine' : ''), arrows: true, boundary: open ? 2 : 1,
        title: `A = ${introSetText(ids)} is ${open ? '' : 'not '}open: ${open ? 'every selected vertex has its whole neighbourhood inside A' : 'a can reach b outside A'}.` });
      math = introPill(`Your selection A = ${introSetText(ids)}`, 'wine')
        + introPill(open ? 'Open ✓ No reachable vertex is missing' : 'Not open: b is missing from your selection', open ? 'teal' : 'purple');
    }
    introStage.innerHTML = drawing + (math ? `<div class="intro-math" aria-live="off">${math}</div>` : '');
  }
  function introPlayback() {
    introDialog.classList.toggle('intro-paused', !introPlaying);
    introFind('#intro-play').textContent = introPlaying ? 'Ⅱ Pause' : '▶ Play';
    introFind('#intro-play').setAttribute('aria-label', introPlaying ? 'Pause guide' : 'Play guide');
    introDialog.dataset.playing = String(introPlaying);
  }
  function introGo(index) {
    introScene = Math.max(0, Math.min(introScenes.length - 1, index));
    introElapsed = 0;
    introPreviousTick = performance.now();
    introFind('#intro-title').textContent = introScenes[introScene][0];
    introFind('#intro-description').textContent = introScenes[introScene][1];
    introFind('#intro-step-count').textContent = `${introScene + 1} / ${introScenes.length}`;
    introFind('#intro-back').disabled = introScene === 0;
    introFind('#intro-next').hidden = introScene === introScenes.length - 1;
    introFind('#intro-try').hidden = introScene !== introScenes.length - 1;
    if (introDialog.open && introDialog.contains(document.activeElement)
      && (document.activeElement.hidden || document.activeElement.disabled)) {
      introFind(introScene === introScenes.length - 1 ? '#intro-try' : '#intro-next').focus();
    }
    introDots.querySelectorAll('button').forEach((button, i) => {
      if (i === introScene) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    introDraw();
    introPlayback();
  }
  function introTick() {
    if (!introDialog.open) return;
    const now = performance.now();
    if (introPlaying && !document.hidden) {
      introElapsed += Math.min(500, now - introPreviousTick);
      if (introCurrentPhase() !== introPhase) {
        // Only a changed mathematical picture needs a new SVG. Replacing an
        // unchanged picture would restart its cursor and path animations.
        if (introScene === 0 || ([2, 3, 5].includes(introScene) && introPhase === 0)) introDraw();
        else { introPhase = introCurrentPhase(); introDialog.dataset.phase = String(introPhase); }
      }
      if (introElapsed >= 7600) {
        if (introScene < introScenes.length - 1) introGo(introScene + 1);
        else { introPlaying = false; introPlayback(); }
      }
    }
    introPreviousTick = now;
    introTimer = window.setTimeout(introTick, 100);
  }
  function introOpen(options = {}) {
    if (introDialog.open) return;
    clearTimeout(introAutoOpen);
    introReturnFocus = document.activeElement;
    introPlaying = true;
    introGo(0);
    const preview = options.preview === true;
    introDialog.dataset.tourPreview = String(preview);
    if (preview) introDialog.show(); else introDialog.showModal();
    if (!preview) introFind('#intro-close').focus();
    introPreviousTick = performance.now();
    introTick();
  }
  function introStop() {
    // A close event can arrive after the guide has already been reopened.
    if (introDialog.open) return;
    clearTimeout(introTimer);
    introTimer = null;
    introPlaying = false;
    introPlayback();
    if (introReturnFocus && introReturnFocus.isConnected && typeof introReturnFocus.focus === 'function') introReturnFocus.focus();
  }
  function introClose() {
    clearTimeout(introAutoOpen);
    if (introDialog.open) introDialog.close();
    introStop();
  }
  introFind('#intro-close').addEventListener('click', introClose);
  introDialog.addEventListener('close', introStop);
  introDialog.addEventListener('cancel', () => { clearTimeout(introAutoOpen); });
  introDialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = [...introDialog.querySelectorAll('button')]
      .filter(button => !button.disabled && !button.hidden && button.getClientRects().length);
    const first = buttons[0], last = buttons[buttons.length - 1];
    const active = document.activeElement;
    if (!first) return;
    if (!buttons.includes(active) || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  introFind('#intro-next').addEventListener('click', () => introGo(introScene + 1));
  introFind('#intro-back').addEventListener('click', () => introGo(introScene - 1));
  introFind('#intro-play').addEventListener('click', () => {
    introPlaying = !introPlaying;
    if (introPlaying && introScene === introScenes.length - 1 && introElapsed >= 7600) introGo(0);
    introPreviousTick = performance.now();
    introPlayback();
  });
  introFind('#intro-replay').addEventListener('click', () => { introPlaying = true; introGo(0); });
  introFind('#intro-try').addEventListener('click', () => {
    introClose();
    if (typeof onTry === 'function') onTry('path3', ['a', 'c'], 'uphill');
  });
  introReduced.addEventListener('change', () => {
    if (introDialog.open) { introDraw(); introPlayback(); }
  });
  let introWatch = document.querySelector('#open-lessons');
  if (!introWatch) {
    introWatch = document.createElement('button');
    introWatch.id = 'open-lessons';
    introWatch.textContent = 'Visual lessons';
    (document.querySelector('header') || document.body).append(introWatch);
  }
  introWatch.addEventListener('click', introOpen);
  return { open: introOpen, close: introClose };
}
