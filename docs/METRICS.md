# Metrics and diagnostics

Every indicator the engine records or the page computes, what it measures, how it is defined, and where it is
stored. Field paths refer to one weekly frame from `frame(W)` (saved in `run.json` as `frames[i]`) unless stated.

**Measurement only.** None of these values is read by a bot, a dealer or any rule of the world, with the exception
noted under "Entry multiplier" (the entry factors use the same signals the diagnostic reports). Diagnostics draw from
private random generators, never from `W.rand`, so recording them does not change a run.

**Who can see it.** The column "Reads" says what each value is computed from:

- **public**: prices, trades, orders, league news and the price guide, which every bot can see;
- **accounts**: bots' private holdings, cash or returns, aggregated (no single bot sees them);
- **internals**: values computed from bots' networks or lineage records;
- **hidden value**: the players' true values `F`, which no participant sees.

Anything marked *accounts*, *internals* or *hidden value* is for the researcher only. The planned government must not
receive *hidden value* or *internals* fields (regulator-spec 8.2–8.3; AUDIT.md methods findings 4 and 17).

---

## 1. Price indexes

| Indicator | Field | Definition | Reads |
|---|---|---|---|
| Vault index | `h.p` | Repeat-sales index, 100 at the open (`repeatSales`). Every sale of a card is paired with the previous sale of the same card of the same kind: order-book and dealer trades form one chain, sealed-auction sales another (`noteTrade`). A sale pairs only with the last sale of its chain in an earlier week, at most 52 weeks back; each pair's log price change is clipped to ±2. Each week the last 104 weeks of the log index are re-estimated together by least squares from all pairs in the window, with a small smoothness term (λ = 0.001) between neighbouring weeks; earlier weeks are held fixed. The frame stores each week's value as published that week. A card's opening price counts as its first trade. | public |
| Marks index | `h.pMark` | A fixed basket of every card market's mark: `100 × Σ P × S0 ÷ Σ P0 × S0` (`idx(W, 'P')`), weighted by print run. It moves with marks, including comparable-sales and book marks, not only trades. | public |
| Value index | `h.f` | The same basket at hidden value: `100 × Σ F × S0 ÷ Σ P0 × S0` (`idx(W, 'F')`). | hidden value |
| Marks vs sales gap | (page) | `h.pMark ÷ h.p`. Above 1, marks sit above what cards sell for. | public |
| Crash and rally events | `events` (kind `crash`, `bubble`) | `detect`: the Vault index (and separately the marks index) against its own value 4 weeks earlier. Below ×0.88 logs a crash, above ×1.15 a rally; 12-week cooldown. | public |
| Bubble event | `events` (kind `bubble`) | Logged when price ÷ value (below) crosses 1.3; re-armed below 1.12. | hidden value |

The Vault index was changed in round 3: auction sales clear a median of about 40% above order-book trades of the
same card, and mixing the two chains made the index rise about ×1.5 per 200 weeks on flat prices (DEVLOG, round 3).

## 2. Prices against value

| Indicator | Field | Definition | Reads |
|---|---|---|---|
| Price ÷ value | `h.bub` | `Σ P × circ ÷ Σ F × circ` over card markets (`bubble`): the copy-weighted ratio of marks to hidden value. | hidden value |
| Price ÷ value by OVR band | `bands` | The same ratio within 6 OVR bands (`bandBubble`). | hidden value |
| Market and value capitalization | `mkt.mcap`, `mkt.vcap` | Marks × copies (plus items at their marks) and hidden value × copies. | public / hidden value |
| Prices follow the football | (page, health board) | Pearson correlation across players of the 20-week log change in price with the 20-week log change in hidden value, from `prices` and `values` in full frames (`followCorr` in `page/ui.js`). Needs at least 10 players. DEVLOG round 5 reports the Spearman rank correlation of the same changes between weeks 10 and 40. | hidden value |
| Price ÷ value (round 5 table) | (analysis) | Geometric mean of price ÷ hidden value over markets with copies (DEVLOG round 5). | hidden value |
| Top cards | `top` | The 3 highest-marked cards with their hidden value `F` and, with the guide on, the guide value `G`. | public / hidden value |

## 3. Wealth and money

