import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { writePreservingDistribution } from '../tools/preserve_distribution.mjs';

function workspace(t) {
  const parent = resolve(tmpdir()), root = mkdtempSync(join(parent, 'uphill-history-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), parent);
    assert.ok(basename(root).startsWith('uphill-history-'));
    rmSync(root, { recursive: true });
  });
  return { root, page: join(root, 'dist', 'index.html'), history: join(root, 'versions') };
}
const page = (version, body = 'original') => `<script>const APP_VERSION = '${version}';</script><p>${body}</p>`;

test('build preserves an openable old page before replacing current and leaves user backups untouched', t => {
  const w = workspace(t), old = page('1.10.0');
  mkdirSync(dirname(w.page)); writeFileSync(w.page, old);
  const backup = join(dirname(w.page), 'user-backup.html'); writeFileSync(backup, 'user saved page');
  const result = writePreservingDistribution(w.page, w.history, page('1.11.0'));
  assert.equal(readFileSync(result.archived, 'utf8'), old);
  assert.equal(readFileSync(w.page, 'utf8'), page('1.11.0'));
  assert.equal(readFileSync(backup, 'utf8'), 'user saved page');
});

test('same-version variants retain both copies and repeated identical builds are no-ops', t => {
  const w = workspace(t), first = page('1.10.0'), second = page('1.10.0', 'second');
  writePreservingDistribution(w.page, w.history, first);
  writePreservingDistribution(w.page, w.history, second);
  const result = writePreservingDistribution(w.page, w.history, page('1.11.0'));
  assert.equal(readFileSync(join(w.history, '1.10.0', 'index.html'), 'utf8'), first);
  assert.equal(readFileSync(result.archived, 'utf8'), second);
  assert.notEqual(result.archived, join(w.history, '1.10.0', 'index.html'));
  assert.deepEqual(writePreservingDistribution(w.page, w.history, page('1.11.0')), { changed: false, archived: null });
});

test('an archive collision fails before replacing the current page', t => {
  const w = workspace(t), old = page('1.10.0');
  mkdirSync(dirname(w.page)); writeFileSync(w.page, old);
  const hash = createHash('sha256').update(old).digest('hex');
  for (const name of ['1.10.0', `1.10.0-${hash}`]) {
    mkdirSync(join(w.history, name), { recursive: true });
    writeFileSync(join(w.history, name, 'index.html'), 'different preserved content');
  }
  assert.throws(() => writePreservingDistribution(w.page, w.history, page('1.11.0')), /Conflicting version archives/);
  assert.equal(readFileSync(w.page, 'utf8'), old);
});

test('unrecognised embedded version cannot escape the history folder', t => {
  const w = workspace(t);
  writePreservingDistribution(w.page, w.history, page('../../outside'));
  const result = writePreservingDistribution(w.page, w.history, page('1.11.0'));
  assert.equal(result.archived, join(w.history, 'unversioned', 'index.html'));
  assert.equal(existsSync(join(w.root, 'outside')), false);
});
