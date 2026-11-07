# Spec: real-world frictions, round 2

For the agent working in `sandbox/`. Read `docs/sandbox/README.md` and the top of `sandbox/engine.mjs` first.

The owner's rule: **set factors, not behaviors.** Every item here is either a bug fix, a measurement fix, or a setting the
owner sizes. Nothing may decide which way prices, wealth or crashes go. Report outcomes as results; never tune toward one.

## Status of round 1 (found in the working copy, uncommitted)

Built: `markRule 'book'` (`markDepth`, `markWeeks`, `markHalfLife`), the marks index `h.pMark` with its own crash and rally
detector, `holdCost`, `wealthTaxForced`, `estateSale`, `cashShocks`, forced sales by cause (`forceSale` / `forcedBy`),
and the mint ledger (`W.house.mint`). Keep all of it. Commit it when the owner asks.

Not built: the auction fix below (still open at `engine.mjs` around line 597).

## Why round 2

Seed 31761 (`sandbox/runs/saves/page-seed31761-laws-w83.json`): royalties paid from the house, allowance 900, living
cost 160. Money stayed flat (5.0M → 5.5M), total hidden value of the original players fell (×0.93), and the Vault index
still went 100 → 216 while the coins traded per 20 weeks fell 6.8M → 2.4M. Every trade printed a median +1.4% to +2.9%
above the same card's previous trade, about 60% up, in every 20-week block.

A likely cause (not proven: the saves don't record per-bot decisions): fitness is a bot's worth at marks
(`worth()` uses `c.P`), and comparable sales re-mark all 16 of a player's markets from one trade. So paying 2% over the
mark for one copy raises the mark on every copy the buyer already holds, and its measured return rises at once.
Selection then copies bots that overpay for what they own: the "marking the close" problem. Items 1 and 2 make prices
and fitness measure what a card could actually be sold for; item 4 lets the owner check the cause directly.

## 1. Bug: auction sales never reach prices

A card sold at auction (bots' sealed auctions, the liquidator, forced sales) changes owner without setting `c.P`,
calling `noteTrade` or counting in `W.lastTrades` / `h.trades` (around `engine.mjs:597`). Auctions are a large share of
the market:
- seed 88, weeks 350–430: 9,792 card auction sales against 2,636 trades;
- seed 31761: 3,462 against 18,653 trades.

Fix: card auctions go through the same path as `xfer` (`c.P = price; noteTrade(W, c, price)`, the price history, volume
and trade count). Items (autographs) keep their own `it.last`. In both saves, auction prices ran above trade prices (a
median ×1.12 and ×1.15), so expect this to raise some marks. That's correct measurement, not a direction.

Acceptance: the Vault index and comparable sales include auction pairs. Report the index on seed 31761 with and without
the fix.

## 2. Fitness at selling value (`fitnessValue`)

`fitnessValue: 'mark' | 'bid'`, default `'mark'` (today).

`'bid'`: at the end of each generation, for fitness only, value each holding at what the bot could have sold it for that
week:

1. Walk down the unfilled bids still standing at the end of the week's call auction (`leftBids`: other bots and the
   dealers, never the liquidator or the bot itself), highest first. One copy fills one bid.
2. Copies beyond the standing bids: value each at the lower of the card's mark and the player's most recent card-auction
   clearing price within `compsWeeks` (brought to this card by its multiplier). With no such auction, use the mark with
   the existing concentration haircut from `worth()`.
3. Cash, debt, money lent and short positions as in `worth()`.

Change only the fitness return (`b.roc` in `generationEnd`) and its inputs `genStart`/end. `worth()` stays as it is for the
page, exits, the wealth tax and estates. Report how often step 2 was used (share of copies valued without a standing
bid). This is a measurement choice: it judges strategies by realisable value instead of by marks they can move.

## 3. Holding premium sizing (no code, page and README only)

`holdCost` is built. The owner needs to see it against what a card earns:
- In the Rules panel "i" text and the README, show the weekly royalty yield beside it: `royaltyRate ÷ weeksPerGeneration`
  (0.5% a week at 10% per 20 weeks; much less with `royaltyFunding: 'house'`, so show the yield actually paid over the
  last generation: royalties paid ÷ total marked value ÷ 20).
- Say in the "i" text: a premium above the royalty yield makes holding lose money on average; well below it barely bites;
  the premium goes to the house treasury, so with `closedEconomy` off it leaves circulation (it tightens money) and with
  `royaltyFunding: 'house'` part of it is paid back to holders as royalties.

## 4. Decision log for credit and cash (measurement)

To separate bot choices from mechanics (the owner asked how bots "knew" to pay down debt when the allowance was cut; the
loans mature and repay automatically, so the question is how much was choice):
- Each week, record per neural bot the network outputs that set credit and cash: `keep` (cash target), `lendShare`,
  `lendRate`, `lev` (borrow share), `maxRate`. Store weekly means and the 10th/50th/90th percentiles in the frame (not per
  bot, to keep saves small), plus the same for the top 10% by worth.
- Record weekly: coins offered to lend, coins asked to borrow, coins lent, coins repaid at maturity, coins repaid by forced
  sales.

## 5. Owner decisions (don't build until the owner says)

- **Where the wealth tax goes:** `wealthTaxTo: 'house' | 'equal' | 'belowMedian'`. `'house'` is today (into the treasury,
  so it leaves circulation unless `closedEconomy` is on, and funds royalties under `royaltyFunding: 'house'`, which pays
  it back mostly to the biggest holders). `'equal'` pays it out to every bot equally. `'belowMedian'` pays it to the bots
  below the median worth.
- **The one-for-one rookie rule:** every retiree is replaced by one rookie at the same position and club, so the league
  is fixed at 66 active players. That's a behavior, not a measured rate. The alternative is arrivals at the measured rate
  (`league_rates.json` `arrivals`), independent of retirements.

## Acceptance checks

1. **Defaults change nothing except item 1:** with `fitnessValue: 'mark'` and every round-1 setting at its default, seed
   31761 matches the current engine for 60 weeks except where auction sales now set prices. Report that difference
   separately.
2. **No hidden value:** none of the new code reads `.F` or anything derived from it.
3. **Determinism:** same seed and settings, identical frames.
4. **Old saves** in `sandbox/runs/saves/` still load.
5. **Speed:** seconds per week headless before and after. Item 2 runs once per generation, so it should cost little.

## Report back to the owner

Run seed 31761 with the owner's settings (`royaltyFunding: 'house'`, allowance 900, living cost 160), one change per run,
and report each as results:
1. the auction fix only;
2. plus `markRule: 'book'`;
3. plus `fitnessValue: 'bid'`;
4. plus `holdCost` at about a fifth of the royalty yield actually paid.

For each run, report:
- the Vault and marks indexes;
- the median trade-to-trade change;
- coins traded per 20 weeks;
- price ÷ value at the 10th, 50th and 90th percentiles;
- how much bots' returns carry over between generations (rank correlation);
- forced sales by cause;
- the item 4 credit and cash summary.