| Indicator | Field | Definition | Reads |
|---|---|---|---|
| Gini | `h.gini` | Gini coefficient of worth across all bots (`gini`). Worth (`worth`) is cash − debt + money lent + copies at marks × (1 − fee) with a concentration haircut of `1 ÷ (1 + 0.06 × (q − 3))` above 3 copies of one card, items at 90% of their marks, cards lent out, minus borrowed cards at their marks, plus short collateral. | accounts |
| Wealth share | `h.share` | Share of total worth held by the top 10%, next 40% and bottom 50% of bots by worth. | accounts |
| Cash share | `mkt.cashShare`, `mkt.cashTop10` | The same three bands ranked by cash; `cashTop10` is the share of all cash held by the 10% of bots with the most cash. | accounts |
| Coins held | `h.money`, `mkt.cash` | Total bot cash. | accounts |
| Money ledger | `money` | Coins created and removed this week by kind (`record`): created = allowance, royalties, outside buyers, prizes, newcomers' cash, wealth tax paid back, dealers' net; removed = living costs, trade fees, packs, liquidator sales, Vault store, outside sellers, holding costs, wealth tax, cash shocks, cash of bots that left. `other` is whatever no tag covers, so `net` equals the change in coins held. | accounts |
| Credit | `mkt.rate`, `mkt.debt`, `mkt.calls`, `mkt.defaults`, `credit` | Last clearing loan rate; total debt; margin calls and defaults this week; `credit` adds offered, asked, lent and repaid coins, and the distribution (mean, 10th, 50th, 90th percentile) of the cash target, lending share, lending rate, leverage and maximum rate outputs for all bots and the richest 10%. | public (rate) / accounts / internals (outputs) |
| Broke bots | `mkt.broke` | Bots that could not pay their living costs this week. | accounts |
| Forced sales by cause | `forced` | Count of forced sales this week by cause (living costs, margin call, loan default, holding costs, wealth tax, cash shock, estate). | accounts |
| Royalty yield | `royYield` | Royalties paid in the last generation ÷ cards held at marks ÷ 20: the weekly yield actually paid. | public |
| Fitness coverage | `fit` | At a generation end with `fitnessValue: 'bid'`: copies valued, copies with no standing bid to sell into, and their share. | accounts |

## 4. Market activity and the order book

| Indicator | Field | Definition | Reads |
|---|---|---|---|
| Trades | `h.trades` | Order-book trades plus card auction sales this week. | public |
| Order flow | `ord` | Bids and asks placed, coins traded (`coins`, including auction sales), cards minted, packs opened, auction listings and sales (`aucListed`, `aucSold`, `aucCardSold`, `aucCoins`), short sales, covers and forced covers, lendable copies, loans due within 4 weeks, allowance paid, prize pool. | public |
| Fire sales | `ord.aucFree` | Card auction sales below `fireShare` (30%) of the card's mark the week before. The pre-round-3 count (1 coin or less, or under 10% of the top bid) is `ord.aucFreeOld`. | public |
| Sale vs quote | `ord.aucVsMark` | Median of auction price ÷ the card's mark before the sale, when 5 or more cards sold. | public |
| Bots' order book | `bookD` | After the weekly cross, over cards with copies: `gap`, the median best-bid to best-ask gap as a share of the mark, on cards where bots stand on both sides; `both`, `onlyBid`, `onlyAsk`, `neither`, the shares of cards by which sides bots stand on; `bidDist`, `askDist`, the median distance of bots' orders from the mark in units of `priceRange`; `bidOff`, `askOff`, the median price-offset output (tanh); `bidEdge`, `askEdge`, the share of orders whose offset is beyond 0.9 in absolute value. | public (book) / internals (offsets) |
| Movers | `movers` | Players with 2 or more trades in 4 weeks, ranked by 4-week price change. | public |
| Pack prices | `pk` | Each pack type's clearing price and packs sold this week. | public |

## 5. Limits the networks press against

`limits` (`limitsSummary`), weekly. Each value is a share. It shows where a fixed mapping or count stops a bot.

| Field | Definition | Reads |
|---|---|---|
| `bidEdge`, `askEdge` | Share of bid and ask prices at their wall: \|tanh(offset)\| > 0.9 under `priceMap: 'range'`, or at the ×50 safety clamp under `'log'`. | internals |
| `bidFar`, `askFar` | Share beyond the default range's edges (×1.54 or ×0.46 of the base), whatever the mapping. | internals |
| `keep`, `lendShare`, `lev` | Share of bots whose cash target, lending share or leverage output is in the top 5% of its range. | internals |
| `lendRate`, `maxRate` | Share of bots whose lending or borrowing rate sits at its wall (`rateMax`, or the safety bound under `'log'`). | internals |
| `lendOver5`, `maxOver5` | Share of bots whose lending or borrowing rate exceeds 5% a week. | internals |
| `qtyEdge` | Share of orders whose size output is in the top 5%. | internals |
| `packBidEdge` | Share of pack bids at their wall. | internals |
| `orders`, `listings`, `items`, `shorts` | Share of acting bots that wanted one more affordable buy order, auction listing, item listing or short sale when the weekly count stopped them. | internals |
| `packs` | Share of acting bots that wanted more packs than `maxPacks`. | internals |

