// Uphill Topology Explorer - open sets: listing and exact counting.
// Spec section 09. Opens are enumerated as UPSETS OF THE QUOTIENT (never as
// 2^|V| vertex subsets) and lifted to vertices. Every result carries an
// explicit status: a truncated list is labelled incomplete, and an
// interrupted count is a lower bound, never an exact total.

export const DEFAULT_LIMITS = Object.freeze({
  maxVertices: 200, maxEdges: 5000, autoEnumerateMaxQuotient: 16,
  displayLimit: 4096, timeBudgetMs: 5000, stateBudget: 1000000,
});

const popcount = m => { let c = 0; while (m) { m &= m - 1n; c++; } return c; };
const lowest = m => { let i = 0; while (!((m >> BigInt(i)) & 1n)) i++; return i; };

// Budget / cancellation controller shared by listing and counting.
export class Budget {
  constructor({ stateBudget = DEFAULT_LIMITS.stateBudget, timeBudgetMs = DEFAULT_LIMITS.timeBudgetMs,
    isCancelled = () => false, now = () => Date.now() } = {}) {
    this.states = 0; this.stateBudget = stateBudget;
    this.deadline = now() + timeBudgetMs; this.now = now; this.isCancelled = isCancelled;
    this.stop = null;
  }
  tick() {
    this.states++;
    if (this.stop) return false;
    if (this.states > this.stateBudget) { this.stop = 'budget'; return false; }
    if (this.states === 1 || (this.states & 1023) === 0) {
      if (this.isCancelled()) { this.stop = 'cancelled'; return false; }
      if (this.now() > this.deadline) { this.stop = 'time'; return false; }
    }
    return true;
  }
}

// Every upset of the quotient poset (up[i], down[i] include i), in a fixed
// deterministic order. Each upset is produced exactly once.
export function* upsets(k, up, down, budget) {
  const all = k === 0 ? 0n : (1n << BigInt(k)) - 1n;
  function* visit(inc, exc) {
    if (!budget.tick()) return;
    const decided = inc | exc;
    if (decided === all) { yield inc; return; }
    const p = lowest(all & ~decided);
    const add = up[p];
    if ((add & exc) === 0n) yield* visit(inc | add, exc);
    const rem = down[p];
    if ((rem & inc) === 0n) yield* visit(inc, exc | rem);
  }
  yield* visit(0n, 0n);
}

// Exact number of upsets, with memo on the undecided set; components
// multiply; an antichain gives 2^k. Returns {status, value(BigInt|null)}.
export function countUpsets(k, up, down, budget) {
  if (k === 0) return { status: 'exact', value: 1n, method: 'empty' };
  const all = (1n << BigInt(k)) - 1n;
  const comparable = i => (up[i] | down[i]) !== (1n << BigInt(i));
  let anti = true;
  for (let i = 0; i < k; i++) if (comparable(i)) { anti = false; break; }
  if (anti) return { status: 'exact', value: 1n << BigInt(k), method: 'antichain 2^k' };
  // connected components of the comparability graph
  const comps = [], seen = new Array(k).fill(false);
  for (let s = 0; s < k; s++) {
    if (seen[s]) continue;
    let m = 0n; const q = [s]; seen[s] = true;
    for (let h = 0; h < q.length; h++) {
      const x = q[h]; m |= 1n << BigInt(x);
      const nbr = up[x] | down[x];
      for (let y = 0; y < k; y++) if (!seen[y] && ((nbr >> BigInt(y)) & 1n)) { seen[y] = true; q.push(y); }
    }
    comps.push(m);
  }
  const memo = new Map();
  const count = S => {
    if (S === 0n) return 1n;
    const key = S.toString(36);
    if (memo.has(key)) return memo.get(key);
    if (!budget.tick()) throw new Error('STOP');
    const p = lowest(S);
    // p in the upset: everything above p is in; p out: everything below out
    const v = count(S & ~up[p]) + count(S & ~down[p]);
    memo.set(key, v);
    return v;
  };
  try {
    let total = 1n;
    for (const c of comps) total *= count(c);
    return { status: 'exact', value: total, method: comps.length > 1 ? 'product over components' : 'memoized recursion' };
  } catch (e) {
    if (e.message !== 'STOP') throw e;
    return { status: 'not-computed', value: null, method: 'budget exceeded: ' + budget.stop };
  }
}

// enumerateOpens(topo, opts) -> machine-readable record (spec section 09)
export function enumerateOpens(T, opts = {}) {
  const limits = Object.assign({}, DEFAULT_LIMITS, opts);
  const budget = opts.budget || new Budget(limits);
  const listed = [];
  let status = 'complete';
  const gen = upsets(T.k, T.up, T.down, budget);
  for (const m of gen) {
    if (listed.length >= limits.displayLimit) { status = 'display-cap'; break; }
    listed.push(m);
  }
  if (budget.stop) status = budget.stop === 'cancelled' ? 'cancelled' : 'interrupted';
  let count;
  if (status === 'complete') count = { status: 'exact', value: BigInt(listed.length), method: 'complete listing' };
  else count = countUpsets(T.k, T.up, T.down, new Budget(Object.assign({}, limits, { isCancelled: budget.isCancelled })));
  return {
    status, listedCount: listed.length, displayLimit: limits.displayLimit,
    upsetMasks: listed, opens: listed.map(m => T.lift(m)),
    count, lowerBound: count.status === 'exact' ? null : BigInt(listed.length),
    limits,
  };
}

export function describeEnumeration(r, carrierWord = 'open sets') {
  const exact = r.count.status === 'exact' ? r.count.value : null;
  if (r.status === 'complete') return `All ${r.listedCount} ${carrierWord}`;
  if (r.status === 'display-cap') {
    return `Showing the first ${r.listedCount.toLocaleString('en')} generated ${carrierWord}; list incomplete.`
      + (exact !== null ? ` Exactly ${exact.toString()} in total.` : ' Total not computed.');
  }
  return `At least ${r.listedCount.toLocaleString('en')} ${carrierWord} found; `
    + (exact !== null ? `exactly ${exact.toString()} by counting.` : 'total not computed.');
}

export { popcount };
