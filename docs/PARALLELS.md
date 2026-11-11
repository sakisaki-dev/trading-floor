# Real-world parallels

Nothing in Trading Floor was built to copy a real market. The rules set quantities (fees, rent, the chance of a cash
shock) and the bots work out the rest. When a pattern shows up that economists have documented in real markets, it is
worth knowing which one, and whether the cause in the sandbox resembles the cause in the real case.

Each entry gives what the sandbox did (run, week and numbers), the real-world case, and where the analogy breaks.
The engine 2.0 runs cited here (seeds 83148, 9556, 24306 and 38148) are summarized generation by generation in
[results/runs](../results/runs/README.md), and the long engine 1.x runs (seeds 11906 and 12864) in
[results/long-runs](../results/long-runs/README.md).

"How close" rates the mechanism, not the resemblance:

- **Close:** the same cause produces the same effect.
- **Partial:** a similar cause, but the sandbox leaves out something that matters in the real case.
- **Loose:** a similar outcome from a different cause.

Most results rest on one to three seeds of one league. A parallel says the sandbox can produce a pattern; it does not
show that real markets produce it for the same reason.

| Sandbox finding | Real-world parallel | How close |
|---|---|---|
| Auction winners pay about twice the mark and lose on resale | The winner's curse | Close |
| Bots learned to overpay for cards they already held, to raise the mark on all their copies | Fund managers buying their own holdings before the quarter's close ("portfolio pumping") | Close |
| Marks rise while resale prices stay flat or fall | Stale marks on illiquid assets; Enron's mark-to-market accounting | Partial |
| Trading collapsed when the dealers left and took about 2,400 weeks to recover | The 2008 collapse of auction-rate securities | Partial |
| Pack prices alternated cheap and expensive for about 2,000 weeks | The cobweb model (the hog cycle) | Partial |
| Borrowers ask for 3× what lenders offer, at about 1% a week | Credit rationing (Stiglitz and Weiss) | Partial |
| A tactic built on heavy borrowing was reinvented and wiped out 5 times | Repeated blow-ups of leveraged strategies | Loose |
| Last generation's winners do no better than average in the next generation | No persistence in mutual fund performance | Close |
| Inequality climbs when one heir takes the estate and levels off when two share it | Primogeniture against partible inheritance | Partial |
| Most new bots quit early | Retail day traders, most of whom lose and quit | Partial |
| Two trading styles coexist for dozens of generations, one of them losing money | Fundamentalists and chartists; the survival of noise traders | Partial |
| One family grows to most of the population without being richer | Neutral drift and founder effects in population genetics | Close |
| Most cards have no orders, and sellers ask well above what buyers bid | Sticky asking prices in housing downturns | Partial |

## Auctions: the winner's curse

**Sandbox.** Sealed-bid auctions clear well above the mark: 1.8× in seed 83148, 1.85× in seed 24306 and 2.2× in
seed 38148 (realismLight, week 996). A typical lot draws 25–40 sealed bids. In seed 83148, cards bought this way and
resold lost 22% when sold to another bot and 30% when sold to a dealer. In seed 24306 the bots that trade mostly at
auction made a loss in 8 of the last 9 generations.

**Real world.** When many bidders each estimate an uncertain value, the highest estimate wins, and the highest
estimate is usually too high. Capen, Clapp and Campbell (1971) described it in offshore oil lease auctions, and
Thaler (1988) surveyed the evidence. The more bidders there are, the larger the overpayment.

**Where it breaks.** Real bidders learn to shade their bids. Within a bot's life the networks do adjust, but the
losses persist across generations, partly because heirs inherit the auction style regardless of how the parent did
(see the two trading styles below).

## Pumping marks before the close

**Sandbox.** On engines before 2.0, bots were scored on the marked value of their holdings. They learned to pay
slightly over the mark for cards they already held, which raised the mark on every copy they owned. Nobody coded this
tactic; selection found it. Scoring on what a card could be sold for (`fitnessValue: 'bid'`) removed the incentive.