On Realism (seed 31761, 60 weeks) before the limits were widened, 28.9% of bot-weeks were stopped by the 3-short
limit; after widening, 1.6% (DEVLOG round 4).

## 6. Population and entry

| Indicator | Field | Definition | Reads |
|---|---|---|---|
| Population | `bots.length` | Bots in the market. | public |
| Joined, left | `people.joined`, `people.left` | Newcomers and bots that quit or retired this week (`peopleChange`). Deaths with heirs are not counted. | public |
| Entry multiplier | `entry` | Present when any entry factor is on (`entryDiag`). `m`, the product of the three components; `hype` = 1 + entryHype × rally, `ret` = 1 + entryReturns × word of mouth, `news` = 1 + entryNews × news; `lam`, the Poisson arrival rate; `share`, each component's share of log m; `raw`, the three signals: the Vault index's 20-week rise, the median bot's own 11-week return (allowance and other money it did not earn removed), and the league news flow (news items in the last 4 weeks over the 52-week weekly average, minus 1, floored at 0). These signals also drive entry when their factors are on. | public (rally, news) / accounts (returns) |
| Lineages | `lineages` | Number of lineages, deepest generation, the largest lineage's worth share and size. | internals |
| Attention | `attention` | With an attention budget: bots, cards scored (summed over bots), cards sampled, watchlist size, live cards. | internals |

## 7. Generation diagnostics (`gen`)

Written at each generation end (`genDiag`, `genIOClose`) and repeated on every frame until the next generation ends.

| Indicator | Field | Definition | Reads |
|---|---|---|---|
| Carry-over | `persistMark`, `persistBid` | Spearman rank correlation of bots' returns between the last two generations, at marks and at selling value, over bots present for both (more than 10 needed). | accounts |
| Skill carries over (health board) | frame `persist` | Spearman correlation of the fitness return (`roc`) between the last two generations. | accounts |
| Descent from winners | `fromTop` | Share of bots whose networks were copied or inherited since the last generation end from a bot in the previous generation's top 10% by return. | internals |
| Largest lineage | `lineTop` | The largest lineage's share of bots. | internals |
| Network distance | `netDist`, `netDistCopies`, `copies` | Mean pairwise cosine distance between card-network weight vectors on 50 bots spread by id; the same between copies and their living sources; number of such pairs. | internals |
| Response distance | `respDist`, `respDistCopies`, `respNear` | Median RMS distance between bots' tanh outputs on 24 fixed sample cards (inputs drawn once from a private generator, seed 24601); the same for copies against sources; share of pairs closer than `sharingRadius`. | internals |
| Strategy clusters | `clusters`, `clusterTop`, `clusterSil` | k-means (k = 2–8, k-means++ starts from a private generator) on each bot's z-scored card-network outputs on the 24 sample cards; k chosen by mean silhouette; largest cluster's share; the silhouette. Describes the networks, not behaviour (compare TACTICS.md). | internals |
| Learning within a lifetime | `adaptKept`, `adaptRun`, `adaptFollow`, `adaptFollowMkt`, `adaptPairs`, `adaptNextKept`, `adaptNextRejected` | Share of trials kept; trials run; Spearman correlation of a kept trial's score with the next period's score, raw and against the period's median; number of pairs; mean next-period score after a kept and after a rejected trial. | accounts |
| Wish to leave | `quitAll`, `quitNew` | Mean, 10th, 50th and 90th percentile of the quit output (after sigmoid), for all bots and for bots under 40 weeks in the market. | internals |
| Exits | `exits`, `exitCause`, `exitAge`, `exitDecile` | Bots that left since the last generation end, by cause (chose to leave, died with heirs, retired, priced out), by weeks in the market (<20, 20–40, 40–100, 100–200, 200+) and by worth decile at exit. | accounts |
| Entries | `entries`, `heirs`, `population` | Newcomers and heirs since the last generation end; bots at the generation end. | public |
| Fitness sharing | `sharing` | With fitness sharing on: its strength and the niche-count percentiles. | internals |
| Tactics | `tactics` | The tactic tracker; see [TACTICS.md](TACTICS.md). | accounts |

