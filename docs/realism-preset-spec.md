# Spec: the last realism gaps, and a "Realism" preset

For the agent working in `sandbox/`. Read `docs/sandbox/README.md`, the top of `sandbox/engine.mjs`, and the earlier specs
(`league-sim-spec.md`, `realism-factors-spec.md`, `health-board-spec.md`).

The owner's rule throughout: **set factors, not behaviors.** Every new item is a quantity the world provides or a choice
the bots make. Nothing scripts a direction for prices, wealth or crashes. Report outcomes as results; never tune toward
one. Don't commit or push unless the owner asks.

## 0. Already built: verify, don't rebuild

The working copy already has these (from the realism and behavior reviews). Check each works as described, and fix only
bugs:

- **Auction sales set prices:** `c.P` and `noteTrade` on card auctions.
- **Prices kept inside the book:** `markRule 'book'` (`markDepth`, `markWeeks`, `markHalfLife`), the marks index
  `h.pMark`.
- **Bots price on their own estimate:** `priceAnchor` (an "anchor to my estimate" card output), `priceRange` (±60%).
- **Wider output limits:** `keepMax`, `rateMax`, `maxOrderQty`, `maxListings`, `maxShorts`, `maxPacks`.
- **Choices back to the bots:**
  - `quitRule 'drawdown' | 'network'`;
  - `forcedOrder 'network'`;
  - `singleBidder 'own'`;
  - `fitnessValue 'bid'`;
  - `wealthTaxTo 'equal' | 'belowMedian' | 'house'`.
- **Frictions:** `holdCost`, `wealthTaxForced`, `estateSale`, `cashShocks`.
- **League:** `rookieRule 'replace' | 'replacePlus' | 'measured'`.
- **The health board.**

**One concern:** `rookieRule` defaults to `'replacePlus'` with `extraRookies: 3`. The 3 extra rookies a season isn't
measured. Keep the option, but the preset below uses `'measured'`.

## 1. Learning within a lifetime (`adapt`)

Today a bot's networks never change while it lives; it improves only by copying (evolution) or through its heirs. Real
traders adjust after their own results.

`adapt: { on: false, every: 10, size: 0.05 }`

When on, each neural bot runs a trial:
1. Every `every` weeks it saves its current networks and their score (its fitness return over the last `every` weeks,
   computed exactly as fitness: `fitnessValue` applies, and allowance, royalties and living costs are excluded).
2. It runs a perturbed copy: every weight plus `W.gauss() × size`.
3. After the next `every` weeks it compares the trial's score with the saved one. It keeps the trial if better, otherwise
   it restores the saved networks.

The bot's own results decide; nothing says what to learn. Draw all randomness from `W.rand` / `W.gauss`, so a run stays
deterministic. Log per generation: trials kept ÷ trials run.

Interaction with evolution: when a bot adopts another's networks (evolution or inheritance), its trial resets.

## 2. Card loss (`lossRate`)

Supply only grows today: packs mint about 165 copies a week, rookies bring new print runs, and nothing leaves. Real
collectibles get lost, damaged or locked away.

`lossRate: 0` (share of each copy lost per season).

When above 0, at each season end each copy in a bot's hands is lost with probability `lossRate`, drawn with `W.rand`. Lost
copies leave circulation (`c.circ--`) and the holder's inventory. Never touch the unminted pool, dealer stock or items
(autographs), and never pick cards by value. Log the count per season (`type: 'lost'`, totals only) and show it in the
money and supply ledger. The "i" text says it's the owner's assumption, not measured.

## 3. Newcomers drawn in by rallies (`entryHype`)

Newcomers arrive at a fixed rate today (`entryRate`). In real markets participation rises after rallies.

`entryHype: 0`. When above 0, the weekly entry rate becomes
`entryRate × (1 + entryHype × max(0, r20))`, where `r20` is the Vault index's return over the last 20 weeks (after the
auction fix). Newcomers stay as they are: random networks and a log-normal starting cash. Only how many arrive changes,
never what they do. The "i" text says it's an assumption.

## 4. Games: the difficulty minimum becomes a setting

`gameFloor: { need: 4, legs: 3 }` ("so guessing never pays well") is tuned toward an outcome. Make it optional:
`gameFloor: null` turns it off. Keep today's value as an option; the preset turns it off.

## 5. Money flows from the dealers

Add the dealers' net purchases (coins they pay bots minus coins bots pay them) as their own line in the money ledger. The
dealers' budget is new money each week, and the owner needs to see how much of the price level comes from it.

## 6. A public price guide (`priceGuide`)