**Real world.** Carhart, Kaniel, Musto and Reed (2002), "Leaning for the Tape", found equity mutual funds buying
their own holdings in the last minutes of a quarter, raising the closing prices their performance is reported on.
The prices fell back the next day.

**Where it breaks.** It is a close match. In both cases a performance measure based on the last trade price is
gamed by the party being measured. The sandbox fix is the one regulators use: value holdings at a price that could
actually be realized.

## Marks against resale prices

**Sandbox.** After 200 weeks of the engine 2.0 run (seed 31761) the marks index stood at 385 and the repeat-sales
index, built from actual resales, at 77. In seed 24306 (410 weeks) it was 382 against 54. The marks follow hidden
value, which keeps rising as young players improve and retired players keep their career value; the cards rarely
sell anywhere near those marks.

On older engines a pricing bug made this worse. A mark moved toward asks placed above it, and the asks were set
relative to the mark, so both kept climbing until one card was marked at 2 × 10²⁸ coins. No coins changed hands.

**Real world.** Assets that rarely trade are valued by a model or by quotes rather than by sales: private equity and
venture holdings, Level 3 assets on bank balance sheets, Enron's long-term energy contracts, which it booked at
mark-to-market values its own models produced. In each case the reported value can drift well above what the asset
would fetch, and the gap shows only when something has to be sold.

**Engine 2.0 correction (2026-11-10).** Most of the 2.0 gap between the marks index and repeat sales is how the two
indexes are built, not overvaluation. The marks index is an arithmetic, value-weighted average, and repeat sales is
geometric and counts each opening price as a first sale. For cards that trade, the median mark equals the card's own
last sale. About a fifth of the gap is the stale-marks effect described here: idle cards keep marks that occasional
auction and dealer prices hold up ([DEVLOG](DEVLOG.md)).

**Where it breaks.** Enron's marks were set by people with a reason to inflate them. The sandbox's marks come from a
fixed rule with no one steering it. The runaway mark is closer to a pricing feedback loop than to fraud.

## Dealers leaving: auction-rate securities

**Sandbox.** In seed 11906 (engine 1.x) outside dealers priced cards from their true value, and prices ranked
players almost perfectly (rank correlation 0.98) by week 20, before the bots had learned anything. When the dealers
were switched off at week 1,102, trades between bots fell to 13–37 a week. It took about 2,400 weeks before they
were back at 170–230 a week.

**Real world.** Auction-rate securities were long-term bonds whose interest rate was reset at frequent auctions. The
broker-dealers who ran the auctions routinely bid to cover any shortfall, so the auctions looked liquid. In February
2008 the dealers stopped bidding, most auctions failed, and holders of a market of roughly $330 billion could not
sell.

**Where it breaks.** The sandbox dealers also supplied the pricing information, so their exit removed both liquidity
and price discovery at once. In the real case the information was still there; only the buyer of last resort left.

## Pack prices: the cobweb

**Sandbox.** In seed 12864 packs sold for nothing for 200 weeks and bots that bid on packs did well. When the supply
ran out, the same bids pushed pack prices up 2.65× a week to 56,905 coins and the pack bidders went broke. For about
2,000 weeks after that, pack prices alternated between cheap and expensive every other week.

**Real world.** The cobweb model (Ezekiel, 1938) describes markets where producers set next season's supply from
this season's price: a high price brings a glut and a low price, which brings a shortage and a high price. Hog and
cattle prices showed these cycles for decades.