## 8. Other weekly fields

| Field | What it holds | Reads |
|---|---|---|
| `why` | For each filled order from a neural bot, the card-network input whose removal lowers "buy minus sell" (or "sell minus buy") the most (`tradeWhy`), counted by input. | internals |
| `sens` | Every 4 weeks: how much each card-network input moves "buy minus sell", by finite differences on 24 live cards, for the richest 10% and a sample of all bots (`nnSensitivity`). | internals |
| `adapt` | Trials run and kept in the last generation. | accounts |
| `guideT`, `guideUse`, `guide` | Last guide publication week; mean anchor-to-guide output; the published values in publication weeks. | public / internals (`guideUse`) |
| `league` | League week and season, last champion, active and injured players. | public |
| `inj` | Ids of injured players. | public |
| `prices`, `values`, `circ`, `pool`, `ovr`, `risk`, `vol`, `si` | Full frames only: per-player price, hidden value, copies, pool, OVR, risk rating, volume and short interest. | public / hidden value (`values`) |

## 9. The health board

The page's health board (`HEALTH` in `page/ui.js`; spec in `docs/health-board-spec.md`) colours 20 indicators in 7 groups.
It is display only: nothing in the engine reads it.

**How a light is coloured.** With fewer than 12 weeks, or no value, it is off ("n/a"). Trend: the 4-week average
against the 12-week average. A change smaller than 5% relative (`deadband`), or smaller than the light's absolute
`flat`, is flat. A change in the good direction is green, in the bad direction red. For "toward 1" and "toward 0"
lights the trend is the change in distance from the target. Inside the alarm zone the light is red whatever the
trend. Inside the healthy band and not getting worse it is green. Alerts have an 8-week cooldown.

| Group | Light | Value | Good | Alarm | Healthy | Reads |
|---|---|---|---|---|---|---|
| Activity | Coins changing hands | `ord.coins` | up | under 25% of its 52-week high | | public |
| Activity | Sales | `h.trades` | up | under 25% of its 52-week high | | public |
| Activity | Bids ÷ offers | `ord.bids ÷ ord.asks` | up | under 0.05 | 0.3–3 | public |
| Prices | Fire sales | `ord.aucFree ÷ ord.aucCardSold` | down | above 5% | 0–1% | public |
| Prices | Sale vs quote | `ord.aucVsMark` | toward 1 | under 0.6 | 0.85–1.15 | public |
| Prices | Price index | `h.p` | up | fell 30% in 8 weeks | | public |
| Prices | Marks vs sales gap | `h.pMark ÷ h.p` | toward 1 | above 1.5 or under 0.67 | 0.9–1.1 | public |
| Money | Liquidity | `mkt.cash ÷ mkt.mcap` | up | under 2% | 5–30% | accounts |
| Money | Broke bots | `mkt.broke ÷ bots` | down | above 25% | 0–5% | accounts |
| Money | Money supply | `money.net ÷ mkt.cash` a week | toward 0 | under −3% or above +5% | −1% to +2% | accounts |
| Money | Cash concentration | `mkt.cashTop10` | down | above 60% | 0–35% | accounts |
| Credit | Leverage | `mkt.debt ÷ mkt.mcap` | down | above 25% | 0–10% | accounts |
| Credit | Distress | `mkt.calls + mkt.defaults` | down | 4-week average 10 or more | 0–2 | accounts |
| Credit | Forced sales | Σ `forced` ÷ `h.trades` | down | above 40% | 0–10% | accounts |
| Fairness | Inequality | `h.gini` | down | above 0.55 | 0–0.35 | accounts |
| Fairness | Bottom half | `h.share[2]` | up | under 15% | above 25% | accounts |
| Football | Prices follow the football | `followCorr` | up | under 0 | 0.4–1 | hidden value |
| Football | Price ÷ value | `h.bub` | toward 1 | above 2 or under 0.5 | 0.8–1.25 | hidden value |
| Bots | Skill carries over | `persist` | up | under 0 | 0.2–1 | accounts |
| Bots | Joiners − leavers | Σ `people.joined − people.left` over 20 weeks | up | more than 10% of bots left in 20 weeks | | public |

The thresholds are presentation choices, not world rules. The board shows a judgement of what a healthy economy
looks like; AUDIT.md methods finding 4 records that it must not be shown to the planned government except as a
separate "advice" arm.
