// Static figures carry their own presentation and no canvas interaction layers.
// This runs in the browser so XML serialization handles arbitrary inert labels.
const SVG_NS = 'http://www.w3.org/2000/svg';
export const figureCSS = `
svg{font-family:Arial,"Segoe UI",sans-serif;background:white;color:#1c1c1c}
.gsvg .vl{font-size:13px;font-weight:bold}.gsvg .vd{font-size:11px;fill:#333}
.gsvg .leg text{font-size:10px}.qsvg .ql{font-size:12px;font-weight:bold}
.qsvg .qs{font-size:10px;fill:#555}.export-caption{font-size:11px;fill:#333}
text{user-select:text}`;

export const reportCSS = `
body{font:15px/1.5 Arial,"Segoe UI",sans-serif;max-width:1100px;margin:1.5rem auto;padding:0 1rem;color:#1c1c1c}
h1,h2,h3{color:#65208d}table{border-collapse:collapse;max-width:100%;font-size:14px}
td,th{border:1px solid #ddd;padding:.25rem .5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}
svg{display:block;width:100%;height:auto;max-height:900px;margin:1rem 0}
.two,.figures{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.figures>div{min-width:0}
.muted,.carrier{color:#555}.ok{color:#00796b}.err{color:#b3261e}
.neighbourhood-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem;overflow-wrap:anywhere}
.neighbourhood-set{border-left:4px solid;padding:.4rem .6rem;min-width:0}.neighbourhood-set strong,.neighbourhood-set span,.neighbourhood-set small{display:block}.neighbourhood-set small{color:#555;margin-top:.3rem}.neighbourhood-notice,.neighbourhood-instruction{grid-column:1/-1}
.answer,.explain{padding:.6rem;border:1px solid #ddd;border-radius:6px}.answer.yes{background:#e6f6f4}.answer.no{background:#fdeefa}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f6f6;padding:.7rem}
details{margin:1rem 0}summary{cursor:pointer;font-weight:bold}.loaded-opens{overflow-wrap:anywhere}
@media(max-width:700px){.two,.figures,.neighbourhood-summary{grid-template-columns:1fr}}
@media print{details{display:block}svg,table{break-inside:avoid}body{max-width:none}}
${figureCSS}`;

export function staticFigure(markup, options = {}) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.localName !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('Cannot export this figure: expected valid SVG.');
  }
  svg.querySelectorAll('.ehit,script,foreignObject').forEach(node => node.remove());
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || attr.name.startsWith('data-') || attr.name === 'tabindex' || attr.name === 'aria-pressed') node.removeAttribute(attr.name);
    }
    if (node.getAttribute('role') === 'button') node.setAttribute('role', 'group');
  }
  const style = doc.createElementNS(SVG_NS, 'style');
  style.textContent = figureCSS;
  svg.insertBefore(style, svg.firstChild);
  const box = (svg.getAttribute('viewBox') || '0 0 440 440').split(/[ ,]+/).map(Number);
  if (box.length !== 4 || !box.every(Number.isFinite)) throw new Error('Cannot export figure: invalid viewBox.');
  const [x, y, width, height] = box;
  const lines = [
    `${options.mode || ''} · ${options.statistic || ''} · carrier: ${options.carrier || 'vertices'}`,
    ...(options.quotient ? ['Q labels identify classes; v is member count; none / partial / all describes selection in A.'] : []),
    ...(!options.quotient ? ['Edges are undirected; arrowheads illustrate the step rule below.'] : []),
    ...(options.relation ? [options.relation] : []),
  ];
  // Use fixed line wrapping to keep captions readable in narrow standalone views.
  const wrapped = [];
  const lineChars = Math.max(36, Math.floor((width - 24) / 6));
  for (const line of lines) {
    let row = '';
    for (const word of line.split(' ')) {
      if (row && (row + ' ' + word).length > lineChars) { wrapped.push(row); row = ''; }
      row += (row ? ' ' : '') + word;
    }
    if (row) wrapped.push(row);
  }
  const extra = 20 + wrapped.length * 16;
  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height + extra}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height + extra));
  const caption = doc.createElementNS(SVG_NS, 'g');
  caption.setAttribute('class', 'export-caption');
  wrapped.forEach((line, i) => {
    const text = doc.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(x + 10));
    text.setAttribute('y', String(y + height + 16 + i * 16));
    text.textContent = line;
    caption.appendChild(text);
  });
  svg.appendChild(caption);
  const desc = svg.querySelector('desc');
  if (desc) desc.textContent += ' ' + lines.join(' ');
  return new XMLSerializer().serializeToString(svg);
}

