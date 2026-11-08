# Model description (ODD protocol)

This document describes the Trading Floor engine (`engine.mjs`, engine version 1.0.0) following the ODD protocol
(Overview, Design concepts, Details; Grimm et al. 2020, *Journal of Artificial Societies and Social Simulation* 23(2) 7).
It describes the engine as run with the Realism preset (`configs/realism.json`), which is how `sim.mjs` runs by
default. Where a setting differs between the engine's defaults (`DEFAULTS` in `engine.mjs`) and Realism, both are
given.

Functions are named as they appear in `engine.mjs`. Every number that is not measured from the save or taken from
real data is marked **assumption**. Measured rates are in `data/league_rates.json` and `data/nfl_age.json`; their
provenance is in [DATA.md](DATA.md).

Contents:

1. [Purpose and patterns](#1-purpose-and-patterns)
2. [Entities, state variables and scales](#2-entities-state-variables-and-scales)
3. [Process overview and scheduling](#3-process-overview-and-scheduling)
4. [Design concepts](#4-design-concepts)
5. [Initialization](#5-initialization)
6. [Input data](#6-input-data)
7. [Submodels](#7-submodels)

---

## 1. Purpose and patterns

**Purpose.** The model is a laboratory for neural-network agents in a market. Bots trade cards of players from a
simulated football league. Each bot is two small neural networks. Bots learn within a lifetime by trial and error,
and their networks are copied, mutated and inherited across generations. The question is what the bots do: which
trading tactics appear, spread, get crowded out or are cannibalized by neighbouring tactics, and how their trading
moves prices. The world sets factors (costs, rates, quantities, real player data) and market mechanisms. It does not
set which way a price moves or what a bot does ([DECISIONS.md](DECISIONS.md)).

The model is not calibrated to any real card market. It makes no claim about real markets.

**Patterns used to evaluate the model.** These are observed outputs that the model is checked against, not targets
it is tuned to:

- Card values match the source site. At the open, OVR matches the site for 203 of 203 players and value matches
  within 1 coin for 203 of 203 (the Y88 check in DEVLOG, "The simulated league").
- The league reproduces the save's measured rates: a 17-game season, games missed per season, season-to-season form
  changes, award counts per season, retirement rates by career stage and production rank.
- Prices should track hidden value when bots trade on research and news. This is measured, not imposed: "Prices
  follow the football" ([METRICS.md](METRICS.md)).
- The Vault index should not drift on flat prices. A drift found in round 3 was traced to mixing auction and
  order-book sales and fixed (`noteTrade`).

## 2. Entities, state variables and scales

### Entities

| Entity | What it is | Key state variables |
|---|---|---|
| World `W` | One simulated market | `t` (week), `cfg` (settings), `rand` (the one random stream), `cards`, `players`, `bots`, `loans`, `cardLoans`, `auctions`, `items`, `liq` (liquidator stock), `coll` (dealers), `treasury`, `house` (fees, pack revenue, money ledger), `hist` (index histories), `L` (league state) |
| Player | A football player with cards | `F` (hidden value of his base card, coins), `P` (implied price), `pool` (unminted copies), `S0` (print run), `lg` (league record: career totals `tot`, per-game `rates`, form window `win`, `active`, `seasons`, `legacy` (Career Legacy), injury spell `out`, `age0`), `guide` (published price-guide value) |
| Card market | One of 16 per player: 4 designs (Prizm, Jersey, Topps, Locker) × 4 finishes (Base, Silver, Gold, Holo) | `mult` (rarity multiplier), `P` (mark), `circ` (copies in circulation), `Ph` (price history), `volH` (volume history), `bb`/`ba` (last week's best unfilled bid and ask), `askLvl`/`bidLvl` (book levels), `lastRoy` (royalty per copy) |
| Item | A one-of-a-kind copy: an autograph, a Prizm colour parallel, an alternate or throwback kit | `mult`, `owner`, `cost`; traded only at sealed auction |
| Neural bot | The trading agent (`kind: 'rule'`, `g.nn: true`) | `cash`, `debt`, `lent`, holdings `h` (market id → copies), `items`, `lots` (cost basis per copy), `notes` (research estimates), `g.card` and `g.bot` (network weights), `lifespan`, `seasons`, `lineage`, `gen`, `roc` (last generation's return), `fit` (fitness), `_ad` (learning trial state), `flags`, `friends` |
| Dealer | One of 25 outside value dealers (`valueCollectors`) | `cash`, `stock`, `err` (fixed bias) |
| Liquidator | Sells cards of bots that left or defaulted | `W.liq` (copies), `W.liqItems` |
| Loan | A cash loan between two bots | `lender`, `borrower`, `amount`, `rate`, `due`, `late` |
| Card loan | A card lent to a short seller | `id`, `lender`, `borrower`, `entry` price, `coll` (cash collateral), `due` |

The engine also contains older bot types (strategy-genome "rule" bots, `brain: 'genome'`) and LLM-driven bots
(`kind: 'ai'`, run by `run.mjs`). Neither is used by `sim.mjs` or the Realism preset; this document describes the
neural bots only.

### Scales

| Scale | Value | Basis |
|---|---|---|
| Time step | One week (`step`) | Model choice |
| Season | 20 weeks (`seasonWeeks`), of which 17 are game weeks | 17 measured from the save (`fullSeason.all`); 20 is an **assumption** |
| Generation | 20 weeks (`weeksPerGeneration`) | **Assumption** |
| Real time | Realism treats one season as about one real year | **Assumption** (the yearly rates in the Realism preset follow from it) |
| League | 32 clubs, 10 players a club (QB, RB, 2 WR, TE, OL, DL, LB, 2 DB) | Roster shape from the save's complete rosters |
| Players at the open | 203 from the save plus generated veterans (461 in total on seed 31761) | 203 real; the rest generated (`fillLeague`) |
| Card markets | 16 per player (7,376 on seed 31761); about 2,400 with copies in circulation at the open | |
| Bots at the open | 250 × `W.fillK` with `botScale: 'cards'` (501 on seed 31761) | 250 is an **assumption**; `fillK` is copies in circulation ÷ copies of the save's own players, about 2.0 |
| Money | Coins; the site's card values are used as coin amounts (`valueDivisor` 1) | |

## 3. Process overview and scheduling

`step(W)` runs one week. The order is fixed. Bots act in a random order (shuffled with `W.rand` each week) in the
order phase; every other phase visits bots in list order.

1. **Week start.** `t` advances. Each player's last week's value is made public to dealers (`p.Fpub = p.F`).
2. **Price guide** (`priceGuide`): every 4 weeks it publishes each player's value as of 1 week earlier.
3. **Season boundary** (every 20 weeks): `nextSeason` advances the season label; card loss (`lossRate`) removes copies
   from bots' hands.
4. **League** (`valueModel: 'league'`): `leagueSeasonEnd` at a season boundary, then `leagueWeek` (one game for every
   active, healthy player in weeks 1–17), then `leagueValues` (every player's hidden value recomputed).
5. **Royalties** (`payRoyalties`): each holder is paid a weekly share of each card's value, scaled by that week's game.
6. **Bookkeeping**: wealth groups, weekly counters; 3 research passes and 3 game tickets granted to every bot.
7. **Allowance**: paid to every bot equally (new money in Realism).
8. **Wealth tax** (every `wealthTaxEvery` = 4 weeks): charged on worth above `wealthTaxThreshold` (2) × the median and
   paid back equally. What a bot can't pay is owed.
9. **Market state**: market drawdown (`mood`), set-aside of dormant retired players (`dormancy`), the list of live
   cards.
10. **Bot stance** (`nnThink`): every neural bot runs its bot network once. With an attention budget, each bot also
    draws the cards it will look at this week (`attendWeek`; off in Realism).
11. **Living costs and credit** (`livingAndCredit`, `creditMarket`): bills still owed (arrears) are collected from cash and
    put up for a forced sale again; living costs are charged; loan interest, maturities,
    margin calls and defaults are settled; the weekly credit auction clears new loans.
12. **Entry and exit** (`peopleChange`): newcomers arrive; bots may quit.
13. **Holding costs and cash shocks.** Unpaid amounts are owed by cause (`b.arrears`) and become forced sales.
14. **Notes** (`socialPhase`): note swaps and theft; theft flags lift after 26 weeks (`liftFlags`).
15. **Research** (`passPhase`): a call auction for passes (`tokenMarket`), then each bot researches the players its
    card network ranks highest (`nnResearchWish`).
16. **Games**: a call auction for tickets, then the weekly contests (`gamePhase`).
17. **Sealed auctions** (`auctionPhase`): last week's listings receive one sealed bid from each bot and settle. New
    listings from this week are opened; the liquidator lists up to 30 copies.
18. **Short-sale upkeep** (`shortUpkeep`): the card-lending pool is rebuilt, lending fees paid, overdue or
    under-margined shorts forced to buy back.
19. **Orders** (`nnAct`, bots in random order): bids, asks, auction listings, short sales and pack bids.
20. **Pack auction** (`packAuction`): one uniform-price auction per pack type.
21. **Order book** (`clear`): a call auction in each card market; then comparable-sales marks (`compsMark`) and book
    marks (`bookMark`).
22. **Dealers** (`valueCollectors`): sell into bids and buy asks around their reference value.
23. **Forced sales** (`forcedSales`): into the best remaining bids, then to auction with no minimum.
24. **Shorts settle** (`settleShorts`); the liquidator's non-auction asks are cut (`liqCut`, unused in Realism);
    `settleForced`: bills owed are paid from cash first, then lenders, only from the proceeds of sales a margin call or
    loan default forced.
25. **Records**: worth histories, the crash, rally, bubble and corner detector (`detect`).
26. **Learning within a lifetime** (`adaptStep`, every 10 weeks).
27. **Generation end** (`generationEnd`, every 20 weeks): fitness, diagnostics and the tactic tracker (`genDiag`,
    `tacticTrack`), evolution, deaths and heirs.
28. **Weekly record** (`record`): indexes, Gini, money ledger.

`sim.mjs` then calls `frame(W, { full: true })` to write the week's record.

## 4. Design concepts

**Basic principles.** Prices form only through market mechanisms: a weekly call auction per card market, second-price
sealed auctions, a uniform-price pack auction, and call auctions for credit, research passes and game tickets. Value
comes from a simulated league: a card pays royalties from its player's games, and outside dealers buy and sell around
a public price guide. The engine contains no rule that moves a price or a value in a set direction. Older rules that
did (a scripted value walk, quote pulls, fixed discounts) remain as switches but are off in Realism.

**Emergence.** Prices, trade volume, the loan rate, the pass and ticket prices, pack prices, wealth inequality,
bubbles and crashes, the population size and the bots' tactics all emerge. None is set.

**Adaptation.** Each bot's behaviour is the output of its networks. Behaviour changes through three routes: trials
within a lifetime (`adaptStep`), selection between generations (`generationEnd`: the worst 10% copy a top-10% bot),
and inheritance (`settleEstate`: heirs carry mutated copies). Newcomers bring new random networks.

**Objectives (fitness).** Return on capital from a bot's own decisions over one generation, valued at what the bot
could actually sell for (`realValue`, `fitnessValue: 'bid'`). Allowance and living costs are removed from the return
because no bot chooses them. Royalties, fees, taxes, tax refunds, holding costs and cash shocks stay in it. Fitness is
the mean of the last 6 generation returns (`nnFitnessGens`). Bots do not see their fitness as an input.

**Learning.** Hill climbing on the bot's own weights: every 10 weeks a bot scores the period just ended, keeps a
trial perturbation if it scored better than the saved networks, else restores them, then starts a new trial
(`adaptStep`). No gradient is computed.

**Prediction.** Bots make no explicit forecasts. The card network maps current inputs (prices, recent returns,
research notes, league news, the price guide) to actions. The price prediction contest is one of the weekly games.

**Sensing.** Bots never read hidden value directly. They see public market data, public league news, the public price
guide (a lagged copy of hidden value), and their own research notes. A research note is hidden value seen through a
log-normal error (`research`: `F × exp(N(0, 0.2))`, the error size is an **assumption**). Section 7.7 lists every
input.

**Interaction.** Indirect, through markets: order books, auctions, the pack auction, the credit market and the
card-lending pool. Direct: note swaps (both bots must accept), note theft (detected with chance 0.35, after which the
victim and its friends refuse to trade with the thief for 26 weeks), and contests (entrants' stakes are redistributed
to the best scores).

**Stochasticity.** One seeded stream (`W.rand`, a 32-bit generator seeded from `seed × 7919 + 17`) drives everything
random: the league (games, injuries, champion, awards, retirements, rookies), pack pulls, the order in which bots act,
research errors, mutations and trials, entries (Poisson), newcomers' cash, quitting, cash shocks, card loss and
estate-sale rounding. Diagnostics use private generators and never draw from `W.rand`. Because the league and the
bots share the stream, any change in the bots' draws changes later football (AUDIT.md, methods finding 1).

**Collectives.** None act as units. Lineages (bots that share descent, `lineage`) and tactics (clusters of behaviour,
[TACTICS.md](TACTICS.md)) are observer categories. Wealth groups (top 10%, next 40%, bottom 50%) are for display.

**Observation.** Each week `frame()` writes a compact record (indexes, prices, values, the money ledger, the order
book summary, limits, credit, entry, the league), and at each generation end a `gen` record (diagnostics and
tactics). [METRICS.md](METRICS.md) defines each field. Measurement code changes nothing in the world.

## 5. Initialization

`createWorld(library, overrides)`:

1. **Settings**: `DEFAULTS` merged with the preset (`configs/realism.json`) and any overrides. `sim.mjs` uses seed
   31761 unless `--seed` is given.
2. **Players**: one per library player (203). Hidden value `F` is the site's card value for him in coins.
3. **Timeline** (`startTimeline`): the market opens at the save's latest season (Y88, `startSeason: 'latest'`). Each
   player's value, OVR, skill, grade, Career Legacy and career totals come from the Y88 snapshot. Players without a
   Y88 row are inactive. Print run `S0 = max(2, round(40 / sqrt(max(0.5, value / 100))))` and pool = `S0 × 10`
   (**assumption**: rarer cards for more valuable players; `printRunK`, `printRunExp`, `printRunMin`,
   `printRunValueFloor`, `printRunUnit`, `poolMultiplier`, one helper `printRun` used at every site).
4. **Full league** (`fillLeague`, `leagueFill: 'full'`): the league opens (`leagueStart`), and every club × position
   below the roster shape gets a generated veteran (`veteran`): a measured early-career season for his rates, a real
   NFL entry age, then a burn-in of s seasons under the league's rules, with s drawn from the seasons played by the
   save's active players. Real players keep their site values; `W.fillK` is computed.
5. **Markets**: 16 per player (`makeMarket`). The site's price history is imported as each card's past
   (`seedHistory`).
6. **Bots**: `250 × fillK` neural bots (`newBot`, `randomBrain`), each with 20,000 coins (**assumption**). Weights are
   drawn from N(0, 1/√fan-in).
7. **Practice** (`practiceGens: 3`): the same networks play 60 weeks in a private world with another seed. The real
   market's bots then take the practice networks, ranked by fitness.
8. **Endowment** (`endow`): each player's `S0` copies are rolled at Standard pack odds and given to random bots at no
   cost.
9. **Contests**: this week's and next week's contests are published.

Dealers receive their starting stock (10% of every card's copies in circulation, **assumption**) the first time they
act.

## 6. Input data

The model reads files in `data/` and no live external input. In summary ([DATA.md](DATA.md) has the provenance):

| File | Used for |
|---|---|
| `library.json` | 203 players: stats, rates, OVR, skill, grade, Career Legacy, hidden value at Y88, family |
| `timeline.json` | The save's 10 real seasons (Y79–Y88), last snapshot of each |
| `history.json` | The site's price history, imported as each card's past |
| `league_rates.json` | Rates measured from the save for the league simulation |
| `nfl_age.json` | Injury risk by age, career-end chance by age and rookie ages from real NFL rosters |
| `kits.json` | Which clubs have alternate and throwback kits; the autographs' mean value multiplier |
| `families.json` | The site's play-style family for each player (display and contest questions) |
| `rookie_names.json` | 5,000 generated names for new players |
| `names.json` | Generic first and last names for bots |

## 7. Submodels

### 7.1 League simulation

After the save's last real season the simulated league sets every hidden value (`valueModel: 'league'`). It never
reads a price or a bot.

- **Start** (`leagueStart`): each player's per-game rates come from his last real season (if he played 4 or more
  games, `lastSeasonMinGames`), else his career per game. His form window starts at his career pace. The save has no
  ages: each player's entry age is a random draw from real NFL rookie ages (**assumption**; it is not his real age, and
  it drives his injury and retirement risk).
- **Weekly game** (`leagueWeek`, `lgGame`): in weeks 1–17 every active, uninjured player plays one game. Yardage stats
  are log-normal around the per-game rate with spread 0.4 (`gameNoise`); count stats are Poisson. Both are
  **assumptions**: only season totals are known. Each game adds to his career totals, his Career Legacy (a per-position
  linear fit measured from the save, `legacyGrowth`) and his form window.
- **Injuries** (`leagueInjuries`, each season): the chance of an injury season is the save's (16 injured seasons; too
  few to split). How the chance varies with age is the real NFL's (`relativeRiskByAge`), rescaled so the league's
  average equals the save's. The games missed are drawn from a real injured season at his position (from every position when
  his has fewer than 3, `injuryPoolMin`; `W.L.injuryFallback` lists those positions). They come as one spell starting
  at a random week (**assumption**).
- **Season end** (`leagueSeasonEnd`):
  - Super Bowl: the champion club is drawn with chance proportional to the summed season production of its card players
    (**assumption**, `championWeight: 'production'`; with `leagueFill: 'save'` it favours clubs with more card players;
    `'equal'` draws evenly among clubs with active card players). Every active player on it gets a ring. A Super Bowl MVP is awarded with the save's measured
    frequency to the champion's top producer.
  - MVP, OPOY, DPOY: each awarded with the save's measured chance per season, at a position drawn from the save's mix,
    to that position's top producer of the season. Picking the top producer is an **assumption** (`awardWinner: 'top'`, the only rule implemented: the save
    keeps only quantiles of the winner's rank, not draws); in the save, MVP
    and OPOY winners ranked at a median quantile of 1.0 within their position (n = 7 each).
  - Retirement: how often careers end is the save's (about 11% of active players a season); how that varies with
    age is the real NFL's (`careerEndByAge`). Past age 40 every career ends.
  - New players: in a full league, each club × position is refilled to the roster shape (`fillRosters`), a retiree's
    slot first. Each rookie (`addRookie`, `leaguePlayer`) gets a name from `rookie_names.json`, first-season rates
    from a real early-career season at his position, the median print run at his position (20 if none, `rookieS0Fallback`) and 16 new card markets. He
    inherits the skill and grade of the real player whose early season was drawn as his template (skill moves value
    0.8–1.2×) and holds OVR 62 (`rookieOvr`) until his first values (**assumptions**).
  - Hall of Fame at Career Legacy 7,500.
  - Form: each active player's rates are multiplied by `exp(swing)`, the swing drawn from the save's real
    season-to-season changes at his position and career stage, plus the measured pressure shift. The shift depends
    on the log change of his hidden value over the season just ended: +0.136 below 0.186, −0.08 from 0.186 to 0.496,
    −0.055 above 0.496 (`pressure` in `league_rates.json`, measured on n = 208 player-seasons). It reads hidden
    value, never a price.
- **Values** (`leagueValues`, weekly): the site's own formula on the simulated record. OVR is a player's rank within
  his position on League Score per game, `62 + 37 × q^0.85` for rank quantile q. Active players are ranked on the last
  `formSeasons × 17` games (2 seasons in Realism; injured games count as zero), retired players and the game's legends
  on career per game. For the first 2 seasons (`formBlendSeasons`) OVR blends from the site's career-total OVR to this form OVR, so the
  market opens at the site's values. Value is
  `(25 + 2400 c³) × skill factor × ((1 + legacy/10000) / 1.5)³ × 1.25 if legacy ≥ 7,000 × tier multiplier × tier scarcity`,
  with `c = (OVR − 60)/39`. In a full league every rank is taken against a fixed reference (the save's own players and
  the legends), so generated players do not change what real cards are worth.
- **Dormancy** (`dormancy`, `wakePlayer`): a retired player whose cards nobody has held, bid on, listed or traded for
  52 weeks is skipped by the weekly per-card upkeep until someone touches one of his cards. This changes no outcome.

### 7.2 Card values, copies and packs

- A card market's value is the player's value × its rarity multiplier: finish ×1, ×1.5, ×2.5, ×6 (Base to Holo) and
  design ×1, ×1.2, ×1.8, ×2.5 (Prizm to Locker). Items carry the site's extra multipliers (autograph parallels, inks,
  inscriptions, serials, throwbacks; Prizm colour parallels; kits). All tables are copied from the site's code.
- Copies come from a finite pool per player. A pack (`ripPack`) draws tiers, finishes and designs at the site's odds
  for its type (Standard 3 cards, Premium 4, Elite 5, Holo Showcase 5), players weighted by pool size within a tier.
- **Pack auction** (`packAuction`): 33 packs a week × `fillK`, split 75 / 21 / 2.5 / 1.5% by type (**assumption**: the
  mix bots bought under an earlier fixed price). Each bot bids a multiple of the last clearing price, set by its bot
  network. The highest bids win and every winner pays the lowest winning bid. No rule links the pack price to hidden
  value.

### 7.3 Order book

`clear(W)` runs one call auction in each card market each week. Bids are sorted high to low, asks low to high, and
pairs match while bid ≥ ask, skipping a bot's own orders and pairs blocked by theft flags. Every matched pair trades
at one price, the midpoint of the last matched bid and ask. The seller pays the 1% fee (`fee`) to the house. Orders
do not carry over: each bot places fresh orders every week.

**Marks.** A market that traded keeps its trade price. One that did not is marked from its player's other markets'
trades or book marks in the last 4 weeks, at the median scaled by multiplier (`compsMark`, `priceRule: 'comps'`).
Then `bookMark` (`markRule: 'book'`) keeps the mark inside the standing book: if the median of the 3 best asks sits
below the mark for 2 weeks running, the mark drops to it; if the median of the 3 best bids sits above for 2 weeks,
it rises to it. With `markHalfLife` 4, an untraded mark outside the bid–ask levels drifts toward their middle; asks
only pull a mark down, bids only push it up, and a mark between the two holds.

### 7.4 Sealed auctions

`auctionPhase`. A bot lists a copy with a reserve; next week every other bot may submit one sealed bid. The highest
bid at or above the reserve wins and pays the second-highest bid or the reserve, whichever is higher. A lone bidder
pays its own bid (`singleBidder: 'own'`). A sale is a trade: it sets the card's mark and feeds comparable sales and the
Vault index (on its own chain, see METRICS). One-of-a-kind items trade only here. A neural bot bids when its card
network's buy output is positive and above its sell output, at the price from `nnPrice`.

### 7.5 Credit, card lending and short selling

- **Loans** (`creditMarket`). There is no bank and no coins are created. Each week, bots with idle cash (above their
  cash target) offer a share of it at their lending rate; bots with leverage appetite request loans up to
  `maxLTV` (60%) of their cards' value at their maximum rate. Requests (highest rate first) and offers (lowest rate
  first) match while the request's rate ≥ the offer's; all new loans take one rate, the midpoint of the last matched
  pair. Loans run 8 weeks. Interest is paid weekly (or added to the loan). Past 75% of the cards' value a borrower
  gets a margin call (a forced sale down to 60%). At maturity it must repay or sell. A borrower whose debt exceeds its
  cash plus cards, or that is 3 weeks late, defaults: lenders recover its cash pro rata, its cards go to the
  liquidator carrying the lenders' unpaid claim, and the bot stays in the market. Each liquidator sale of a seized copy
  pays the claimants pro rata to what each is still owed; anything over goes to the borrower (to the treasury if it
  has left). A bot that leaves repays its loans from cash first; its lenders keep the same claim on its cards. New
  offers and requests need only be above the matcher's dust floor (0.5 coins). A neural bot lends up to
  `lendShareMax` (all) of its idle cash and asks to borrow a share of `maxLTV` × its cards' value.
- **Bills owed** (`bill`, `collectArrears`). Living costs, holding costs, the wealth tax and cash shocks are paid from
  cash; the rest is owed, by cause, and counts as a debt in worth. It is collected from later cash (at the start of
  the week and after the forced sales) and paid where the bill was going (living costs and shocks leave the economy,
  holding costs go to the treasury, the tax to the tax pot or the treasury). While owed, it is put up for a forced sale
  each week (the wealth tax only with `wealthTaxForced`). Heirs inherit it; only a bot that leaves is excused.
- **Card lending and shorts** (`lendPool`, `borrowCard`, `shortUpkeep`, `settleShorts`). Each bot lends a share of
  its copies (bot-network output). A bot with no copy of a card may borrow one and sell it, posting 50% of the price as
  collateral and paying 0.5% of the price a week to the lender; a short seller also pays the lender any royalty the
  card earns. The card must be returned within 12 weeks or when the short seller's worth falls below 25% of what it
  owes, or when it can't pay a fee or royalty (it pays from its cash only; the shortfall is the lender's loss). A lender
  is drawn in proportion to the copies it offers. A forced cover bids up to `coverBid` (1.15) × the price for
  `coverGraceWeeks` (3) weeks, then settles in cash at `coverSettle` (1.1) × the price (all three the owner's
  settings). A short whose sale did not fill is undone. A short seller holding a copy of a card it owes returns it at
  settlement (plain netting): a bot can't be long and short the same card.

### 7.6 Outside dealers and the liquidator

- **Dealers** (`valueCollectors`, `outsideMode: 'value'`). 25 dealers outside the bot economy (**assumption**). Each
  receives `outsideBudget × fillK ÷ 25` coins a week (Realism 100,000 a week in total before scaling,
  **assumption**), saves up to 26 weeks of budget, holds at most 4 copies of any card, and has a fixed error: a bias
  drawn from N(0, 0.15) plus a fixed per-card wobble of up to ±7.5%. Its reference value is the public price guide
  (Realism) or last week's value. It sells to bids within 5% below its reference and buys asks at or below it,
  cheapest first relative to the reference. Dealers start with 10% of every card's copies. They are price takers on
  the bots' orders; a bubble can outrun them when their stock or cash runs out.
- **Liquidator**. Copies from bots that left or defaulted go to the liquidator (`toLiq`), which lists up to 30 a week
  at sealed auction with no minimum price (`liquidation: 'auction'`), one-of-a-kind items first.

### 7.7 The bots' networks

Each neural bot has two feed-forward networks with tanh hidden layers and linear outputs (`forward`, `cardKernel`).
Weights start at N(0, 1/√fan-in) (`randomNet`).

**Bot network** (40 inputs, 12 hidden, 41 outputs; 1,025 weights), run once a week (`nnThink`).

- Inputs (`BOT_IN`): bias; cash, debt, money lent and short exposure as shares of worth; worth against the median
  bot; own 4-week return; age (seasons ÷ lifespan) and weeks of life left; the last loan rate; weeks to its own and
  its lenders' nearest maturity; pass, ticket and prize-pool prices; notes held and fresh; theft flags on it; friends;
  market drawdown and 4-week change; season phase; pack value against price; last week's game results; the royalty
  rate, living cost share, allowance share, trade fee, pack markup, card lending fee and short margin; its cards lent;
  games on each of the 8 positions this week and next.
- Outputs (`BOT_OUT`): cash target (`keepMax × sigmoid`, up to 100% of worth in Realism); lending share and rate;
  leverage (borrow share) and maximum borrowing rate; pass and ticket bid and ask; research count (0–6); packs wanted
  per type (0, 1 or 2) and pack bid per type; share, steal and accept notes; enter each of 10 contests; share of cards
  to lend; research aim per position; quit.
- Rates in Realism (`rateMap: 'log'`): `0.025 × exp(output)`, with only a safety bound of 1,000% a week.

**Card network** (43 inputs, 16 and 8 hidden, 9 outputs in Realism; 921 weights), run for every card the bot looks
at, once in the research phase and once in the order phase (`nnResearchWish`, `nnAct`), and for each auction it
could bid in (`nnAuctionBid`). Without an attention budget a bot looks at every live card (about 2,100 to 2,900).

- Inputs (`CARD_IN`): bias; log price; log rarity premium; design and finish; price change over 1, 4 and 12 weeks;
  price below its 12-week average; trades in 4 weeks; copies out; pool left; has a fresh note, note against price,
  note age, OVR from research; copies held, gain on cost, share of worth; cash and debt shares; market drawdown,
  4-week change and season phase; one-of-a-kind flag and premium; risk rating from research (zero under the league);
  royalty yield from its note; its weeks of life left; copies it is short; copies lendable; card lending fee;
  royalty paid last generation ÷ price; games on the card's position; last week's best bid and ask ÷ price; league
  news (weeks out injured, form against career pace, reigning award winner, retired, rookie); with the guide on,
  guide ÷ price and weeks since the guide updated.
- Outputs (`CARD_OUT`): buy, sell, price offset, size, research, auction, short, anchor to its own estimate, and with
  the guide on, anchor to the guide.
- **Actions from outputs** (`nnAct`): buy if buy > 0 and buy > sell; sell (ask) if it holds copies and sell > 0; list
  at auction if auction > 1; short if it holds none, short > 0.5 and short > buy. Size is
  `1 + min(maxOrderQty − 1, floor(maxOrderQty × sigmoid))` copies (1 to 3, every size reachable). Buy orders are placed in order of the buy output, up to 40 a week (`deployOrders`) while cash above the cash
  target lasts. Up to 10 auction listings (`maxListings`), 30 short sales (`maxShorts`) and 8 packs (`maxPacks`) a week.
- **Price** (`nnPrice`): the base starts at the mark, moves toward the guide by `sigmoid(anchor to the guide)`, then
  toward its own fresh research estimate by `sigmoid(anchor to my estimate)`. The order price is
  `base × exp(0.6 × price offset)` (`priceMap: 'log'`), held only by a safety clamp of ×50 either way.
- **Research** (`nnResearchWish`): players it has no fresh note on, ranked by the research output plus its research
  aim for the position; it researches up to its research count, `passesPerWeek × exp(output)` (passes permitting; the
  pass price binds, `maxResearchPerWeek` 60 is a safety bound). Notes go stale after 12 weeks and are forgotten at 24
  (`memoryCap` 0: no count limit). Pass and ticket bids and asks are the last clearing price × exp(output) on the pack
  bid's scale (before the first trade, `passOpen` 10 or `ticketOpen` 4 × coinScale). Packs: 0 to `maxPacks` of each
  type, `maxPacks` in all.
- **Forced sales** (`forcedSales`, `forcedOrder: 'network'`): a forced seller sells the cards its own network most
  wants to sell, first into standing bids, then at auction with no minimum.

### 7.8 Learning and evolution

- **Within a lifetime** (`adaptStep`; Realism: every 10 weeks, step 0.05). The score of a period is the bot's return
  at selling value with money it did not earn removed. If a trial was running and scored better than the saved
  networks' score, it is kept; else the saved networks are restored. A new trial then adds N(0, 0.05) to every weight.
  Adopting another bot's networks resets the trial.
- **Selection** (`generationEnd`; every 20 weeks). Bots are ranked by fitness. Each of the worst 10% adopts a mutated
  copy of a randomly chosen top-10% bot's networks and keeps its own cash and cards. Mutation (`mutateBrain`) adds
  N(0, 0.15) to every weight and redraws each weight from N(0, 1) with chance 0.01. These rates are **assumptions**.
- **Practice** (`practiceGens: 3`): before the market opens, the networks play 3 generations in a private world.

### 7.9 Entry, exit, death and heirs

- **Entry** (`peopleChange`, `newcomer`). Each week Poisson(λ) newcomers arrive with fresh random networks and
  `20,000 × exp(N(0, 0.5))` coins (**assumption**). λ = `entryRate × botK × (1 + entryHype × rally) × (1 + entryReturns
  × word of mouth) × (1 + entryNews × news)`, with entryRate 0.25 and all three factors at 1 in Realism
  (**assumptions**). Rally is the Vault index's 20-week rise; word of mouth the median bot's own 11-week return; news
  the league's 4-week news count over its 52-week average, minus 1. Each is floored at 0. Only how many arrive depends
  on them.
- **Quitting** (`quitRule: 'network'`). After 20 weeks in the market, a bot leaves each week with chance
  `0.25 × max(0, quit − 0.5) × 2`, where quit is its quit output through a sigmoid. A leaving bot's cards go to the
  liquidator; loans it made are forgiven and loans it owes default (`removeBot`).
- **Death** (`mortality`). Each bot lives 6–14 generations (uniform, **assumption**). At death 40% of each holding is
  sold into standing bids (`estateSale`, **assumption**) and the unsold part is put up at no-minimum auction by the
  heir. One heir (`heirs: 1`) inherits cash, copies with their cost basis, items, loans in both directions, notes,
  friends and flags, and a mutated copy of the networks (`settleEstate`).

### 7.10 The Realism factors

All are settings; with each at its engine default a run matches the earlier engine for the same seed.

| Factor | Realism value | Basis |
|---|---|---|
| Allowance (`allowance`) | 200 a week per bot | **Assumption**: equal to the flat living cost |
| Living cost (`livingCost`, `lifestyle`) | 200 a week + 0.05% of worth a week | **Assumption** |
| Royalties (`royaltyRate`, `royaltyFunding: 'minted'`) | 5% of value per 20 weeks, paid weekly, scaled by each game's production ÷ career pace; new money | **Assumption** |
| Holding cost (`holdCost`) | 0.05% of the mark a week, to the house | **Assumption** |
| Wealth tax (`wealthTax`, `wealthTaxThreshold`, `wealthTaxEvery`, `wealthTaxTo: 'equal'`, `wealthTaxForced`) | 0.1% a week (charged every 4 weeks) on worth above twice the median, paid back equally; unpaid tax is owed and sold for | **Assumption** |
| Trade fee (`fee`) | 1% of each sale | **Assumption** |
| Dealers (`outsideBudget`, `outsideNews`) | 100,000 a week, 25 dealers; see 7.6 | **Assumption** |
| Price guide (`guideOn`, `guideEvery`, `guideLag`) | Every 4 weeks, 1 week old | **Assumption**, modelled on printed price guides |
| Cash shocks (`cashShockChance`, `cashShockSize`) | 0.5% a week, a need of 10% of worth | **Assumption** |
| Card loss (`lossRate`) | 1% of copies in bots' hands a season | **Assumption** |
| Estate sale (`estateSale`) | 40% of holdings at death | **Assumption** |
| Entry factors (`entryHype`, `entryReturns`, `entryNews`) | 1 each | **Assumption** |
| Full league (`leagueFill`), bots scale with cards (`botScale`) | On | Roster shape from the save |
| Form window (`formSeasons`) | 2 seasons | Chosen; closer to the save's season-to-season spread than 1 |
| Pressure (`pressureStrength`) | 1 (the measured shift) | Measured |
| Freedom (`priceMap`, `rateMap`, `keepMax`, counts) | Log maps, cash target up to 100%, 40 / 10 / 30 / 8 | Widened so no limit binds often (DEVLOG round 4) |
| Fitness at selling value (`fitnessValue: 'bid'`) | On | Design choice |
| Contests (`games`, `prizeShare: 0`) | On; prizes only from stakes | Design choice |

## Assumptions

Every constant below is an assumption: not measured from the save, chosen by the owner or carried over from an earlier
version of the model. Each is a setting in `DEFAULTS` with a doc comment, listed in `ASSUMPTIONS` (`engine.mjs`), shown
with its running value in the page's Rules under **Assumptions** (the most consequential ones also as controls), and
written into every run file with the rest of the configuration. The values are the ones the code always used: naming
them changed no result.

| Setting | Value | What it decides |
|---|---|---|
| `printRunK` | 40 | Print run: copies out at the open = max(printRunMin, round(printRunK ÷ max(printRunValueFloor, value ÷ printRunUnit)^printRunExp)): every card's scarcity |
| `printRunExp` | 0.5 | Print run: how fast copies fall as value rises (0.5: a square-root law) |
| `printRunMin` | 2 | Print run: the fewest copies of any card |
| `printRunValueFloor` | 0.5 | Print run: the lowest value ÷ printRunUnit the formula uses, which caps the most copies |
| `printRunUnit` | 100 | Print run: the value unit (coins) |
| `poolMultiplier` | 10 | Unminted copies in the pool = copies out at the open × this: how long packs can mint |
| `packsPerWeek` | 33 | Packs released a week (from an earlier simulation's purchases, not the save) |
| `packMix` | standard 0.75, premium 0.21, elite 0.025, holo 0.015 | Share of the released packs of each type |
| `startCash` | 20000 | A bot's opening cash |
| `newcomerCashSd` | 0.5 | Spread (log sd) of a newcomer's cash around startCash: created money |
| `concentrationFree` | 3 | Copies of one card counted at full mark in worth and fitness |
| `concentrationSlope` | 0.06 | Haircut per copy beyond concentrationFree: 1 ÷ (1 + slope × excess) |
| `itemHaircut` | 0.9 | Share of its mark a one-of-a-kind item counts for in worth, fitness value and collateral |
| `passesPerWeek` | 3 | Research passes granted to every bot each week |
| `passLife` | 1 | Weeks before an unused pass expires |
| `maxResearchPerWeek` | 6 | Most players one bot may research in a week |
| `knowledgeWeeks` | 12 | Weeks before a research note goes stale |
| `memoryCap` | 25 | Most notes one bot keeps |
| `nnResearchError` | 0.2 | Log-normal error of a neural bot's research note around hidden value: how much information is worth |
| `notesPerSwap` | 3 | Freshest notes each side gives in a swap |
| `notesPerTheft` | 3 | Freshest notes a theft copies |
| `detectChance` | 0.35 | Chance a theft is noticed |
| `guardChance` | 0.5 | Chance a theft from a bot that flagged the thief is stopped |
| `gamePaid` | valuation 0.2, prediction 0.1, blindRank 0.25, closest 0.25, keepCut 0.25, imposter 0.25, grid 0.25, higherLower 0.25, overUnder 0.25, duel 0 | Share of entrants paid in each contest: how skewed winnings are |
| `lifespan` | 6–14 | A bot's life in generations, drawn uniformly |
| `aiLifespanWeeks` | 40–80 | An AI bot's life in weeks, drawn uniformly (AI bots only) |
| `nnResetScale` | 1 | Sd of a weight redrawn in mutation ('layer': its layer's 1/√fan-in) |
| `nnWidenScale` | 0.1 | Sd of the new weights when a network is widened for the price guide |
| `hotVolWeeks` | 20 | Rule bots' hot list: weeks of trades counted |
| `hotRetWeeks` | 4 | Rule bots' hot list: weeks of return counted |
| `hotFloor` | 0.2 | Rule bots' hot list: floor on the return factor |
| `moodWeeks` | 8 | Weeks of the Vault index the market drawdown (a bot input) is measured over |
| `rsMaxGap` | 52 | Vault index: longest gap (weeks) between two sales of a card that are paired |
| `rsWindow` | 104 | Vault index: weeks solved each week |
| `rsClamp` | 2 | Vault index: clamp on a pair's log change |
| `rsSmooth` | 0.001 | Vault index: smoothness between neighbouring weeks |
| `impliedVolumeWeight` | 2 | A player's implied price weights each card market by copies out + this × last week's trades |
| `outsideSaveWeeks` | 4 | outsideMode 'budget': weeks of budget unspent collector money can save |
| `gameNoise` | 0.4 | Log-normal spread of a game's yards around the per-game rate (the save has season totals only) |
| `lastSeasonMinGames` | 4 | Games in the last real season needed to open on its rates rather than the career's |
| `entryAgeFallback` | 23 | Entry age if the NFL age data is missing (real players' ages are random draws from NFL rookie ages: the save has none) |
| `injuryPoolMin` | 3 | Injured seasons a position needs to draw spell lengths from its own |
| `championWeight` | production | How the Super Bowl champion club is drawn: by its card players' production, or evenly |
| `awardWinner` | top | MVP, OPOY and DPOY go to the top producer at the drawn position |
| `rookieS0Fallback` | 20 | A rookie's print run if his position has no players (else its median) |
| `rookieOvr` | 62 | A rookie's OVR until his first values (he inherits his template player's skill and grade) |
| `formBlendSeasons` | 2 | Seasons over which a card moves from career OVR to form OVR after the open |
| `lossRate` | 0 | Share of copies lost a season |
| `entryHype` | 0 | Newcomers after Vault index rallies |
| `entryReturns` | 0 | Newcomers after good median returns |
| `entryNews` | 0 | Newcomers after league news |
| `hypeInjury` | 0 | Extra injury chance after a value rise |

Two valuation rules are disclosed rather than made settings: a one-of-a-kind item is marked at its plain card's price ×
(its premium ÷ the plain card's premium), not from its own sales (they are too rare), and `holdingsValue` (loan
collateral) counts items at `itemHaircut` × mark without the fee that `worth` deducts. Card input 27 is the promised
royalty yield (`royaltyRate` × the note's estimate ÷ price); input 32 carries what was actually paid.

## Known limits

- One random stream drives both the league and the bots, so the football is not held constant between runs that
  differ in the bots' behaviour (AUDIT.md, methods finding 1).
- Research reads hidden value with noise; the valuation contest and some diagnostics read it exactly. AUDIT.md section
  5a lists the channels found.
- Code findings from the audit (AUDIT.md section 5) are marked Open, Fixed or Deferred one by one.
- The league's weekly stat draws, injury spells, champion draw and award winners are assumptions; only season totals
  are known from the save.
