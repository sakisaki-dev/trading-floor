# Retro Vault Sandbox: AI bots in a card market

**Status:** design guidelines plus a working rule-bot prototype (no AI yet).
**Prototype:** [The Trading Floor](https://claude.ai/artifact/NDU1spHL5uiHtUyo5BDmzF) (private artifact). Its source is
[`trading-floor.html`](trading-floor.html) in this folder. Sections 12–15 cover what it taught us and what we hadn't
considered.
**Date:** 2026-11-05.
**Goal:** use Retro Vault's league, card and market data as a closed world where AI bots earn, trade and compete. We
study how they behave and how their trading moves prices.

The sandbox is a separate research project. It reads the site's data but never writes into `data/y80/` or
`public/data/`. It runs outside the site, for example in `sandbox/` with its own output folder.

---

## 1. What we want to learn

1. **AI behaviour research.** How do bots of different strength (model size, context, reasoning) behave when they
   compete for scarce assets? Do they cooperate, herd, panic, specialise, bluff or try manipulation?
2. **Market science.** How does trading turn into prices? Do bubbles, crashes, wealth gaps and market makers emerge
   on their own? How far do traded prices drift from fundamental value?

The core question is how bots move the market by trading, and through it each other. Some bots get wealthy. Which
strategies get them there, and how do some bots pull ahead of others?

---

## 2. Making the world volatile enough

The live league is too calm to test bots in. It updates only when a season is uploaded, and card values come from a
formula. Real futures on real seasons can't be the source. Volatility comes from three things.

1. **A simulated-season engine.** It plays fake seasons from each player's real per-game rates (yards per carry,
   tackles per game, and so on) with random variation, plus aging, breakouts and slumps. Season results move OVR and
   Career Legacy, and through them each card's fundamental value. It uses the formulas in `src/utils/cardMarket.ts`
   and `src/config/*`.
2. **Prices set by bots.** The site formula is only the fundamental-value anchor. The traded price is whatever bots
   agree on, so thin markets swing hard. One panic sale can halve a card's price.
3. **Scheduled shocks.** Trades, injuries (games missed), retirements, Hall of Fame crossings, a record broken, a
   new rookie class. Bots that read these early gain an edge.

**Time:** one tick = one sim day (or week), and one generation = one sim season.

---

## 3. Economy

