import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Keep a complete, directly openable copy before replacing the current page.
// Existing archives, including a different build with the same version, are
// never overwritten. A failed archive write leaves the current page intact.
export function writePreservingDistribution(destination, history, html) {
  const next = Buffer.from(html, 'utf8');
  let archived = null;
  if (existsSync(destination)) {
    const previous = readFileSync(destination);
    if (previous.equals(next)) return { changed: false, archived };
    const match = previous.toString('utf8').match(/\b(?:const\s+)?APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    const version = match && /^\d+(?:\.\d+){1,3}(?:[-+][a-zA-Z0-9.-]+)?$/.test(match[1]) ? match[1] : 'unversioned';
    const hash = digest(previous);
    for (const name of [version, `${version}-${hash}`]) {
      const folder = join(history, name), file = join(folder, 'index.html');
      if (existsSync(file)) {
        if (!readFileSync(file).equals(previous)) continue;
      } else {
        mkdirSync(folder, { recursive: true });
        writeFileSync(file, previous, { flag: 'wx' });
      }
      if (!readFileSync(file).equals(previous)) throw new Error('Previous-version preservation failed.');
      archived = file;
      break;
    }
    if (!archived) throw new Error('Conflicting version archives; current page was not replaced.');
  }
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.new`;
  writeFileSync(temporary, next, { flag: 'wx' });
  renameSync(temporary, destination);
  return { changed: true, archived };
}