Today dealers see every card's value each week (`p.Fpub`, last week's value, `engine.mjs` around line 1287), while bots
see hidden value only through research notes (this week's value with error, a few players a week). On the real Retro
Vault site the card value formula is public: it's a price guide, like Beckett in real collecting. Everyone can see it,
it lags, and the edge comes from knowing something before it updates.

`priceGuide: { on: false, every: 4, lag: 1 }`

When on:
1. **Publishing:** every `every` weeks, the guide re-publishes each player's value as of `lag` weeks earlier (the site
   formula's value then, from the stored value history). Between publications it holds. Store it per player
   (`p.guide`, `p.guideT`). It's public: every bot, dealer and the page see the same number.
2. **Bot inputs:** two new card-network inputs, appended to `CARD_IN`:
   - "guide ÷ price": the card's guide value × its rarity multiplier, ÷ its price, as a log, clamped like the other price
     ratios;
   - "weeks since the guide updated".
3. **Pricing:** `nnPrice` gains the guide as a second anchor. A new card output, "anchor to the guide", sets how far the
   base moves from the current price toward the guide value:
   - the research anchor applies when the bot holds a fresh note, and the guide anchor when it's on;
   - when both apply, take them in sequence: the base moves toward the guide by the guide output, then toward the
     research estimate by the research output.
   The network learns which to trust; nothing tells it to.
4. **Dealers:** `valueCollectors` uses the guide instead of `Fpub` (still with each dealer's own error), so dealers know
   nothing bots can't see. Their only remaining edge is their money.
5. **Research is unchanged:** this week's value with its error, the only way to be ahead of the guide.

Network shapes change: initialise the new input and output weights small and random for existing networks (practice
generations, heirs, copies), so nothing breaks and the bots must learn to use the guide.

The page: a "Guide" column or line wherever a card's price is shown (card detail, movers, the top cards), and the date of
the last publication. With the guide off, nothing changes.

Acceptance:
- With `priceGuide.on` false, frames match the current engine.
- With it on:
  - every bot and dealer reads the same guide;
  - the guide changes only at publication weeks;
  - it equals the stored value from `lag` weeks before that publication.
- Report how much the guide anchor is used (the mean of the guide output) and how price ÷ value changes against the
  same seed with the guide off.

## 7. The "Realism" preset

Add a preset `realism` ("Realism") to `PRESETS` in `ui.js` and make it the page's default. Keep `laws` selectable. Old saves
keep their own settings.

**Calibration:** one season (20 weeks) ≈ one real year. Rates below are given per week, with their yearly equivalent.
Every number marked *assumption* isn't measured; the "i" text and the README say so.

### Money: income mostly from the football, costs that balance it

| Setting | Value | Why |
|---|---|---|
| `allowance` | 200 | A stipend equal to the flat living cost, so a bot with no cards breaks even. Most income then comes from cards, not handouts. (Was 1,800: 9% of starting cash every week.) |
| `livingCost` | 200 | Matches the stipend. |
| `lifestyle` | 0.0005 | 1% of worth a year: richer bots spend more. Was 3% a year, which billed card-rich bots on paper wealth and forced sales. |
| `royaltyFunding` | `'minted'` | Royalties are the economy's main income, so money enters through the games. |
| `royaltyRate` | 0.05 | 5% of value a year, an income asset's yield. |
| `holdCost` | 0.0005 | 1% of the card's price a year, like storage or insurance. About a fifth of the yield: holding still pays, but not for free. |
| `wealthTax` | 0.001 | 2% a year on worth above twice the median. *Assumption.* |
| `wealthTaxTo` | `'equal'` | Paid out to every bot alike: the cash goes back to bidders, not to holders. |
| `wealthTaxForced` | true | A card-rich bot with no cash sells to pay. Safe now that a lone bidder pays its own bid. |
| `outsideMode` / `outsideBudget` | `'value'` / 100000 | Dealers stay as a two-sided anchor, smaller so outside money doesn't set the price level. *Assumption.* |
| `outsideNews` | true | Dealers' attention follows public news. *Assumption.* |
| `priceGuide` | `{ on: true, every: 4, lag: 1 }` | A public price guide, like real collecting: everyone sees value with a delay; research is about being early. |
| `fee` | 0.01 | |
| `centralBank`, `closedEconomy` | false | Policy experiments, not realism defaults. |

### Prices and measurement

| Setting | Value | Why |
|---|---|---|
| `markRule` | `'book'` | Prices can't sit above standing offers. |
| `markHalfLife` | 4 | An unsold price drifts toward the book like an aging appraisal. |
| `priceRule` / `compsWeeks` | `'comps'` / 4 | |
| `singleBidder` | `'own'` | No more cards given away. |
| `forcedSale` / `forcedOrder` | `'book'` / `'network'` | Forced sellers choose what to sell. |
| `liquidation` | `'auction'` | |
| `vaultIndex` | `'repeatSales'` | |

### Bots

| Setting | Value | Why |
|---|---|---|
| `priceAnchor` / `priceRange` | true / 0.6 | Bots can price on their own research, within ±60%. |
| `keepMax` / `rateMax` | 0.95 / 0.05 | Bots can wait in cash; lenders can charge more in a crisis. |
| `fitnessValue` | `'bid'` | Judged by what they could sell for. |
| `evolve`, `evolveShare`, `nnFitnessGens` | true, 0.1, 6 | |
| `practiceGens` | 3 | |
| `adapt` | `{ on: true, every: 10, size: 0.05 }` | Learning within a lifetime. |
| `quitRule` | `'network'` | Leaving is the bot's choice, not a threshold. |
| `mortality`, `lifespan`, `heirs` | true, [6, 14], 1 | |

### Frictions and life events

| Setting | Value | Why |
|---|---|---|
| `estateSale` | 0.4 | Like a real estate tax: dynasties pay something at each death. |
| `cashShocks` | `{ chance: 0.005, size: 0.1 }` | About a 10% chance a year of needing a tenth of one's worth. *Assumption.* |
| `lossRate` | 0.01 | 1% of copies lost a year. *Assumption.* |
| `turnover`, `entryRate` | true, 0.25 | |
| `entryHype` | 1 | A +50% market over 20 weeks brings 1.5× newcomers. *Assumption.* |

### League

| Setting | Value | Why |
|---|---|---|
| `valueModel` / `valueBasis` | `'league'` / `'form'` | |
| `formSeasons` | 2 | Closer to the real save's season-to-season swings than 1 (log spread 0.78 against 0.90; the save's is 0.41). |
| `rookieRule` | `'measured'` | Arrivals at the save's rate, not one-for-one. |
| `injuries`, `injuryByAge`, `retirement`, `retirementByAge`, `awards`, `rookies` | true | |
| `pressure` / `pressureStrength` / `hypeInjury` | true / 1 / 0 | Only the measured strength. |
| `startSeason` | `'latest'` | |

### Games and the rest

| Setting | Value | Why |
|---|---|---|
| `games` / `prizeShare` | true / 0 | Games pay only from the stakes, so only skill wins. |
| `gameFloor` | null | No tuned difficulty minimum. |
| `credit`, `maxLTV`, `marginCall`, `loanWeeks` | true, 0.6, 0.75, 8 | |
| `shorting` | true | |
| Off: `fashion`, `store`, `priceLimit`, `positionLimit`, `capPoorest`, `leagueUpdates`, `lenderCycle` | | Each scripts a behavior or is a policy or test tool. |

The preset's `hyp` text: one paragraph saying what the world is (income from the football, costs that balance it, real
frictions, bots that price on their own research and learn within a lifetime), and that every assumption is marked in the
Rules panel.

