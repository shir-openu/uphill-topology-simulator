# -*- coding: utf-8 -*-
"""Exercise the repaired offline distribution through controls and actual files.

python tests/e2e_regressions.py [--chrome PATH] [--engine both|worker|fallback]
No application hook mutates state: __uphill is used only for assertions. Downloads
are real browser downloads; imports use DOM.setFileInputFiles and FileReader.
Requires an installed Chrome/Chromium and the existing websocket-client package.
"""
import argparse
import base64
import copy
from datetime import datetime, timezone
import hashlib
import json
import platform
from pathlib import Path
import sys
import time
import xml.etree.ElementTree as ET

from e2e_acceptance import Browser, CDP, PAGE, ROOT


DOM_HELPERS = r"""
window.changeControl = (id, value) => {
  const el = document.getElementById(id);
  if (!el) throw new Error('Missing control: ' + id);
  el.value = value; el.dispatchEvent(new Event('change', {bubbles:true}));
};
window.press = (selector) => {
  const el = document.querySelector(selector);
  if (!el) throw new Error('Missing button: ' + selector);
  el.click();
};
window.__fileLoads = 0;
const readText = FileReader.prototype.readAsText;
FileReader.prototype.readAsText = function (...args) {
  this.addEventListener('loadend', () => window.__fileLoads++, {once:true});
  return readText.apply(this, args);
};
true;
"""


