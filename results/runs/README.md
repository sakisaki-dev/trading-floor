# Engine 2.0 runs

Per-generation summaries of the engine 2.0 page runs that [docs/PARALLELS.md](../../docs/PARALLELS.md) cites, so its
figures can be checked without the saves (30–60 MB each, kept out of git).

| File | Run | Weeks | Settings |
|---|---|---|---|
| `seed83148-realism.json` | Realism preset, seed 83148 | 149 | Preset defaults |
| `seed9556-realismLight.json` | realismLight preset, seed 9556 | 177 | Central bank on, cash shocks 0.002, `lossRate` 0.002, `holdCost` 0.001, entry weights changed, all at week 0 |
| `seed24306-realismLight.json` | realismLight preset, seed 24306 | 410 | Allowance 1,000, `heirs` 2, `estateSale` 0.25, central bank on, price guide and league updates off, all at week 0 |
| `seed38148-realismLight.json` | realismLight preset, seed 38148 | 996 | Preset defaults (`heirs` 1, `estateSale` 0.4) |

Each file holds the preset and starting rules, the state at the last week (indexes, Gini, cash shares, auction
premium, the three most valuable cards) and, for every generation (20 weeks):

- `indexes`: the repeat-sales (Vault), marks and value indexes, and price ÷ value;
- `gini`, `worthShare` and `cashShare` (top 10%, middle 40%, bottom half);
- `auctionOverMark`: what auctions cleared at against the mark;
- `book`: the share of cards with no bot orders, bid and ask counts, and how far bids sit below the mark (log);
- `credit`: coins offered and asked for on loan, lent, and total debt;
- `returnCarryOver` (rank correlation of returns between generations), `largestFamily`, `exits`, `entries`, `heirs`,
  `quitNewMedian`;
- `tactics`: each tactic's share, return and description, and any tactic that died.

Two figures in PARALLELS.md come from the saves' trade logs, which these files leave out: the resale losses in seed
83148 (−22% to other bots, −30% to dealers) and the estates and the Cut 1/1 autograph in seed 9556.

The value and marks indexes use the cards that existed at week 0. In seed 38148 every one of those players had
retired by about week 588, so both indexes stop moving there; compare the Vault index with them only before then.

Rebuild (needs the saves in `runs/saves/`):

```bash
node --max-old-space-size=8192 scripts/summarize_run.mjs results/runs/seed38148-realismLight.json runs/saves/page-seed38148-realismLight-w996.json
```