## Acceptance checks

1. **Each new item is off by default** (`adapt.on false`, `lossRate 0`, `entryHype 0`, `gameFloor` as today,
   `priceGuide.on false`), and with them off the engine's frames match the current working copy for 60 weeks on seed 88.
2. **No hidden value:** the new code never reads `.F` or anything derived from it, except the price guide, which publishes
   past values on purpose (and only at publication weeks, `lag` weeks old).
3. **Determinism:** the same seed and settings give identical frames, including with `adapt` on.
4. **Old saves** in `sandbox/runs/saves/` still load.
5. **Speed:** seconds per week headless with the preset against `laws`. `adapt` should cost little.

## Report back to the owner

Run the Realism preset for 300 weeks on seeds 88, 31761 and three new seeds. Report, as results:

- **Money:** coins created and removed per week (the ledger, including dealer net flow) and net money growth per 20 weeks.
  If it's far from flat (more than about ±10% a season), say so and show which line drives it. Don't change the preset;
  the owner decides.
- **The health board:** each light's state at weeks 100, 200 and 300, and every week a light first turned red.
- **Markets:** both price indexes, coins traded (trades and auctions), the fire-sale share, and bids ÷ offers.
- **The football link:** correlation of price change with value change per season, and median price ÷ value.
- **Bots:**
  - how much returns carry over between generations;
  - trials kept ÷ run (adapt);
  - the top trade reasons;
  - quits per 20 weeks.
- **Wealth:** the Gini, the bottom half's share, cash concentration, estate sales, shocks, and copies lost.
- **Anything that looks like a bug,** separately from outcomes.
