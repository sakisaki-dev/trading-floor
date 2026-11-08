# Figures

## overview.svg

Three panels over 200 weeks of one Realism run: (a) the Vault index and the marks index, (b) bots in the market with
cumulative arrivals and departures, (c) the tactic tracker's tactics as shares of profiled bots, one bar per
generation. Definitions are in [METRICS.md](../METRICS.md) and [TACTICS.md](../TACTICS.md).

### How it was made

```bash
node sim.mjs --preset realism --seed 31761 --weeks 200 --out runs/fig-31761-v2
node scripts/figure.mjs runs/fig-31761-v2/run.json docs/figures/overview.svg
```

`runs/` is not committed. The run is deterministic: the same code, data, settings and seed give the same frames.

### Run metadata

| Field | Value |
|---|---|
| Run id | `fig-31761-v2` |
| Seed | 31761 |
| Preset | `realism` (`configs/realism.json`) |
| Weeks | 200 (10 generations) |
| Engine | 2.0.0, repository commit `a541a0c` (split random streams, `rngStreams: 'split'`) |
| Node | v24.10.0 |
| World setup (including 3 practice generations) | 121 s |
| Seconds per week | 2.36 (one core, after setup) |
| At the open | 501 bots, 461 players |
| Date | 2026-11-07 |

### What the figure shows (one seed; observations, not findings)

- The Vault index ended at 77 (range 63–100) and the marks index at 385, its highest point. The marks index was more
  than 5% above the Vault index from week 1 to the end. At week 60 the two stood at 67 and 193, at week 100 at 73 and
  273. Since 2.0.0, cards with no price open at comparable sales rather than at hidden value, and both indexes are
  measured against those openings.
- The population fell from 501 (a peak of 515 at week 20) to 344: 189 bots arrived and 346 left. Deaths with heirs are
  not counted as departures.
- Two tactics persisted through all 10 generations, and no other appeared. At week 200, T1 (59%: rarely trades at
  auction, trades with dealers and outsiders, buys 14% below the mark) returned a median −3% at selling value; T2 (41%:
  trades at auction and with other bots, buys 48% above the mark) returned +2%. T1's share ranged from 49% to 64%. In
  generation 4 the tracker flagged T1 as crowding and T2 as cannibalized by it. Silhouettes were 0.14–0.17, so these
  are regions of a continuum rather than separate types.

### Engine 1.0.0 (before the audit's fixes)

The first version of this figure (run `fig-31761`, engine 1.0.0, commit `85ffd9a`) ended with the Vault index at 108,
the marks index at 149 and 320 bots (188 arrivals, 369 departures), with the same two tactics and three short-lived
heavy-borrowing tactics that each lasted one generation. It is not comparable with 2.0.0 (see `CHANGELOG.md`).

## long-run.svg

Three panels over the 7,973 weeks of seed 11906 (Realism, engine 1.x, dealers off at week 1,102, the dashed line):
(a) bots in the market where a save holds exact counts, and the largest family's share of all bots at each save;
(b) order-book trades and card auction sales per week, 20-week means; (c) the rank correlation of price with hidden
value across players, and the correlation of their 20-week changes.

Drawn from the checked-in summary, so no save is needed:

```bash
node scripts/long_run_figure.mjs results/long-runs/seed11906-realism.json docs/figures/long-run.svg
```

How the summary was made: [results/long-runs](../../results/long-runs/README.md).
