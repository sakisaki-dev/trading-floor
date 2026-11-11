// Scripted governments for the arms (spec 12.2), run in the driver's process. Each decides every week from the public
// indicators only (what the AI sees in state/now.json) and its controls land the next week. No model, no randomness except
// A4's own seeded stream, so every arm is deterministic on its seed.
import * as E from '../engine.mjs';
const prng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const ARMS = {
  // A0: do nothing (board inputs present but always zero)
  A0: () => ({ decide: () => null }),
  // A1: balanced-budget thermostat: spending = the last 4 weeks' average revenue, plus a quarter of the gap between the
  // treasury and a 4-week buffer of that revenue each week; the allowance carries what royalties leave
  A1: () => ({ decide: (W, ind) => { const rev = ind.revenue4w / 4, roy = -(W.moneyWeek?.treasury?.lines?.royalties || 0), S = Math.max(0, rev + (ind.treasury - 4 * rev) / 4); return { allowance: Math.max(0, (S - roy) / Math.max(1, ind.bots)) }; } }),
  // A2: scripted greedy: taxes at a fixed high rate (opts.fee; the Laffer sweep's revenue-maximising rate once measured), no spending
  A2: (o = {}) => ({ decide: (W) => (W.t === 0 ? { fee: o.fee ?? 0.05, allowance: 0, royaltyCap: 0 } : null) }),
  // A3: scripted generous: spends all revenue (last week's) as allowance, royalties uncapped
  A3: () => ({ decide: (W, ind) => ({ royaltyCap: 1, allowance: Math.max(0, (ind.treasury + ind.revenue) / 2 / Math.max(1, ind.bots)) }) }),
  // L: the Laffer sweep (spec 13.3): one tax dial fixed at a level from week 0 (opts.dial, default the trade fee; opts.level),
  // and every week all of last week's revenue goes back to the bots as allowance, so a high rate does not shrink the base
  // only by draining coins into the treasury
  L: (o = {}) => ({ decide: (W, ind) => ({ ...(W.t === 0 ? { [o.dial ?? 'fee']: o.level ?? 0.01 } : {}), allowance: Math.max(0, ind.revenue / Math.max(1, ind.bots)) }) }),
  // A4: random legal moves: every `every` weeks one numeric dial moves to a random legal value near its current one
  A4: (o = {}) => { const r = prng((o.seed ?? 1) * 7919 + 777), every = o.every ?? 10, keys = Object.keys(E.GOV_DIALS).filter((k) => !E.GOV_DIALS[k].bool);
    return { decide: (W) => { if (W.t % every) return null; const k = keys[Math.floor(r() * keys.length)], D = E.GOV_DIALS[k], v = (D.cfg ? W.cfg[k] : W.gov.d[k]) ?? 0; let x = v * Math.exp((r() - 0.5)) + (r() - 0.5) * 0.01; if (D.int) x = Math.round(x); x = Math.min(D.hi, Math.max(D.lo, x)); return { [k]: x }; } }; },
};
