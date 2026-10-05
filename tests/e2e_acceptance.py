# -*- coding: utf-8 -*-
"""End-to-end acceptance run (spec section 18) on the BUILT dist/index.html,
in headless Chrome with the network switched OFF before the page loads.

Drives the page through the same controls a user has (select changes,
buttons, checkboxes) where practical, and through window.__uphill hooks for
reading state. Writes tests/e2e_results_current.json and tests/shots_current/.
On the guided release, visible UI controls first expose Workbench/Bright and
load the historical square fixture. e2e_guided.py tests the untouched default.

    python tests/e2e_acceptance.py
"""
import argparse, base64, hashlib, json, os, platform, shutil, socket, subprocess, sys, tempfile, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import websocket

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PAGE = Path(ROOT, 'dist', 'index.html').as_uri()
SHOTS = os.path.join(HERE, 'shots_current')
OUTPUT = os.path.join(HERE, 'e2e_results_current.json')


def chrome_path(value=None):
    candidates = [value, os.environ.get('UPHILL_CHROME'), os.environ.get('CHROME_PATH'),
                  r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                  r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    for name in ('google-chrome', 'chromium', 'chromium-browser', 'chrome', 'msedge'):
        candidate = shutil.which(name)
        if candidate:
            return candidate
    raise RuntimeError('No installed Chrome/Chromium found; set UPHILL_CHROME or use --chrome PATH.')


STARTUP_OBSERVERS = r"""
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__errs.push(String(e.reason)));
window.__workerCreated = 0;
window.__workerMessages = 0;
const NativeWorker = window.Worker;
window.Worker = function (...args) {
  const worker = new NativeWorker(...args);
  window.__workerCreated++;
  worker.addEventListener('message', () => window.__workerMessages++);
  return worker;
};
"""


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


class CDP:
    def __init__(self, ws):
        self.url = ws
        self.ws = websocket.create_connection(ws, timeout=60, suppress_origin=True)
        self.i = 0; self.events = []

    def call(self, method, **params):
        self.i += 1; mid = self.i
        self.ws.send(json.dumps({'id': mid, 'method': method, 'params': params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == mid:
                if 'error' in m: raise RuntimeError(m['error'])
                return m.get('result', {})
            self.events.append(m)

    def js(self, expr, await_promise=False):
        r = self.call('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=await_promise, userGesture=True)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'])[:600])
        return r['result'].get('value')

    def shot(self, name):
        os.makedirs(SHOTS, exist_ok=True)
        d = self.call('Page.captureScreenshot', format='png')['data']
        open(os.path.join(SHOTS, name + '.png'), 'wb').write(base64.b64decode(d))


class Browser:
    """Launch installed Chromium; attach all observers before first file navigation."""
    def __init__(self, chrome=None, fallback=False, download_dir=None, guided=False, reduced_motion=None):
        self.chrome = chrome_path(chrome)
        self.fallback = fallback
        self.download_dir = download_dir
        self.guided = guided
        self.reduced_motion = reduced_motion

    def __enter__(self):
        port = free_port()
        self.prof = tempfile.mkdtemp(prefix='uphill_e2e_')
        default_profile = Path(self.prof, 'Default')
        default_profile.mkdir()
        Path(default_profile, 'Preferences').write_text(json.dumps({
            'profile': {'default_content_setting_values': {'automatic_downloads': 1}}
        }), encoding='utf-8')
        self.proc = subprocess.Popen([self.chrome, '--headless=new', '--disable-gpu', f'--remote-debugging-port={port}',
                                     '--remote-allow-origins=*', f'--user-data-dir={self.prof}', '--window-size=1400,1100',
                                     '--no-first-run', '--no-default-browser-check', '--do-not-de-elevate',
                                     '--disable-component-update', '--disable-background-networking', '--disable-extensions',
                                     'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        tab = None
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json', timeout=0.5))
                tab = [t for t in tabs if t['type'] == 'page'][0]; break
            except Exception:
                time.sleep(0.2)
        if tab is None:
            self.proc.kill()
            raise RuntimeError('Browser debugging endpoint did not start.')
        c = CDP(tab['webSocketDebuggerUrl'])
        self.c = c
        c.call('Network.enable'); c.call('Page.enable'); c.call('Runtime.enable')
        c.call('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
        observer = STARTUP_OBSERVERS
        if self.fallback:
            observer += "window.Worker = function () { throw new Error('Forced browser-test worker fallback'); };"
        c.call('Page.addScriptToEvaluateOnNewDocument', source=observer)
        if self.reduced_motion is not None:
            c.call('Emulation.setEmulatedMedia', features=[{
                'name': 'prefers-reduced-motion',
                'value': 'reduce' if self.reduced_motion else 'no-preference'
            }])
        if self.download_dir:
            os.makedirs(self.download_dir, exist_ok=True)
            c.call('Browser.setDownloadBehavior', behavior='allow', downloadPath=os.path.abspath(self.download_dir), eventsEnabled=True)
        c.call('Page.navigate', url=PAGE)
        for _ in range(200):
            if c.js('Boolean(window.__uphill && window.__uphill.S.model)'):
                break
            time.sleep(0.05)
        else:
            raise RuntimeError('The built application failed to initialize.')
        if not self.guided:
            self.prepare_workbench(c)
        return c

    @staticmethod
    def prepare_workbench(c):
        """Use ordinary UI controls to load the historical mathematical fixture.

        Guided tests opt out and exercise the unmodified first-visit experience.
        The delivered first-visit default is separately tested by e2e_guided.py.
        Historical suites explicitly load square_diagonal and choose A={a,c}.
        """
        c.js("""(() => {
          // This ordinary Skip control cancels an active tour AND its pending
          // initial timer before historical fixtures are loaded.
          const skip = document.getElementById('live-tour-skip');
          if (skip) skip.click();
          const guide = document.getElementById('intro-guide');
          if (guide && guide.open) {
            const close = document.getElementById('intro-close');
            if (!close) throw new Error('Visible guide has no close control');
            close.click();
          }
          if (document.body.dataset.workspace === 'explore') document.getElementById('workspace-toggle').click();
          if (document.body.dataset.theme === 'dark') document.getElementById('theme-toggle').click();
          for (const id of ['edit-drawer', 'sets-drawer']) {
            const drawer = document.getElementById(id);
            if (drawer && !drawer.open) drawer.querySelector('summary').click();
          }
          if (document.getElementById('workspace-toggle')) {
            const preset = document.getElementById('preset');
            preset.value = 'square_diagonal';
            preset.dispatchEvent(new Event('change', {bubbles:true}));
            for (const id of ['a', 'c']) {
              const input = [...document.querySelectorAll('#vlist input')].find(e=>e.dataset.v===id);
              if (!input) throw new Error('Legacy fixture is missing vertex ' + id);
              if (!input.checked) input.click();
            }
          }
          window.scrollTo({top:0, behavior:'instant'});
          return true;
        })()""")

    def __exit__(self, *args):
        self.c.ws.close()
        self.proc.kill()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            # Windows can delay termination while parallel Chrome instances
            # close their profiles. Retry only our owned process handle.
            self.proc.kill()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                print('Warning: owned test browser termination is delayed; retaining its temporary profile.')
                return
        # The temporary browser profile is outside the project and owned by this run.
        profile = Path(self.prof).resolve()
        temp_root = Path(tempfile.gettempdir()).resolve()
        if profile.parent == temp_root and profile.name.startswith('uphill_e2e_'):
            shutil.rmtree(profile, ignore_errors=True)


def main():
    global OUTPUT, SHOTS
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chrome')
    parser.add_argument('--force-fallback', action='store_true')
    parser.add_argument('--output', default=OUTPUT)
    parser.add_argument('--shots', default=SHOTS)
    args = parser.parse_args()
    OUTPUT, SHOTS = args.output, args.shots
    with Browser(args.chrome, args.force_fallback) as c:
        return run(c)


HELP = r"""
window.U = window.__uphill;
window.ids = s => [...s].sort();
window.setSel = sel => { const el = document.querySelector(sel); return el; };
window.chg = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', {bubbles: true})); };
window.clickAct = (act, extra) => { const el = document.querySelector(`[data-act="${act}"]` + (extra || '')); if (!el) throw new Error('no button ' + act + (extra||'')); el.click(); };
window.T = () => U.S.model.topo;
window.A = () => U.S.model.topo.ids(U.S.A).sort();
window.an = k => U.S.model.topo.ids(U.S.analysis[k]).sort();
window.cnt = () => document.getElementById('status').textContent;
window.waitEnum = async () => { for (let i = 0; i < 200; i++) { if (!U.S.enumRunning && U.S.enumeration) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
true
"""


def run(c):
    R = []
    def check(n, name, ok, detail=''):
        R.append({'item': n, 'check': name, 'pass': bool(ok), 'detail': detail})
        print(('PASS' if ok else 'FAIL'), n, name, detail if not ok else '')

    c.js(HELP)
    c.js('waitEnum()', True)
    # 1 offline
    failed = [e for e in c.events if e.get('method') == 'Network.loadingFailed']
    reqs = [e['params']['request']['url'] for e in c.events if e.get('method') == 'Network.requestWillBeSent']
    ext = [u for u in reqs if not u.startswith(('file:', 'blob:', 'data:'))]
    check(1, 'offline load: no external requests, no failed loads', not ext and not failed, f'ext={ext} failed={len(failed)}')
    st = c.js('cnt()')
    check(1, 'historical square fixture: A={a,c}, 5 opens, 3 plateaus, int=A, cl=V, bd={b,d}',
          c.js("U.S.presetId") == 'square_diagonal' and c.js('A()') == ['a', 'c'] and c.js('T().k') == 3
          and ' 5 ' in st and c.js("an('interior')") == ['a', 'c'] and c.js("an('closure')") == ['a', 'b', 'c', 'd']
          and c.js("an('boundary')") == ['b', 'd'], st)
    c.shot('01_default_square')
    # 2
    check(2, 'square degrees 3,2,3,2; 3 plateaus; 5 opens',
          c.js("U.S.model.degree.join(',')") == '3,2,3,2' and c.js('T().k') == 3 and c.js('String(U.S.enumeration && U.S.enumeration.listedCount)') == '5')
    # 3 select only a (via the checklist)
    c.js("document.querySelector('#vlist [data-v=\"c\"]').click(); true")
    check(3, 'A={a}: boundary = V including a', c.js('A()') == ['a'] and c.js("an('boundary')") == ['a', 'b', 'c', 'd'])
    insp = c.js("document.getElementById('insp').textContent")
    check(3, 'failing-open witness is a -> c', 'a → c' in insp, insp[:200])
    c.shot('03_A_is_a')
    # 4
    c.js("clickAct('op', '[data-op=\"enlarge\"]'); true")
    e1 = c.js('A()')
    c.js("U.doUndo(); true"); u1 = c.js('A()')
    c.js("clickAct('op', '[data-op=\"closure\"]'); true"); e2 = c.js('A()')
    check(4, 'O(A)={a,c}; undo -> {a}; closure -> V', e1 == ['a', 'c'] and u1 == ['a'] and e2 == ['a', 'b', 'c', 'd'], f'{e1} {u1} {e2}')
    c.js("U.doUndo(); true")
    # 5
    res = {}
    for m in ('strict', 'weak-patch', 'uphill'):
        c.js(f"chg('mode', '{m}'); true"); time.sleep(0.3); c.js('waitEnum()', True)
        res[m] = (c.js("an('interior')"), c.js("an('closure')"), c.js("an('boundary')"), c.js('A()'), c.js("String(U.S.enumeration.listedCount)"))
    check(5, 'strict A={a}: int {a}, cl {a,b,d}, bd {b,d}, 7 opens',
          res['strict'][:3] == (['a'], ['a', 'b', 'd'], ['b', 'd']) and res['strict'][4] == '7', str(res['strict']))
    check(5, 'weak patch A={a}: int ∅, cl {a,c}, bd {a,c}, 8 opens',
          res['weak-patch'][:3] == ([], ['a', 'c'], ['a', 'c']) and res['weak-patch'][4] == '8', str(res['weak-patch']))
    check(5, 'selection unchanged across modes', all(v[3] == ['a'] for v in res.values()))
    # 6
    c.js("clickAct('tab', '[data-tab=\"compare\"]'); true")
    cmp = c.js("document.getElementById('tabbody').textContent")
    ok6 = 'strict uphill ⊆ finite weak patch: no' in cmp and 'finite weak patch ⊆ strict uphill: no' in cmp and 'witness {a}' in cmp and 'witness {b}' in cmp
    check(6, 'strict and weak patch incomparable with witnesses {a} and {b}', ok6, cmp[:400])
    c.shot('06_compare')
    # 7, 8, 9 presets
    def counts(pid):
        out = {}
        c.js(f"chg('preset', '{pid}'); true")
        for m in ('uphill', 'strict', 'weak-patch'):
            c.js(f"chg('mode', '{m}'); true"); c.js('waitEnum()', True)
            out[m] = c.js("U.S.enumeration ? String(U.S.enumeration.count.value) : null")
        c.js("chg('mode', 'uphill'); true")
        return out
    for pid, want in (('edge2', ('2', '4', '2')), ('triangle3', ('2', '8', '2')), ('cycle4', ('2', '16', '2'))):
        got = counts(pid)
        check(7, f'{pid}: base/strict/weak = {want}', (got['uphill'], got['strict'], got['weak-patch']) == want, str(got))
    for pid, want in (('empty0', '1'), ('isolated3', '8')):
        got = counts(pid)
        check(8, f'{pid}: {want} opens, no exceptions', got['uphill'] == want and not c.js('window.__errs.length'), str(got))
    check(8, 'isolated3 shows all three vertices', c.js("document.querySelectorAll('#graph .vtx').length") == 3)
    got = counts('crown7')
    cls = c.js("T().classes.map(c => c.map(i => U.S.graph.nodes[i].id).join('')).sort().join('|')")
    check(9, 'crown7: 7 vertices, 11 edges, classes {0},{1234},{5},{6}; 7/38/16',
          c.js('U.S.graph.nodes.length') == 7 and c.js('U.S.graph.edges.length') == 11 and cls == '0|1234|5|6'
          and (got['uphill'], got['strict'], got['weak-patch']) == ('7', '38', '16'), f'{cls} {got}')
    c.shot('09_crown7')
    # 10 subspace
    c.js("chg('preset', 'path3'); clickAct('tab', '[data-tab=\"subspace\"]'); true")
    c.js("document.querySelector('[data-act=\"subv\"][data-v=\"a\"]').click(); document.querySelector('[data-act=\"subv\"][data-v=\"b\"]').click(); true")
    sp = c.js("document.getElementById('tabbody').textContent")
    check(10, 'path S={a,b}: inherited 3 / induced 2', 'Inherited uphill (non-strict) topology on S2 points / 2 classes / 3 open sets' in sp.replace('\n', '') and '/ 2 open sets' in sp, sp[:600])
    c.js("chg('preset', 'subspace_intermediate'); clickAct('tab', '[data-tab=\"subspace\"]'); true")
    c.js("document.querySelector('[data-act=\"subv\"][data-v=\"a\"]').click(); document.querySelector('[data-act=\"subv\"][data-v=\"c\"]').click(); true")
    sp = c.js("document.getElementById('tabbody').textContent")
    check(10, 'tree S={a,c}: inherited 3 / induced 4, path through omitted [b]',
          '/ 3 open sets' in sp and '/ 4 open sets' in sp and '[b]' in sp, sp[:700])
    c.shot('10_subspace_tree')
    # 11 Königsberg
    c.js("chg('preset', 'konigsberg'); true")
    rows = [('incident-edges', 'uphill', '3', ['A'], ['B', 'C', 'D']), ('distinct-neighbours', 'uphill', '5', ['A', 'D'], ['B', 'C']),
            ('incident-edges', 'strict', '9', ['A', 'B'], ['C', 'D']), ('distinct-neighbours', 'strict', '7', ['D'], ['B', 'C'])]
    for stat, mode, n, U, bd in rows:
        c.js(f"chg('stat', '{stat}'); chg('mode', '{mode}'); U.setSelection({json.dumps(U)}); true"); c.js('waitEnum()', True)
        got = (c.js("String(U.S.enumeration.count.value)"), c.js("an('boundary')"), c.js('U.S.analysis.open'))
        check(11, f'Königsberg {stat} {mode}: {n} opens, U={U} open, boundary {bd}', got == (n, bd, True), str(got))
    c.js("chg('stat', 'incident-edges'); chg('mode', 'uphill'); true")
    # 12, 13 poset
    c.js("clickAct('tab', '[data-tab=\"poset\"]'); clickAct('poset-preset', '[data-p=\"crown\"]'); clickAct('poset-load'); true")
    time.sleep(0.5)
    g = (c.js('U.S.graph.nodes.length'), c.js('U.S.graph.edges.length'), c.js("[...new Set(U.S.model.degree)].sort().join(',')"),
         c.js('U.S.generator && U.S.generator.pass'), c.js("document.getElementById('gen-banner').textContent"))
    c.js('waitEnum()', True)
    check(12, 'crown poset: 28 vertices, 50 edges, degrees {3,4}, certificate pass, 7 opens',
          g[:4] == (28, 50, '3,4', True) and c.js("String(U.S.enumeration.count.value)") == '7' and 'PASS' in g[4], str(g))
    c.shot('12_poset_crown')
    c.js("chg('mode', 'strict'); true")
    ban = c.js("document.getElementById('gen-banner').textContent")
    check(13, 'strict mode withdraws the poset certificate', 'withdrawn' in ban, ban)
    c.js("chg('mode', 'uphill'); true")
    # 14 100 isolates
    c.js("chg('preset', 'isolated100'); clickAct('tab', '[data-tab=\"opens\"]'); true")
    c.js("clickAct('enum'); true"); ok = c.js('waitEnum()', True)
    e = c.js("({s: U.S.enumeration.status, n: U.S.enumeration.listedCount, v: String(U.S.enumeration.count.value)})")
    ex = json.loads(c.js("JSON.stringify(U.experiment().results.openCount)"))
    check(14, '100 isolates: exact 2^100, list capped at 4096 and labelled incomplete, count exported as string',
          ok and e['s'] == 'display-cap' and e['n'] == 4096 and e['v'] == str(2 ** 100) and ex['value'] == str(2 ** 100)
          and 'list incomplete' in c.js("document.getElementById('tabbody').textContent"), f'{e} {ex}')
    worker_used = c.js("U.S.enumeration && U.S.enumeration.engine")
    # 15 edit during enumeration, then undo
    c.js("U.S.limits.displayLimit = 1e9; U.S.limits.timeBudgetMs = 60000; U.S.limits.stateBudget = 1e12; U.startEnumeration(); true")
    time.sleep(0.3)
    running = c.js('U.S.enumRunning')
    c.js("U.editGraph(g => { g.nodes.push({id: 'extra', label: 'extra'}); }); true")
    after = (c.js('U.S.enumRunning'), c.js('U.S.enumeration === null'), c.js('U.S.graph.nodes.length'))
    time.sleep(1.0)
    stale = c.js('U.S.enumeration && U.S.enumRev !== U.S.rev')
    c.js('U.doUndo(); true')
    check(15, 'edit cancels the running enumeration; no stale result; undo restores 100 vertices',
          running and after == (False, True, 101) and not stale and c.js('U.S.graph.nodes.length') == 100, f'{running} {after} {stale}')
    c.js("U.S.limits.displayLimit = 4096; U.S.limits.timeBudgetMs = 5000; U.S.limits.stateBudget = 1000000; true")
    # 16 export / reimport / report / svg
    c.js("chg('preset', 'crown7'); U.setSelection(['5']); true")
    rt = c.js("(() => { const ex = U.experiment(); const back = U.importExperiment(JSON.parse(JSON.stringify(ex))); return {ok: back.ok, mm: back.mismatches, cl: back.results.selection.closure.sort().join(',')}; })()")
    rep = c.js('U.reportHTML()')
    svg = c.js('U.graphSVG({legend: true})')
    check(16, 'export/reimport reproduces results; report self-contained with JSON and figures; SVG labelled',
          rt['ok'] and rt['mm'] == [] and rt['cl'] == '0,1,2,3,4,5' and 'application/json' in rep and '<svg' in rep
          and 'http' not in rep.split('<style>')[0] and '<title' in svg and 'interior' in svg, str(rt))
    open(os.path.join(SHOTS, 'report_crown7.html'), 'w', encoding='utf-8').write(rep)
    # 17 keyboard / textual
    k17 = c.js("(() => { const v = [...document.querySelectorAll('#graph .vtx')]; return v.length === U.S.graph.nodes.length && v.every(x => x.getAttribute('tabindex') === '0' && x.getAttribute('aria-label')) && document.querySelectorAll('#vlist input').length === U.S.graph.nodes.length; })()")
    c.js("U.setTool('focus'); const v = document.querySelector('#graph .vtx[data-v=\"4\"]'); v.focus(); v.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); true")
    f17 = c.js('U.S.focus')
    c.js("U.setSelection([]); U.setTool('select'); const w = document.querySelector('#graph .vtx[data-v=\"4\"]'); w.focus(); w.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); true")
    a17 = c.js('[...U.S.selected].join(",")')
    check(17, 'every vertex focusable with a text label; checklist complete; Enter explains a vertex (Explain tool) or toggles it in A (Select tool)',
          k17 and f17 == '4' and a17 == '4', f'focus={f17} A={a17}')
    # 18 gallery
    c.js("clickAct('tab', '[data-tab=\"gallery\"]'); true")
    gal = c.js("document.getElementById('tabbody').textContent")
    check(18, 'infinite gallery states its symbolic, finite-window status', 'symbolic explanation; displayed window only' in gal)
    c.shot('18_gallery')
    # 19-24 interactive canvas, real mouse events
    def xy(vid):
        return c.js("(() => { const svg = document.querySelector('#graph svg'); const q = U.S.graph.layout['%s']; const p = svg.createSVGPoint(); p.x = q.x; p.y = q.y; const r = p.matrixTransform(svg.getScreenCTM()); return [r.x, r.y]; })()" % vid)

    def svgxy(x, y):
        return c.js("(() => { const svg = document.querySelector('#graph svg'); const p = svg.createSVGPoint(); p.x = %s; p.y = %s; const r = p.matrixTransform(svg.getScreenCTM()); return [r.x, r.y]; })()" % (x, y))

    def mouse(kind, pt, mods=0):
        c.call('Input.dispatchMouseEvent', type=kind, x=pt[0], y=pt[1], button='left', buttons=1 if kind != 'mouseReleased' else 0, clickCount=1, modifiers=mods)

    def drag(a, b, mods=0):
        mouse('mousePressed', a, mods)
        for t in (0.25, 0.5, 0.75, 1.0):
            mouse('mouseMoved', [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], mods)
        mouse('mouseReleased', b, mods)

    def click(pt):
        mouse('mousePressed', pt); mouse('mouseReleased', pt)

    c.js("chg('preset', 'square_diagonal'); window.scrollTo(0, 0); true")
    c.js("document.querySelector('#graph').scrollIntoView(); true")
    c.js("U.setTool('select'); U.setSelection([]); true")
    click(xy('a'))
    ans = c.js("document.querySelector('#insp .answer').textContent")
    check(19, 'Select tool: clicking vertex a puts it in A; the card answers "Is A open? No" with the step a → c and O(A) = {a, c}',
          c.js('[...U.S.selected].join(",")') == 'a' and 'No' in ans and 'a → c' in ans and '{a, c}' in ans, ans)
    click(xy('c'))
    ans = c.js("document.querySelector('#insp .answer').textContent")
    check(20, 'clicking c too: A = {a, c}, the card answers Yes', c.js('[...U.S.selected].sort().join(",")') == 'a,c' and 'Yes' in ans, ans)
    c.shot('19_select_answer')
    c.js("U.setSelection([]); true")
    xs = [U_ for U_ in c.js("U.S.graph.nodes.map(n => [n.id, U.S.graph.layout[n.id].x, U.S.graph.layout[n.id].y])")]
    x0 = min(v[1] for v in xs) - 20; x1 = max(v[1] for v in xs) + 20
    y0 = min(v[2] for v in xs) - 20; y1 = max(v[2] for v in xs) + 20
    drag(svgxy(x0, y0), svgxy(x1, y1))
    boxed = c.js('[...U.S.selected].sort().join(",")')
    check(21, 'box drag on empty space selects every vertex inside; A = V is open', boxed == ','.join(sorted(v[0] for v in xs))
          and 'Yes' in c.js("document.querySelector('#insp .answer').textContent"), boxed)
    n0 = c.js('U.S.graph.nodes.length'); e0 = c.js('U.S.graph.edges.length')
    c.js("U.setTool('add-vertex'); true")
    click(svgxy((x0 + x1) / 2, y1 + 40 if y1 + 40 < c.js("document.querySelector('#graph svg').viewBox.baseVal.height") else y0 - 10))
    newid = c.js('U.S.graph.nodes.length > %d ? U.S.graph.nodes[U.S.graph.nodes.length - 1].id : null' % n0)
    check(22, 'Add vertex: a click on empty canvas adds an isolated vertex (degree 0) and recomputes',
          newid is not None and c.js('U.S.model.degree[U.S.graph.nodes.length - 1]') == 0, str(newid))
    if newid:
        c.js("U.setTool('add-edge'); true")
        drag(xy(newid), xy('a'))
        e1 = c.js('U.S.graph.edges.length')
        click(xy(newid)); click(xy('c'))
        e2 = c.js('U.S.graph.edges.length')
        check(23, 'Add edge: drag vertex to vertex adds an edge; click-then-click adds another', e1 == e0 + 1 and e2 == e0 + 2, f'{e0}->{e1}->{e2}')
        c.shot('23_added_edges')
        c.js("U.setTool('delete'); true")
        click(xy(newid))
        check(24, 'Delete: clicking the new vertex removes it with its two edges; Undo brings them back',
              c.js('U.S.graph.nodes.length') == n0 and c.js('U.S.graph.edges.length') == e0
              and c.js("U.doUndo(), U.S.graph.edges.length") == e0 + 2, '')
    check(0, 'no uncaught page errors during the run', not c.js('window.__errs.length'), str(c.js('window.__errs')))
    out = {'page': PAGE, 'offline': True, 'workerAvailable': worker_used,
           'chrome': c.call('Browser.getVersion')['product'], 'results': R,
           'passed': sum(r['pass'] for r in R), 'total': len(R)}
    out.update({'date': datetime.now(timezone.utc).isoformat(), 'os': platform.platform(),
                'python': platform.python_version(), 'workerCreated': c.js('window.__workerCreated'),
                'distributionSha256': hashlib.sha256(Path(ROOT, 'dist', 'index.html').read_bytes()).hexdigest(),
                'startupObserversBeforeNavigation': True})
    json.dump(out, open(OUTPUT, 'w', encoding='utf-8'), indent=1)
    print(f"{out['passed']}/{out['total']} checks passed ({out['chrome']})")
    return 0 if out['passed'] == out['total'] else 1


if __name__ == '__main__':
    sys.exit(main())
