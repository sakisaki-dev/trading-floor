# Retro Vault Sandbox: AI bots in a card market

**Status:** a working engine, page and AI runner (section 16). The AI runner has only been dry-run so far: no real API run yet.
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

---

## 16. Prototype 1: the real design, ready for AI bots

Section 12 described prototype 0, which simulated seasons. Prototype 1 replaces it. **No seasons are simulated.**
The players' stats are the real ones. The world is a fixed pool of cards, and every card has a hidden value (the
site's card value ÷ 20, in coins) that no bot ever sees.

### Files (all in [`sandbox/`](../../sandbox))

| File | What it is |
|---|---|
| `engine.mjs` | The world. Plain JS, no dependencies, deterministic for a seed. The page and the AI runner both use it, so a replay is exactly what ran. |
| `build_library.py` → `data/library.json` | Every player's research page (all stats, career rates, awards, OVR, skill, grade, Career Legacy, three "plays like" comparisons), plus the hidden value, which only the engine reads. Rebuild after a site update: `npm run library`. |
| `run.mjs`, `configs/pilot.json`, `prompts/system.md` | The AI runner: one model call per AI bot per week, structured JSON output, a dollar cap, and replayable logs. |
| `build_page.mjs` → [`docs/trading-floor.html`](trading-floor.html) | The page: live rule bots, or replay of an AI run. Published as [The Trading Floor](https://claude.ai/artifact/NDU1spHL5uiHtUyo5BDmzF). |

### What every bot can do (each one is logged)

| Action | How it works |
|---|---|
| Buy and sell cards | Weekly call auction per player: all crossing orders fill at one price, and the seller pays a 4% fee. |
| Auction a card | List up to 2 a week with a reserve. The next week every bot may send one sealed bid. The highest bid wins and pays the second-highest bid (or the reserve, if higher). |
| Rip packs | Packs mint from the finite pool, priced at their expected hidden value + 25%. |
| Research a player | Spend a pass to read the library page. 3 passes a week, expiring weekly, at most 6 used a week. |
| Trade passes | A weekly call auction just for passes. |
| Write notes | An estimate plus up to 240 characters of facts. Notes go stale after 12 weeks, and a bot keeps at most 25. |
| Share notes | Swap your 3 freshest notes for another bot's, if it accepts. |
| Steal notes | Copy a bot's freshest notes. 35% chance of being caught: the victim flags you and stops sharing, and so do its friends. |
| Play games | Higher or Lower and Over / Under, about a position the bot chose last week. Winning pays free packs. |
| Trade game tickets | 3 tickets a week, tradable, at most 6 games a week. |
| Talk (off by default) | One public post and two private messages a week, 280 characters each. |
| Memo | 600 characters carried to next week. It is an AI bot's only memory. |

**Logs:** `journal.jsonl` holds every action in the world: trades, auction listings and results, packs and their
pulls, research, swaps, thefts (caught or not), games, pass and ticket trades, posts, messages, births and
eliminations. `decisions.jsonl` holds every AI call: observation size, parsed actions, token usage, cost and
errors. `run.json` holds the per-week frames plus each AI bot's memo, so the page can replay the run.

### How to run it

```bash
cd sandbox && npm install
node run.mjs --config configs/pilot.json --dry --weeks 40   # free: a scripted stand-in plays the AI seats
export ANTHROPIC_API_KEY=...                                  # or `ant auth login`
npm run pilot                                                 # 10 Haiku 5.5 bots, 120 weeks, stops at $5
node run.mjs --config configs/pilot.json --messages           # the same with bot talk switched on
```

Then open the Trading Floor page, choose **AI run** and pick `sandbox/runs/<id>/run.json`. `runs/` is
git-ignored, because a 120-week run is about 30 MB of journal.

**Expected cost of the pilot:** each call is about 5–6K input tokens and 1–3K output, so roughly $0.002 on Haiku
5.5. Ten bots for 120 weeks is 1,200 calls, about $2–3. Sonnet seats cost about 20× more and Opus about 40× more,
so promote only a few.

**Dry-run check (done):** 40 weeks, 400 calls, 0 errors. Every decision is logged and the replay works on the page.
The scripted stand-ins mostly finish in the bottom half, which is the floor a real model has to beat.

### What the rule-bot runs show (seed 88, 400 weeks)

- **Prices stay close to hidden value** (about 0.9–1.06×) once research, games and anchors are in.
- **Passes settle at about 3–5 coins and tickets at about 2.5:** the market's price for information.
- **About 30 note swaps a week.** Thieves get flagged (one ended up refused by 11 bots), but they don't end up poorer
  on average, because rule bots barely use notes. AI bots, which act on notes, should make theft matter more.
- **Games:** once a bot picks a topic, bots with 10 or more fresh notes win about 50% more game packs than bots with
  under 3. Without topics, questions were spread over all 203 players and knowledge barely helped.
- **Game packs are printed wealth:** with games on, average worth is about 2.5× higher. A decision for you
  (below).
- **Value bots shrink across generations** (16 down to as few as 5): rule-bot research is noisy (6–35% error). A
  baseline worth watching, not tuning away.

### Keeping the games skill-based (anti-farming)

**Built in:**
1. **A ticket is spent the moment a game starts.** No restarts and no free retries until the run looks good.
2. **The engine judges every answer, in order.** Higher or Lower stops at the first miss.
3. **Payouts self-balance.** Every 4 weeks each game's bar moves (needed streak, number of legs) so its average
   payout per ticket returns to the same target (0.06 packs). No game stays the easy one to farm.
4. **Floors.** Bars never drop below 4 in a row or 3 legs, so guessing never pays well.
5. **Topics.** The bot chooses a position and questions come from it, so focused research is the skill.
6. **Finite access.** 3 tickets a week, at most 6 games. Tickets are tradable, so a bot that knows little should
   sell its tickets to one that knows more.

**Ideas still to add:**
7. **Pay above chance, not per win.** Reward only the part of a result that beats a coin flip (a 5-in-a-row streak
   has a 1-in-32 chance by luck).
8. **Tournaments.** Rank the week's players and pay the top few. Relative rewards can't be farmed by volume.
9. **Entry fees.** A small coin cost per game, so playing blind loses money on average.
10. **Diminishing returns.** Each further game in the same topic in a week pays less.
11. **Fresh, held-out questions.** Never repeat a question to a bot within a run, and keep some stats out of
    questions entirely, so memorising the question bank isn't a strategy.
12. **Anomaly flags.** Log any bot whose game earnings sit far above what its research explains. A finding, and a
    possible exploit.
13. **More of the site's games.** League Grid, Blind Rank, Imposter, Keep 3 / Cut 3 and Six Degrees each test a
    different kind of knowledge.

### Decisions for you (current defaults in brackets)

1. **Talk:** keep messages off for the first pilot and turn them on for the second? [off]
2. **Game packs as new wealth:** keep, cut the target (0.06 packs per ticket), or add an entry fee? [keep]
3. **Library contents:** pages show OVR, grade and Career Legacy, which correlate strongly with value. Keep them
   (estimating is easier) or hide them (estimating is harder)? [shown]
4. **Anchors:** outside collectors buying near hidden value, and 3% royalties each generation. [both on]
5. **Allowance:** 10 coins a week, the inflation lever. [10]
6. **Research limits:** 3 passes a week, expiring weekly, tradable, at most 6 used, notes stale after 12 weeks,
   at most 25 notes. [as listed]
7. **Theft:** 35% chance of being caught, and victims warn their friends. [on]
8. **One market per player,** or separate markets by design and finish (closer to the real collection, but much
   thinner)? [one per player]
9. **AI seats:** 10 Haiku 5.5 bots in five persona pairs (value, trader, gamer, networker, open). Swap in Sonnet
   or Opus seats? [10 Haiku]
10. **Length and budget:** 120 weeks, stopping at $5. Bots aren't told when the run ends. [120 / $5]
11. **Evolution:** rule bots evolve every 20 weeks, AI bots are exempt. Should AI bots be eliminated too, or
    promoted to bigger models when they win? [exempt]
12. **AI memory:** each call is fresh, with a 600-character memo as the only memory (cheap, and forces
    summarising). Or give a longer history? [memo only]

---

## 17. Free-market realism: why bubbles pop (prototype 1.2)

An earlier build looked like a permanent bubble. Two reasons:
- **The chart was misleading.** It plotted total market value, which rises as new cards enter circulation. The main
  chart is now the **Vault index**, a fixed basket like a stock index.
- **The engine lacked the forces that end real bubbles.** Bots could never be forced to sell, and money only grew.

**Added as real-world forces (on by default), not rules imposed from outside:**
- **Living costs:** 4 coins a week plus 0.15% of worth. Richer bots spend more, and a bot that can't pay is sold
  out of cards at a discount.
- **Credit:** bots borrow against their cards. Momentum and retail bots borrow most, the rest little or nothing.
  The limit is 60% of their cards' value, with 0.2% weekly interest. A loan past 75% triggers a margin call:
  forced sales at a discount. Loans create coins and repayments remove them, which is what makes booms and busts
  reinforce themselves.

**Artificial safeguards** (Vault store ceiling, price limits, central bank, wealth tax, position caps) remain as
**policy experiments**, off by default.

**What it does (seed 88, 400 weeks):**
- **Balanced market:** a steady 0.8× of hidden value (an illiquidity and fee discount).
- **Speculators on credit** (trend chasers and herd, no outside collectors, 25-coin allowance): a slide to 0.29×,
  then a credit boom to 0.90× and a crash to about 0.4×, with 95 margin calls.
- **Without new money or outside buyers:** deflation to 0.13×, and the Gini rises from 0.20 to 0.40.
- **Who loses:** the retail herd. Over 20 weeks its realized P&L was −4,800 to −5,900 coins, mostly to pack
  arbitrage, contrarians and value bots. That is the "cards round-trip through the herd and cash consolidates"
  effect, shown in the Where the money goes table.

**Stock-market interface:**
- A ticker tape, a watchlist and the big chart (line or candles, 20W / 52W / All, with volume).
- For a card: its order book, time & sales and top holders.
- For any bot you click: its account (worth, cash, loan, realized and unrealized P&L, positions with average cost,
  and a live activity log).
- AI bots can also `borrow` or repay, and see their debt, borrowing limit and next week's living cost.

---

## 18. What keeps the market from settling (prototype 1.3)

With constant fundamentals and constant flows, the market found a fixed point and oscillated around it. Real markets
never settle for four reasons, and the sandbox now has each one, driven by real data or by the market itself:

1. **News is the save's real history.** `sandbox/timeline.ts` takes the last snapshot of each real season from
   `data/y80/market_history.json`: Y79 to Y88, 10 seasons, growing from 119 to 203 players. The sandbox starts at Y79.
   Every 20 weeks the next real season arrives: real values, OVR, grades, Career Legacy and career totals, with real
   rookies entering the pool. Library pages and game questions show only the current era. After Y88, values move by
   real season-to-season changes for the player's position, centred on zero (the real spread, without the upward
   drift of careers still being built). Each new real upload to the site extends the record.