**Where it breaks.** The sandbox cycle runs on the demand side (bots bidding on last week's pack price) rather than
on supply. The pack bidders' collapse also shows a tactic that fit one regime (free packs) and failed in the next.

## Unmet demand for loans

**Sandbox.** In seed 38148 (week 996) bots asked to borrow 2.3 million coins and other bots offered 0.68 million.
The same gap appeared in the long runs where lending never spread, although loans paid about 1% a week.

**Real world.** Stiglitz and Weiss (1981) showed why lenders may refuse to raise rates to clear the market: higher
rates drive away safe borrowers and attract risky ones, so lenders ration credit instead.

**Where it breaks.** The sandbox has no screening of borrowers. The more likely cause is that lending was never
selected for: in seed 11906 lending spread with one successful family and vanished when that family was replaced.

## Leverage, reinvented and wiped out

**Sandbox.** In seed 38148 a tactic of borrowing more than the bot's whole worth each generation, trading many
times its worth and then being forced to sell appeared 5 separate times over 49 generations. Each time it lasted a
single generation and vanished, usually after losses of 24–72%.

**Real world.** Leveraged strategies keep returning after each blow-up: Long-Term Capital Management in 1998,
Archegos in 2021. Minsky and later Geanakoplos ("The Leverage Cycle", 2010) describe credit expanding in calm
periods until a loss forces sales that deepen the loss.

**Where it breaks.** In the sandbox the tactic is reinvented by mutation, not by people who forgot the last crash,
and it never has a long run of success first. It is a parallel in outcome only.

## No persistence of returns

**Sandbox.** The rank correlation between a bot's return in one generation and its return in the next was −0.03 to
−0.08 under all 11 settings tested on older engines, about zero in seed 9556 and mostly negative in seed 38148. The
exception is seed 24306, where each estate went to two heirs, at +0.12 to +0.24.

**Real world.** Carhart (1997) found that mutual fund performance barely persists once costs and momentum are
accounted for, and S&P's SPIVA persistence reports find few top funds staying on top.

**Where it breaks.** The sandbox exception points at inherited advantage. Heirs start with their parent's money and
network, so in that run returns carry over through inheritance rather than skill.

## Inheritance and inequality

**Sandbox.**

| | seed 9556 | seed 38148 | seed 24306 |
|---|---|---|---|
| Heirs per death | 1 | 1 | 2 (a quarter of the estate sold) |
| Gini of wealth | rose to 0.63 by week 177 | peaked at 0.75, 0.69 at week 996 | flat near 0.50 for 350 weeks |

In seed 9556 three of the seven richest bots were heirs who had inherited 0.86–2.1 million coins less than a season
earlier, and the richest held one card, a Cut 1/1 autograph, marked at 3.96 million. In seed 38148 the 10% of bots
with the most cash held 73% of it, and the poorer half held 2.6%.

**Real world.** Under primogeniture one heir takes the estate and large holdings stay intact across generations;
partible inheritance splits them. Piketty (2014) argues that inherited wealth drives long-run concentration whenever
returns on capital exceed growth. In the United States today the top 10% of households hold about two-thirds of
household wealth (Federal Reserve, Distributional Financial Accounts).

**Where it breaks.** The three runs differ in seed and in other settings (seed 24306 also had a 5× allowance), so the
comparison is suggestive only. The planned test runs one seed with one heir and with two, all else equal.

## New entrants quit

**Sandbox.** Every run loses most of its new bots early. The engine 2.0 run went from 501 bots to 344 in 200 weeks;
seed 38148 went from 259 to 150 by week 300 and stayed there. In seed 24306 the median quitting tendency of new bots
fell from about 0.5 to about 0.28 over 20 generations, the first sign that selection may reduce quitting. On older
engines, letting bots quit after heavy losses raised the correlation between prices and player performance from 0.39
to 0.69.

**Real world.** Barber, Lee, Liu and Odean's studies of day traders in Taiwan found that fewer than 1% earn
predictable profits and that most quit after losses. The market selection argument (Friedman, 1953; Blume and Easley,
2006) holds that markets get better at pricing as poor traders lose money and leave.

**Where it breaks.** Sandbox bots that quit leave no offspring, so quitting is selected against directly. Real
traders who quit don't pass anything on, but new ones arrive with the same habits.

## Two trading styles that won't go away

**Sandbox.** Every run so far splits into the same two groups: bots that trade mostly with dealers and rarely at
auction (49–66%), and bots that trade mostly at auction with other bots (34–51%). In seed 38148 the split lasted 41
generations, with the lead changing hands several times. The auction group in seed 24306 kept its share while losing
money for 8 generations.

**Real world.** Heterogeneous-agent models (Brock and Hommes, 1998) have fundamentalists and trend followers trading
side by side, each growing when its rule is working. De Long, Shleifer, Summers and Waldmann (1991) showed that noise
traders can survive, and even grow, against rational traders. Farmer (2002) describes markets as ecologies of
strategies.

**Where it breaks.** The losing group in seed 24306 survives partly because each death passes the parent's style to
its heirs regardless of performance, which is closer to family tradition than to market selection.

## A family takes over: neutral drift

**Sandbox.** In seed 11906 a family of 4 bots grew to 93% of the population (282 of 303 bots) over about 7,000
weeks. In seed 24306 one family grew to 24% of the bots in 400 weeks and held 24% of the wealth: it grew by having
heirs, not by being richer. In seed 38148 the leading family reached 42% at week 620 and fell back to 30%.

**Real world.** In population genetics, Kimura's neutral theory shows that a lineage can take over a population by
chance alone, without any fitness advantage, and that this is more likely in small populations. A founder effect is
the same thing after a population shrinks.

**Where it breaks.** It is a close match in mechanism. Whether the takeover in seed 11906 was drift or advantage has
not been tested: it would need replicate runs from the same starting population.

## Thin order books and sticky asking prices

**Sandbox.** In a typical week 68–77% of cards have no bot orders at all. In the engine 2.0 run asks outnumbered bids
4 to 1. In seed 38148 the balance reversed, with bids outnumbering asks 2.6 to 1, but the bids sat at about a quarter
of the mark, so few filled.

**Real world.** In housing downturns sellers keep asking prices near what they paid, buyers bid lower, and sales
volume falls more than prices do. Genesove and Mayer (2001) tied this to loss aversion among Boston condo sellers.

**Where it breaks.** Sandbox sellers anchor on the mark rather than on what they paid, and the bots have no built-in
loss aversion; any reluctance to sell at a loss was learned.

## References

- Barber, B., Lee, Y.-T., Liu, Y.-J. and Odean, T. (2014). The cross-section of speculator skill: Evidence from day
  trading. *Journal of Financial Markets*.
- Blume, L. and Easley, D. (2006). If you're so smart, why aren't you rich? *Econometrica*.
- Brock, W. and Hommes, C. (1998). Heterogeneous beliefs and routes to chaos in a simple asset pricing model.
  *Journal of Economic Dynamics and Control*.
- Capen, E., Clapp, R. and Campbell, W. (1971). Competitive bidding in high-risk situations. *Journal of Petroleum
  Technology*.
- Carhart, M. (1997). On persistence in mutual fund performance. *Journal of Finance*.
- Carhart, M., Kaniel, R., Musto, D. and Reed, A. (2002). Leaning for the tape: Evidence of gaming behavior in equity
  mutual funds. *Journal of Finance*.
- De Long, J. B., Shleifer, A., Summers, L. and Waldmann, R. (1991). The survival of noise traders in financial
  markets. *Journal of Business*.
- Ezekiel, M. (1938). The cobweb theorem. *Quarterly Journal of Economics*.
- Farmer, J. D. (2002). Market force, ecology and evolution. *Industrial and Corporate Change*.
- Friedman, M. (1953). *Essays in Positive Economics*.
- Geanakoplos, J. (2010). The leverage cycle. *NBER Macroeconomics Annual 2009*.
- Genesove, D. and Mayer, C. (2001). Loss aversion and seller behavior: Evidence from the housing market. *Quarterly
  Journal of Economics*.
- Kimura, M. (1983). *The Neutral Theory of Molecular Evolution*.
- Piketty, T. (2014). *Capital in the Twenty-First Century*.
- Stiglitz, J. and Weiss, A. (1981). Credit rationing in markets with imperfect information. *American Economic
  Review*.
- Thaler, R. (1988). Anomalies: The winner's curse. *Journal of Economic Perspectives*.