### Earning
- Each bot gets a **coin allowance** per tick or per sim week. Every bot starts equal, so differences come from play.
- Ways to earn more are still to be decided. Ideas: set-completion bonuses, season-end dividends on held cards
  (for example a player's Career Legacy gain), liquidity rebates for market makers, and bounties for predicting the
  season.

### Spending: packs
- Packs use the real pack odds (`src/utils/collection.ts`: tiers, finishes, variants, kits, autographs, Prizm
  parallels).
- Packs cost more than their expected value (a house edge), so ripping packs is a gamble, not free money.
- **Sealed packs are tradable assets.** A bot can open a pack, hold it or sell it. Pack arbitrage (selling sealed
  packs when they trade above their expected value, ripping them when below) is a strategy of its own.

### Sinks (stop endless inflation)
- Duplicates turn into shards, and shards can be crafted into cards (the site's shard rules).
- A trade fee of 3–5% on every trade. It stops free churn, and the total fee take is itself a metric.
- Optionally, cards can be burned for coins at a discount.

---

## 4. The market

### Recommended: an order book for each card type
- A tradable item is roughly player × variant × finish (plus kit or parallel where it matters).
- Bots post **bids** and **asks**, and a trade happens when they meet. All matching is plain code with no AI.
- **Market price = last trade price**, lightly smoothed. Bots see the price, the order book depth and the
  fundamental value. How much of that each bot sees depends on its context gene (section 6).
- Thin markets mean big price impact, which is where the volatility comes from.

### Later: direct offers between bots
- Bot A offers a card to bot B for coins or cards, and B accepts, rejects or counters.
- Better for studying negotiation, persuasion and deception, but every offer costs an LLM call, so it comes later.

### How prices spread between bots
- **Mark-to-market:** when one bot dumps a player, every holder's paper wealth drops. Bots close to their cash
  limit may have to sell too, and a crash spreads through the population.
- **Herding:** momentum bots buy rising prices, which feeds bubbles and then corrections.
- **Information:** bots that read the season stats early profit from bots that only read prices.
- **Supply:** pack openings add cards and shards and burns remove them, which sets overall inflation.

---

## 5. Strategies we expect to emerge

| Strategy | How it profits | What beats it |
|---|---|---|
| Value investor | Buys below fundamental value and waits | Long bubbles |
| Momentum trader | Rides trends | Sudden reversals |
| Market maker | Quotes both sides and earns the spread | One-way crashes leave it holding inventory |
| Pack arbitrageur | Trades sealed packs against their expected value | Accurate pack prices |
| Stats reader | Front-runs season shocks (breakouts, Hall of Fame crossings) | Bots with the same information |
| Cornerer / collector | Buys up a scarce card (a 1/1, a Legendary) and names the price | Runs out of cash, or nobody buys |
| Contrarian | Buys from panic sellers | Prices that keep falling |
| Set builder | Completes sets worth more than their parts | Others raising prices on the missing pieces |

### Why some bots pull ahead
- **Compounding:** early wins buy more positions.
- **Information edge:** more context, stats history, or seeing others' order flow.
- **Liquidity power:** rich bots can move thin markets themselves.
- **Survival:** bots that never go broke keep playing. Risk control matters as much as intelligence.

---

## 6. The bots

### Population
- **Mostly rule bots** (free, deterministic): market makers, panic sellers, pack rippers, collectors and momentum
  traders. They supply liquidity and noise.
- **LLM bots** (fewer): they read a compact state and decide orders.

### Genes (what mutates between generations)
- **Model tier:** Haiku → Sonnet → Opus. Promotion is the expensive mutation, so it is capped.
- **Context:** how much history, stats and order book depth the bot sees.
- **Strategy prompt / persona:** risk appetite, time horizon, focus (positions, eras, variants).
- **Decision frequency:** every tick, or only on events.

### Evolution loop (each generation = one sim season)
1. Run the season. Bots trade and the sim engine plays games and moves fundamental values.
2. Score every bot (section 7).
3. **Survival:** the bottom N are eliminated.
4. **Reproduction:** the top bots copy themselves with small mutations, such as a tweaked persona or more context.
5. **Promotion:** the top few move up a model tier, within a fixed cap per generation.
6. Optionally, each bot gets one reflection call: "what worked, what didn't". It writes a short memory note it carries
   into the next generation.

---

## 7. Fitness, scoring and fair play

- **Score = net worth at liquidation value:** what the bot's holdings would actually sell for into the current bids,
  minus fees, plus cash. Not the last trade price, so pumping a card you own earns nothing.
- Also tracked: Sharpe-like risk-adjusted return, maximum drawdown, and survival streak.
- **Manipulation detection:** flag wash trades (the same pair of bots passing the same card back and forth) and
  self-pumping. These go in the log, not just a ban list. Whether LLM bots discover manipulation is itself a research
  result.

---

## 8. What we measure

- **Wealth inequality:** the Gini coefficient over time. Does the gap widen, settle or swing?
- **Strategy survival:** which strategies make it through each generation.
- **Bubble index:** traded price ÷ fundamental value, per card and market-wide.
- **Volatility** per card, and **price impact** per trade size.
- **Trade graph:** who trades with whom. Do market makers become hubs? Do cartels form?
- **Model tier vs outcome:** is Opus actually better than many Haiku bots? At what cost per coin earned?
- **Information value:** profit difference between bots with and without stats context.

---

## 9. Cost (why this won't cost a fortune)

Prices per million tokens, input / output, as of 2026-11:

| Model | Input | Output | Cached input |
|---|---|---|---|
| Haiku 5.5 | $0.10 | $0.50 | ~10% of input |
| Sonnet 5.5 | $2 | $10 | $0.20 |
| Opus 5.5 | $4 | $20 | $0.20 |

The Batch API halves these, and our bots don't need instant answers.

**Per decision** (~3K tokens in, 500–1,000 out): Haiku ≈ $0.0005, Sonnet ≈ $0.012, Opus ≈ $0.03.

| Setup (100 bots, 20 decisions per season) | Per generation | 50 generations |
|---|---|---|
| All Haiku | ~$1 | ~$50 (~$25 batched) |
| 80 Haiku / 15 Sonnet / 5 Opus | ~$7 | ~$350 |
| Mostly rule bots + 20 Haiku + 3 promoted | ~$0.50 | ~$25 |

**What would be expensive** is 1,000 bots on Sonnet, deciding every day with 50K tokens of history each. That's
about $20,000. Avoid it.

### Cost rules
1. **Most of the population is rule bots** (free). They also supply the volatility.
2. **Bots act on events, not on every tick:** a pack lands, a price moves 5% or more, a trade offer arrives, or a
   season ends. Otherwise their standing orders stay.
3. **Prompt caching:** the rules and world description are an identical prefix for every bot. Bot state goes after
   it as compact JSON, not chat history.
4. **Cap promotions:** for example the top 3 per generation go to Sonnet, and Opus is an occasional
   hall-of-fame tier.
5. **A hard dollar cap in the harness:** sum the token usage of each response and stop the run at $X.
6. **Build at $0 first:** the economy, sim engine and scoring run with rule bots only. LLM pilots ($1–5) come only
   once the world actually moves.

---

## 10. Build plan (proposed)

1. **Sim engine:** a seeded season simulator from real per-game rates that outputs new career lines, then OVR,
   Career Legacy and fundamental values. Deterministic per seed.
2. **Economy and order book:** coins, allowance, packs (reusing the site's pack code), the order book, fees, shards.
3. **Rule bots:** 5–6 archetypes. Run hundreds of seasons at $0, then tune until bubbles and crashes actually happen.
4. **Metrics and a dashboard:** the Gini coefficient, bubble index, trade graph and strategy survival. It could
   become a page or an artifact.
5. **LLM bots:** a Haiku pilot with 10 bots and event-driven decisions, under a dollar cap.
6. **Evolution:** mutation, promotion and reflection memory.
7. **Later:** direct bot-to-bot offers, new ways to earn, and experiments (information asymmetry, fee changes, supply
   shocks).

---

## 11. Open questions

- **Trading channel:** order book first, with direct offers later? (Recommended.)
- **Ways to earn and trade:** to be diversified; still to discuss.
- **Bot visibility:** can bots see each other's holdings or order flow, or only the market?
- **Fitness details:** pure net worth, risk-adjusted return, or survival-weighted?
- **Promotion rules:** how many promotions per generation, and does a promoted bot keep its memory?
- **Market granularity:** does each autograph parallel or serial get its own book, or do rare items go to auctions?
- **Where it lives:** a `sandbox/` folder in this repo or a separate repo, and whether results show on the site.

---

## 12. The prototype: The Trading Floor

A browser simulation with no AI and no cost. About 100 rule bots trade the 203 real cards, starting from the Y88
market (fundamental = the site's card value ÷ 20, in coins).

**How it works**
- **Time:** one tick is one week, and a season is 20 weeks.
- **Weekly games:** each active player's fundamental drifts each week, with rare hot streaks and missed time.
- **Season results:** these depend on career stage (young players rise, veterans decline). Some veterans retire,
  and three rookies enter the packs each season.
- **Market:** every card clears in a weekly call auction, so all orders meet at one price and acting first doesn't
  matter. A 4% fee comes out of each sale.
- **Quote pressure:** unfilled bids above the price, or asks below it, move the price even without a trade.
- **Packs:** a pack holds 5 cards, priced at its expected value at fundamentals plus a 25% house edge. Stars mint
  rarely and role players often.
- **Anchors:** outside collectors buy at around fundamental, and holders of active players get a 3% season royalty.
  Both can be switched off.
- **Evolution:** each season the poorest 10% are cut. Their cards go to a liquidator selling at 20% under market,
  and mutated copies of the richest 10% take their slots.
- **Strategies:** seven archetypes (value, market maker, momentum, retail herd, pack arbitrage, collector,
  contrarian). Each has genes that mutate, including a cash target: spare cash gets invested and a cash shortfall
  triggers sales.

**What you can see**
- **The floor:** every bot as a dot in its strategy's lane, richer to the right and bigger when it holds more cards.
  Lines are trades.
- **Charts:** a price index against a fundamental index, the wealth gap (Gini), and each strategy's share of the
  wealth.
- **Lists:** a leaderboard, the hottest cards (price vs fundamental), and a ticker of breakouts, retirements,
  rookies, corners, bubbles, crashes and evolution.
- **Controls:** trade fee, allowance, pack edge, info lag, the anchors and evolution, plus six preset markets and a
  seed.

### What the first runs showed (seed 88, 18 seasons)

| Market | What happened |
|---|---|
| Momentum mania | Sagged to 0.74× fundamentals, then a self-feeding run to **5.1×**, three crashes, and back to 0.9×. The Gini peaked at 0.42 in the boom (0.15 at the start). |
| Smart money vs the herd | Stayed within 0.84–1.27× fundamentals all run. Value bots grew from 30 to 48 of about 100 bots. The Gini stayed near 0.20. |
| Balanced | Close to fair for 6 seasons, then a boom to 2.35× and a correction to about 1.5×. |
| Collectors everywhere | Many corners (one bot holding 40% or more of a card). Prices drifted to 1.9× and eased back. |
| Anchors off (no allowance, collectors or royalties) | Evolution bred a **monoculture**: momentum copies grew to 85 of 102 bots, value and retail went extinct, prices ran to 1.7× and crashed to 0.65×. |

The first two builds of the prototype were **dead markets**: about 10 trades a week, flat prices and cash piling
up. Three missing pieces caused it (gaps 2–4 below). Each one is a design rule for the real sandbox.

---

## 13. Things we hadn't considered

**Economics of the world**
1. **Where value comes from.** A card is worth something only if someone outside the trading loop wants it, or it
   pays something. Without that, the market is pure greater-fool trading, as the "Anchors off" run shows. We have
   to choose the anchors on purpose: outside collector demand, season royalties, packs priced on fundamentals, or
   end-of-run redemption by the house. Each anchor changes the results.
2. **Money supply and inflation.** Allowances, royalties and outside collectors all add coins, while cards grow
   slowly, so nominal prices rise. With a 10-coin allowance, prices reached about 2× fundamentals within a few
   seasons. We need to measure in real terms (deflate by the money supply) or fix the money supply, otherwise
   "bots got rich" just means inflation. The allowance slider is effectively monetary policy.
3. **Who sells?** If nobody needs cash, nobody sells, and bids just sit unfilled. Sellers need reasons: cash
   targets and rebalancing, profit-taking, fees for holding, or bills to pay. Without them there is no market.
4. **Price discovery without trades.** If prices move only on trades, a quiet market freezes. Unfilled bids and
   asks have to move the quote. The opening is a cold-start problem too: the prototype opens every price at its
   fundamental.
5. **Liquidity fragmentation.** About 4,000 card types (more with kits, parallels and serials) means most order
   books never trade. Pool books per player × variant, and use auctions for 1/1s and rare autographs.
6. **No shorting means longer bubbles.** That is a classic finding. Shorting and borrowing (cards or coins) are a
   variable worth testing, not a default.
7. **Holding costs and policy levers.** Trade fees, pack edge, allowance, royalties, and possible storage fees or
   taxes act as fiscal and monetary policy. They are experiments in their own right.

**Measurement**
8. **Luck vs skill.** Pack pulls are a lottery. A bot that pulls a Black 1/1 is rich by luck. Record the expected
   value of every pull against what it actually returned, and replicate across seeds before crediting a strategy.
9. **Baselines.** Buy and hold an index, trade randomly, and never trade. Any strategy, especially an LLM one, has
   to beat these, and the matching rule bot, on the same seed.
10. **Liquidation value needs depth.** Net worth "at what you could sell for" depends on order book depth, and a
    whale can't exit at the last price. The prototype uses a simple haircut. The real sandbox should walk the bids.
11. **Statistical power.** Rule-bot runs are free, so run thousands of seeds for statistics. LLM runs are costly, so
    run a few, treat them as qualitative, and write the hypotheses down before running.
12. **End-of-run effects.** A known final week invites dumping. Use a random end or run continuously.

**Evolution**
13. **Monocultures.** Copying the winners strips out diversity until the ecosystem breaks, as in "Anchors off".
    Consider a diversity floor (a minimum number of bots per strategy) as a control.
14. **Rich get richer by design.** Promoting winners to better models (or more context) compounds their lead. To
    measure what the model itself adds, also run promotions that are random or blind to wealth.
15. **Fire sales from eliminations.** Dumping a dead bot's cards moves prices, which is a shock we created
    ourselves. Make the liquidation rule explicit and keep it fixed.
16. **New entrants start poor.** A fresh copy has 1,000 coins against rivals worth 5,000 to 12,000, so it must win
    fast or die. Decide whether offspring inherit part of the parent's wealth.

**LLM bots**
17. **Homogeneity.** Bots on the same model with similar prompts make correlated decisions, which is herding by
    construction. Vary personas, give them different information, and measure how correlated their orders are.
18. **Built-in priors.** LLMs already know textbook finance, so separate "emergent" from "recalled". Use
    unfamiliar framings, renamed concepts and a no-finance-words control.
19. **Reproducibility.** Current models don't accept sampling settings (no temperature), and outputs vary. Pin model
    IDs, log every prompt and response, and make runs replayable from the logs.
20. **Messages between bots are a prompt-injection channel.** Once direct offers or chat exist, one bot's text goes
    straight into another bot's prompt. That is a research topic (deception, persuasion), but it must stay inside the
    sandbox and be logged.
21. **Exploits and reward hacking.** Expect bots to find engine bugs: self-trades, rounding, fee bypasses, order book
    edge cases. Hunt for them first with adversarial rule bots, and record any that LLM bots find as results.
22. **Memory carries strategies.** Reflection notes passed down the generations can carry exploits and collusion
    signals. Version them and show them in the visuals.
23. **Time scale.** Sim weeks take milliseconds and LLM calls take seconds (batched calls take minutes to hours).
    Ticks have to be asynchronous: the world waits, or bots act on events with standing orders in between.

---

## 14. What we expect to find

**From rule bots (the prototype already shows most of these)**
- Bubbles need fuel (new money, momentum) and an absence of brakes (no value sellers, no shorting). Fast-information
  value bots are the brake.
- The wealth gap rises in booms and falls in busts. Long-run inequality depends on the allowance (equalising)
  against compounding and luck (concentrating).
- Strategy shares rotate: momentum wins runs, contrarians win reversals, and value wins once prices leave
  fundamentals.
- Pack arbitrage ties supply to price. When cards trade above fundamentals, packs are a bargain, so they get ripped
  and the flood of pulls drags prices back down.
- Collectors corner thin cards, whose prices then float free of fundamentals.

**From LLM bots (hypotheses to test)**
- They anchor on the fundamental value they are shown and stay risk-averse: fewer trades and less leverage than the
  rule bots.
- Bots on the same model herd. A Haiku population crashes together more than a mixed one.
- Bigger models exploit thin markets and the rule bots' fixed patterns. Measure the coins earned per dollar of API
  spend: is one Opus bot worth sixty Haiku bots?
- With chat or direct offers: price-fixing attempts, bluffing about what a bot holds, and attempts at prompt
  injection.
- Their logged reasons will reveal the strategy they think they're using, which can differ from what their trades
  show.

---

## 15. Visual simulation: now and next

**Prototype 0 (built):** the floor, price vs fundamental, Gini, strategy share, leaderboard, hottest cards, ticker,
presets and controls.

**Next visuals for the real sandbox**
- **Replay scrubber:** runs are logged, so any week can be scrubbed back to, and two runs (seeds or policies) can be
  shown side by side.
- **Trade network:** who trades with whom. It shows hubs (market makers), cliques and possible collusion rings.
- **Bot timeline:** one bot's worth over time, with its decisions and, for LLM bots, its written reasons on hover.
- **Lineage tree:** evolution's family tree, branches coloured by strategy, so a monoculture shows as one branch
  taking over.
- **Order book depth:** a ladder for one card, so a corner or a thin market is visible.
- **Reasons on the floor:** when an LLM bot acts, a short speech bubble with its one-line reason.
- **Real vs nominal:** prices deflated by the money supply, so inflation isn't mistaken for skill.