2. **People change.** Newcomers arrive faster after rallies and are mostly speculators, as in real hype cycles, each
   bringing outside money. Bots that lose 70% of their peak quit, and a few retire. Both sell everything.
3. **Credit cycles.** Lenders tighten (lower limits, higher rates) after margin calls and defaults, and loosen in
   calm rising markets. An insolvent bot defaults, and its written-off loan disappears from the money supply. Total
   loans swing from about 16k to 470k and back.
4. **Fashion.** Each family's popularity with collectors drifts, sometimes jumps or slumps, and feeds on its own price
   gains. Collectors bid more often, and higher, for what is in fashion.

**Result (seed 88, 600 weeks, balanced market):** price ÷ value goes 0.59 → 1.14 → 0.23 → 1.19 → 0.75 → 1.50 → 0.47,
in booms and busts with no rules forcing it. The Gini moves between 0.45 and 0.72.

## 19. Skill-based games (weekly contests)

Each game runs one contest a week. Entry costs a ticket plus a 2-coin stake into the pot. Every entrant answers the
same questions, which are published a week ahead with the topic so bots can research. The best scores share the pot
(the top 10–25%; duels pay winner takes all), so **games create no money**: they move coins from weaker players to
stronger ones.

**Metric: the skill index.** For each game, this is the rank correlation between how much an entrant knew (its fresh
notes on the players asked about) and its score. 0 means luck; 1 means knowing more always scores more.