const reportEscape = value => String(value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));
const reportSet = ids => ids.length ? '{' + ids.map(reportEscape).join(', ') + '}' : '∅';
const reportCount = count => count?.status === 'exact' ? reportEscape(count.value) + ' (exact)' : 'not computed';

export function subspaceReport(experiment) {
  const comparison = experiment.subspaceComparison;
  if (!comparison) return '<p>No subspace comparison recorded.</p>';
  const selected = reportSet(comparison.selectedVertexIds);
  let html = `<p>Carrier S = ${reportSet(comparison.subspaceVertexIds)}. Ambient A = ${reportSet(experiment.analysis.selectedVertexIds)}; both comparisons analyze A ∩ S = ${selected}. Mode: ${reportEscape(comparison.mode)}; statistic: ${reportEscape(comparison.statistic)}.</p>`;
  html += '<div class="two">';
  for (const [name, context] of [['Inherited topology on S', comparison.inherited], ['Recomputed topology of G[S]', comparison.recomputed]]) {
    const r = context.results, a = r.selection;
    const rows = [
      ['Carrier', reportSet(context.carrierVertexIds)],
      ['Open sets', reportCount(r.openCount)],
      ['Degree convention', reportEscape(context.degreeConvention)],
      ['Degrees', context.carrierVertexIds.map(id => `${reportEscape(id)}=${reportEscape(r.degrees[id])}`).join(', ') || '∅'],
      ['Classes', r.classes.map(reportSet).join(' ') || '∅'],
      ['A ∩ S', reportSet(a.selected)],
      ['Interior', reportSet(a.interior)], ['Closure', reportSet(a.closure)],
      ['Boundary', reportSet(a.boundary)], ['Exterior', reportSet(a.exterior)],
      ['Least open enlargement', reportSet(a.leastOpenEnlargement)],
      ['Open / closed / dense', [a.open, a.closed, a.dense].map(b => b ? 'yes' : 'no').join(' / ')],
    ];
    html += `<div><h3>${name}</h3><table>${rows.map(([key,value]) => `<tr><th>${key}</th><td>${value}</td></tr>`).join('')}</table></div>`;
  }
  return html + '</div><p>The inherited calculation uses N<sub>S</sub>(x) = N<sub>G</sub>(x) ∩ S, so ambient paths may leave S. The induced calculation recomputes degrees from G[S].</p>';
}

export function loadedSetsReport(experiment) {
  const r = experiment.enumeration;
  if (!r) return `<p>No loaded list recorded. Open-set total: ${reportCount(experiment.results.openCount)}.</p>`;
  const complete = r.status === 'complete';
  let html = `<p>${complete ? 'All' : 'Loaded'} ${r.listedCount} open sets; ${complete ? 'complete enumeration' : 'list incomplete'} (status: ${reportEscape(r.status)}). Total: ${reportCount(r.count)}. Display cap: ${reportEscape(r.displayLimit)}.</p>`;
  if (r.limits) html += `<p>Recorded listing budget: ${reportEscape(r.limits.timeBudgetMs)} ms / ${reportEscape(r.limits.stateBudget)} search states. Recorded engine: ${reportEscape(r.engine || 'unspecified')}.</p>`;
  html += '<p>Every loaded entry is included below. Entries use vertex IDs; decimal quotient masks and their class mapping are retained in the experiment JSON.</p><ol class="loaded-opens">';
  for (const raw of r.upsetMasks || []) {
    const mask = BigInt(raw), ids = [];
    r.quotientClasses.forEach((members, i) => { if ((mask >> BigInt(i)) & 1n) ids.push(...members); });
    html += `<li>${reportSet(ids)}</li>`;
  }
  return html + '</ol>';
}
