# Spec: round 3 (a correction, two measurement fixes, and the next experiments)

For the agent working in `sandbox/`. It follows your report on the five Realism runs (300 weeks; seeds 88, 31761, 7,
4242, 2026) and builds on `realism-preset-spec.md`.

The owner's framing: the sandbox is for experimenting with **neural networks, machine behavior and evolution**. Rules
are the environment the networks adapt to. So:
- fix only code bugs and errors in the specs;
- add every other change as a setting, keeping the current behavior available;
- answer questions with controlled comparisons (same seeds, one change);
- report outcomes as results, never tuned toward an expectation.

Don't commit or push unless the owner asks.

## 1. Correction: the marks fade (an error in `realism-factors-spec.md`)

The runaway marks index (68,024 on seed 31761, 138,497 on 4242 with the guide off; 2–3× the Vault index with it on) is
caused by an instruction in the earlier spec: with `markHalfLife`, an untraded mark drifts "toward the ask median when
there are no bids".

That compounds:
1. Asks are placed relative to the mark (up to +`priceRange`).
2. The mark drifts up toward them.
3. The next asks are placed relative to the higher mark.

It's the same compounding as the pack spiral.

Replace the rule in both `markRule 'book'` and the `markHalfLife` fade:
- **Asks can only pull a mark down. Bids can only push it up.** A standing ask above the mark, or a bid below it, never
  moves it.
- **Fade:**
  - with both sides standing, the mark drifts toward the middle of the bid and ask levels, but never above the ask level
    or below the bid level;
  - with only asks standing, it drifts toward the lower of the ask level and the card's last trade price;
  - with only bids standing, toward the higher of the bid level and the last trade;
  - with neither, it holds.
- `markDepth` and `markWeeks` are unchanged.

Acceptance:
- On seeds 31761 and 4242, guide off, the marks index stays within a small factor of the Vault index over 300 weeks.
  Report the ratio over time; don't tune toward a number.
- A unit check: a card with only asks standing above its mark keeps its mark.

## 2. Measurement: fire sales

Fire sales are exactly 0 in every run. With a lone bidder paying its own bid, "sold for 1 coin or less" now almost never
happens, so the light has gone blind.

Redefine `aucFree` (keep the field name and add `aucFreeOld` for the old count) as **card auction sales at less than
`fireShare` (default 0.3) of the card's mark the week before the sale**. Use the health board's "Fire sales" light and its
thresholds unchanged. Confirm with a test that it counts something when it should: a forced sale into a single low
bidder.

## 2b. Bug: the Vault index drifts upward on long runs

Seed 12864 run to week 1716 (`sandbox/runs/saves/page-seed12864-laws-w1716.json`, built from the committed engine):

| Weeks | Median player price | Mean of players' price changes (geometric) | Marks index | Vault index |
|---|---|---|---|---|
| 782–1202 | ×1.32 | ×1.56 | ×1.47 | ×3.27 |
| 1202–1716 | ×1.00 | ×1.13 | ×0.96 | ×2.35 |
| 782–1716 | ×1.40 | ×1.60 | ×1.42 | **×7.70** |

The same run continued to week 3009 (`page-seed12864-laws-w3009.json`, no setting changes after week 385): from week
1700 to 3009 the Vault index went 3,961 → 41,322 (×10.4) while the marks index went 312 → 273 (×0.87).

Trade-to-trade changes late in the run were a median +0.7%, 56% up. That is far too little to explain ×2.35 on flat
prices.

The regression index (all repeat-sales pairs in the last 104 weeks solved by least squares) seems to drift when its
window slides. Possible causes:
- how each new window is joined to the levels before it;
- pairs spanning long gaps;
- sales selected toward cards that are rising.

Find the cause and fix it, so the index tracks the median repeat-sale change over any window.

Acceptance: on this save (replayed from its frames and log, where the log covers it) or a fresh long run, the Vault
index's change over any 200-week window is within a small factor of the median player price change over the same
window. Report both.

## 3. Ablation: who reads the price guide (`priceGuide.who`)

With the guide on, prices follow value, but the guide-anchor output averages about 0.5 (an untrained network), while the
dealers price from the guide. The convergence may be the dealers' doing, not the bots'.

`priceGuide.who: 'all' | 'bots' | 'dealers'`, default `'all'` (today).
- `'bots'`: bots get the guide inputs and the guide anchor; dealers price from `Fpub` (last week's value, as before the
  guide).
- `'dealers'`: dealers price from the guide; bots' guide inputs are fixed at 0 and the guide anchor is ignored (the base
  is as if the output were 0).

Report per generation:
- the mean and 10th/50th/90th percentiles of the guide-anchor output;
- the same for the top 10% by worth.

## 4. Diagnostics: why skill doesn't carry over

Bots' returns correlate *negatively* between generations, on every seed. Three possible causes, each measurable without
changing the world:

- **Crowding:** when the worst bots copy the winners, the winning strategy gets common and its edge disappears. Measure:
  - at each generation end, the share of the population descended (by copying or inheritance) from the previous
    generation's top 10%;
  - the mean pairwise distance between bots' card networks (cosine distance of the flattened weights, on a sample of
    50 bots), and the same among the copied bots and their sources;
  - the number of strategy clusters: k-means on the card networks' responses to a fixed set of 24 sample cards, k
    chosen by silhouette, max 8. Report the count and the largest cluster's share.
