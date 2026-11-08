# Long runs

Small summaries of the two long Trading Floor page runs, so the README's long-run findings can be checked without the
saves themselves (about 150 MB each, kept out of git). Both ran on engine 1.x, before the 2.0 audit.

| File | Run | Weeks | Setting changes |
|---|---|---|---|
| `seed11906-realism.json` | Realism preset, seed 11906, learning within a lifetime on | 7,973 | Dealers off at week 1,102 |
| `seed12864-laws.json` | Laws preset, seed 12864 | 3,009 | Many in the first 385 weeks (listed in the file), none after |

Each file holds:
- `atSaves`: at the end of every save of the run, the bot count, the five largest families (lineages) with their
  sizes and shares, the family tree's depth, the median lending share and the skill carry-over between generations.
  `sameRunAsLongest` confirms each save is the same run as the longest one.
- `population`: exact bot counts every 4 weeks, wherever a save holds them (each save keeps full detail for its last
  ~104 weeks only, so the series has gaps).
- `series`, every 20 weeks: trades and auction sales per week (20-week means), the cash share of the 10% of bots with
  the most cash, broke bots, the median lending share, the median hidden value, the median price ÷ hidden value, the
  rank correlation of price with value across players, and the correlation of 20-week log changes in price with
  20-week log changes in value.

Rebuild (needs the saves in `runs/saves/`):

```bash
node --max-old-space-size=12000 scripts/summarize_saves.mjs results/long-runs/seed11906-realism.json runs/saves/page-seed11906-realism-w*.json
node --max-old-space-size=12000 scripts/summarize_saves.mjs results/long-runs/seed12864-laws.json runs/saves/page-seed12864-laws-w*.json
node scripts/long_run_figure.mjs results/long-runs/seed11906-realism.json docs/figures/long-run.svg
```
