// Drawing-only explanations derived from the active, tested topology model.
// These previews never replace A and are discarded after analytical edits.
import { members, setOf, pathInto } from '../kernel/topology.js';

function coverPath(T, from, to) {
  if (from === to) return [from];
  const previous = new Map([[from, null]]), queue = [from];
  for (let p = 0; p < queue.length; p++) {
    const current = queue[p];
    for (const [a, b] of T.covers) {
      if (a !== current || previous.has(b)) continue;
      previous.set(b, a); queue.push(b);
      if (b === to) {
        const path = [b];
        while (previous.get(path[0]) !== null) path.unshift(previous.get(path[0]));
        return path;
      }
    }
  }
  return [];
}

export function neighbourhoodTrace(model, vertex, classIndex = null) {
  const T = model.topo;
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= T.n) return null;
  const mask = T.N[vertex].slice();
  return {
    key: classIndex === null ? `vertex:${vertex}` : `class:${classIndex}`,
    kind: classIndex === null ? 'neighbourhood' : 'class', origin: vertex, classIndex,
    mask, arcs: model.mode === 'weak-patch' ? [] : model.arcs.filter(([a, b]) => mask[a] && mask[b]),
    classes: T.classes.map((c, i) => c.some(x => mask[x]) ? i : -1).filter(i => i >= 0),
    path: null, referenceOnly: false,
  };
}

export function relationTrace(model, from, to, kind = 'relation') {
  const T = model.topo;
  const valid = i => Number.isInteger(i) && i >= 0 && i < (kind === 'cover' ? T.k : T.n);
  if (!valid(from) || !valid(to)) return null;
  const origin = kind === 'cover' ? T.classes[from][0] : from;
  const target = kind === 'cover' ? T.classes[to][0] : to;
  let path = null, holds = false;
  if (kind === 'arc') {
    holds = model.arcs.some(([a, b]) => a === from && b === to);
    if (holds) path = [from, to];
  } else if (kind === 'cover') {
    holds = T.covers.some(([a, b]) => a === from && b === to);
    if (holds) path = pathInto(model, origin, setOf(T.n, T.classes[to]));
  } else {
    holds = Boolean(T.N[origin][target]);
    if (holds && model.mode !== 'weak-patch') path = pathInto(model, origin, setOf(T.n, [target]));
  }
  const points = kind === 'cover' ? [...T.classes[from], ...T.classes[to]] : [origin, target];
  const mask = setOf(T.n, [...points, ...(path || [])]);
  const referenceOnly = kind === 'arc' && model.mode === 'weak-patch';
  const quotientPath = holds && !referenceOnly ? coverPath(T, T.pointToClass[origin], T.pointToClass[target]) : [];
  return { key: `${kind}:${from}:${to}`, kind, from, to, origin, target, holds,
    mask, path, arcs: path ? path.slice(1).map((p, i) => [path[i], p]) : [],
    classes: [...new Set(members(mask).map(x => T.pointToClass[x]))],
    quotientPath, referenceOnly };
}