- **Measurement at selling value:** each generation, record both the mark-based return and the bid-based return for every
  bot, and report the between-generation rank correlation of each, whatever `fitnessValue` is set to.
- **Learning within a lifetime keeping noise:** report the trials kept, and the rank correlation between a kept trial's
  score and the same bot's next-trial score. If kept trials don't outperform afterwards, they were noise.

Put these in a per-generation `gen` record in the frame (`gen.persistMark`, `gen.persistBid`, `gen.fromTop`,
`gen.netDist`, `gen.clusters`, `gen.clusterTop`, `gen.adaptKept`, `gen.adaptFollow`). Show them on the page under the
bots' panels.

## 5. Two settings to compare

### 5a. Dealers that fund themselves (`collectorFunding`)

Dealers' net buying (72–89k a week) is the largest money source, ahead of the allowance (about 32k) and royalties (5–14k).
So the bots evolve mostly against "sell to the dealers", not against the football.

`collectorFunding: 'budget' | 'self'`, default `'budget'` (today: `outsideBudget` coins a week, savings capped).

`'self'`:
- each dealer starts with `collectorStake` coins (default `outsideBudget × 20 ÷ collectors`, so a stake equal to 20 weeks
  of today's budget) and its starting stock;
- after that it spends only its cash: the stake plus what it earned selling. No weekly budget.

A dealer that runs out of cash only sells until it has cash again. Dealers stay a two-sided anchor, but no longer inject
money. Show their cash and net flow in the ledger.

### 5b. Pack bids anchored to what's inside (`packBid`, `packReserve`)

Pack bids are last clearing price × 0.37 to 2.72. That drove packs to free for 200 weeks in seed 12864, then ×2.65 a week
to 56,905, and the Realism runs lose about half their coins to packs in the first 20 weeks.

- `packBid: 'last' | 'contents'`, default `'last'` (today).
  - `'contents'`: a bot's pack bid has a base between the last clearing price and the pack's expected contents. Contents
    are valued at market prices (`evMarket`), or at the guide's prices when the guide is on for bots.
  - A new bot output, "anchor packs to contents", chooses how far toward the contents value the base moves (like the
    card price anchor). The existing pack-bid output then multiplies the base by ×0.37 to ×2.72.
  - New weights start small and random.
- `packReserve: 0` (share). When above 0, the house won't sell a pack below `packReserve` × its expected contents (at
  the guide when on, otherwise market). Unsold packs carry to next week as they do now.

Bots can still pay far above the contents; this only gives them an anchor to choose, and stops packs from being free when
`packReserve > 0`.

## 6. The runs

Seeds 88, 31761 and 7, 300 weeks, the Realism preset, with the marks correction and the new fire-sale count in every run.
Change one thing per comparison:

| Comparison | Runs (each on 3 seeds) |
|---|---|
| Baseline | Realism as it is |
| Who reads the guide | `priceGuide.who`: `'bots'`, `'dealers'` |
| Why skill doesn't carry over | `fitnessValue: 'mark'`; `adapt.on: false` |
| Dealer money | `collectorFunding: 'self'` |
| Pack pricing | `packBid: 'contents'`; then `packBid: 'contents'` with `packReserve: 0.5` |

That's 8 settings × 3 seeds = 24 runs. If time is short, run seeds 88 and 31761 first.

## Acceptance checks

1. **Defaults change nothing,** except items 1 and 2: with every new setting at its default, frames match the current
   engine apart from marks and the fire-sale count. Report that difference on one seed.
2. **Determinism:** same seed and settings give identical frames (including the new `gen` record).
3. **No hidden value** in the new code, except the guide's published values and the pack contents value (`evMarket` is at
   market prices; the guide version uses the published guide).
4. **Old saves load.** Missing `gen` fields show "n/a".
5. **Speed:** seconds per week with the diagnostics on. Clustering runs once a generation on a sample, so it should cost
   little.

## Report back to the owner

For each comparison, against the baseline on the same seeds:

- **Prices:** price-to-value correlation by season; median price ÷ value; the Vault and marks indexes (and their ratio).
- **Money:** net growth per 20 weeks; dealer net flow; pack spending.
- **Wealth:** Gini; the bottom half's share.
- **Bots:**
  - the carry-over measures from item 4 (mark-based and bid-based);
  - descent from the top 10%;
  - network distance and the number of strategy clusters;
  - trials kept, and whether they outperform afterwards;
  - the guide-anchor output.
- **Health board:** first-red weeks.
- **League:** active players over time. With `rookieRule: 'measured'`, seed 12864 went from 66 active players to between
  14 and 39 over 85 seasons, because measured arrivals (about 3 a season) don't keep up with retirements. Royalties
  then fell to 0.018% of prices a week, so the football link fades. Report it; don't change the rule.
- **Lineages:** the largest lineage's share of the population over time (seed 12864 reached 40%).

Then say which explanation the diagnostics support for the negative carry-over (crowding, measurement, or noise kept by
within-lifetime learning), with the evidence, as a result, not a recommendation to tune.
