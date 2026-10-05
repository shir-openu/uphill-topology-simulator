// Deterministic single-file build: dist/index.html
// Kernel modules are concatenated (imports/exports stripped) into one
// <script id="kernel-src"> so the same text runs on the page and inside the
// enumeration worker (Blob URL). The app is appended in its own script.
// No dependencies; `node build.mjs`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writePreservingDistribution } from './tools/preserve_distribution.mjs';

const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = src => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(?=(const|let|function\*?|class|async)\b)/gm, '');

const kernelFiles = ['src/kernel/graph.js', 'src/kernel/topology.js', 'src/kernel/enumeration.js',
  'src/kernel/poset.js', 'src/kernel/serialization.js'];
const kernel = kernelFiles.map(f => `// ---- ${f}\n` + strip(rd(f))).join('\n');

const fx = JSON.parse(rd('fixtures/acceptance_fixtures_spec_v1.json'));
const graphs = Object.fromEntries(fx.fixtures.map(f => [f.id, f.graph]));
const presets = `const FIXTURE_GRAPHS = ${JSON.stringify(graphs)};\n` + strip(rd('src/presets.js'));
const app = '(function(){\n' + presets + '\n' + strip(rd('src/ui/static-export.js'))
  + '\n' + strip(rd('src/ui/exploration.js')) + '\n' + strip(rd('src/ui/graph-viewport.js'))
  + '\n' + strip(rd('src/ui/drawing-layout.js')) + '\n' + strip(rd('src/ui/graph-details.js'))
  + '\n' + strip(rd('src/ui/neighbourhood-colours.js'))
  + '\n' + strip(rd('src/ui/visual-explainer.js')) + '\n' + strip(rd('src/ui/intro-guide.js'))
  + '\n' + strip(rd('src/ui/tour-adapter.js')) + '\n' + strip(rd('src/ui/live-tour.js'))
  + '\n' + strip(rd('src/ui/control-menus.js')) + '\n' + strip(rd('src/ui/preset-fan.js'))
  + '\n' + strip(rd('src/ui/control-help.js'))
  + '\n' + strip(rd('src/ui/app.js')) + '\n})();';

for (const [name, s] of [['kernel', kernel], ['app', app]]) {
  if (/<\/script/i.test(s)) throw new Error(`${name} contains </script`);
  if (/\bimport\s*\(|^\s*import\s/m.test(s)) throw new Error(`${name} still has an import`);
  if (/https?:\/\//.test(s.replace(/\/\/[^\n]*/g, ''))) console.warn(`note: ${name} mentions a URL (check it is not fetched)`);
}
let html = rd('src/ui/index.template.html');
html = html.replace('/*CSS*/', () => rd('src/ui/styles.css'))
  .replace('/*KERNEL*/', () => kernel)
  .replace('/*APP*/', () => app);
const saved = writePreservingDistribution(fileURLToPath(new URL('dist/index.html', import.meta.url)),
  fileURLToPath(new URL('versions/', import.meta.url)), html);
if (saved.archived) console.log(`Previous version preserved: ${saved.archived}`);
console.log(`dist/index.html ${saved.changed ? 'written' : 'unchanged'}: ${Buffer.byteLength(html, 'utf8')} bytes`);
