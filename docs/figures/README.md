# Figures

## overview.svg

Three panels over 200 weeks of one Realism run: (a) the Vault index and the marks index, (b) bots in the market with
cumulative arrivals and departures, (c) the tactic tracker's tactics as shares of profiled bots, one bar per
generation. Definitions are in [METRICS.md](../METRICS.md) and [TACTICS.md](../TACTICS.md).

### How it was made

```bash
node sim.mjs --preset realism --seed 31761 --weeks 200 --out runs/fig-31761
node scripts/figure.mjs runs/fig-31761/run.json docs/figures/overview.svg
```

`runs/` is not committed. The run is deterministic: the same code, data, settings and seed give the same frames.

### Run metadata

| Field | Value |
|---|---|
| Run id | `fig-31761` |
| Seed | 31761 |
| Preset | `realism` (`configs/realism.json`) |
| Weeks | 200 (10 generations) |
| Engine | 1.0.0, repository commit `85ffd9a` |
| Node | v24.10.0 |
| World setup (including 3 practice generations) | 119 s |
| Seconds per week | 2.66 (one core, after setup) |
| At the open | 501 bots, 461 players (203 from the save, 258 generated) |
| Date | 2026-11-07 |

### What the figure shows (one seed; observations, not findings)

- The Vault index ended at 108 and the marks index at 149. The marks index first rose more than 5% above the Vault index
  (after week 60) at week 84.
- The population fell from 501 (a peak of 518 near week 20) to 320: 188 bots arrived and 369 left. Deaths with
  heirs are not counted as departures.
- Two tactics persisted through all 10 generations. At week 200, T2 (53%: trades at auction, trades with other bots,
  opens few packs) returned a median −3% at selling value and was flagged as crowding; T1 (47%: rarely trades at
  auction, trades with dealers and outsiders, opens about 8 packs a generation) returned +10%. Three short-lived
  tactics of heavy borrowers who were forced to sell (T3, T4, T5) each lasted one generation at 6–9% of bots.
  Silhouettes were 0.15–0.17, so these are regions of a continuum rather than separate types.