class RegressionRun:
    def __init__(self, c, folder, engine):
        self.c, self.folder, self.engine = c, folder, engine
        self.rows = []
        self.serial = 0
        c.js(DOM_HELPERS)

    def test(self, name, fn):
        start = time.monotonic()
        try:
            detail = fn()
            self.rows.append({'check': name, 'pass': True, 'detail': detail,
                              'seconds': round(time.monotonic() - start, 3)})
            print(f'PASS [{self.engine}] {name}')
        except Exception as exc:
            self.rows.append({'check': name, 'pass': False, 'detail': str(exc),
                              'seconds': round(time.monotonic() - start, 3)})
            print(f'FAIL [{self.engine}] {name}: {exc}')

    def wait(self, expression, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            result = self.c.js(expression)
            if result:
                return result
            time.sleep(0.03)
        raise AssertionError('Timed out waiting for ' + expression)

    def enum_done(self):
        self.wait('!window.__uphill.S.enumRunning')

    def action(self, act, extra=''):
        self.click(f'[data-act="{act}"]{extra}')

    def click(self, selector):
        self.c.js(f'press({json.dumps(selector)}); true')

    def change(self, control, value):
        self.c.js(f'changeControl({json.dumps(control)}, {json.dumps(value)}); true')

    def preset(self, pid, mode='uphill'):
        self.change('preset', pid)
        self.change('mode', mode)
        self.change('stat', 'incident-edges')
        self.enum_done()

    def tab(self, name):
        self.action('tab', f'[data-tab="{name}"]')

    def choose(self, ids, sub=False):
        prefix = '#tabbody [data-act="subv"]' if sub else '#vlist input'
        wanted = json.dumps(ids)
        self.c.js(f"""(() => {{
          const target = new Set({wanted});
          const all = [...document.querySelectorAll({json.dumps(prefix)})].map(el => el.dataset.v);
          for (const id of all) {{
            const el = [...document.querySelectorAll({json.dumps(prefix)})].find(e => e.dataset.v === id);
            if (el.checked !== target.has(id)) el.click();
          }}
          return true;
        }})()""")

    def state(self):
        return self.c.js("""(() => { const s=window.__uphill.S; return {
          nodes:s.graph.nodes.map(n=>({id:n.id,label:n.label})),
          edges:s.graph.edges.map(e=>[e.id,s.graph.nodes[e.u].id,s.graph.nodes[e.v].id]),
          mode:s.mode,statistic:s.statistic,A:[...s.selected].sort(),S:[...s.sub].sort(),
          limits:s.limits,seed:s.randomSeed,meta:s.graph.meta
        }; })()""")

    def download(self, control, label):
        event_start = len(self.c.events)
        point = self.c.js(f"(() => {{ const el=document.getElementById({json.dumps(control)}); el.scrollIntoView({{block:'center'}}); const r=el.getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2]; }})()")
        for kind in ('mousePressed', 'mouseReleased'):
            self.c.call('Input.dispatchMouseEvent', type=kind, x=point[0], y=point[1], button='left', buttons=1 if kind == 'mousePressed' else 0, clickCount=1)
        extension = {'exp-json': '.json', 'exp-html': '.html', 'exp-svg': '.svg', 'exp-qsvg': '.svg'}[control]
        prefix = {'exp-json': 'uphill_experiment', 'exp-html': 'uphill_report', 'exp-svg': 'uphill_graph', 'exp-qsvg': 'uphill_quotient'}[control]
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            # Drain CDP events; a completed event is the authority, not an
            # intermediate path that Chrome may replace at finalization.
            self.c.js('true')
            events = self.c.events[event_start:]
            started = [e['params'] for e in events if e.get('method') == 'Browser.downloadWillBegin'
                       and e['params']['suggestedFilename'].startswith(prefix) and e['params']['url'].startswith('blob:')]
            completed = [e['params'] for e in events if e.get('method') == 'Browser.downloadProgress'
                         and e['params']['state'] == 'completed' and any(s['guid'] == e['params']['guid'] for s in started)]
            if completed:
                path = Path(completed[-1].get('filePath', str(self.folder / started[-1]['suggestedFilename'])))
                assert path.suffix == extension and path.is_file() and path.stat().st_size
                self.serial += 1
                target = self.folder / f'{self.serial:02d}_{label}{path.suffix}'
                path.rename(target)
                return target
            time.sleep(0.05)
        raise AssertionError('Browser download did not finish: ' + control)

    def export(self, label):
        path = self.download('exp-json', label)
        return path, json.loads(path.read_text(encoding='utf-8'))

    def import_file(self, path):
        previous = self.c.js('window.__fileLoads')
        doc = self.c.call('DOM.getDocument')
        node = self.c.call('DOM.querySelector', nodeId=doc['root']['nodeId'], selector='#imp')['nodeId']
        self.c.call('DOM.setFileInputFiles', files=[str(path.resolve())], nodeId=node)
        self.wait(f'window.__fileLoads > {previous}')
        self.enum_done()

    def input_file(self, data, name):
        path = self.folder / (name + '.json')
        path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        self.import_file(path)
        return path

    def assert_opens(self, expected=None):
        result = self.c.js("""(() => { const s=window.__uphill.S, e=s.enumeration; return {
          running:s.enumRunning,key:s.enumKey,expectedKey:`${s.rev}|${s.mode}|${s.statistic}`,
          listed:e&&e.listedCount,valid:!!e&&e.opens.every(o=>s.model.topo.analyze(o).open),
          status:e&&e.status,engine:e&&e.engine,
          listingText:document.getElementById('tabbody').textContent.includes('Listing…')
        }; })()""")
        assert not result['running'] and not result['listingText'], result
        assert result['valid'] and result['key'] == result['expectedKey'], result
        if expected is not None:
            assert result['listed'] == expected, result
        return result

    def generated(self, start_mode):
        self.preset('konigsberg', start_mode)
        self.change('stat', 'distinct-neighbours')
        self.tab('poset')
        self.action('poset-preset', '[data-p="crown"]')
        self.action('poset-load')
        self.enum_done()
        state = self.state()
        assert len(state['nodes']) == 28 and len(state['edges']) == 50, state
        assert (state['mode'], state['statistic']) == ('uphill', 'incident-edges'), state
        self.tab('opens')
        result = self.assert_opens(7)
        _, exported = self.export('generated_' + start_mode)
        assert exported['enumeration']['listedCount'] == 7, exported['enumeration']
        assert len(exported['enumeration']['upsetMasks']) == 7
        assert exported['results']['openCount']['value'] == '7'
        assert self.c.js('window.__uphill.S.generator.pass')
        return result

    def comparison(self, preset, S, A, expected):
        self.preset(preset)
        self.choose(A)
        self.tab('subspace')
        self.choose(S, sub=True)
        before = self.state()
        path, exported = self.export('subspace_' + preset + '_' + str(len(S)))
        comp = exported['subspaceComparison']
        assert sorted(comp['subspaceVertexIds']) == sorted(S), comp
        assert sorted(comp['selectedVertexIds']) == sorted(set(S) & set(A)), comp
        assert exported['analysis']['carrier'] == 'vertices'
        assert sorted(exported['analysis']['selectedVertexIds']) == sorted(A)
        counts = (comp['inherited']['results']['openCount']['value'], comp['recomputed']['results']['openCount']['value'])
        assert counts == expected, (counts, expected)
        for context in ('inherited', 'recomputed'):
            assert sorted(comp[context]['carrierVertexIds']) == sorted(S), comp
        if preset == 'subspace_intermediate' and S == ['a', 'c']:
            assert '[b]' in self.c.js("document.getElementById('tabbody').textContent")
        self.preset('triangle3', 'strict')
        self.import_file(path)
        assert self.state() == before, (self.state(), before)
        assert 'match' in self.c.js("document.getElementById('msgs').textContent")
        self.tab('subspace')
        _, second = self.export('subspace_restored')
        assert second['subspaceComparison'] == comp
        report = self.download('exp-html', 'subspace_report')
        report_text = report.read_text(encoding='utf-8')
        assert 'Inherited' in report_text and 'recomputed' in report_text.lower()
        return {'S': S, 'ambientA': A, 'counts': counts, 'download': str(path.relative_to(ROOT))}

    def malformed(self):
        self.preset('path3', 'weak-patch')
        self.choose(['a'])
        self.tab('subspace'); self.choose(['a', 'b'], sub=True)
        _, valid = self.export('valid_for_rejections')
        before = self.state()
        cases = []
        for field, val in [('selectedVertexIds', 42), ('selectedVertexIds', {}), ('subspaceVertexIds', {}),
                           ('mode', 'unknown'), ('statistic', 'unknown'), ('selectedVertexIds', ['missing'])]:
            d = copy.deepcopy(valid); d['analysis'][field] = val; cases.append(d)
        for val in (42, [], None):
            d = copy.deepcopy(valid); d['analysis'] = val; cases.append(d)
        for val in ({}, ['missing'], 42):
            d = copy.deepcopy(valid); d['subspaceComparison']['subspaceVertexIds'] = val; cases.append(d)
        d = copy.deepcopy(valid); d['analysis']['carrier'] = 'subspace'; cases.append(d)
        d = copy.deepcopy(valid); d['results'] = []; cases.append(d)
        d = copy.deepcopy(valid); d['graph']['nodes'] += [{'id': f'large_{i}', 'label': str(i)} for i in range(201)]; cases.append(d)
        for i, d in enumerate(cases):
            self.input_file(d, 'malformed_' + str(i))
            assert self.state() == before, f'Rejected import {i} changed the session'
            assert 'reject' in self.c.js("document.getElementById('msgs').textContent.toLowerCase()"), i
        assert self.c.js('window.__errs') == [], self.c.js('window.__errs')
        return {'rejectedShapes': len(cases), 'sessionPreserved': True}

    def ids(self):
        self.preset('path3'); self.tab('edit')
        self.change('el', '-1 2\n1 3'); self.change('iso', '')
        self.action('import-el'); self.enum_done()
        assert sorted(n['id'] for n in self.state()['nodes']) == ['-1', '1', '2', '3']
        self.assert_opens(4)
        self.tab('edit')
        self.change('el', '01 1\n-0 0\nalpha Ω'); self.change('iso', 'isolated')
        self.action('import-el'); self.enum_done()
        assert len(self.state()['nodes']) == 7, self.state()
        before = self.state()
        for edge_text in ('a-b-c', 'a b c', 'a b\nb a'):
            self.tab('edit'); self.change('el', edge_text); self.action('import-el')
            assert self.state() == before, edge_text
        path, exported = self.export('string_ids')
        self.preset('empty0'); self.import_file(path)
        assert self.state() == before
        label = '<img src=x onerror="window.__labelExecuted=1"> & Ω'
        exported['graph']['nodes'][0]['label'] = label
        self.input_file(exported, 'inert_labels')
        assert self.state()['nodes'][0]['label'] == label
        assert self.c.js('Boolean(window.__labelExecuted)') is False
        assert self.c.js("document.querySelector('#graph img') === null")
        return {'negativePairCount': 4, 'distinctIds': len(before['nodes']), 'HTMLLabelInert': True}

    def opens(self):
        self.preset('isolated100'); self.tab('opens'); self.action('enum'); self.enum_done()
        self.assert_opens(4096)
        path, data = self.export('isolated100_list')
        rec = data['enumeration']
        assert rec['status'] == 'display-cap' and rec['count']['status'] == 'exact', rec
        assert rec['count']['value'] == str(2**100) and data['results']['openCount']['value'] == str(2**100)
        assert rec['listedCount'] == len(rec['upsetMasks']) == len(set(rec['upsetMasks'])) == 4096
        assert len(rec['quotientClasses']) == 100 and all(len(c) == 1 for c in rec['quotientClasses'])
        assert all(0 <= int(m) < 2**100 for m in rec['upsetMasks'])
        seen = set()
        while True:
            indexes = self.c.js("[...document.querySelectorAll('[data-act=preview]')].map(e=>Number(e.dataset.i))")
            seen.update(indexes)
            next_selector = self.c.js("""(() => {
              const buttons=[...document.querySelectorAll('[data-act="enum-page"]')];
              const next=buttons.find(b=>/next/i.test(b.textContent)&&!b.disabled);
              return next ? '[data-act="enum-page"][data-page="'+next.dataset.page+'"]' : null;
            })()""")
            if not next_selector:
                break
            self.click(next_selector)
        assert seen == set(range(4096)), f'Only {len(seen)} / 4096 loaded entries accessible'
        self.preset('path3'); self.import_file(path)
        _, restored = self.export('isolated100_restored')
        assert restored['enumeration'] == rec, 'Loaded list did not survive file roundtrip'
        return {'exactCount': rec['count']['value'], 'accessibleLoadedEntries': len(seen), 'status': rec['status']}

    def interruption(self):
        self.preset('isolated100'); _, data = self.export('enumeration_inputs')
        data['enumeration'] = None
        data['limits'].update(displayLimit=100000, stateBudget=10000000, timeBudgetMs=5000, autoEnumerateMaxQuotient=0)
        self.input_file(data, 'long_enumeration')
        self.tab('opens')
        # Same user-event task guarantees cancellation is requested before the
        # fallback timer begins; worker messages may arrive asynchronously later.
        running = self.c.js("press('[data-act=enum]'); const wasRunning=window.__uphill.S.enumRunning; changeControl('mode','strict'); wasRunning")
        assert running
        time.sleep(0.1)
        assert not self.c.js('window.__uphill.S.enumRunning')
        assert self.c.js('window.__uphill.S.enumeration === null')
        self.tab('opens')
        running = self.c.js("press('[data-act=enum]'); const running=window.__uphill.S.enumRunning; press('[data-act=\"tab\"][data-tab=\"edit\"]'); changeControl('newv','extra'); press('[data-act=addv]'); running")
        assert running and len(self.state()['nodes']) == 101
        self.click('#undo')
        time.sleep(0.1)
        assert len(self.state()['nodes']) == 100 and not self.c.js('window.__uphill.S.enumRunning')
        assert self.c.js('window.__uphill.S.enumeration === null')
        self.tab('opens')
        self.c.js("press('[data-act=enum]'); press('[data-act=cancel-enum]'); true")
        assert not self.c.js('window.__uphill.S.enumRunning')
        # A tiny explicit search budget distinguishes honest interrupted status
        # from a silently exact partial list.
        data['limits'].update(displayLimit=4096, stateBudget=1, timeBudgetMs=5000)
        self.input_file(data, 'tiny_budget'); self.tab('opens'); self.action('enum'); self.enum_done()
        _, limited = self.export('budget_result')
        assert limited['enumeration']['status'] == 'interrupted', limited['enumeration']
        assert limited['enumeration']['listedCount'] < 4096
        # Restore ordinary limits via the UI importer before subsequent cases.
        data['limits'].update(autoEnumerateMaxQuotient=16, stateBudget=1000000)
        self.input_file(data, 'restored_limits')
        return {'modeCancellation': True, 'editUndoCancellation': True, 'cancelButton': True, 'budgetStatus': limited['enumeration']['status']}

    def undo_and_text(self):
        self.preset('path3', 'weak-patch'); self.choose(['a'])
        self.tab('subspace'); self.choose(['a', 'b'], sub=True)
        before = self.state()
        _, data = self.export('undo_input')
        data['analysis']['mode'] = 'strict'; data['analysis']['statistic'] = 'distinct-neighbours'
        data['analysis']['selectedVertexIds'] = ['c']; data['subspaceComparison']['subspaceVertexIds'] = ['c']
        data['subspaceComparison']['selectedVertexIds'] = ['c']
        data.pop('subspaceComparison')
        data['enumeration'] = None
        self.input_file(data, 'undo_import')
        changed = self.state()
        self.click('#undo'); assert self.state() == before, (self.state(), before)
        self.click('#redo'); assert self.state() == changed
        self.tab('edit')
        old_text = self.c.js("document.getElementById('el').value")
        self.c.js("document.getElementById('el').focus(); true")
        self.c.call('Input.insertText', text='draft text')
        before_key = self.state()
        self.c.call('Input.dispatchKeyEvent', type='rawKeyDown', key='z', code='KeyZ', windowsVirtualKeyCode=90, modifiers=2)
        self.c.call('Input.dispatchKeyEvent', type='keyUp', key='z', code='KeyZ', windowsVirtualKeyCode=90, modifiers=2)
        assert self.state() == before_key, 'Text Ctrl+Z undid the graph import'
        assert self.c.js("document.getElementById('el').value") == old_text, 'Native text undo was prevented'
        return {'fullSessionUndoRedo': True, 'nativeTextUndo': True}

    def explanations(self):
        self.preset('path3', 'weak-patch'); self.choose(['a'])
        text = self.c.js("document.getElementById('insp').textContent")
        assert 'union of whole original plateaus' in text and 'No allowed step leaves A' not in text, text
        assert 'reference only' in self.c.js("document.getElementById('graph').textContent").lower()
        report = self.download('exp-html', 'weak_patch_report').read_text(encoding='utf-8')
        assert 'reference only' in report and 'union of whole original plateaus' in report
        self.preset('path3', 'strict'); self.choose(['a'])
        text = self.c.js("document.getElementById('insp').textContent")
        assert '<' in text and '≤' not in text, text
        self.tab('subspace'); self.choose(['a', 'b'], sub=True)
        assert 'strict uphill' in self.c.js("document.getElementById('tabbody').textContent")
        return {'weakPatchReferenceLabel': True, 'strictWitnessOperator': '<'}

    def transients(self):
        self.preset('square_diagonal'); self.choose(['a'])
        self.action('show-arc')
        assert self.c.js('window.__uphill.S.explain !== null')
        self.choose(['a', 'c'])
        assert self.c.js('window.__uphill.S.explain === null')
        self.tab('opens'); self.action('preview', '[data-i="0"]')
        assert self.c.js('window.__uphill.S.preview !== null')
        self.change('mode', 'strict'); self.enum_done()
        assert self.c.js('window.__uphill.S.preview === null')
        self.tab('poset')
        self.c.js("document.getElementById('pp').value='my draft'; document.getElementById('pp').dispatchEvent(new Event('input',{bubbles:true})); true")
        self.change('mode', 'uphill'); self.enum_done()
        assert self.c.js("document.getElementById('pp').value") == 'my draft'
        return {'oldWitnessCleared': True, 'oldPreviewCleared': True, 'unsentDraftPreserved': True}

    def provenance(self):
        self.generated('weak-patch')
        self.change('mode', 'strict')
        strict_path, _ = self.export('generated_strict_mode')
        self.preset('triangle3')
        self.import_file(strict_path)
        assert self.state()['mode'] == 'strict'
        assert 'withdrawn' in self.c.js("document.getElementById('gen-banner').textContent")
        self.change('mode', 'uphill'); self.enum_done()
        assert 'PASS' in self.c.js("document.getElementById('gen-banner').textContent")
        _, data = self.export('provenance_source')
        data['graph']['meta'] = {'source': 'browser roundtrip regression', 'nested': {'year': 2026}}
        data['provenance']['randomSeed'] = 123
        data['limits']['displayLimit'] = 17
        data['generator']['certificatePass'] = False
        self.input_file(data, 'provenance_import')
        state = self.state()
        assert state['meta'] == data['graph']['meta'] and state['seed'] == 123 and state['limits']['displayLimit'] == 17, state
        assert self.c.js('window.__uphill.S.generator.pass') is True, 'Imported certificate boolean was trusted'
        _, exported = self.export('provenance_restored')
        assert exported['graph']['meta'] == data['graph']['meta'] and exported['provenance']['randomSeed'] == 123
        assert exported['limits']['displayLimit'] == 17
        # Undoable import returns the original per-session listing limits.
        self.click('#undo')
        return {'metadata': True, 'randomSeed': 123, 'customDisplayLimit': 17, 'certificateRecomputed': True}

    def static_file(self, path, svg):
        if svg:
            root = ET.fromstring(path.read_text(encoding='utf-8'))
            assert root.tag == '{http://www.w3.org/2000/svg}svg'
            assert root.find('{http://www.w3.org/2000/svg}style') is not None
            assert root.find('{http://www.w3.org/2000/svg}title') is not None
            assert root.find('{http://www.w3.org/2000/svg}desc') is not None
            assert all('ehit' not in el.attrib.get('class', '').split() for el in root.iter())
        target = self.c.call('Target.createTarget', url='about:blank')['targetId']
        tab = CDP(self.c.url.rsplit('/', 1)[0] + '/' + target)
        try:
            tab.call('Network.enable'); tab.call('Page.enable'); tab.call('Runtime.enable')
            tab.call('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
            tab.call('Page.navigate', url=path.as_uri())
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if tab.js("document.readyState === 'complete' && document.documentElement.tagName.toLowerCase() !== 'head'"):
                    break
                time.sleep(0.04)
            detail = tab.js("""(() => ({
              svgs:document.querySelectorAll('svg').length,
              parserErrors:document.querySelectorAll('parsererror').length,
              hits:document.querySelectorAll('.ehit').length,
              fonts:[...document.querySelectorAll('svg .vl,svg .ql')].map(e=>({kind:e.classList.contains('vl')?'graph':'quotient',size:getComputedStyle(e).fontSize})),
              visible:[...document.querySelectorAll('svg')].every(e=>e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0)
            }))()""")
            assert detail['svgs'] >= 1 and detail['parserErrors'] == 0 and detail['hits'] == 0 and detail['visible'], detail
            assert all(f['size'] == ('13px' if f['kind'] == 'graph' else '12px') for f in detail['fonts']), detail
            reqs = [e['params']['request']['url'] for e in tab.events if e.get('method') == 'Network.requestWillBeSent']
            assert all(u.startswith(('file:', 'blob:', 'data:')) for u in reqs), reqs
            shot = tab.call('Page.captureScreenshot', format='png')['data']
            path.with_suffix(path.suffix + '.png').write_bytes(base64.b64decode(shot))
            return detail
        finally:
            tab.ws.close(); self.c.call('Target.closeTarget', targetId=target)

    def static_exports(self):
        details = []
        for preset in ('konigsberg', 'crown7', 'empty0'):
            self.preset(preset)
            for control in ('exp-svg', 'exp-qsvg', 'exp-html'):
                path = self.download(control, preset + '_' + control)
                details.append({'file': str(path.relative_to(ROOT)), **self.static_file(path, control != 'exp-html')})
        self.generated('strict')
        for control in ('exp-svg', 'exp-qsvg', 'exp-html'):
            path = self.download(control, 'generated_crown_' + control)
            details.append({'file': str(path.relative_to(ROOT)), **self.static_file(path, control != 'exp-html')})
        return details

    def run(self):
        self.test('atomic crown load from weak patch and other statistic', lambda: self.generated('weak-patch'))
        self.test('atomic crown load from strict and other statistic', lambda: self.generated('strict'))
        for name, preset, S, A, counts in (
            ('path FileReader roundtrip', 'path3', ['a', 'b'], ['a'], ('3', '2')),
            ('tree omitted path roundtrip', 'subspace_intermediate', ['a', 'c'], ['a'], ('3', '4')),
            ('empty carrier and ambient A outside S', 'path3', [], ['a'], ('1', '1')),
            ('whole carrier', 'path3', ['a', 'b', 'c'], ['a'], ('5', '5')),
            ('partial plateau and ambient A outside S', 'square_diagonal', ['a', 'b'], ['a', 'd'], ('3', '2'))):
            self.test(name, lambda p=preset,s=S,a=A,n=counts: self.comparison(p,s,a,n))
        self.test('malformed FileReader imports preserve complete session', self.malformed)
        self.test('edge list IDs, rejection, actual file roundtrip and inert labels', self.ids)
        self.test('all 4096 loaded entries available with honest exact 2^100 total', self.opens)
        self.test('mode/edit/undo/cancel during enumeration and tiny search budget', self.interruption)
        self.test('import undo/redo and native text Ctrl+Z', self.undo_and_text)
        self.test('weak patch reference explanation and strict inequality', self.explanations)
        self.test('selection/mode clears old witnesses and preserves unsent draft', self.transients)
        self.test('metadata, seed, limits and recomputed generator certificate', self.provenance)
        self.test('independently opened SVG and report downloads', self.static_exports)
        def health():
            errors = self.c.js('window.__errs')
            assert errors == [], errors
            exceptions = [e['params'].get('exceptionDetails') for e in self.c.events if e.get('method') == 'Runtime.exceptionThrown']
            assert not exceptions, exceptions
            urls = [e['params']['request']['url'] for e in self.c.events if e.get('method') == 'Network.requestWillBeSent']
            assert all(u.startswith(('file:', 'blob:', 'data:')) for u in urls), urls
            created = self.c.js('window.__workerCreated')
            messages = self.c.js('window.__workerMessages')
            assert (created > 0 and messages > 0) if self.engine == 'worker' else created == 0, (created, messages)
            return {'startupErrors': errors, 'externalRequests': 0, 'workersCreated': created, 'workerMessages': messages}
        self.test('startup and runtime observers, offline requests, selected engine', health)
        return self.rows


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chrome')
    parser.add_argument('--engine', choices=('both', 'worker', 'fallback'), default='both')
    parser.add_argument('--output', default=str(Path(ROOT, 'tests', 'e2e_regressions_current.json')))
    args = parser.parse_args()
    engines = ('worker', 'fallback') if args.engine == 'both' else (args.engine,)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    result = {'date': datetime.now(timezone.utc).isoformat(), 'page': PAGE, 'offline': True,
              'os': platform.platform(), 'python': platform.python_version(),
              'distributionSha256': hashlib.sha256(Path(ROOT, 'dist', 'index.html').read_bytes()).hexdigest(),
              'startupObserversBeforeNavigation': True, 'engines': {}}
    for engine in engines:
        folder = Path(ROOT, 'tests', 'browser_regression_artifacts', stamp, engine)
        folder.mkdir(parents=True, exist_ok=True)
        with Browser(args.chrome, engine == 'fallback', str(folder)) as c:
            result['browser'] = c.call('Browser.getVersion')
            result['engines'][engine] = RegressionRun(c, folder, engine).run()
        Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    rows = [r for engine in result['engines'].values() for r in engine]
    result.update(passed=sum(r['pass'] for r in rows), total=len(rows))
    Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"{result['passed']}/{result['total']} browser regression groups passed")
    return 0 if result['passed'] == result['total'] else 1


if __name__ == '__main__':
    sys.exit(main())
