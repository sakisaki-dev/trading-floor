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

## Deviations after part 1

Part 1 above is unchanged. Each deviation is listed here as it happens.

5. **A bug fix moved the engine to 2.0.1 during Gate B** (2026-11-10). Repeat sales dated every card's opening price
   at week 0. Rule 1.1 classifies this as a bug, because the documentation says the opening counts as the card's
   first trade, which means the week it opened. The eight runs started at `aef611e` (2.0.0) are kept as the **pilot
   comparison set for g1**, which ran on the same engine. They are reported only against g1. Gate B proper runs on
   2.0.1 in `runs/gateb/`.
6. **The 7,000-week do-nothing run is deferred.** On a full machine it would take more than a day. It runs after the
   rest of Gate B.
7. **The regulated preset's living cost now scales with wealth** (2026-11-12, engine 2.1.0). Eight do-nothing runs
   that each changed one setting (DEVLOG, "What drains the regulated world") showed that the fixed 200 coins a bot a
   week left two thirds of bots broke under every government, so no policy could show against the seed spread. This is
   a change of world, not a bug fix: the owner chose it. The regulated preset now charges `livingCost` 0 and
   `lifestyle` 0.001 (about the same total, in proportion to equity), the setting tested as `livingProp`. Gate B is
   started over on 2.1.0 in `runs/gateb/`; nothing run before is part of it. The Claude government is not re-run in
   this stretch (no subscription use), so G1 waits.
8. **A printing dial, a steward arm and open-ended runs** (2026-11-13, engine 2.2.0). Three 300-week trials on seed 1
   (A0, G1 with `--brief v1`, and a steward with a mission brief) showed card prices falling in every arm because packs
   keep minting copies while coins drain out, and no dial reached either cause. The owner chose to give the government
   one supply lever: `printRate`, the share of the normal packs released a week (0 to 1; copies already out are never
   removed). Unset it reads as 1, so every earlier run replays identically (checked: the first 30 weeks of A0 seed 1
   hash the same as on 2.1.0); it is not a bot input. Also new: the steward brief (`--brief steward`, its own label;
   the sleeping paragraph was added after the first trial) with `--own-account off`, and `--weeks 0` for runs that go
   on until stopped. The trials are exploratory; none is part of G1 or Gate B.

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