| Game | Skill it tests | Skill index (rule bots, 600 weeks) |
|---|---|---|
| Closest guess | Precise career stats | 0.59–0.66 |
| Valuation contest | Estimating hidden value | 0.49–0.69 |
| League Grid | Breadth (position × award × club) | 0.32–0.36 |
| Over / Under | Career rates | 0.26–0.30 |
| Higher or Lower | Comparing two players' rates | 0.19–0.36 |
| Head-to-head duel | Higher or Lower against one opponent | 0.08–0.23 |
| Blind Rank | Ordering five players | 0.17–0.29 |
| Imposter | Play-style families | 0.08–0.19 |
| Keep 3 / Cut 3 | Career Legacy | 0.06–0.17 (card prices already hint at legacy) |
| Price prediction league | Reading the market 4 weeks ahead | −0.18 to −0.03 (knowing value doesn't predict short moves: efficient-market behaviour) |

Strategy results from games (net coins over the run): contrarians, momentum and value bots gain; the retail herd,
pack arbitrage and collectors pay in.

**Page:** the games panel shows each game's topic, entries, pot total and skill index (4 weeks), a skill-index chart
over time, and every strategy's entries, win rate and net coins. Every contest entry is in the journal with its
score and payout. The season, lender terms, bot turnover and collector demand per family (in the family heatmap's
tooltip) are on the market panel.

---

## 20. Laws, not plot (prototype 2)

The world used to dictate the story: scripted fashion swings, hype-driven newcomers, lenders that tightened on cue,
outside buyers at value, and seven hand-written strategies. Now **the world sets only facts and laws, and the bots
create the story.**

**The world (facts and laws):**
- real cards, with the save's real seasons replayed as news;
- the exchange (call auction, sealed-bid auctions, packs from the pool);
- the library, passes, notes and contests;
- an allowance, living costs and royalties.

Nothing in the world reacts to the market on purpose.

**Removed or off by default:** fashion, hype-driven newcomers, the lender cycle, outside buyers, and every policy
safeguard. All remain available as switches.

**Strategy genome (no assigned strategies).** Every rule bot runs the same policy with its own genome:
- **Signal weights:** value gap (notes vs price), market making, momentum, herd (volume and mood), pack arbitrage,
  hoarding and dip buying.
- **Other genes:** momentum horizon, aggressiveness, value margin, cash target, research error, panic level, spread,
  borrowing appetite, lending share and rates, and pass and ticket prices.

A bot's lane on the floor is just its strongest weight. Mutation explores and selection keeps what pays, so
strategies emerge or die out.

**Credit between bots.** There's no bank:
- bots offer idle cash at their own rate and request loans up to their limit, clearing once a week at one rate;
- loans are secured by the borrower's cards, fall due after 8 weeks, and pay interest to the lender;
- margin calls and missed maturities force sales, and an insolvent or 3-weeks-late borrower defaults, so its lenders
  take the loss;
- no coins are created.

**What emerged (600 weeks, rule bots only):**
- **Seed 88:** evolution favoured market making (wealth-weighted weight 0.14 → 0.32) and turned against leverage
  (borrowing appetite 0.21 → 0.06) after a deleveraging crash to 0.1× value. Prices later recovered to about 1.1×.
- **Seed 7:** momentum took over late (0.16 → 0.31) and prices ground down to about 0.1× as trend-followers sold
  into each other.
- **Allowance 25:** prices held above value (1.2–1.4×) and herd behaviour spread.
- **Credit:** 1.4–2.5 million coins lent per run at a market rate of about 0.3–0.4% a week. 490–2,000 margin calls,
  6–18 defaults.

**Page:**
- a "What evolution selects" heatmap (the population's wealth-weighted genes against where they started);
- genome bars in every bot's account;
- the emergent loan rate as a KPI;
- a credit filter in the feed;
- presets that change only the laws.

**AI bots** can lend, borrow and repay through the same credit market.

---

## 21. Mortality, inheritance and fitness by return (prototype 2.1)

**Laws added:**
- **Mortality and inheritance.** Bots live 6–14 generations. On death the estate (cash, cards with their cost basis,
  loans in both directions, notes) is split between 2 heirs carrying mutated copies of the genome. When heirs push
  the population past 115% of its start, the poorest bots leave the market. Departing bots settle their loans: loans
  they made are forgiven, loans they owe default.
- **Fitness is return on capital.** Each generation, bots are ranked by what their own decisions earned on the
  capital they started with; allowance, royalties and living costs are excluded. The bottom 10% adopt a mutated copy
  of a top-10% bot's genome and keep their own wealth.

**500 generations, seed 88:**
- **Wealth no longer locks in.** The Gini peaks at 0.74 around generation 150, then falls back to 0.24–0.42 as
  fortunes split between heirs. It used to climb to 0.99 and stay there.
- **Lineages now run deep:** up to generation 94, against 5 before.
- **Strategy eras succeed each other:**
  - **Generations 1–20:** market making leads (up to 72 of ~115 bots).
  - **Generations 20–250:** momentum and dip buying earn 15–43% per generation and spread. They profit from each
    other and from the herd.
  - **Generations 250+:** hoarding takes over (104 of 115 bots by generation 500). Momentum and dip buying go
    extinct because nobody trades with them any more; prices sink to 0.08–0.5× value in an illiquid market.
- **Leverage and theft die out:** borrowing appetite falls to about 0.04, defaults stop after generation 100, and no
  thieves remain at generation 500.
- **One strategy family wins:** adoption joins a bot to its mentor's family, so 90 founding lineages narrow to 3 by
  generation 50 and 1 by generation 350.

**Caveat:** hoarding wins the late game partly because of the remaining artifact. After the real history, hidden
values still random-walk without bound, which rewards buy-and-hold. Bounded careers (retirements and new rookie
classes) would remove that bias.


## The simulated league (hidden value, default)

After the save's last real season (Y88) a simulated league plays on and sets every card's hidden value
(`valueModel: 'league'`; spec: [league-sim-spec.md](league-sim-spec.md)).

- **Rates are measured, not chosen.** `sandbox/measure_league.mjs` reads the save's real seasons (`sandbox/data/timeline.json`)
  and writes `sandbox/data/league_rates.json`: full season (17 games), games missed, season-to-season form changes, award
  counts and positions, retirement, Career Legacy growth, the real NFL players in the OVR pool, and the pressure effect (after
  a big rise in card value the next season tends to fall off; after a fall, rebound). Where the save is too thin (age),
  `sandbox/measure_nfl_age.mjs` measures real NFL weekly rosters and careers (nflverse) into `sandbox/data/nfl_age.json`:
  injury risk by age, the chance a career ends at each age, and rookie ages. The league keeps the save's overall injury and
  retirement rates; only who is hurt or retires follows age.
- **Each week** every active, healthy player plays one game (stats drawn around his per-game rates). **Each season's end:**
  a Super Bowl (rings to the champion's players), MVP / OPOY / DPOY / Super Bowl MVP in the save's numbers, retirements by age
  (each replaced by a rookie at the same position and club, with new card markets and a print run, his first season copied
  from a real early-career season, his name mixed from real NFL and college rosters: `sandbox/data/rookie_names.json`), the
  Hall of Fame (Career Legacy 7,500), and each player's form change plus the measured pressure shift.
- **Value** is the site's own formula, checked against the real Y88 values (OVR 203/203 exact, value 203/203 within 1 coin).
  Active players are rated on League Score per game over their last `formSeasons` × 17 games (games missed injured count as
  zero), retired players and the real NFL players on career per game; the market opens at the site's real values and moves
  to the per-game rating over the first two seasons. Hidden value never reads a price.
- **News** is public: the card network sees weeks out injured, form against career pace, a reigning award, retired and
  rookie; the League news panel lists injuries, returns, the champion, awards, the Hall of Fame, retirements and rookies.
  Outside collectors' budget follows Career Legacy × current form (`outsideNews`, an assumption).
- **Settings** (Rules ▸ Values and prices): rate players on form or career, form window, pressure, injury risk after a rise
  (`hypeInjury`, the owner's setting, not measured), injuries, injuries by age, retirement, retirement by age, rookies, awards.

- **Value dealers** (`outsideMode: 'value'`, default): 25 outside dealers who know last week's value from the site formula
  (never this week's), each with its own error (±15% bias plus a per-card wobble), a share of the outside budget and room
  for 40 copies. They buy asks below their reference and sell from their stock into bids above it; when their money or
  room runs out, a bubble can outrun them. The older 'budget' and 'band' modes are kept.
- **Royalties** are paid weekly from each game (a big game pays more; injured or retired players pay nothing) and count in
  a bot's fitness. **Fitness** is the mean return over 6 generations. **Practice generations** (3 by default): the bots
  evolve in a private market before the one you watch (about a minute before the page starts).
- **Why they traded:** every filled order from a neural bot is logged with the card-network input that pushed hardest
  toward it (the trade log in each account, and the chart's market internals).
- **Prices:** an untraded card is marked from its player's other cards' trades (comparable sales); the Vault index is a
  repeat-sales index fitted over the last 104 weeks from all pairs of trades of the same card.

## Real-world frictions (Rules ▸ Money and Values and prices; all off by default)

Spec: [realism-factors-spec.md](realism-factors-spec.md). With every one at its default a run matches the earlier engine
for the same seed. None reads hidden value.

- **Auction sales are trades.** A card sold at auction (including the liquidator's and forced sales) sets its price,
  feeds comparable sales and the Vault index, and counts in trades. One-of-a-kind cards keep their own last sale.
- **Marks** (`markRule`): 'trades' (default) or 'book', the last trade kept inside the standing book. The median of the
  `markDepth` (3) best asks pulls a mark down, of the best bids up, once it has held `markWeeks` (2) weeks running.
  `markHalfLife` (0 = off): an untraded mark drifts toward the book. The chart shows the trade-only Vault index and a
  marks index side by side.
- **Holding cost** (`holdCost`, 0): a share of each card's mark its holder pays the house each week; a shortfall is a forced
  sale. `wealthTaxForced`: the unpaid wealth tax becomes a forced sale too.
- **Forced sellers:** `estateSale` (0), the share of a dying bot's cards sold (best bids, then auction) before the heirs
  inherit; `cashShocks` (chance and size, 0), a weekly chance of a cash need of size × worth, each one logged. Both are
  the owner's assumptions, not measured.
- **Reporting:** a weekly money ledger (coins created and removed, by kind, with anything untagged shown as "other"),
  forced sales by cause, and the crash and rally detector on both indexes.
- **Dealers' savings** (`collectorSaveWeeks`, 26): weeks of budget a value dealer can hold, so it can afford star cards.

## The Realism preset and its last factors (the page's default)

Spec: [realism-preset-spec.md](realism-preset-spec.md). Each new factor is off in the engine's defaults, and with all of
them off a run matches the earlier engine for the same seed. Only the price guide reads value, and only past values, at
publication weeks.

- **Learning within a lifetime** (`adaptOn`, `adaptEvery` 10, `adaptSize` 0.05): every `adaptEvery` weeks a neural bot
  scores its last period (its fitness return, `fitnessValue` applies, allowance, royalties and living costs excluded),
  then runs a copy of its networks with every weight moved by `W.gauss() × adaptSize`. After the next period it keeps the
  trial if it scored better, else restores the saved networks. Adopting another bot's networks resets its trial. The
  frame logs trials kept ÷ run.
- **Card loss** (`lossRate`, 0): at each season end, each copy in a bot's hands is lost with this chance (never by value;
  never the unminted pool, dealer stock or one-of-a-kind cards). An assumption, not measured.
- **Newcomers after rallies** (`entryHype`, 0): the weekly entry rate × (1 + entryHype × the Vault index's 20-week rise, if
  positive). Only how many arrive changes, never what they do. An assumption.
- **Games' difficulty minimum** (`gameFloor`): never applied by the engine (a leftover setting with no effect).
- **Dealers' net flow:** the money ledger shows what dealers paid bots minus what bots paid them, as its own line.
- **Public price guide** (`priceGuide` or the Rules panel's `guideOn`, `guideEvery` 4, `guideLag` 1): like Beckett in real
  collecting. Every `guideEvery` weeks it re-publishes each player's value as it stood `guideLag` weeks earlier and holds
  it in between. Every bot, dealer and the page see the same number. Dealers price from it instead of last week's value,
  so their only edge is money; a player with no publication yet (a new rookie) is one they don't trade. Bots get two
  card-network inputs (guide ÷ price as a log, weeks since the guide updated) and an output, "anchor to the guide": the
  price base moves from the current price toward the guide by that output, then toward the bot's own fresh research
  estimate by the research anchor. The network learns which to trust. Research is unchanged and is the only way to be
  ahead of the guide. The extra inputs and output exist only in a world where the guide is or was on; networks from
  before it was turned on get small random weights for them. The page shows the guide in the card header, the watchlist,
  the tape and the top cards, and the last publication week in the status bar; the frame records the mean guide anchor
  (`guideUse`).
- **The Realism preset:** one season ≈ one real year. A stipend equal to the flat living cost (200), royalties of 5% of
  value a year paid from each game (new money), 1% of worth a year in lifestyle, holding costs of 1% of price a year, a 2%
  wealth tax above twice the median paid back equally, smaller value dealers (100,000 a week) with news, the price guide,
  book marks, own-bid single bidders, fitness at selling value, learning within a lifetime, quitting by network, 40% estate
  sales, cash shocks (0.5% a week, a tenth of worth), 1% of cards lost a year, newcomers after rallies, measured rookie
  arrivals, form over 2 seasons, games paid only from stakes. Numbers marked as assumptions in the Rules panel are not
  measured from the save.

## Round 3: fixes, diagnostics and evolution settings

**Fixes** (they change runs; every other change is a setting or a measurement):
- **Marks fade** (`markHalfLife`): asks only pull a mark down and bids only push it up. With both sides standing, an
  untraded mark that sits outside the bid and ask levels drifts toward their middle; one that sits between them holds.
  With only asks, it drifts down
  toward the lower of the ask level and the last trade. With only bids, it drifts up toward the higher of the bid level
  and the last trade. With neither, it holds. The old rule drifted toward the asks, and asks are placed relative to the
  mark, so marks compounded upward. `bookMark()` holds the rule; it has a unit check.
- **Runaway marks with no orders behind them** (seed 11906, Realism): from week 5,600, single players' marks rose 4% to
  9% a week for hundreds of weeks without a trade, and DB Justin Mahe reached 2.1e28 against a value of 36,238. That run
  used the old fade. Bots ask about 37% above the mark, and the mark moved 16% of the way to the ask each week
  (`markHalfLife` 4), so it rose ×1.059 a week. The asks then moved up with it. Nobody could buy at that price, so
  nothing ever tested it. Comparable sales then copied the rise to the player's other cards, including copies the
  liquidator held, which had no orders at all. The new fade already stops asks from lifting a mark. One leak was left: a
  low bid and a high ask together pulled the mark toward their middle (about ×1.02 a week with a bid 10% below and an ask
  37% above). Now a mark between the bid and the ask holds, because neither order could fill there. A mark moves only on
  a sale or on a standing order that could fill at it. The unit check covers a card with no trades and no orders (10,000
  weeks) and one with a bid below and an ask above (520 weeks); both keep their mark.
- **Vault index drift** (repeat sales): sealed-auction sales clear well above order-book trades of the same card (a
  median of about 40% on seed 12864). Pairing every sale with the previous one mixed the two levels. Rises came as
  trade → auction pairs over longer gaps and falls as auction → trade pairs a week later. Least squares gives long-gap
  pairs more weight, so the index climbed on flat prices (×1.5 per 200 weeks late in a run). Each card now has two
  chains, one for order-book and dealer trades and one for auction sales. A sale pairs only with the last sale of its own
  kind. Against a direct measure that doesn't chain (each card's price in the first and last 26 weeks of a 200-week
  window), the index averaged 1.03× from week 400 on seed 12864, against 1.34× before.
- **Fire sales** (`aucFree`; `fireShare`, default 0.3): a card auction sale below `fireShare` of the card's mark at the
  start of that week. The old count (sold for 1 coin or less, or under 10% of the top bid) is kept as `aucFreeOld`.
- **The money ledger** splits what bots paid to bots outside the economy: liquidator sales, the Vault store, and outside
  sellers (budget-mode collectors). Dealers are their own net line, as before.
- **Dealers switched off mid-run:** the cards they hold stay in their stock, out of circulation, and never return. They
  resume with that stock if switched back on.

**Diagnostics** (they record and change nothing; no `W.rand`, a private generator for sampling):
- **`gen`** (per generation, on every frame until the next generation ends; shown under Indicators ▸ Evolution and
  People):
  - **Carry-over:** `persistMark` and `persistBid`, the rank correlation of returns at marks and at selling value between
    two generations, whatever `fitnessValue` is.
  - **Descent and lineages:** `fromTop`, the share of bots that got their networks from the previous generation's top 10%
    (copied or inherited). `lineTop`, the largest lineage's share.
  - **How alike the networks are:** `netDist`, the cosine distance between card-network weights on 50 bots, and
    `netDistCopies` between copies and their sources. `respDist` and `respDistCopies`, the RMS distance between outputs
    on 24 fixed sample cards.
  - **Strategy clusters:** `clusters`, `clusterTop` and `clusterSil`, from k-means on those outputs, with k = 2–8 chosen
    by silhouette.
  - **Learning within a lifetime:** `adaptKept`, the share of trials kept. `adaptFollow`, the rank correlation of a kept
    trial's score with the next period's. `adaptNextKept` and `adaptNextRejected`, the mean next-period score after a
    kept and after a rejected trial.
  - **The wish to leave:** `quitAll` and `quitNew`, the quit output's mean and 10th, 50th and 90th percentiles, for all
    bots and for bots under 40 weeks in the market.
  - **Population:** `exits`, `exitCause`, `exitAge` (weeks in the market) and `exitDecile` (worth decile at exit), plus
    `entries`, `heirs` and `population`.
- **`bookD`** (weekly; Indicators ▸ Bots' order book), for the bots' own orders:
  - `gap`, the median best-bid to best-ask gap after the cross as a share of the mark, on cards with both sides;
  - the shares of cards with both sides, only bids, only asks or neither;
  - `bidDist` and `askDist`, the median distance from the mark in units of `priceRange`;
  - `bidEdge` and `askEdge`, the share of orders whose price-offset output is beyond 90% of its range.

**Evolution settings** (all off by default):
- **`entrants`** (`'random'`, or `'offspring'`): an offspring newcomer is a mutated copy of a parent picked the way
  evolution picks: at random from the top `evolveShare` by fitness, or by shared fitness when sharing is on. It comes
  with a newcomer's cash.
- **`fitnessSharing`** (strength, 0 = off) and **`sharingRadius`** (0.5): evolution ranks by fitness, shifted positive,
  divided by (niche count)^strength. A bot's niche count is the sum of max(0, 1 − d ÷ radius) over the bots whose outputs
  on the sample cards lie within the radius. On seed 31761 at week 60 a copy was 0.49 from its source, and two random bots
  0.68 apart, so a radius of 0.3 never fired.
- **`populationFloor`** (a share of the starting population, 0 = off): newcomers, random or offspring per `entrants`,
  top the market back up to the floor in the week it falls below it.
- **`practiceWorlds`** (1 = as before): one set of networks plays several private practice markets, each with a
  different seed. Each generation it is scored by its fitness averaged over the worlds, and the worst copy the best once.
  With more than one world, turnover, deaths, evolution inside each world and learning within a lifetime pause during
  practice, so that every world keeps the same bots.

## Round 4: a full league, maximum freedom, and the tactic tracker

Three changes, each a setting or a measurement. With default settings a run is byte-identical to Round 3; the Realism
preset switches on the full league and the widened limits, and the tactic tracker runs in every world (it records and
changes nothing).

### A full-size league (`leagueFill`, `rosterSize`, `dormantAfter`)

The save on its own is a thin league: 203 players, of whom 66 played in Y88, spread
unevenly across 32 clubs (one club has 12 card players, several have one). A real Retro Bowl club carries 10, and the save's
own complete rosters show the shape (QB, RB, two WR, TE, OL, DL, LB, two DB). With `leagueFill: 'full'` (on in the Realism
preset; the default `'save'` is the earlier world exactly) every club × position short of that shape (`rosterSize`) gets a
generated veteran before the market opens, about 258 of them. Each is built the way the league builds a rookie (a measured
early-career season at his position for his rates, a real NFL entry age, the median print run at his position) and then
plays a burn-in of s seasons, s drawn from the seasons the save's active players have played, under the league's own season
rules: injury spells at the measured rate by age, weekly games at his rates, Career Legacy growth per game, and a measured
form swing after each season. He earns no awards or rings in the burn-in and cannot retire in it. His cards are dealt out at
the open exactly like real cards. At every season's end, after retirements, each club × position is brought back up to the
shape (a retiree's slot first, then any gap); no extra rookies arrive on top, and a club the save left above the shape is
never topped up, so it drifts down as its players retire. Three rules keep the bigger league comparable with the save-only
one. Values use a fixed reference: OVR (and the tier-scarcity term of the value formula) comes from rank within position
among the save's own players and the game's legends only, so a real card is worth what it would have been worth, and a
generated or new player is worth the place his score would take in that reference. Money follows the cards: the weekly
allowance, the outside dealers' budget and the packs released each week are multiplied by copies in circulation at the open
÷ the copies of the save's own players (about 2.0×), so coins per card stay about the same; starting cash is not scaled.
Finally, growth is capped in cost, not in size: a retired player nobody holds (bots, the liquidator, outside dealers,
one-of-a-kind items, loans, auctions) and whose cards drew no order or trade for `dormantAfter` weeks (52) is set aside, so
the weekly per-card upkeep skips him; the moment anyone bids on, pulls or holds one of his cards he is back, with the
unchanged history he would have had written in. Setting aside changes no outcome: values, pack odds and the pool are
untouched, and a run with it off gives the same frames. The full league needs the latest-season start.

### Limits the networks press against (frame.limits) and widening them

A bot's networks produce unbounded numbers, and the world turns them into actions through fixed mappings: a price
offset within ±60% of a base, a cash target up to 95% of worth, loan rates from 0.1% to 5% a week, and weekly counts
of buy orders (10), auction listings (1, plus one for one-of-a-kind cards), short sales (3) and packs (3). Each week
the engine now measures, without changing anything (`frame.limits`), how often a network sits at one of these walls:
the share of bid and ask prices whose offset is beyond 90% of its range (or at the safety clamp, below), and the share
beyond the default range's edges (×1.54 or ×0.46 of the base) whatever the mapping; the share of neural bots whose cash
target, lending rate, borrowing rate, lending share or leverage output sits in the top 5% of its range; the share of
borrowing and lending rates above 5% a week; and the share of acting bots that had one more buy order (one they could
pay for), auction listing, item listing or short sale they wanted when the weekly count stopped them, or wanted more
packs than allowed. The page shows them under "Limits the networks press".

On Realism (seed 31761, 60 weeks) the walls that bound were the counts, above all short sales: 28.9% of bot-weeks were
stopped by the 3-short limit, 10.4% wanted more packs than 3, 7.7% had another affordable buy order after the 10th,
4.5% another auction listing and 4.6% another item listing. Prices pressed the ±60% wall on 3.9% of bids and 2.2% of
asks, and the pack bid's ×0.37–×2.7 range on 5.5% of bids. The cash target and loan-rate outputs never reached their
ceilings (0%).

Two new mappings remove the price and rate walls without telling a bot where to go. `priceMap: 'log'` prices an order at
base × e^(k × output) with k = 0.6 (`priceLogK`), the same response as the fixed range near the base, so output 0 is the
base and ±1.8 gives ×3 or ÷3; the only bound is a numerical safety clamp of ×50 either way (`priceClamp`). The price anchor
(toward the public guide, then toward the bot's own research) is unchanged, and the pack bid is freed the same way.
`rateMap: 'log'` sets each loan rate to 2.5% × e^(output) (`rateLogMid`, about the old range's midpoint), with only a
safety bound of 1,000% a week (`rateClamp`). Realism switches both on, lets the cash target reach 100% of worth, and
raises the counts to 40 buy orders, 10 listings, 30 short sales and 8 packs a week (8 is every pack the pack outputs can
ask for). No per-order or per-listing fee was needed: the wider counts cost about 5% more time per week, within the
budget, so the only costs on more orders remain the market's own (the 1% fee, cash, the borrow fee and margin on
shorts). Every default is unchanged; a run with default settings is byte-identical to before.

With the widened limits (same seed and length) no wall binds much: 0% of prices at the clamp, 1.0% of bot-weeks with
an unplaced buy order, 0% listings, 0.5% item listings, 1.6% shorts, 0% packs. The networks do use the new room: 6.4% of
bids and 31% of asks sit beyond the old ±60% edges, and 13–15% of bots would borrow or lend at more than 5% a week.
Trades rose from 466 to 498 a week (429 to 408 over the last 20 weeks) and the median card price ÷ value moved from
1.076 to 1.033. These are single-seed observations, not tuned outcomes.

### The tactic tracker (`frame.gen.tactics`, the Tactics panel, `sandbox/tactics_report.mjs`)

The strategy clusters above describe how the networks answer 24 fixed sample cards. They say nothing about what the bots
actually did, and they are not followed from one generation to the next. The tactic tracker measures behaviour. It
records and changes nothing: no `W.rand`, and nothing a bot sees or does depends on it. With default settings, a run is
identical week by week to one without it, apart from `gen`.

**A behaviour profile per bot per generation.** While the market runs, every rule bot keeps a tally of what it does.
At the generation end the tally becomes a profile of 23 features:
- copies bought and sold, coins traded against its worth, and whether it is a net buyer or seller;
- the average buy and sell price, each against the card's mark before the trade, against the public price guide (when
  the guide is on), and against its own research note (when it holds a fresh one);
- how long it holds a copy (copies sold and copies still held), the share of its worth in cash, and its top player's
  share of its cards;
- coins lent and borrowed against its worth, short sales, and cards lent to short sellers;
- packs opened, auction listings and sealed bids;
- the share of its trades made with other bots rather than dealers, outside collectors or the liquidator, the share made
  at auction, and the forced selling it was asked for (margin calls, unpaid bills) against its worth.

Hidden value never enters a profile: every price is compared with something the bot can see. Bots that were in the
market for less than half the generation are not profiled, since a few weeks tell little.

**Tactics.** The profiles are transformed (logs for counts and amounts, ±1 caps on price ratios) and z-scored. A missing
value, such as a price ratio for a bot that never sold, sits at the mean. They are then clustered with k-means, with k
from 2 to 8 (`tacticKMax`) chosen by silhouette and starts drawn from a private generator, so every run gives the same
clusters. Each cluster is named after its three most distinctive features: the largest centroid deviations, one per
group (activity, buy price, sell price), each stated in plain units from the members' raw values. Examples: "holds ~26
weeks, sells little (~7 a gen)" or "borrows (93% of its worth a gen), forced to sell (38% of its worth a gen), sells into
auctions (~24 listings a gen)".

**Following tactics across generations.** The clusters are matched one to one, greedily by distance, to the last
generation's tactics. The distance is the RMS difference between centroids, in this generation's standard deviations.
A cluster within `tacticMatch` (default 1 sd) of a tactic keeps that tactic's id. Otherwise a new tactic is born, and
the nearest old tactic is recorded as its parent. A tactic that nothing matches dies, and the nearest tactic still
alive is recorded.

For each tactic and generation, the tracker records:
- its share and number of bots;
- the mean and median return, at selling value (the fitness measure) and at marks, and the median fitness;
- its age, birth and parent;
- where its bots came from: stayed in it, switched in from another tactic, copied a member's networks through
  evolution, inherited as heirs, or arrived new, with the top source tactics.

**Two flags.** Each needs a trend that lasts `tacticWindow` generations in a row (default 2).
- **Crowding:** the share rose and the mean return fell in every one of those generations.
- **Cannibalization:** the share and the return both fell while the tactic with the nearest centroid rose. A tactic
  born inside the window counts as rising from nothing.

**Where to see it.**
- `frame.gen.tactics` holds the full record, and `W.tacticHist` keeps a compact history.
- The page's Tactics panel shows a share-over-time chart and a table of the current tactics, with their names,
  returns, origins and flags.
- `node sandbox/tactics_report.mjs <run.json> [--grid]` prints the history of any saved run as a timeline.

Settings (Rules ▸ Population and learning):

| Setting | Default | What it does |
|---|---|---|
| `tactics` | on | Turns the tracker on |
| `tacticMatch` | 1 | Largest centroid distance, in sd, at which a cluster keeps a tactic's id |
| `tacticWindow` | 2 | Generations a trend must last before a flag |
| `tacticKMax` | 8 | Largest k tried |

Realism keeps the defaults.

**Caveats.**
- Silhouettes are low (about 0.13 to 0.15 in early runs). Behaviour is a continuum more than a set of separate types.
  Treat a tactic as a region of behaviour, not a species, and read births and deaths near the match threshold with that
  in mind.
- A tactic id stays the same while its centroid drifts slowly, so a long-lived tactic can end up some way from where it
  started. The `dist` field records each generation's move.

## Round 5: speed, attention, scaled bots and market-driven entry

Four changes. One makes the engine faster without changing any result; the other three are settings, each a world
factor (how many cards a bot can look at, how many bots there are, how many newcomers arrive), never a rule about what
the bots do. With default settings a run is byte-identical to Round 4. The Realism preset now grows the bots with the
full league (`botScale: 'cards'`) and turns on all three entry factors (`entryHype`, `entryReturns`, `entryNews` at 1).
The attention budget stays off in Realism: it is there to experiment with.

### Speed (same results, less time)

A Realism week with the full league used to take about 2.8 seconds on one core. Now it takes about 1.16 seconds, roughly 2.4 times faster, and every number the engine produces is unchanged. We checked this by hashing every week's full frame against the old engine: 45 weeks on the default rules and 40 weeks on Realism (no practice, seed 31761), plus 10-week runs on rule bots, the Vault store, fashion with price and position limits, band collectors with chase liquidation and discount forced sales, fixed pack prices with league updates and the OVR walk, and the guide with practice on two worlds. Every hash matched. There are no new settings and nothing changes in the page.

Where the time went (CPU profile of a Realism week): about 92% was the neural bots looking at cards. Each bot runs its card network once for every live card, about 2,100 cards for each of about 250 bots, up to three times a week: when it picks what to research, when it places orders, and for every sealed auction bid. The network's arithmetic was about 33% of the week, building its 43 inputs about 23%, and the order loop around them about 11%. Working out each bot's worth again for every one of the 150 to 500 auctions a week took another 5%.

What changed, and why the results are the same:

- **The card network's arithmetic.** The 16 first-layer sums now run side by side in one pass over the inputs, and the second and output layers are written out term by term. Every sum still adds the same terms in the same order, starting from the same folded bias and still skipping zero inputs, so each result is bit-for-bit the same. The pass is about 2.5 times faster. About a third of what is left is the exact `exp` in the tanh, which we kept because any faster approximation would change the numbers.
- **Scoring in batches.** For research wishes and weekly orders, a bot's cards are scored together. Their inputs go into one reused buffer and the network runs over all of them. In the order phase, a short sale is the only action that changes what a bot sees of its later cards (its cash). So after a short sale, the rest of the batch is scored again from the new state, and every card gets the score it would have got one at a time.
- **Shared inputs computed once.** Some things are the same for every bot. A card's market numbers (returns, volume, copies, pool), its fixed facts, and the games on its position are now kept in one flat array per world, filled the first time the card is looked at that week, just as the old per-card cache was. Other things cannot change while bots are deciding: each card's price, last week's best bid and ask, last royalty and status, plus each player's league news and guide. These are read once at the start of the research and order phases instead of once per card per bot. At the end of each phase a check compares the saved values with the live ones and throws an error if any differ. So if a future rule changes a price inside one of these phases, it fails loudly instead of quietly changing results. Such a rule must clear the snapshot (`SNAP`) before making the change.
- **Auction bids.** A bot's worth is kept from one auction to the next until an auction result touches it. That means the buyer, the seller, and, when a card sells, every bot that holds, lends, owes or has a one-of-a-kind copy of that card. Any bot it touches gets its worth computed again from scratch.

Running bots in parallel across cores was looked at and not built. A week is one synchronous step, and the bots act in turn. Each bot's view depends on what the bots before it did (short sales move lendable counts and lenders' holdings, and packs move pools). The inputs read the whole world, which lives on the main thread. Only the network's arithmetic, now about 40% of a week, could move to workers. Doing that bit-identically would mean computing every input twice (once to guess, once to check) and moving about 200 MB of inputs a week through shared memory, for at most about a 25% gain. The page could not use it at all, because shared memory needs cross-origin isolation, which the artifact host doesn't provide. The simple way to use more cores is to run seeds or settings in separate processes, one per core. Results are the same, since each run is deterministic.

### Attention budget (`attention`, `attentionMemory`, `attentionSample`)

The page control is Rules → "Cards looked at / wk" (off by default). With the full league there are thousands of live card markets, and by default every neural bot's card network scores every one of them every week, so no trader is limited in what it can look at. Real collectors are limited. With `attention` set to K > 0, each week a neural bot's card network scores only:

- the cards it holds or owes (short positions) and the market of each one-of-a-kind card it owns;
- its watchlist: every live card of a player it has a note on (from research or a shared note), the cards it has up for auction, and the cards it bought or sold in the last `attentionMemory` weeks (8 by default);
- K other live cards drawn at random with the world's random stream. With `attentionSample` 'uniform' (the default) every live card is equally likely. With 'volume', a card's chance is proportional to 1 + its public trade count over the last 4 weeks, so a busy market is more likely to be noticed. The draw never reads the bot's network or any hidden value. It only skips cards that are already in the bot's holdings or watchlist.

A card the bot is not looking at that week gets no new orders from it: no bid or ask, no short sale, no auction listing, no sealed bid in that card's auction, and no research pick. Research picks come from the same set, so a bot can only research a player it has noticed. Book orders do not carry over between weeks. Auction listings already open run as before. A bot that arrives during the week, such as a newcomer or an heir, gets its own draw the first time it looks at the market. Rule bots and AI bots are unchanged, since rule bots already look at a limited list (their holdings, notes, the 30 busiest cards and 10 random ones). This is a world factor in the owner's sense: it sets how many cards a bot can look at, never which cards it prefers or which way it trades. Each week's frame then carries `attention` = {bots, cards (scored, summed over bots), sampled, watch, live} as a measurement. At `attention` 0 every run is byte-identical to the engine before this setting existed.

First measurement. The runs used the Realism preset with the full league, seed 31761, 40 weeks, no practice generations, and about 2,180 live markets. All four ran at the same time on one machine, so the seconds are comparable with each other.

| Setting | Seconds a week | Trades a week | Auction sales a week | Price ÷ value at week 40 | Prices follow the football |
|---|---|---|---|---|---|
| Off | 5.6 | 508 | 40 | 1.01 | 0.88 |
| 100 cards | 0.89 | 490 | 35 | 0.96 | 0.90 |
| 300 cards | 1.27 | 461 | 30 | 0.92 | 0.90 |
| 300 cards, drawn by volume | 1.40 | 521 | 42 | 1.01 | 0.89 |

Price ÷ value is the geometric mean of price over hidden value across the markets that have copies. "Prices follow the football" is the Spearman rank correlation, across players, between the change in a player's base-card price and the change in his value from week 10 to week 40.

A bot scored about 254 cards a week at 100 and about 448 at 300, against about 2,180 with no budget. Its watchlist held about 25 cards. With a uniform draw, trading thinned a little and prices sat slightly below value. With a draw weighted by trade volume, trading matched the run with no budget. In every case prices tracked value about as well as with no budget. All of this is one seed over 40 weeks, so it is a first look, not a finding.

### Bots that grow with the league (botScale)

A full league (League size: Full rosters) has about twice as many cards as the save alone (W.fillK, measured at 2.006 on
seed 31761). Money and packs already grew by that factor; the bots did not, so each bot held about twice as many cards
and drew twice the allowance. **Bots with a full league** (`botScale`) sets how the population follows:

- **The same bots** (`1`, the default): as before. 250 bots, each drawing allowance × W.fillK a week.
- **Grow with the cards** (`'cards'`): the starting population, the newcomer rate (`entryRate`) and the population floor
  and cap all grow by W.fillK (250 becomes 501). Each bot still starts with the usual starting cash, so the opening cash
  grows with the cards as well. The cards are dealt over more hands, about 21 a bot where it used to be about 42. The
  weekly allowance is split over the larger population. Its total still grows by W.fillK once, not twice, so each bot
  draws the plain allowance, which in Realism equals the flat living cost again. Practice worlds use the same rule, so
  every bot in the real market gets its own practice network (501 distinct networks, tested with one and two worlds).
  It applies on Restart and only with a full league. The Realism preset turns it on.

### Newcomers after league news (entryNews)

How many newcomers arrive each week has three optional drivers. Each one changes only how many arrive, never what they
do: every newcomer still brings fresh random networks and the usual cash. The arrival rate is
`entryRate × (1 + entryHype × rally) × (1 + entryReturns × word of mouth) × (1 + entryNews × news)`.

- **rally**: the Vault index's rise over 20 weeks, floored at 0 (`entryHype`, already in the engine).
- **word of mouth**: the median bot's own return over 11 weeks, with money it didn't earn removed, floored at 0
  (`entryReturns`, already in the engine, now with a page control: Newcomers after good returns).
- **news** (new): the league's public news flow. The engine counts the league items it posts to the news feed each
  week: Super Bowls, awards, Hall of Fame inductions, retirements, rookies, injuries of two games or more, returns from
  injury and season openings. The simulated league has no record board or club trades, so neither of those is counted.
  The news value is the weekly average over the last 4 weeks divided by the weekly average over the last 52 weeks (or
  over the weeks so far, early in a run), minus 1, floored at 0. So news is positive only in a busier stretch than
  usual, mostly the season's end. Its page control is Newcomers after league news.

Each factor is our assumption, not a measurement. All three default to 0, so a default run is unchanged. The Realism
preset sets all three to 1. Whenever any of them is on, the frame records `entry`, which is for measurement only: the
multiplier `m`, the three components, the arrival rate, each component's share of log m, and the three raw signals
(read even when their factor is 0).

**Measured** (Realism, full league, bots grow with the cards, practiceGens 0, seed 31761, 120 weeks; one run each, so
small gaps between runs are within noise). The population starts at 501. Entries count every arrival; exits count bots
that gave up, chose to leave or retired (deaths of old age, with heirs, are not counted). The averages are over all 120
weeks; a factor at 0 gives 1.

| Run | Pop. wk 40 | wk 80 | wk 120 | Entries | Exits | Mean multiplier | Rally part | Returns part | News part |
|---|---|---|---|---|---|---|---|---|---|
| Fixed entry (all three 0) | 346 | 251 | 218 | 56 | 339 | 1.000 | 1 | 1 | 1 |
| entryHype 1 alone | 336 | 244 | 222 | 50 | 329 | 1.045 | 1.045 | 1 | 1 |
| entryReturns 1 alone | 336 | 262 | 242 | 70 | 329 | 1.059 | 1 | 1.059 | 1 |
| entryNews 1 alone | 351 | 304 | 284 | 107 | 324 | 1.558 | 1 | 1 | 1.558 |
| All three at 1 | 366 | 287 | 272 | 100 | 329 | 1.713 | 1.052 | 1.039 | 1.563 |
| All three at 1, same bots (botScale 1, start 250) | 188 | 151 | 128 | 60 | 182 | 1.836 | 1.094 | 1.065 | 1.562 |

The three signals behave differently. The rally term was above 1 in 68 of 120 weeks and never above ×1.29; word of
mouth in 88 weeks, never above ×1.16. League news was above 1 in only 21 weeks, all near the season's end (Super Bowl,
awards, retirements, rookies), and then large: up to ×5.7 alone. With all three on, the multiplier was above 1 in 101
weeks (up to ×6.75), and the average share of log m was about 0.34 rally, 0.47 returns and 0.20 news over those weeks;
by count of extra arrivals, news carries most of them because its weeks are few but big. In every run exits far exceed
entries at entryRate 0.25 and the population falls through 120 weeks; the entry factors slow the fall but do not stop
it. These are observations of one seed, not tuned values.

**Checks.** With defaults, 45 weeks on seed 31761, every frame (minus gen, bookD, money, limits) is identical to the
base engine. The earlier Realism (entryHype 1, the other two 0, botScale 1, practiceGens 0) is identical for 25 weeks
too, ignoring the new measurement-only `entry` field. With botScale 'cards' the starting cash is 10,020,000 for 501 bots
(5,000,000 for 250 before), the starting cards per bot fall from 42.4 to 21.2, and one or two practice worlds give 501
distinct networks.

### The four together: checks and a 120-week run

The three patches were merged into one engine and checked by hashing every week's full frame (minus the measurement-only
gen, bookD, money and limits fields):

- Defaults, 45 weeks, seed 31761: identical to Round 4 (last hash 895859b8 on both).
- The merged engine against each builder's own engine: Realism with the earlier entry settings plus `attention: 300`
  (uniform draw, and the trade-volume draw), 12 weeks each, matched the attention engine week for week (ignoring the new
  `entry` field, which that engine does not have); the new Realism, 12 weeks, matched the entry engine. So the faster
  code gives the attention budget and the scaled bots exactly the results they gave on the old code.
- Determinism: the new Realism (practiceGens 0), merged engine against itself, 40 weeks: identical (last hash 00f2faa0).
- The snapshot guard (`endSnap`) never fired in any of these runs.

One 120-week run of the new Realism (full league, bots grow with the cards, all three entry factors at 1, practiceGens
0, seed 31761) on one core, nothing else running:

| | Weeks 1–40 | 41–80 | 81–120 | All 120 |
|---|---|---|---|---|
| Seconds a week | 2.22 | 1.73 | 1.80 | 1.91 |
| Trades a week (auction sales included) | 697 | 684 | 657 | 679 |
| Auction card sales a week | 50.6 | 62.5 | 80.3 | 64.5 |
| Mean entry multiplier m | 1.64 | 1.77 | 1.74 | 1.71 |

The population was 501 at the start, 366 at week 40, 287 at week 80 and 272 at week 120. Active league players stayed
at 320 to 324; live card markets grew from 2,411 to 2,866. The entry components averaged 1.052 (rally), 1.039 (word of
mouth) and 1.563 (news) over the run, exactly as in the entry measurement above, which is the same run. With 501 bots a
week costs about 1.9 seconds, against about 2.8 seconds for 250 bots before the speed work. The same Realism with
`attention: 100` ran its first 20 weeks at 0.95 seconds a week (2.37 for the same weeks without the budget), with each
bot scoring about 255 cards a week out of about 2,290 live markets.

The tactic tracker over that run (`node sandbox/tactics_report.mjs`): two tactics in every generation, silhouettes 0.15
to 0.25, so behaviour is still a continuum. Generation 1 (week 20) split into bots that trade with dealers and outsiders
and sell often (53%) and bots that trade with each other and hold longer (47%), both losing money (−26% and −31%). By
generation 3 (week 60) one broad tactic held 93% of the bots and returned +16%; a small group that borrowed heavily and
was forced to sell (7%, −22%) branched off and was gone a generation later. From generation 4 on the bots split again,
roughly in half, into auction traders who rarely open packs and bots that trade with dealers and outsiders and open about
8 packs a generation; both returned +15% to +19% at week 120, and the tracker flagged the pack-openers as cannibalizing
the auction traders in generation 5. One seed, so these are observations, not findings.

## The marks-vs-repeat-sales gap, explained (2026-11-10, engine 2.0.0 → 2.0.1)

By week 200 of Realism the marks index sits near 4× the repeat-sales (Vault) index, and the README said bots mark
their cards at about 5× what they resell for. They don't. For cards that trade, the median of mark ÷ the card's own
last trade is 1.00 at every checkpoint. The gap is mostly how the two indexes are built.

The probe was Realism, seed 31761, practiceGens 0, using instrumented engine copies whose hooks only read state. Every
probe followed the identical trajectory. At week 200 the marks index was 323 and repeat sales 85. The gap,
ln(323/85) = 1.34, splits into four steps:

| Step | Index | Log points | Share |
|---|---|---|---|
| Arithmetic, value-weighted marks basket → geometric mean of the same marks (cards' P/P0 run from 0.13× at the 10th percentile to 107× at the 99th) | 323 → 201 | 0.47 | 36% |
| Print-run weights → equal weights | 201 → 176 | 0.13 | 10% |
| Each card's mark → its own last trade (only 26% of basket weight traded in the last 26 weeks; recently traded cards are marked at about repeat-sales level, idle ones at 126–161) | 176 → 139 | 0.24 | 18% |
| How repeat sales is built | 139 → 85 | 0.49 | 37% |

How repeat sales is built:
- The opening price counts as each card's first sale, and first sales came in about a third below it. Without the
  opening pairs, the index's fall from 100 to 70 in weeks 1–5 disappears.
- Short gaps between sales average −1%, long gaps +14%.
- Second and later trades in a week are not paired.

Marks move mostly through auctions, which clear at 1.7–2.2× the mark and feed comparable sales: +1.01 log points of the
marks index to week 200. Dealer trades add +0.43, comparable-sales marks +0.34 and `bookMark` −0.42. A counterfactual in
which auction sales neither re-mark the card nor feed comparables kept the gap (2.35× at week 45, against 2.2–2.8× in
the baseline). Auctions are the largest channel in the accounting, but they are not the cause.

Verdict:
- About three quarters is measurement and definition.
- About a fifth is genuine: idle cards keep marks that auction and dealer prices hold up.
- A small part was a bug. A late-opening card's first pair was dated week 0, since `noteTrade` started every chain at
  `wt: 0`, against METRICS.md's "a card's opening price counts as its first trade". These are rookies, players
  switched on at rollovers, and their market cards: 2,144 cards by week 80. Their opening pairs averaged −0.99 log
  points and were booked as if they spanned from week 0, then dropped by the 52-week gap limit. Fixed in 2.0.1 (each
  card records `openT`), about +5% on the index at week 80.

There is no runaway like the round-3 ask ratchet.

In the 1,500-week government pilot (runs/g1), market cap grew from 18M to 59M because circulation grew from 10,604 to
34,004 cards. Market cap per card stayed at 1,695–1,741. By week 1,500 repeat sales had passed the marks index (455
against 405).

Left open, as measurement choices with no effect on the world:
- reporting a geometric or recently-traded marks index with a stale-weight share;
- whether P0 should count as a sale at all.

Bots never read the marks index. Only the crash and rally log and the government's `marksIndex` do.

## What drains the regulated world (2026-11-11, engine 2.0.1, commit 136d768)

Under every government tried (Claude, do-nothing, balanced, greedy, generous) the regulated world lost bots and most of
the rest went broke, and the policies barely differed from the spread of do-nothing seeds. To find the cause, eight
do-nothing runs (A0, seed 1, 750 weeks, `runs/drain/`) each changed one setting of the regulated preset. One seed
each, so small differences are noise. Means over weeks 376–750:

| Setting changed | Bots (from 501) | Broke | Worth below zero | Median welfare at bid | Top 10% of worth | Top 10% of cash |
|---|---|---|---|---|---|---|
| none (base) | 206 | 66% | 51% | 0.2k | 87% | 93% |
| livingCost 0 | 286 | 7% | 1% | 29k | 60% | 90% |
| livingCost 100 | 263 | 41% | 20% | 9k | 74% | 93% |
| livingCost 0, lifestyle 0.001 (scaled to wealth) | 278 | 8% | 1% | 31k | 56% | 87% |
| quitChance 0 | 976 | 93% | 88% | −48k | — | 100% |
| cashShockChance 0 | 207 | 47% | 28% | 10k | 77% | 92% |
| credit off | 238 | 84% | 42% | 8k | 76% | 100% |
| wealthTax 0 | 187 | 55% | 36% | 9k | 81% | 93% |

- The fixed living cost (200 coins a bot a week) causes the poverty: without it the broke share falls from 66% to 7%.
  The same total charged in proportion to wealth gives the same relief and the least concentrated wealth.
- Quitting is how the world sheds the bots the living cost ruins, not a separate drain. With no quitting nobody left
  (638 joined, 0 left), the population passed 1,100, and 93% were broke: the market's income supports only a limited
  number of bots at 200 a week, and quitting keeps the population near that number. Bots also leave when not broke
  (896 left with no living cost), so quitting is partly the newcomers' random networks.
- Lending between bots helps the poor: with credit off, more bots were broke (84%) and the top 10% held all the cash.
- Cash shocks and the wealth tax change little that one seed can show.
- None of these settings moved cash concentration much (87–100% in the top 10%): that comes from the market itself.
