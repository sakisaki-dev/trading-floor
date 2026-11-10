# Pre-registration: the AI government

This file is the pre-registration that [regulator-spec.md](regulator-spec.md) section 20.1 calls for. It has two
parts, committed separately. Each part's hash is in the commit that adds it, and nothing in a committed part changes
afterwards. A change means a new, separately labelled run, and every deviation is listed in the results.

## Status

| Part | What | State |
|---|---|---|
| 1 | The bug-versus-result rubric, the world-response tests (Gate B) and how they are reported | Committed 2026-11-10 |
| 2 | Hypothesis numbers, initial dials with A0's measured balance, analysis windows, cadences, the frozen analysis script | After Gate B |

## Deviations already on record

These happened before this file existed. They are reported with every result.

1. **Run g1 started before any pre-registration.** It ran on 2026-11-09 (Haiku 5.5, brief v1, seed 1, 1,500 weeks,
   commit `aef611e`), after the plumbing test and before Gate B. It is a **pilot**. It is reported in full, but it
   tests none of H1a–H3b. The pre-registered G1 run comes after part 2.
2. **The plumbing-200 run** (seed 1, 200 weeks) also used a real session. It is reported as a plumbing test.
3. **The first Gate B runs started about an hour before part 1 was committed:** A0 on seeds 1–5, and A1, A2 and A3
   on seed 1, all 1,500 weeks at commit `aef611e`. No output from them was read before the commit beyond the
   setup line ("world ready in N s").
4. **The government's view changes between g1 and G1.** It gains statistics the engine already measured but never
   wrote to `now.json` (spec 8.4). Nothing from 8.3 is added. g1 and G1 therefore differ in what the government sees,
   and the scripted arms are unaffected, because they read only fields that existed before.

## Part 1

### 1.1 The bug-versus-result rubric

This is copied from spec 17.4 and binding from here on.

A world response that differs from expectation is a bug only if a specific line of code does something other than
what the spec or the code's own documentation says it does, and the fix must be traceable to that difference.
Otherwise it is a result: it is reported, and the question is restated. No world response leads to adding or retuning
a force.

A fix to a bug that changes engine results invalidates every run made before it for comparison with runs made after
it. All the arms and the G1 run are then re-run on the fixed engine, and the old runs are reported as pre-fix.

### 1.2 The world-response runs (Gate B)

All of them run headless with `--pace 0` on the regulated preset, with the scripted governments in
[gov/arms.mjs](../gov/arms.mjs) and no model. The same seed gives the same league under every arm (split streams,
12.1).

| Test | Runs | Length | Notes |
|---|---|---|---|
| A0, do nothing | Seeds 1–10 | 1,500 weeks | The control; g1's seed is seed 1 |
| A1, balanced budget | Seed 1, later seeds 2–3 | 1,500 | |
| A2, greedy: fee 5%, no spending | Seed 1, later seeds 2–3 | 1,500 | Also the starvation test |
| A3, generous: spends everything | Seed 1, later seeds 2–3 | 1,500 | Also the generosity test |
| A4, one random legal move every 23 weeks | Seed 1 | 1,500 | Spec 12.2 asks for g1's cadence. g1 changed a dial on 41 of its 181 turns, a median of 23 weeks apart. |
| Laffer sweep, trade fee | 8 levels: 0, 0.5%, 1%, 2%, 4%, 8%, 16%, 30%; seed 1 | 1,500 | All revenue recycled as allowance the next week; the late window is weeks 751–1,500 |
| Do nothing, long | Seed 1 | 7,000 | Whether the world stays stable at the initial dials |

**Smaller than the spec asks** because of compute (one Mac, 8 cores):
- The Laffer sweep: one tax, one seed, 1,500 weeks. The spec asks for two taxes, three seeds and 2,000 weeks.
- A1–A3: one seed first.
- A0b and the credibility, avoidance and elasticity tests: deferred.

### 1.3 How each run is reported

Every run that starts is reported, including broken ones.

The comparison is `node tools/compare_arms.mjs <runs>`, applied identically to every run. It reports two windows:
- the last week;
- the mean over weeks 751–1,500, the second half. For the 7,000-week run, the halves are of its full length.

The measures:
- bots;
- median worth and mean cash;
- the Gini;
- the share of bots in arrears (`mkt.broke` ÷ bots), and the bots with unpaid bills;
- the richest 10%'s share of cash;
- the Vault index and the marks index;
- trades;
- the treasury and the government's own account;
- bots' total cash and the cards' total value;
- forced sales a week;
- money created and destroyed by line, summed over the run.

The **A0 spread** is the range from the lowest to the highest of the A0 seeds. With 10 seeds this stands in for the
95% interval the spec names. A run's value beyond the spread is marked as above or below.

**The Laffer result:**
- the mean weekly revenue in the late window at each fee;
- whether it peaks at an interior fee;
- trades, bots and the Vault index at each fee. These are the volume and population terms. The avoidance term needs
  per-bot behaviour logging that does not exist yet, so it is not reported.

**Spec 2.3 primary outcomes:**
- Fiscal stance, the buffer and the consumption share are computed from the treasury's ledger lines in the frames.
- Bot welfare at bid value is not in the frames, which record worth at marks. Until a bid-value series is added
  (measurement only), welfare is reported as median worth at marks plus living and lifestyle costs paid per bot.
  This is a deviation and is labelled so.
