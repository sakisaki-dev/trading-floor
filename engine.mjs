// Retro Vault Sandbox engine: one world, run by the browser prototype (docs/trading-floor.html) and by the
// Node runner with AI bots (sandbox/run.mjs). Plain JS, no dependencies, deterministic for a seed (AI bots aside).
//
// The world: a fixed pool of cards for the 203 real league players. Nothing is simulated about the players: their
// stats are the real ones, in a library a bot can read only with research passes (3 a week by default). Each card has
// a HIDDEN fundamental F (the site's card value, in coins) that no bot reads directly; bots estimate it from research.
// Disclosed channels that carry it: royalties (each card's last-generation payout, card input x32, is F × royaltyRate ×
// the games played, so it tracks F closely), the price guide (F a week old, every guideEvery weeks) and the dealers who
// trade around last week's F. Everything else a bot reads is built from prices, trades, its own records and the library.
// Bots trade cards in a weekly call auction, buy packs that mint from the pool, trade research passes, and swap or
// steal research notes. Every decision a run depends on is in DEFAULTS below.

let PRACTICE_HOOK = null; // called (week, of) during practice generations, so a page can show progress
export function setPracticeHook(f) { PRACTICE_HOOK = f; }
export const DEFAULTS = {
  seed: 88,
  // rngStreams 'split' (default; a fix, audit methods 1): independent seeded generators per subsystem, each seeded from the
  // run seed and a fixed id (RNG_STREAMS): the league (games, injuries, awards, retirements, rookies, season draws), the
  // market and bots (orders, research, packs, auctions, social, evolution, mutation, the opening endowment) and people
  // (newcomers, quits, deaths and lifespans, estate rounding, cash shocks, card loss). A market rule that changes how many
  // draws the bots make then cannot change a game: on one seed the football is the same under every market setting.
  // 'single': the old one shared stream (the market's), kept to replay runs made before engine 2.x exactly
  rngStreams: 'split',
  weeksPerGeneration: 20, // evolution and royalties happen at the end of each generation
  valueDivisor: 1, // the site's card values are divided by this to get coins (1 = the site's exact prices)
  // coinScale: scales only the small coin amounts written into the code as multiples of it: the value floor (0.05×), the worth
  // floor networks divide by (50×), the pass and ticket price ranges, the lending and borrowing minimums, collector-target and
  // auction-log thresholds. startCash, allowance, livingCost, gameStake and every other coin setting are raw coins.
  coinScale: 20,
  startCash: 20000, // ASSUMPTION (not measured from the save): a bot's opening cash
  allowance: 1800, // coins per bot per week (new money: this is the inflation lever)
  fee: 0.01, // share of every card sale kept by the house
  packSize: 5,
  packEdge: 0.25, // packs cost their expected hidden value × (1 + edge)
  poolMultiplier: 10, // ASSUMPTION (not measured from the save): unminted copies in the pool = copies in circulation at the start × this
  // Print run (ASSUMPTION, the owner's, not measured from the save): a player's copies in circulation at the open are
  // S0 = max(printRunMin, round(printRunK ÷ max(printRunValueFloor, value ÷ printRunUnit)^printRunExp)), value his site price.
  // It sets every card's scarcity and, through poolMultiplier, the pool packs mint from (printRun(), used at every site).
  printRunK: 40, printRunExp: 0.5, printRunMin: 2, printRunValueFloor: 0.5, printRunUnit: 100,
  passesPerWeek: 3, // ASSUMPTION: research passes granted to every bot each week
  passLife: 1, // ASSUMPTION: weeks before an unused pass expires (1 = use or sell it this week)
  maxResearchPerWeek: 60, // ASSUMPTION: numerical safety bound on the players one bot may research in a week (own and bought passes together); far above what passes reach, so the pass price is what binds (was 6, a second wall on top of the price)
  passesTradable: true,
  knowledgeWeeks: 12, // ASSUMPTION: a research note goes stale after this many weeks
  memoryCap: 0, // ASSUMPTION: 0 (default): no count limit; a note is forgotten once it is 2 × knowledgeWeeks old (stale notes already count for nothing, and the network's note-age input saturates there). Above 0: the old wall, at most this many notes (oldest dropped first)
  sharing: true, // bots may swap notes ("friendly")
  stealing: true, // thieves may copy another bot's notes
  detectChance: 0.35, // ASSUMPTION: chance a theft is noticed; the victim then flags the thief and stops sharing with it
  notesPerSwap: 3, notesPerTheft: 3, guardChance: 0.5, // ASSUMPTIONS: the freshest notes each side gives in a swap; the freshest notes a theft copies; chance a theft from a bot that flagged the thief is stopped (it watches)
  gossip: true, // a victim's friends flag the thief too
  outsideCollectors: true, // buyers from outside the bots bid around hidden value (the market's anchor)
  royalties: true, // each generation, holders get 3% of hidden value per card held
  royaltyRate: 0.1, royaltyEvery: 'week', royaltyFunding: 'minted', // royaltyFunding 'minted': new coins (prices inflate); 'house': paid only out of the house's takings (fees, pack sales, living costs), a closed loop that can fall short
  // royaltyRate: share of hidden value a card pays its holders per weeksPerGeneration (20) weeks; 'week' pays it weekly, from that week's game under the league
  evolve: true, // each generation the worst 10% by recent return adopt a mutated copy of a top 10% bot's networks (so strategies that trade well on the news can spread); off: strategies spread only through heirs
  evolveShare: 0.1,
  mortality: true, // bots live 6–14 generations; on death the estate is split between heirs that carry a mutated copy of the genome
  lifespan: [6, 14], // ASSUMPTION (not measured): a bot's life in generations, drawn uniformly between the two
  heirs: 1, // an estate passes to this many heirs, each with a mutated copy of the networks (1 keeps the population steady: it changes only through newcomers and bots that give up or retire)
  capPoorest: false, populationCap: 1.15, // OLD RULE (off): heirs beyond populationCap × the starting population push the poorest bots out of the market
  // Intrinsic value: 'ovrWalk' (default) starts every card at the site's price for it (its value × its rarity). Each week
  // it rises by a percentage with probability walkUp, else falls by the same percentage. The size of that move comes
  // from the card's risk rating: ±walkVolLow at riskLo or below, ±walkVolHigh at riskHi or above, in between in a line.
  // With every card rising 55% of weeks, riskier cards earn more on average but swing far harder. The risk rating
  // starts at the player's OVR and then follows the card's own record: riskPerDoubling points up for every doubling of
  // its value since it entered the market (down for every halving), plus or minus any change in his real OVR from new
  // seasons. A low card that keeps rising becomes a safe, slow one; a top card that crashes becomes risky.
  // Never below 1% of where it started. 'formula' follows the site's value formula season by season instead.
  // 'factors' (default): value = player factor × supply factor and nothing else. The player factor is the site's value
  // for him from his real data (OVR, skill, Career Legacy); it changes only when a season changes that data, and past the
  // real history it holds (pastSave 'hold': no data, no change; 'draw' replays a random real season-to-season change from
  // his position, which compounds about ×1.21 a season). The supply factor is
  // (copies out now + print run) ÷ (copies out at the start + print run), raised to −scarcity: packs opened add copies and
  // lower it, collectors taking cards out raise it. Nothing here says which way a value goes.
  valueModel: 'league', scarcity: 0.5, pastSave: 'hold',
  // formulaPull ('formula' model only, past the save): how far each drawn season pulls a value back toward its last real one
  // (0 to 1; 0 = none). A disclosed factor: it sets a direction (back toward the anchor). Without it the draws compound: a
  // log change averaging zero still grows the average value by exp(sd²/2) a season (16% for linemen, about 400× in 40 seasons).
  formulaPull: 0.25,
  // 'league' (default): after the last real season a simulated league plays on (rates measured from the save:
  // sandbox/data/league_rates.json) and the site's own value formula reprices every player weekly from its stats.
  // valueBasis 'form': an active player is ranked (in the site's one OVR pool) on his career League Score × his form, the
  // production per game over his last formSeasons × 17 games (games missed injured count as zero: injuryCountsInForm)
  // ÷ his career per game. The window starts at his career pace, so the market opens at the site's real values.
  // Retired players keep career OVR. 'career': everyone on career OVR, exactly as the site.
  formSeasons: 1, injuryCountsInForm: true, injuryByAge: true, retirementByAge: true, // injuryByAge: injury chance follows the real NFL's risk by age (sandbox/data/nfl_age.json)
  // pressure: next season's form change is shifted by how much his card value moved this season (measured in the save: a
  // big rise tends to be followed by a falloff, a fall by a rebound). hypeInjury (0 = off, the owner's setting, NOT measured:
  // the save shows no link): extra chance of an injury spell next season, × the log rise of his value this season.
  pressure: true, pressureStrength: 1, hypeInjury: 0, // pressureStrength 1 = the measured shift; above 1 is the owner's setting
  // gameNoise (ASSUMPTION, not measured: the save has season totals only): the log-normal spread of a game's yards around the
  // player's per-game rate, for real players, rookies and generated veterans' burn-in alike.
  valueBasis: 'form', injuries: true, retirement: true, rookies: true, rookieRule: 'replacePlus', extraRookies: 3, // rookieRule 'replacePlus' (default): one rookie per retiree at his position and club, plus extraRookies (3) more a season; 'replace': one per retiree only (66 active always); 'measured': arrivals at the save's measured rate, whoever retires
  awards: true, gameNoise: 0.4,
  // openPrice: where a card with no price yet opens (a rookie at his first valuation, a generated veteran at the open, a save
  // player entering in a replayed real season). 'comps' (default): comparable sales, the median price of the 5 players at his
  // position with cards out whose public OVR is nearest his; 'position': the median price at his position; 'value': his
  // hidden value (the old rule; it leaks F into prices, kept to reproduce old runs)
  openPrice: 'comps',
  // leagueFill 'save' (default): the league is the save's own players (66 active in Y88, a few per club). 'full': every club
  // carries a real Retro Bowl roster of rosterSize (10: QB, RB, 2 WR, TE, OL, DL, LB, 2 DB; the save's own full rosters).
  // At the open each club × position short of it gets a generated veteran: a rookie built from measured data (as addRookie)
  // who has already played s seasons, s drawn from the seasons played by the save's active players, under the league's own
  // season rules (injuries, form swings, Career Legacy growth; no awards or rings). His cards are dealt out like real ones.
  // At each season's end retirees are replaced and any gap filled until every club × position is back at rosterSize
  // (rookieRule and extraRookies are not used; a slot above the shape is never filled, so it drifts down). OVR and value
  // for everyone come from rank within position among the save's own players (and the game's legends): a fixed reference,
  // so real cards keep the values they would have had and a generated player is worth where he would rank in it. Money
  // follows the cards: allowance, outsideBudget and packsPerWeek are scaled by copies in circulation at the open ÷ the
  // copies of the save's own players. Needs valueModel 'league', history on and startSeason 'latest'.
  // dormantAfter (weeks; 'full' only): a retired player none of whose cards anyone holds (bots, the liquidator, outside
  // dealers, one-of-a-kind items) and whose markets saw no trade or order for this many weeks is set aside: the weekly
  // per-card loops skip his 16 markets. He wakes the moment anyone bids, lists, pulls or holds one. 0 = never.
  leagueFill: 'save', rosterSize: { QB: 1, RB: 1, WR: 2, TE: 1, OL: 1, DL: 1, LB: 1, DB: 2 }, dormantAfter: 52,
  walkUp: 0.55, walkVolLow: 0.15, walkVolHigh: 0.03, riskLo: 60, riskHi: 95, riskPerDoubling: 10,
  startSeason: 'latest', // 'latest' opens the market at the present (site prices and price history imported); 'first' replays from Y79
  priceOnly: false, // a card is worth only what someone pays: no hidden value anywhere in the world (no royalties, packs priced
                    // from market prices, no valuation contest, research shows what a card has traded for). Real seasons still
                    // update the library's stats and the game questions, and bring rookies. Off by default: with nothing to
                    // anchor them (holding earns nothing, cards have no use), prices ratchet down to about zero.
  history: true, // replay the save's real seasons as news (sandbox/data/timeline.json), then real-change draws after
  seasonWeeks: 20, // weeks per season
  turnover: true, // newcomers with fresh random networks arrive (entryRate a week, the only source of new strategies); bots that lose 70% of their peak may give up, and a few retire
  entryRate: 0.25, // newcomers per week
  // entrants 'random' (default): a newcomer brings a brand-new random network; 'offspring': a mutated copy of a bot already
  // in the market, its parent picked the way evolution picks (at random from the top evolveShare by fitness, shared
  // fitness when fitnessSharing is on); random until the first generation has ended. Its cash is a newcomer's as before.
  // fitnessSharing (0 = off): evolution ranks bots by fitness divided by (niche count)^strength, the niche count being how
  // many bots' card networks behave like its own (tanh of each output on 24 fixed sample cards, RMS distance, a triangle
  // kernel of radius sharingRadius). Fitness is first shifted to be positive. A common strategy scores less, a rare one more (NEAT).
  // populationFloor (0 = off): a share of the starting population; when bots leave and the market falls below it,
  // newcomers (random or offspring, per entrants) top it back up that week. The world still decides who leaves.
  // practiceWorlds (1 = today): practice runs on this many private markets (different seeds) with one shared set of
  // networks; each generation they play every world, are scored by their average fitness across the worlds, and the
  // worst evolveShare copy the best once. Above 1, turnover, deaths, evolution inside each world and learning within a
  // lifetime pause during practice (they would make the worlds' populations differ).
  entrants: 'random', fitnessSharing: 0, sharingRadius: 0.5, populationFloor: 0, practiceWorlds: 1, // sharingRadius: the kernel width, a chosen number (0.5: about how far a copy drifts from its source in one generation, measured 0.49; two random bots 0.68)
  retireRate: 0, // share of bots that leave at random each week (the old rule was 0.002)
  fashion: false, // collectors' taste for each player family drifts, jumps on hype and feeds on price gains
  gameStake: 40, // coins each entrant stakes into a game's pot (plus a ticket); the best scores share the pot
  prizeShare: 0, // share of the house's weekly takings (trade fees, pack sales, living costs) added to contest prizes (0: games pay only from the stakes, so only skill wins)
  aiLifespanWeeks: [40, 80], // ASSUMPTION (not measured): an AI bot's life in weeks, drawn uniformly; when it ends its estate and memo pass to one heir, who carries on
  games: true, // weekly Arcade contests (see GAMES)
  gameTickets: 3, // game tickets granted to every bot each week; a ticket is spent when a game starts (no restarts)
  ticketLife: 1, // weeks before an unused ticket expires
  ticketsTradable: true, // bots may sell tickets to bots that play better
  maxGamesPerWeek: 6, // most games one bot may play in a week, own and bought tickets together
  auctions: true, // bots may put a card up for a sealed-bid auction (highest bid wins, pays the second-highest)
  // Real-world forces (on by default): bots must pay to live, and can borrow against their cards
  livingCost: 80, // coins a bot must spend each week just to stay in the market (leaves the economy)
  lifestyle: 0.0015, // plus this share of its worth: richer bots spend more, as people do
  credit: true, // bots may lend to and borrow from each other, secured by the borrower's cards (no bank, no new coins)
  maxLTV: 0.6, // most a bot can borrow, as a share of its cards' value
  marginCall: 0.75, // past this share of its cards' value, a borrower must sell at a discount until it is back under maxLTV
  loanWeeks: 8, // loans fall due after this many weeks; a borrower that can't repay must sell, and after 3 late weeks defaults
  interest: 0.002, // (unused without a bank) the rate is whatever lenders and borrowers agree
  // Artificial safeguards (policy experiments, all off by default)
  store: false, // the Vault store sells unminted copies at the public value (the guide, or last week's value) × (1 + storePremium): a ceiling while the pool lasts
  storePremium: 0.6, storeCopies: 3, // storeCopies: most copies of one card the store offers a week
  priceLimit: 0, // a card's price can move at most this much in a week (0 = off)
  centralBank: false, // the allowance follows prices: more coins when cards trade below hidden value, none when above (inflation targeting)
  bankTarget: 1, // the price ÷ hidden value the bank aims for
  bankGain: 4, // how hard it reacts: allowance × (1 + gain × (target − price ÷ value)), between 0 and 4× the base
  closedEconomy: false, // instead: allowances and royalties paid only from what the house collects (no printed money)
  wealthTax: 0, // weekly tax on worth above wealthTaxThreshold × the median bot, collected every wealthTaxEvery weeks (0 = off); what a bot can't pay is owed (arrears) and collected from later cash and forced sales
  wealthTaxThreshold: 2, wealthTaxEvery: 4, // the owner's settings: taxed worth starts at this multiple of the median bot's worth; collected every this many weeks (rate × weeks each time)
  positionLimit: 0, // no bot may hold more than this share of a card's circulation (at least 3 copies allowed; 0 = off)
  // The liquidator sells the cards of bots that defaulted or left. 'cutWhenUnsold': each card's asking price is set
  // once when it arrives (liqStart × its price that day) and cut by liqStep only in weeks when no copy of it sells,
  // so it never chases its own falling price. 'chase': the old rule, liqStart is ignored and it asks 80% of each
  // week's price (which pulls prices down by itself).
  liquidation: 'auction', liqListings: 30, liqStart: 0.95, liqStep: 0.05, // 'auction': seized copies go to the sealed auction with no minimum price, liqListings a week; 'cutWhenUnsold' / 'chase': the old asks (liqStart, liqStep)
  twoSidedQuotes: true, // between trades, a price is marked to the spread only when the book has both an unfilled bid and an unfilled offer; off: any unfilled bid above or offer below pulls it (the old rule, which dragged every price down while random bots posted far more offers than bids)
  quotePull: 0.25, // how far unfilled orders pull the quoted price toward them each week (priceRule 'quotes' only)
  priceRule: 'comps', compsWeeks: 4, vaultIndex: 'repeatSales', // 'comps' (default): an untraded card is marked from its player's other cards' trades in the last compsWeeks weeks (comparable sales); 'lastTrade': its own last trade only. vaultIndex 'repeatSales': from pairs of trades of the same card; 'basket': every card's mark
  // 'lastTrade': a card's price is the last price it traded at; best bid and ask are shown, never move it. 'quotes': the old pull
  // markRule 'book' (default): the last trade or comparable-sales mark, kept inside the standing book (the median of the
  // markDepth best asks pulls it down, of the best bids up, once it has held markWeeks weeks running). markHalfLife: an
  // untraded mark drifts toward the book with this half-life (0 = off): with both sides, toward their middle; with only
  // asks, down toward the lower of the ask level and the last trade; with only bids, up toward the higher of the bid level
  // and the last trade; with neither, it holds. Asks never raise a mark, bids never lower one. fireShare: a card auction
  // sale below this share of the card's mark the week before counts as a fire sale (measurement only). holdCost: share of each card's mark its holder pays
  // a week to the house (0 = off). wealthTaxForced: the unpaid part of the wealth tax becomes a forced sale.
  // estateSale: share of a dying bot's cards sold before the heirs inherit. cashShockChance: weekly chance of a cash need of
  // cashShockSize × worth (the owner's assumption, not measured).
  wealthTaxTo: 'equal', // where the wealth tax goes: 'equal' (default) paid out to every bot alike, like a citizen's dividend; 'belowMedian' to the bots below the median worth; 'house' into the house treasury (it leaves circulation unless Closed economy is on)
  // Bots' freedom: priceRange (±60%) around a base the card network chooses between the price and its own research estimate
  // (priceAnchor); keepMax (95%) the most cash it may target; rateMax (5% a week) the highest loan rate it may offer or
  // adaptBar: what a trial is judged against. 'kept' (default): the score of the last kept period, from another stretch of
  // the market; 'fresh': after a rejected trial the restored networks run one period untouched and that score is the bar;
  // 'market': every score is measured against the median score of all neural bots over the same period (the market's common
  // move removed). entryReturns: newcomers × (1 + entryReturns × the median bot's own return over the last 11 weeks, allowance
  // and other money it didn't earn removed): word of mouth (owner's assumption, only how many arrive, never what they do).
  // entryNews: newcomers × (1 + entryNews × news), news = the league's public news this last 4 weeks (Super Bowls, awards,
  // Hall of Fame inductions, retirements, rookies, injuries, returns, season openings: the league items of the news feed)
  // over its 52-week average, minus 1, floored at 0: people hear about the hobby when the league is in the news (an
  // assumption; only how many arrive, never what they do). The league has no records or club trades to count.
  // botScale: with a full league (leagueFill 'full'), 'cards' multiplies the starting population, the newcomer rate and
  // the population floor and cap by W.fillK, the factor money and packs already follow; the allowance is then split over
  // the larger population, so its total still grows by W.fillK once. 1 (default): as before, the same bots for any league.
  // accept; maxOrderQty, maxListings, maxShorts, maxPacks: per-card order size and weekly counts. quitRule 'drawdown'
  // (default): a bot that lost quitDrawdown of its peak may give up, quitChance a week; 'network': its own quit output.
  // forcedOrder 'network' (default): forced sellers sell the cards their own network most wants to sell; 'price': dearest first.
  adaptOn: false, adaptEvery: 10, adaptSize: 0.05, adaptBar: 'kept', lossRate: 0, entryHype: 0, entryReturns: 0, entryNews: 0, botScale: 1, // adapt*: learning within a lifetime (off); lossRate: share of copies lost per season (owner's assumption); entryHype: newcomers × (1 + entryHype × the Vault index's 20-week rise) (owner's assumption)
  priceRange: 0.6, priceAnchor: true, keepMax: 0.95, rateMax: 0.05, maxOrderQty: 3, maxListings: 1, maxShorts: 3, maxPacks: 3,
  // priceMap: how the 'price offset' output becomes a price. 'range' (default): base × (1 + priceRange × tanh(output)), a wall
  // at ±priceRange; 'log': base × exp(priceLogK × output), the same slope at 0 (0 = the base) but no wall: ×3 or ÷3 at output
  // ±1.8, held only by a numerical safety clamp of priceClamp either way; it also frees the pack bid (exp(output) instead of
  // exp(tanh(output)), held by the same clamp). rateMap: how the two loan-rate outputs become rates. 'range' (default):
  // 0.1% to rateMax through a sigmoid; 'log': rateLogMid × exp(output) (2.5% at output 0, about the range's midpoint), no rateMax, held only
  // by the numerical safety bound rateClamp (10 = 1,000% a week).
  priceMap: 'range', priceLogK: 0.6, priceClamp: 50, rateMap: 'range', rateLogMid: 0.025, rateClamp: 10,
  quitRule: 'drawdown', quitDrawdown: 0.7, quitChance: 0.25, quitMinWeeks: 20, forcedOrder: 'network', // quitMinWeeks: no bot may quit (either quit rule) in its first this many weeks (the owner's assumption)
  // lendShareMax: the most of its idle cash a neural bot's lending output can offer (1 = all of it; the old wall was 0.7).
  // A neural bot's borrowing output is a share of what it may borrow (maxLTV × its cards' value), so maxLTV is the only limit.
  // passOpen, ticketOpen: the reference price (× coinScale) a pass or ticket order is set around until the first trade;
  // after that the last clearing price. Bids and asks map the same way (see nnThink).
  lendShareMax: 1, passOpen: 10, ticketOpen: 4,
  aiCaps: { orders: 40, notes: 12, auctionBids: 10 }, // AI bots: most orders, notes and sealed bids a week (their other caps are the neural bots': maxOrderQty, maxPacks, maxListings, maxShorts, maxResearchPerWeek, maxGamesPerWeek)
  singleBidder: 'own', // an auction with one bidder: 'own' (default) it pays its own bid; 'reserve' it pays the reserve (with no minimum, 0.01)
  // fitnessExo: which cash flows are taken out of a bot's return (booked to b.exo) for fitness, lifetime learning and the
  // entry signal. 'lumpSums' (default; owner decision 2026-11-07): only lump sums a bot did not choose (the allowance, the
  // wealth tax paid back, the flat living cost, cash shocks); taxes and costs tied to its holdings or activity (wealth tax,
  // lifestyle, holding costs, fees) count in its return. 'legacy': the allowance and all living costs (the old booking)
  fitnessExo: 'lumpSums',
  fitnessValue: 'bid', // 'bid' (default): fitness from what each bot could actually sell its holdings for that week (realValue); the page's worth is unchanged
  markRule: 'book', markDepth: 3, markWeeks: 2, markHalfLife: 0, fireShare: 0.3, holdCost: 0, wealthTaxForced: false, estateSale: 0, cashShockChance: 0, cashShockSize: 0, // estateSale is the owner's assumption, not measured
  // Unpaid bills (living costs, holding costs, wealth tax, cash shocks) are owed, by cause (b.arrears): worth counts them as a
  // debt, later cash and forced-sale proceeds pay them to where the bill was going, and only bots that leave are excused.
  // compsSource: what counts as a comparable sale for the comps mark: 'trades+book' (default) a trade or a book-moved mark
  // of any of the player's cards; 'trades' trades only (no mark-to-mark feedback between a player's 16 markets).
  compsSource: 'trades+book',
  collectorSaveWeeks: 26, // dealer savings, in weeks of budget, so dealers can afford star cards (they still buy only at or below their read of value; 4 = the earlier world)
  outsideMode: 'value', collectors: 25, collectorError: 0.15, collectorStart: 0.1, collectorPerCard: 4, collectorSpread: 0.05, // 'value' (default): two-sided dealers trading around last week's public value (see valueCollectors); 'budget': a price-taking budget; // 'budget': outsideBudget coins a week buy the lowest asks, spread by real popularity (Career Legacy), and outsideResale of what collectors hold is sold back into the best bids. ('band', the old 5% chance of a bid at 0.85–1.08× hidden value that destroyed the copies it bought, is retired: createWorld rejects it.) Dealers' starting stock (collectorStart) is taken from the unminted pool
  outsideBudget: 250000, outsideResale: 0.02, outsideNews: true, // outsideNews: each player's share is his Career Legacy × his current form (the public news: a hot streak draws more, a slump or an injury less)
  forcedSale: 'book', // 'book': a margin-called or broke bot sells into the best bids, then lists the rest at auction with no minimum. 'discount': the old 88% ask and 70% item reserve
  packSale: 'auction', // 'auction': packsPerWeek are released and sold by uniform-price auction (everyone pays the lowest winning bid). 'markup': the old expected value + packEdge
  packsPerWeek: 33, packMix: { standard: 0.75, premium: 0.21, elite: 0.025, holo: 0.015 }, // ASSUMPTION (not measured from the save): the count and mix bots bought under the old markup price in an earlier simulation
  shorting: true, // bots may borrow cards from holders who lend them, sell them, and buy them back later
  cardLendFee: 0.005, // weekly fee a borrower pays the lender, as a share of the card's price
  shortMargin: 0.5, // cash a short seller posts as collateral, as a share of the price, per copy
  shortMaintenance: 0.25, // a short seller whose worth falls below this share of what it owes in borrowed cards is forced to buy back
  cardLoanWeeks: 12, // a borrowed card must be returned within this many weeks
  // A called short (due, under shortMaintenance, or unable to pay its fee or royalty) must buy its card back: a neural
  // borrower bids what its own card network prices the card at, any other borrower coverBid × the mark; one still short
  // coverGraceWeeks after the call (or that can't pay the mark) is settled in cash at coverSettle × the mark, paid to the
  // lender (the owner's settings, not measured)
  coverGraceWeeks: 3, coverSettle: 1.1, coverBid: 1.15,
  flagWeeks: 26, // a caught thief can't trade with the bots that flagged it; the flags lift after this many weeks without being caught again (0 = never)
  deployOrders: 10, // most buy orders a bot places a week to put spare cash to work
  // The most-traded list: live cards ranked by trades over hotVolWeeks weeks ('volume', default: plain trade count; 'momentum':
  // the old rule, trades × max(hotFloor, 1 + hotRetWeeks-week return), which tilts toward rising cards). Genome bots research from its top
  // hotResearch and look for orders in its top hotOrders, a genome collector's book draws from its top hotBook, and an AI bot
  // sees marketRows rows of it a week (it may page further with the marketPage action). Neural bots never read it.
  hotRank: 'volume', hotResearch: 40, hotOrders: 30, hotBook: 50, marketRows: 40,
  // attention: an attention budget for the neural bots (a world factor: how many cards a bot can look at, never which way it
  // trades). 0 (default): every bot's card network scores every live card each week. K > 0: each week it scores only the cards
  // it holds or owes, its watchlist (players it has notes on, cards it has up for auction, cards it traded in the last
  // attentionMemory weeks) and K other live cards drawn with W.rand: 'uniform' (default) every live card equally likely,
  // 'volume' in proportion to 1 + its public trade count over the last 4 weeks. Unattended cards get no new orders from that
  // bot that week (book orders, sealed auction bids, research), and the draw never reads its network or hidden values.
  attention: 0, attentionMemory: 8, attentionSample: 'uniform',
  messages: false, // AI bots may talk: one public board post and two private messages a week (280 characters each)
  messageLimits: { public: 1, direct: 2, chars: 280 },
  guideOn: false, guideEvery: 4, guideLag: 1, // a public price guide: each player's value, re-published every guideEvery weeks as of guideLag weeks earlier; bots and dealers see the same (old run files' priceGuide object is mapped onto these)
  gameFloor: { need: 4, legs: 3 }, // NOT READ ANYWHERE: a leftover setting with no effect (no difficulty minimum is applied)
  leagueUpdates: false, // TEST ONLY: every updateEvery weeks some players' hidden values move, as a real upload would
  updateEvery: 40,
  population: 250, // non-AI bots at the start
  brain: 'nn', // 'nn': each bot is two small neural networks with random weights; 'genome': the older strategy-genome bots
  nnMutation: 0.15, // weight noise when a bot copies a better bot's networks (standard deviation per weight)
  nnReset: 0.01, // chance each copied weight is redrawn from scratch instead (bigger jumps)
  // ASSUMPTIONS: nnResetScale, the sd of a redrawn weight (1; 'layer': its layer's initialization scale 1/√fan-in, about
  // 6× smaller on the card network's first layer); nnWidenScale, the sd of the new weights when a network is widened for the guide
  nnResetScale: 1, nnWidenScale: 0.1,
  nnResearchError: 0.2, // ASSUMPTION (not measured): how far a neural bot's research note can be off the hidden value (log-normal sd); sets how much information is worth
  nnFitnessGens: 6, // fitness = the mean return over this many generations (a longer window rewards consistency over luck)
  nnStartBias: 0, // newborn networks lean toward doing nothing: this is subtracted from the buy, sell, pack and borrow outputs' starting bias
  practiceGens: 3, // before the market opens, the bots play this many generations in a private practice market with the same rules and open with what they learned // neural bots are ranked by their average return over this many generations
  social: { sharer: 0.45, reciprocator: 0.35, thief: 0.2 }, // social style shares among rule bots
  // Tactic tracker (measurement only, frame.gen.tactics): each generation every bot's profile of what it actually did
  // (trades and their prices against the mark, guide and its own notes, holding period, cash, concentration, loans, shorts,
  // packs, auctions, counterparties) is clustered; a cluster within tacticMatch (RMS distance in the generation's standard
  // deviations) of a tactic of the last generation keeps its id, else a new tactic is born. tacticWindow: generations a
  // trend must last to flag crowding (share up, return down) or cannibalization. Changes nothing in the world.
  tactics: true, tacticMatch: 1, tacticWindow: 2, tacticKMax: 8,
  // ASSUMPTIONS: constants not measured from the save, named here so they are visible, changeable and written into every
  // run file (docs/MODEL.md, "Assumptions"; the page's Rules, "Assumptions"). Defaults are the values the code always used.
  concentrationFree: 3, concentrationSlope: 0.06, // worth() and fitness count copies of one card beyond concentrationFree at 1 ÷ (1 + slope × the excess): a big holding is harder to sell
  itemHaircut: 0.9, // a one-of-a-kind item counts at this share of its mark in worth, fitness value and loan collateral (harder to sell)
  hotVolWeeks: 20, hotRetWeeks: 4, hotFloor: 0.2, // the most-traded list counts trades over hotVolWeeks; under hotRank 'momentum' × max(hotFloor, 1 + the hotRetWeeks return)
  moodWeeks: 8, // the market drawdown every bot reads is the Vault index's fall from its peak over this many weeks
  rsMaxGap: 52, rsWindow: 104, rsClamp: 2, rsSmooth: 1e-3, // repeat-sales Vault index (bots and entry read it): longest gap paired (weeks), weeks solved, clamp on a pair's log change, smoothness between neighbouring weeks
  outsideSaveWeeks: 4, // outsideMode 'budget': unspent collector money waits up to this many weeks' worth
  newcomerCashSd: 0.5, // a newcomer's cash = startCash × exp(this × a normal draw): created money, log-normal spread
  lastSeasonMinGames: 4, // a real player's opening per-game rates come from his last real season only if he played this many games in it; else from his career
  entryAgeFallback: 23, // the save has no ages: each player's entry age is a random draw from real NFL rookie ages (nfl_age.json), this if those are missing
  injuryPoolMin: 3, // a position with fewer injured seasons than this in the save draws spell lengths from all positions (W.L.injuryFallback lists them)
  championWeight: 'production', // Super Bowl champion: a club drawn in proportion to its card players' season production ('production'), or evenly among clubs with active card players ('equal')
  awardWinner: 'top', // MVP, OPOY, DPOY go to the top producer at the drawn position (the only rule; the save's winners ranked 0.90–0.98 within position on average)
  rookieS0Fallback: 20, rookieOvr: 62, // a rookie's print run is the median S0 at his position (rookieS0Fallback if none); his OVR until his first values; he inherits his template player's skill and grade
  formBlendSeasons: 2, // valueBasis 'form': each card moves from career OVR to form OVR over this many seasons after the open
  impliedVolumeWeight: 2, // a player's implied price weights each of his card markets by copies out + this × last week's trades
  gamePaid: { valuation: 0.2, prediction: 0.1, blindRank: 0.25, closest: 0.25, keepCut: 0.25, imposter: 0.25, grid: 0.25, higherLower: 0.25, overUnder: 0.25, duel: 0 }, // share of entrants paid in each contest (0: one winner, or the duel's pair rule)
};
// Every setting that is an assumption (not measured from the save), with what it decides: the page's Rules list it under
// "Assumptions" with the running values, and docs/MODEL.md's Assumptions table follows it
export const ASSUMPTIONS = [
  ['printRunK', 'Print run: copies out at the open = max(printRunMin, round(printRunK ÷ max(printRunValueFloor, value ÷ printRunUnit)^printRunExp)): every card\'s scarcity'],
  ['printRunExp', 'Print run: how fast copies fall as value rises (0.5: a square-root law)'], ['printRunMin', 'Print run: the fewest copies of any card'],
  ['printRunValueFloor', 'Print run: the lowest value ÷ printRunUnit the formula uses, which caps the most copies'], ['printRunUnit', 'Print run: the value unit (coins)'],
  ['poolMultiplier', 'Unminted copies in the pool = copies out at the open × this: how long packs can mint'],
  ['packsPerWeek', 'Packs released a week (from an earlier simulation\'s purchases, not the save)'], ['packMix', 'Share of the released packs of each type'],
  ['startCash', 'A bot\'s opening cash'], ['newcomerCashSd', 'Spread (log sd) of a newcomer\'s cash around startCash: created money'],
  ['concentrationFree', 'Copies of one card counted at full mark in worth and fitness'], ['concentrationSlope', 'Haircut per copy beyond concentrationFree: 1 ÷ (1 + slope × excess)'],
  ['itemHaircut', 'Share of its mark a one-of-a-kind item counts for in worth, fitness value and collateral'],
  ['passesPerWeek', 'Research passes granted to every bot each week'], ['passLife', 'Weeks before an unused pass expires'], ['maxResearchPerWeek', 'Most players one bot may research in a week'],
  ['knowledgeWeeks', 'Weeks before a research note goes stale'], ['memoryCap', 'Most notes one bot keeps'], ['nnResearchError', 'Log-normal error of a neural bot\'s research note around hidden value: how much information is worth'],
  ['notesPerSwap', 'Freshest notes each side gives in a swap'], ['notesPerTheft', 'Freshest notes a theft copies'], ['detectChance', 'Chance a theft is noticed'], ['guardChance', 'Chance a theft from a bot that flagged the thief is stopped'],
  ['gamePaid', 'Share of entrants paid in each contest: how skewed winnings are'],
  ['lifespan', 'A bot\'s life in generations, drawn uniformly'], ['aiLifespanWeeks', 'An AI bot\'s life in weeks, drawn uniformly (AI bots only)'],
  ['nnResetScale', 'Sd of a weight redrawn in mutation (\'layer\': its layer\'s 1/√fan-in)'], ['nnWidenScale', 'Sd of the new weights when a network is widened for the price guide'],
  ['hotVolWeeks', 'Rule bots\' hot list: weeks of trades counted'], ['hotRetWeeks', 'Rule bots\' hot list: weeks of return counted'], ['hotFloor', 'Rule bots\' hot list: floor on the return factor'],
  ['moodWeeks', 'Weeks of the Vault index the market drawdown (a bot input) is measured over'],
  ['rsMaxGap', 'Vault index: longest gap (weeks) between two sales of a card that are paired'], ['rsWindow', 'Vault index: weeks solved each week'], ['rsClamp', 'Vault index: clamp on a pair\'s log change'], ['rsSmooth', 'Vault index: smoothness between neighbouring weeks'],
  ['impliedVolumeWeight', 'A player\'s implied price weights each card market by copies out + this × last week\'s trades'],
  ['outsideSaveWeeks', 'outsideMode \'budget\': weeks of budget unspent collector money can save'],
  ['gameNoise', 'Log-normal spread of a game\'s yards around the per-game rate (the save has season totals only)'],
  ['lastSeasonMinGames', 'Games in the last real season needed to open on its rates rather than the career\'s'],
  ['entryAgeFallback', 'Entry age if the NFL age data is missing (real players\' ages are random draws from NFL rookie ages: the save has none)'],
  ['injuryPoolMin', 'Injured seasons a position needs to draw spell lengths from its own'],
  ['championWeight', 'How the Super Bowl champion club is drawn: by its card players\' production, or evenly'],
  ['awardWinner', 'MVP, OPOY and DPOY go to the top producer at the drawn position'],
  ['rookieS0Fallback', 'A rookie\'s print run if his position has no players (else its median)'], ['rookieOvr', 'A rookie\'s OVR until his first values (he inherits his template player\'s skill and grade)'],
  ['formBlendSeasons', 'Seasons over which a card moves from career OVR to form OVR after the open'],
  ['lossRate', 'Share of copies lost a season'], ['entryHype', 'Newcomers after Vault index rallies'], ['entryReturns', 'Newcomers after good median returns'], ['entryNews', 'Newcomers after league news'], ['hypeInjury', 'Extra injury chance after a value rise'],
];

export const ARCH = [
  { key: 'value', label: 'Value', short: 'VAL', color: '#3987e5', blurb: 'Strongest gene: the gap between its notes and the price.' },
  { key: 'mm', label: 'Market maker', short: 'MM', color: '#d95926', blurb: 'Quotes a bid and an ask on a handful of cards and earns the spread.' },
  { key: 'momentum', label: 'Momentum', short: 'MOM', color: '#199e70', blurb: 'Buys what is rising, sells what is falling. Sells its research passes.' },
  { key: 'retail', label: 'Herd', short: 'HRD', color: '#c98500', blurb: 'Rips packs, chases hot cards, panic-sells when the market drops.' },
  { key: 'arb', label: 'Pack arbitrage', short: 'ARB', color: '#d55181', blurb: 'Rips packs when their pulls sell for more than the pack costs, then flips them.' },
  { key: 'collector', label: 'Collector', short: 'COL', color: '#008300', blurb: 'Researches and hoards two favourite players. Can corner a card.' },
  { key: 'contrarian', label: 'Contrarian', short: 'CTR', color: '#9085e9', blurb: 'Buys sharp drops below the recent average, sells the bounce.' },
  { key: 'ai', label: 'AI bots', short: 'AI', color: '#e66767', blurb: 'An LLM decides: research, orders, packs, passes, notes. Run by sandbox/run.mjs.' },
  { key: 'nn', label: 'Neural', short: 'NN', color: '#3987e5', blurb: 'Two small neural networks with random starting weights decide everything; what earns money is copied.' },
];
export const AI = 7, NN_KIND = 8;
// Bots are compared by wealth, not by strategy: each week every bot is placed in one of three groups by its worth
export const GROUPS = [{ key: 'top', label: 'Top 10%', color: '#e66767' }, { key: 'mid', label: 'Next 40%', color: '#c98500' }, { key: 'low', label: 'Bottom 50%', color: '#3987e5' }];
export const OVR_BANDS = [{ label: 'under 70', lo: 0 }, { label: '70–79', lo: 70 }, { label: '80–84', lo: 80 }, { label: '85–89', lo: 85 }, { label: '90–94', lo: 90 }, { label: '95+', lo: 95 }];
export const FINISH_MULTS = [1, 1.5, 2.5, 6], DESIGN_MULTS = [1, 1.2, 1.8, 2.5, 1];
export const bandOf = (ovr) => { let k = 0; for (let i = 0; i < OVR_BANDS.length; i++) if ((ovr ?? 60) >= OVR_BANDS[i].lo) k = i; return k; };

/* ---------- Random ---------- */
// The stream ids: a stream's seed is seed × 7919 + its id. mulberry32 walks one cycle of 2^32 states, so two streams are
// the same sequence shifted; these ids put every pair at least 0.22 × 2^32 (about 960 million draws) apart on it, for
// every run seed (the seed term cancels). market 17 is the old shared stream; display 29 is the trade-arc sample (W.drand)
export const RNG_STREAMS = { market: 17, league: 171, people: 313, display: 29 };
function rngStream(seed) { const rand = seeded(seed); return {
  rand, gauss: () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
  pick: (a) => a[Math.floor(rand() * a.length)],
  shuffle: (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }, // seeded Fisher-Yates: every order equally likely (a random-comparator sort is not)
}; }
// Run f with W.rand, W.gauss, W.pick and W.shuffle drawing from stream S (for code deep in shared helpers, such as a
// newcomer's new networks); restored after. With rngStreams 'single' every stream is the market's, so it changes nothing
function onStream(W, S, f) { if (S === W.rngMarket) return f(); const o = [W.rand, W.gauss, W.pick, W.shuffle]; W.rand = S.rand; W.gauss = S.gauss; W.pick = S.pick; W.shuffle = S.shuffle; try { return f(); } finally { [W.rand, W.gauss, W.pick, W.shuffle] = o; } }
export const rngLayout = (cfg) => ({ mode: cfg.rngStreams === 'single' ? 'single' : 'split', seedRule: 'seed * 7919 + id', ids: cfg.rngStreams === 'single' ? { all: RNG_STREAMS.market, display: RNG_STREAMS.display } : { ...RNG_STREAMS }, diagnostics: 'private prng, fixed seeds' });
function seeded(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
// The print run (an assumption, see DEFAULTS): copies in circulation at the open for a player whose site value is v.
// √ is computed as Math.sqrt at the default exponent so the result is bit-identical to the old inline formula.
export function printRun(cfg, v) { const x = Math.max(cfg.printRunValueFloor, v / cfg.printRunUnit), e = cfg.printRunExp; return Math.max(cfg.printRunMin, Math.round(cfg.printRunK / (e === 0.5 ? Math.sqrt(x) : Math.pow(x, e)))); }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- World ---------- */
// One spelling per setting: older run files and presets wrote some as nested objects (priceGuide, cashShocks, adapt); they
// are mapped onto the flat keys the engine and the page's controls read (a flat key already given wins)
function canonCfg(o) {
  const x = { ...o }, pg = x.priceGuide, cs = x.cashShocks, ad = x.adapt; delete x.priceGuide; delete x.cashShocks; delete x.adapt; delete x.lenderCycle; // lenderCycle: dead code, removed
  if (pg && typeof pg === 'object') { x.guideOn ??= pg.on; x.guideEvery ??= pg.every; x.guideLag ??= pg.lag; }
  if (cs && typeof cs === 'object') { x.cashShockChance ??= cs.chance; x.cashShockSize ??= cs.size; }
  if (ad && typeof ad === 'object') { x.adaptOn ??= ad.on; x.adaptEvery ??= ad.every; x.adaptSize ??= ad.size; }
  for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k];
  return x;
}
export function createWorld(library, overrides = {}) {
  overrides = canonCfg(overrides);
  const cfg = { ...DEFAULTS, ...overrides, social: { ...DEFAULTS.social, ...(overrides.social || {}) } };
  if (cfg.outsideCollectors && cfg.outsideMode === 'band') throw new Error("outsideMode 'band' is retired (it destroyed the copies it bought and paid in new coins at hidden value): use 'value' or 'budget'");
  if (cfg.rngStreams !== 'split' && cfg.rngStreams !== 'single') throw new Error(`rngStreams must be 'split' or 'single', not ${JSON.stringify(cfg.rngStreams)}`);
  const S0 = (id) => cfg.seed * 7919 + id, mk = rngStream(S0(RNG_STREAMS.market)), split = cfg.rngStreams === 'split', rand = mk.rand, lib0 = library;
  if (fullLeague(cfg)) library = { ...library, players: library.players.slice() }; // generated players go into this world's own list, never the caller's (a practice world shares it)
  packCache = null; hot = []; mood = { drop: 0 }; // module state belongs to the newest world
  const W = {
    cfg, rand, t: 0, nextId: 1, cards: [], bots: [], events: [], arcsWeek: [], liq: new Map(),
    house: { fees: 0, packs: 0, outside: 0, royalties: 0 }, lastTrades: 0, passPrice: null, passTrades: 0,
    hist: { p: [], f: [], bub: [], gini: [], share: [], trades: [], money: [], pass: [], informed: [], flags: [], shares: [], thefts: [], gamePacks: [] },
    contests: null, predictions: [], gameStats: null, gameArch: null, gamePacksWeek: 0,
    tickets: true, ticketPrice: null, ticketTrades: 0, auctions: [], auctionResults: [], journal: [], board: [],
    treasury: 0, flow: null, botLog: new Map(),
    cool: {}, cornered: new Set(), bubbleOn: false, week: { shares: 0, thefts: 0, caught: 0, researched: new Map() },
    library,
  };
  if (cfg.government) govSetup(W); // a government run (regulated preset): refuses a world without the pinned settings
  W.guideNet = !!guideOn(cfg); useShape(W);
  W.byPos = {}; W.libIndex = new Map(); W.byKey = new Map(); W.mktByKey = new Map(); W.items = new Map(); W.liqItems = [];
  W.kitInfo = library.kits?.kits || null; W.kitMeta = library.kits || null;
  if (!(W.kitMeta?.autographMeanMult > 0)) throw new Error('library.kits.autographMeanMult is missing (data/kits.json): pack prices need the autograph mean multiplier');
  library.players.forEach((p, i) => { (W.byPos[p.pos] ||= []).push(p); W.libIndex.set(p, i); });
  // W.rand, W.gauss, W.pick and W.shuffle are the market's stream (most of the code); the league and people draw from their own
  W.rngMarket = mk; W.rngLeague = split ? rngStream(S0(RNG_STREAMS.league)) : mk; W.rngPeople = split ? rngStream(S0(RNG_STREAMS.people)) : mk;
  W.gauss = mk.gauss; W.pick = mk.pick; W.shuffle = mk.shuffle;
  W.rngLayout = rngLayout(cfg); // the stream layout this world was built with (run files record it)
  W.drand = seeded(S0(RNG_STREAMS.display)); // a private stream for display-only sampling, so a measurement never shifts the world's draws
  // Players hold the player-level facts; each has 16 card markets (4 designs × 4 finishes). A player's F is the
  // intrinsic value of his Prizm Base card: the site's price for it (card value)
  W.players = [];
  library.players.forEach((p, i) => {
    const F = Math.max(W.cfg.coinScale * 0.05, p.hidden.value / W.cfg.valueDivisor), S0 = printRun(cfg, p.hidden.value);
    W.players.push({ id: i, key: p.key, name: p.name, pos: p.pos, team: teamShort(p.team), F, F0: F, P: F, P0: F, S0, circ: 0, pool: S0 * cfg.poolMultiplier, Ph: [F], volH: [], isPlayer: true });
  });
  for (const c of W.players) W.byKey.set(c.key, c);
  W.families = familyList(library);
  library.players.forEach((p, i) => (W.players[i].fam = familyIndex(W.families, p)));
  startTimeline(W);
  if (fullLeague(cfg)) fillLeague(W);
  W.botK = cfg.botScale === 'cards' ? (W.fillK ?? 1) : 1; // bots follow the cards too (botScale)
  for (const p of W.players) for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) { const m = makeMarket(W, p, d, f); W.cards.push(m); W.mktByKey.set(m.key, m); }
  seedHistory(W);
  for (let k = 0, n = popOf(W); k < n; k++) W.bots.push(newBot(W, null));
  // A practice season: the same bots' networks first play cfg.practiceGens generations in a private market with the
  // same rules (another seed); the real market opens with the networks that came out of it
  if (cfg.practiceGens > 0 && cfg.brain === 'nn' && W.bots.length && (cfg.practiceWorlds ?? 1) > 1) practiceMany(W, lib0, overrides);
  else if (cfg.practiceGens > 0 && cfg.brain === 'nn' && W.bots.length) {
    const P = createWorld(lib0, { ...overrides, seed: (cfg.seed || 88) * 7919 + 1, practiceGens: 0 });
    const T = cfg.practiceGens * cfg.weeksPerGeneration; for (let t = 0; t < T; t++) { step(P); if (PRACTICE_HOOK) PRACTICE_HOOK(t + 1, T); }
    const pb = P.bots.filter((b) => b.g?.nn).sort((x, y) => (y.fit ?? 0) - (x.fit ?? 0));
    W.bots.forEach((b, i) => { const s = pb[i % pb.length]; if (s && b.g?.nn) b.g = { ...s.g, card: Float64Array.from(s.g.card), bot: Float64Array.from(s.g.bot), w: { ...s.g.w }, targets: [], book: [] }; });
    W.practice = { gens: cfg.practiceGens, endIndex: P.hist.p[P.hist.p.length - 1], endPF: bubble(P) };
    packCache = null; packCacheT = null; hot = []; mood = { drop: 0 };
  }
  if (W.bots.length) endow(W, W.bots);
  for (const b of W.bots) { b.nwh = [worth(W, b)]; b.genStart = b.nwh[0]; b.exo = 0; }
  if (cfg.games) { publishContests(W); publishContests(W); } // this week's contests and the ones two weeks out
  if (W.gov) govOpen(W); // the opening dials and the opening grant (week 0)
  record(W);
  log(W, 'start', `The market opens${W.seasonLabel ? ` in ${W.seasonLabel}` : ''}: ${W.bots.length} bots, ${W.players.filter((p) => p.on !== false).length} players, ${(W.cards.reduce((s, c) => s + c.circ, 0) + W.items.size).toLocaleString()} cards in circulation (${W.items.size} one of a kind) and ${W.players.reduce((s, c) => s + c.pool, 0).toLocaleString()} still in the pool. Every card opens at the site's price for it.`);
  return W;
}
// Practice on several worlds (practiceWorlds > 1): one set of networks plays every private world each generation; each
// network's score is its fitness averaged over the worlds it is still in; the worst evolveShare copy the best (mutated, with
// world 0's generator); the market opens with the networks ranked by that score, as with one world
function practiceMany(W, library, overrides) {
  const cfg = W.cfg, K = cfg.practiceWorlds, wpg = cfg.weeksPerGeneration, T = K * cfg.practiceGens * wpg; let done = 0;
  const ov = { ...overrides, practiceGens: 0, practiceWorlds: 1, turnover: false, mortality: false, evolve: false, adaptOn: false, populationFloor: 0 };
  const Ps = Array.from({ length: K }, (_, j) => createWorld(library, { ...ov, seed: (cfg.seed || 88) * 7919 + 1 + j * 104729 }));
  const copyG = (g) => ({ ...g, card: Float64Array.from(g.card), bot: Float64Array.from(g.bot), w: { ...g.w }, targets: [], book: [] });
  let nets = new Map(Ps[0].bots.filter((b) => b.g?.nn).map((b) => [b.id, b.g])), score = new Map();
  for (let g = 0; g < cfg.practiceGens; g++) {
    for (const P of Ps) for (const b of P.bots) { const n = nets.get(b.id); if (n) b.g = copyG(n); }
    for (const P of Ps) for (let t = 0; t < wpg; t++) { step(P); if (PRACTICE_HOOK) PRACTICE_HOOK(++done, T); }
    const next = new Map(); score = new Map();
    for (const id of nets.keys()) { const fs = Ps.map((P) => P.bots.find((b) => b.id === id)).filter(Boolean); if (!fs.length) continue; next.set(id, fs[0].g); score.set(id, fs.reduce((a, b) => a + (Number.isFinite(b.fit) ? b.fit : 0), 0) / fs.length); }
    const ids = [...score.keys()].sort((a, b) => score.get(b) - score.get(a)), n = Math.max(1, Math.round(ids.length * cfg.evolveShare));
    if (g < cfg.practiceGens - 1 && cfg.evolve && ids.length > 4) { const best = ids.slice(0, n); for (const id of ids.slice(-n)) next.set(id, mutate(Ps[0], next.get(Ps[0].pick(best)))); }
    nets = next;
  }
  const ranked = [...score.keys()].sort((a, b) => score.get(b) - score.get(a)).map((id) => nets.get(id));
  W.bots.forEach((b, i) => { const s = ranked[i % ranked.length]; if (s && b.g?.nn) b.g = copyG(s); });
  W.practice = { gens: cfg.practiceGens, worlds: K, endIndex: Ps.map((P) => r2(P.hist.p[P.hist.p.length - 1])), endPF: Ps.map((P) => r2x(bubble(P))) };
  packCache = null; packCacheT = null; hot = []; mood = { drop: 0 };
}
export function teamShort(t) { const w = String(t || 'FA').split(' '); return t === 'Free agent' ? 'FA' : w[w.length - 1]; }

// AI bots join on equal terms: the same starting cash plus a basket as big as the average rule bot's, minted from the pool.
export function addAiBot(W, extra = {}) {
  const b = onStream(W, W.rngPeople, () => newBot(W, AI, null, { social: extra.social || 'reciprocator', ...extra })); // entry draws: the people stream
  const lw = W.cfg.aiLifespanWeeks; if (lw) { b.lifespanW = lw[0] + Math.floor(W.rngPeople.rand() * (lw[1] - lw[0] + 1)); }
  b.line = extra.line || 1;
  const rule = W.bots.filter((x) => x.kind === 'rule'), avg = rule.length ? Math.round(rule.reduce((s, x) => s + x.n, 0) / rule.length) : 0;
  for (let k = 0; k < avg; k++) { const pk = packInfo(W, 'standard'); if (!pk.tot) break; const p = drawTier(W, pk, PACK_TYPES.standard.tiers, wpick(W, PACK_TYPES.standard.tiers), new Map()); if (!p) break; const x = rollCopy(W, p, 'standard'); mintCopy(W, b, x, p.P * copyMult(x)); } // cost basis at the public price, never the hidden value
  packCache = null; packCacheT = null;
  W.bots.push(b); led(W, 'newcomers', b.cash); b.nwh = [worth(W, b)];
  return b;
}

// Two bots can't deal with each other while either has flagged the other as a thief
const blocked = (a, b) => !!a && !!b && typeof a === 'object' && typeof b === 'object' && (a.flags?.has(b.id) || b.flags?.has(a.id));
function give(b, c, q) { const v = (b.h.get(c.id) || 0) + q; v > 0 ? b.h.set(c.id, v) : b.h.delete(c.id); b.n += q; }
// What a bot could actually sell for this week (fitnessValue 'bid', for fitness only): each copy fills one standing bid of
// another bot, highest first; copies beyond the bids are valued at the lower of the mark and the player's latest card-auction
// price within compsWeeks (brought to this card by its multiplier), or at the mark with worth()'s concentration haircut.
// Cash, debt, money lent and one-of-a-kind cards as in worth().
function realValue(W, b, st) {
  const cfg = W.cfg, fee = cfg.fee, k = cfg.compsWeeks ?? 4; let v = b.cash - (b.debt || 0) + (b.lent || 0) - arrearsOf(b);
  for (const [id, q] of b.h) { const c = W.cards[id], hc = haircut(cfg, q), bs = typeof bids !== 'undefined' && bids?.[id] ? leftBids(c).filter((o) => o.b !== b) : [];
    let n = 0; for (; n < q && n < bs.length; n++) v += bs[n].p * (1 - fee);
    const rest = q - n; if (rest > 0) { const p = W.players[c.pid], auc = p.aucBaseT != null && W.t - p.aucBaseT < k ? p.aucBaseP * c.mult : null; v += rest * (auc != null ? Math.min(c.P, auc) : c.P * hc) * (1 - fee); if (st) st.noBid += rest; }
    if (st) st.copies += q; }
  for (const it of heldItems(W, b)) v += markItem(W, it) * (1 - fee) * cfg.itemHaircut;
  return v;
}
const r2x = (x) => Math.round(x * 10000) / 10000;
// The concentration haircut (an assumption, see DEFAULTS): q copies of one card count as q × this each
const haircut = (cfg, q) => (q <= cfg.concentrationFree ? 1 : 1 / (1 + cfg.concentrationSlope * (q - cfg.concentrationFree)));
export function worth(W, b) {
  let v = b.cash - (b.debt || 0) + (b.lent || 0) - arrearsOf(b); // bills it owes count as a debt
  for (const [id, q] of b.h) { const c = W.cards[id]; const hc = haircut(W.cfg, q); v += q * c.P * (1 - W.cfg.fee) * hc; }
  for (const it of heldItems(W, b)) v += markItem(W, it) * (1 - W.cfg.fee) * W.cfg.itemHaircut; // one of a kind: harder to sell (itemHaircut, an assumption)
  if (b.lentOut) for (const [id, q] of b.lentOut) v += q * W.cards[id].P * (1 - W.cfg.fee); // cards lent out are still yours
  if (b.owed) for (const [id, q] of b.owed) v -= q * W.cards[id].P; // borrowed cards must be bought back
  return v + (b.shortColl || 0);
}
const fresh = (W, n) => n && W.t - n.week <= W.cfg.knowledgeWeeks;
// Notes are kept per player (his Prizm Base card); for any other card the estimate scales by its rarity premium
export const estimate = (W, b, c) => { const n = b.notes.get(c.isPlayer === false ? c.pid : c.id); return fresh(W, n) ? n.est * (c.isPlayer === false ? c.mult : 1) : null; };
const playerOf = (W, c) => (c.isPlayer === false ? W.players[c.pid] : c);
const est = (W, b, c) => estimate(W, b, c) ?? c.P;
const ret = (c, L) => c.P / c.Ph[Math.max(0, c.Ph.length - 1 - L)] - 1;
const ma = (c, L) => { const h = c.Ph, n = Math.min(L, h.length); let s = 0; for (let i = h.length - n; i < h.length; i++) s += h[i]; return s / n; };
const recentVol = (c, L = 60) => { let s = 0; for (let i = Math.max(0, c.volH.length - L); i < c.volH.length; i++) s += c.volH[i]; return s; };

/* ---------- Library ---------- */
// What a research pass reveals: the full page minus the hidden value.
export function libraryPage(W, cardId) {
  const p = W.library.players[cardId];
  const { hidden, hallOfFame, stats, rates, ...page } = p;
  const e = W.era?.[cardId];
  if (!e) return { ...page, stats, rates };
  const risk = W.cfg.valueModel === 'ovrWalk' ? riskRating(W, W.players[cardId]) : null; // only where the rating sets the walk's odds: elsewhere rating − OVR is 10 × log2(F/F0), the hidden value
  return { ...page, asOf: W.seasonLabel || W.timeline.seasons[0].season, ovr: e.ovr, skill: e.skill, grade: e.grade, careerLegacy: e.legacy, careerTotals: e.totals, perGame: e.perGame, ...(risk != null ? { riskRating: Math.round(risk), weeklySwingPct: Math.round(walkVol(W, risk) * 1000) / 10 } : {}) };
}
function writeNote(W, b, c, estValue, from, facts) {
  b.notes.set(c.isMkt ? c.pid : c.id, { est: c.isMkt ? estValue / c.mult : estValue, week: W.t, from, ...(facts ? { facts: String(facts).slice(0, 240) } : {}) });
  if (W.cfg.memoryCap > 0 && b.notes.size > W.cfg.memoryCap) { // the old count wall (memoryCap 0: notes expire by age instead, in step)
    let oldest = null; for (const [id, n] of b.notes) if (!oldest || n.week < oldest[1].week) oldest = [id, n];
    b.notes.delete(oldest[0]);
  }
}
function research(W, b, c0) {
  const c = playerOf(W, c0);
  b.stats.researched++;
  jot(W, { type: 'research', bot: b.name, player: c.key });
  W.week.researched.set(c.id, (W.week.researched.get(c.id) || 0) + 1);
  // A rule bot's "analysis" is the hidden value seen through its own error. An AI bot writes its own estimate.
  // It also keeps what the page showed (career rates, totals, Career Legacy, play-style family), seen through the same
  // error (z): what its contest answers are computed from
  if (b.kind === 'rule') { const z = W.gauss(); writeNote(W, b, c, (W.cfg.priceOnly ? ma(c, 20) : c.F) * Math.exp(z * b.g.err), 'research'); const n = b.notes.get(c.id); if (n) { const e = eraOf(W, c.id); n.ovr = W.era?.[c.id]?.ovr ?? W.library.players[c.id].ovr; if (W.cfg.valueModel === 'ovrWalk') n.risk = riskRating(W, c); n.z = z; n.lib = { pg: { ...(e.perGame || {}) }, tot: { ...(e.totals || {}) }, leg: e.legacy ?? 0, fam: c.fam }; } }
}
function usePass(W, b) { if (!b.passes.length) return false; b.passes.sort((x, y) => x - y); b.passes.shift(); return true; }


/* ---------- Rarities: the site's card designs, finishes, kits, parallels and autographs ---------- */
// Every table below is copied from the site (src/utils/collection.ts, src/utils/cardMarket.ts, src/config/autographs.ts).
// A player has 16 tradable card markets (4 designs × 4 finishes, home kit, no parallel). Any copy that is one of a kind
// (an autograph, a Prizm colour parallel, an alternate or throwback kit) is an item, traded only at auction.
export const DESIGNS = ['Prizm', 'Jersey', 'Topps', 'Locker', 'Autograph'];
export const FINISHES = ['Base', 'Silver', 'Gold', 'Holo'];
const FINISH_MULT = [1, 1.5, 2.5, 6], DESIGN_MULT = [1, 1.2, 1.8, 2.5, 1];
const TIERS = ['common', 'rare', 'epic', 'legendary'];
export const PACK_TYPES = {
  standard: { label: 'Standard', size: 3, tiers: [75, 18, 6, 1], fin: [[86.5, 11.2, 2, 0.3], [87, 10.8, 1.95, 0.25], [88, 10, 1.8, 0.2], [89, 9.5, 1.4, 0.1]], des: [44, 29, 15, 8.5, 3.5], kit: [0.08, 0.025], prizm: [0.08, 0.04, 0.018, 0.0045, 0.0002] },
  premium: { label: 'Premium', size: 4, tiers: [66, 24, 8.5, 1.5], fin: [[80, 15, 4.5, 0.5], [81, 14.5, 4.1, 0.4], [82, 14, 3.7, 0.3], [84, 13, 2.8, 0.2]], des: [40, 29, 17, 10, 4], kit: [0.09, 0.03], prizm: [0.085, 0.045, 0.021, 0.0055, 0.00025], silverPlus: true },
  elite: { label: 'Elite', size: 5, tiers: [52, 30, 15, 3], fin: [[74, 20, 5.5, 0.5], [75, 19.5, 5, 0.5], [77, 18, 4.6, 0.4], [80, 16, 3.7, 0.3]], des: [36, 28, 19, 12, 5], kit: [0.1, 0.035], prizm: [0.09, 0.05, 0.024, 0.0065, 0.0003], epicPlus: true },
  holo: { label: 'Holo Showcase', size: 5, tiers: [52, 30, 15, 3], fin: [[74, 20, 5.5, 0.5], [75, 19.5, 5, 0.5], [77, 18, 4.6, 0.4], [80, 16, 3.7, 0.3]], des: [32, 28, 20, 13.5, 6.5], kit: [0.12, 0.045], prizm: [0.095, 0.055, 0.027, 0.008, 0.0004], oneHolo: true },
};
const STACK = { 2: [[1, 0.9, 0.8, 0.7], [1, 0.9, 0.8, 0.7]], 3: [[1, 0.85, 0.7, 0.55], [1, 0.85, 0.7, 0.55]], 4: [[1, 0.65, 0.45, 0.15], [1, 0.65, 0.5, 0.5]] }; // [tier factors, finish factors]
const COMBO_AUTO_LEG_HOLO = 0.15;
const KIT_BONUS = { home: 1, alt: 1.2, era: 1.4 };
const PRIZM = [{ c: 'Red', run: 199, m: 1.3 }, { c: 'Blue', run: 99, m: 1.6 }, { c: 'Green', run: 49, m: 2 }, { c: 'Gold', run: 10, m: 3.5 }, { c: 'Black', run: 1, m: 8 }];
const AUTO_PAR = [{ id: 'Sticker', run: 99, w: 50, m: 3 }, { id: 'On-card', run: 50, w: 27, m: 5 }, { id: 'Inscribed', run: 25, w: 13, m: 6 }, { id: 'Patch', run: 10, w: 8, m: 10 }, { id: 'Cut 1/1', run: 1, w: 2, m: 40 }];
const INKS = [['Ballpoint black', 10, 0.9], ['Ballpoint blue', 10, 0.95], ['Sharpie black', 22, 1], ['Sharpie blue', 14, 1.1], ['Felt tip, team colour', 16, 1.2], ['Paint pen silver', 12, 1.3], ['Broad nib navy', 6, 1.4], ['Broad nib oxblood', 5, 1.5], ['Paint pen gold', 5, 1.6]];
const INSCRIBE = { nickname: 1.3, hof: 1.25, mvp: 1.2, champ: 1.15 }, INSCRIBE_CHANCE = 0.12, THROWBACK = { chance: 0.06, mult: 1.25 };
const serialMult = (n, of) => (of === 1 ? 1 : n === 1 ? 1.5 : n === of ? 1.2 : 1);
function wpick(W, ws) { const t = ws.reduce((a, b) => a + b, 0); let r = W.rand() * t; for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; } return ws.length - 1; }
// The site's tiers: Legendary = Career Legacy 10,000+; Epic = Hall of Famer (7,500+) or OVR 90+; Rare = OVR 80+
export function tierOf(W, p) { const e = W.era?.[p.id], lg = e?.legacy ?? W.library.players[p.id].careerLegacy ?? 0, ovr = e?.ovr ?? W.library.players[p.id].ovr ?? 60; return lg >= 10000 ? 3 : lg >= 7500 || ovr >= 90 ? 2 : ovr >= 80 ? 1 : 0; }
export const mktId = (pid, d, f) => pid * 16 + d * 4 + f;
// One copy's rarity roll for a known player, with a pack type's odds
function rollCopy(W, p, type, force = {}) {
  const P = PACK_TYPES[type], t = tierOf(W, p);
  const f = force.f ?? wpick(W, P.fin[t]);
  const dw = P.des.map((w, d) => w * (STACK[d] ? STACK[d][0][t] * STACK[d][1][f] : 1) * (d === 4 && t === 3 && f === 3 ? COMBO_AUTO_LEG_HOLO : 1));
  const d = wpick(W, dw);
  if (d === 4) return { pid: p.id, d, f, auto: rollAuto(W, p) };
  const kits = W.kitInfo?.[p.key] || [1, 0], r = W.rand();
  const kit = kits[1] && r < P.kit[1] ? 'era' : kits[0] && r >= P.kit[1] && r < P.kit[1] + P.kit[0] ? 'alt' : 'home';
  let par = null;
  if (d === 0) { let x = W.rand(); for (const pz of PRIZM) { const pr = P.prizm[PRIZM.indexOf(pz)]; if (x < pr) { par = { c: pz.c, run: pz.run, ser: 1 + Math.floor(W.rand() * pz.run), m: pz.m }; break; } x -= pr; } }
  return { pid: p.id, d, f, kit, par };
}
function rollAuto(W, p) {
  const lp = W.library.players[p.id], e = W.era?.[p.id], hof = (e?.legacy ?? lp.careerLegacy ?? 0) >= 7500;
  const ins = [lp.nickname && 'nickname', hof && 'hof', (e?.totals?.mvp ?? lp.stats?.MVP ?? 0) > 0 && 'mvp', (e?.totals?.rings ?? lp.stats?.Rings ?? 0) > 1 && 'champ'].filter(Boolean);
  let par = AUTO_PAR[wpick(W, AUTO_PAR.map((x) => x.w))];
  if ((par.id === 'Cut 1/1' && !hof) || (par.id === 'Inscribed' && !ins.length)) par = AUTO_PAR[1];
  const ink = par.id === 'Cut 1/1' ? INKS[6] : INKS[wpick(W, INKS.map((x) => x[1]))];
  const insc = par.id === 'Inscribed' ? W.pick(ins) : ins.length && W.rand() < INSCRIBE_CHANCE ? W.pick(ins) : null;
  const ser = 1 + Math.floor(W.rand() * par.run), tb = W.rand() < THROWBACK.chance;
  return { par: par.id, run: par.run, ser, ink: ink[0], insc, tb, m: par.m * ink[2] * (insc ? INSCRIBE[insc] : 1) * serialMult(ser, par.run) * (tb ? THROWBACK.mult : 1) };
}
// A copy's value multiplier on top of the player's base (Prizm Base) value, as the site prices it
function copyMult(x) {
  if (x.d === 4) return FINISH_MULT[x.f] * x.auto.m;
  return FINISH_MULT[x.f] * DESIGN_MULT[x.d] * KIT_BONUS[x.kit] * (x.par ? x.par.m * (x.par.ser === 1 && x.par.run > 1 ? 1.15 : 1) : 1);
}
export function itemLabel(W, it) {
  const p = W.players[it.pid];
  if (it.d === 4) return `${p.pos} ${p.name} · ${FINISHES[it.f]} Autograph, ${it.auto.par} ${it.auto.ser}/${it.auto.run}, ${it.auto.ink}${it.auto.insc ? `, inscribed (${it.auto.insc})` : ''}${it.auto.tb ? ', throwback' : ''}`;
  return `${p.pos} ${p.name} · ${FINISHES[it.f]} ${DESIGNS[it.d]}${it.kit !== 'home' ? ` (${it.kit === 'era' ? 'throwback' : 'alternate'} kit)` : ''}${it.par ? `, Prizm ${it.par.c} ${it.par.ser}/${it.par.run}` : ''}`;
}
// Put a rolled copy in a bot's hands: a market copy if it is a plain card, otherwise a one-of-a-kind item
function mintCopy(W, b, x, cost, t = W.t, fromPool = true) {
  const p = W.players[x.pid]; if (fromPool && p.pool <= 0) return null; // the pool first: nothing is counted or woken for a copy that isn't there
  if (W.ord && fromPool) W.ord.minted++; if (p.dorm) wakePlayer(W, p);
  if (fromPool) { p.pool--; if (p.pool === 0) log(W, 'pool', `The pool has run out of ${p.pos} ${p.name} cards.`); }
  if (x.d < 4 && x.kit === 'home' && !x.par) { const m = W.cards[mktId(x.pid, x.d, x.f)]; m.circ++; if (!fromPool) m.S0++; if (b) { give(b, m, 1); addLot(b, m, cost, t); } return m; }
  const it = { uid: `I${(W.itemSeq = (W.itemSeq || 0) + 1)}`, pid: x.pid, d: x.d, f: x.f, kit: x.kit || 'home', par: x.par || null, auto: x.auto || null, mult: copyMult(x), owner: b, cost, last: null };
  it.label = itemLabel(W, it); W.items.set(it.uid, it); (W._itRoyN ||= new Map()).set(it.uid, W._royN || 0); if (b) (b.items ||= new ItemSet()).add(it.uid);
  return it;
}
// An item's mark-to-market: its plain card's price × (its premium ÷ the plain card's), not its own trades (an assumption:
// one-of-a-kind items trade too rarely to mark); worth and collateral then take itemHaircut. Intrinsic value: base value × premium
export function markItem(W, it) { const m = W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)]; return (m.P / m.mult) * it.mult; }
export const intrinsicItem = (W, it) => W.players[it.pid].F * it.mult;
// Pack prices: each type's expected intrinsic value of its contents × (1 + edge); the market EV uses traded prices
let packCacheT = null, packCache = null;
function packInfo(W, type = 'standard') {
  if (!packCacheT || packCacheT.t !== W.t) packCacheT = { t: W.t, by: {} };
  const hit = packCacheT.by[type]; if (hit) { if (W.cfg.packSale === 'auction') hit.price = W.packPx?.[type] ?? hit.evMarket; return hit; }
  const P = PACK_TYPES[type], meanAuto = W.kitMeta.autographMeanMult; // checked at world build (no silent fallback)
  // pool-weighted base value and implied base price of each tier
  const tv = [0, 0, 0, 0], tp = [0, 0, 0, 0], tn = [0, 0, 0, 0], byTier = [[], [], [], []], ka = [[0, 0, 0, 0], [0, 0, 0, 0]], ke = [[0, 0, 0, 0], [0, 0, 0, 0]]; // ka/ke: value and price held by players with an alternate / era kit
  for (const p of W.players) { if (p.on === false || p.pool <= 0) continue; const t = tierOf(W, p), kits = W.kitInfo?.[p.key] || [1, 0]; tv[t] += p.pool * p.F; tp[t] += p.pool * p.P; tn[t] += p.pool; byTier[t].push(p); if (kits[0]) { ka[0][t] += p.pool * p.F; ka[1][t] += p.pool * p.P; } if (kits[1]) { ke[0][t] += p.pool * p.F; ke[1][t] += p.pool * p.P; } }
  const tw = P.tiers.map((w, t) => (tn[t] ? w : 0)), twt = tw.reduce((a, b) => a + b, 0) || 1;
  let ev = 0, evP = 0;
  for (let t = 0; t < 4; t++) {
    if (!tw[t]) continue;
    const eOf = (kf) => { let e = 0; P.fin[t].forEach((fw, f) => { const dw = P.des.map((w, d) => w * (STACK[d] ? STACK[d][0][t] * STACK[d][1][f] : 1) * (d === 4 && t === 3 && f === 3 ? COMBO_AUTO_LEG_HOLO : 1)), dt = dw.reduce((a, b) => a + b, 0);
      const de = dw.reduce((s, w, d) => s + (w / dt) * (d === 4 ? meanAuto : DESIGN_MULT[d] * kf * (d === 0 ? 1 + P.prizm.reduce((a, pr, i) => a + pr * (PRIZM[i].m - 1), 0) : 1)), 0);
      e += (fw / 100) * FINISH_MULT[f] * de; }); return e; };
    const kf = (j, tot) => 1 + (tot > 0 ? P.kit[0] * 0.2 * ka[j][t] / tot + P.kit[1] * 0.4 * ke[j][t] / tot : 0); // a kit premium only for the clubs that have that kit, weighted as the draw is
    ev += (tw[t] / twt) * (tv[t] / tn[t]) * eOf(kf(0, tv[t])); evP += (tw[t] / twt) * (tp[t] / tn[t]) * eOf(kf(1, tp[t]));
  }
  const size = P.size, out = { type, size, ev: ev * size, evMarket: evP * size, price: (W.cfg.priceOnly ? evP : ev) * size * (1 + W.cfg.packEdge), byTier, tot: tn.reduce((a, b) => a + b, 0) };
  if (W.cfg.packSale === 'auction') out.price = W.packPx?.[type] ?? out.evMarket;
  packCacheT.by[type] = out; return out;
}
// A player from tier t, by what is left in the pool (taken: copies already drawn for this pack); null if the tier has none left
function drawPlayer(W, pk, t, taken) { const left = (p) => Math.max(0, p.pool - (taken?.get(p) || 0)), xs = pk.byTier[t] || [], tot = xs.reduce((a, p) => a + left(p), 0); if (!(tot > 0)) return null; let r = W.rand() * tot; let last = null; for (const p of xs) { const l = left(p); if (!l) continue; last = p; r -= l; if (r <= 0) return p; } return last; }
// The rolled tier, or (when it has nothing left) a re-roll among the tiers that do, with the pack's own tier odds (prefer: tiers to try first)
function drawTier(W, pk, ws, t, taken, prefer = null) {
  const live = (i) => (pk.byTier[i] || []).some((p) => p.pool - (taken?.get(p) || 0) > 0);
  if (!live(t)) { const pick = (ok) => { const w = ws.map((x, i) => (ok(i) && live(i) ? x : 0)); return w.some((x) => x > 0) ? wpick(W, w) : -1; }; t = prefer ? pick(prefer) : -1; if (t < 0) t = pick(() => true); if (t < 0) return null; }
  const p = drawPlayer(W, pk, t, taken); if (p && taken) taken.set(p, (taken.get(p) || 0) + 1); return p;
}
// A bot wants a pack: under 'auction' that is a bid (the price it names: mult × the last clearing price), settled with
// everyone else's in packAuction; otherwise it buys at the posted price
function buyPack(W, b, type = 'standard', mult = 1) {
  if (W.cfg.packSale !== 'auction') return ripPack(W, b, false, type);
  const p = packInfo(W, type).price * mult; if (!(p > 0) || b.cash < p) return null;
  (W.packBids ||= []).push({ b, type, p }); return true;
}
// 5. Packs: packsPerWeek released (by packMix), one uniform-price auction per type: the highest bids win and all pay the
// lowest winning bid. Nothing links the price to hidden value.
function packAuction(W) {
  const cfg = W.cfg, bidsP = W.packBids || []; W.packBids = []; W.packWeek = {};
  const carry = (W.packCarry ||= {}), px = (W.packPx ||= {});
  for (const type of Object.keys(PACK_TYPES)) {
    const supply = (carry[type] || 0) + (cfg.packsPerWeek || 0) * (cfg.printRate ?? 1) * (W.fillK ?? 1) * (cfg.packMix?.[type] || 0), n0 = Math.floor(supply); carry[type] = supply - n0;
    const bs = bidsP.filter((x) => x.type === type).sort((x, y) => y.p - x.p), n = Math.min(n0, bs.length);
    let sold = 0;
    if (n > 0) { const clearPx = bs[n - 1].p; for (const x of bs.slice(0, n)) if (x.b.cash >= clearPx && ripPack(W, x.b, false, type, clearPx)) sold++; if (sold) px[type] = clearPx; }
    W.packWeek[type] = { released: n0, bids: bs.length, sold, price: px[type] ?? null };
  }
  packCacheT = null;
}
function ripPack(W, b, free = false, type = 'standard', paid = null) {
  const pk = packInfo(W, type), P = PACK_TYPES[type], cost = paid ?? pk.price;
  if (!pk.tot || (!free && b.cash < cost)) return null;
  const ptx = W.gov && !free ? govPackTax(W, cost) : 0; if (ptx > 0 && b.cash < cost + ptx) return null; // a government's pack sales tax, added to the price (negative: a subsidy)
  if (!free) { b.cash -= cost; flowOut(W, b, cost); if (!W.gov) tre(W, 'packs', cost); led(W, 'packs', cost); W.house.packRevenue = (W.house.packRevenue || 0) + cost; } // a government run: the publisher's revenue leaves the economy
  if (ptx) govPackTaxPay(W, b, ptx, ptx);
  W.house.packs++; tkAdd(W, b, 'packs');
  const rolls = [], taken = new Map();
  for (let k = 0; k < P.size; k++) {
    let t = wpick(W, P.tiers), ep = false;
    if (P.epicPlus && k === P.size - 1 && !rolls.some((x) => tierOf(W, W.players[x.pid]) >= 2)) { t = Math.max(2, t); ep = true; }
    const p = drawTier(W, pk, P.tiers, t, taken, ep ? (i) => i >= 2 : null); if (!p) break;
    const force = {};
    if (P.oneHolo && k === 0) force.f = 3;
    if (P.silverPlus && k === P.size - 1 && !rolls.some((x) => x.f >= 1)) force.f = Math.max(1, wpick(W, P.fin[tierOf(W, p)]));
    rolls.push(rollCopy(W, p, type, force));
  }
  const each = free ? 0 : cost / P.size, out = []; // each copy's share of the price
  for (const x of rolls) { const got = mintCopy(W, b, x, each); if (got) out.push(got); }
  const back = free ? 0 : cost - each * out.length; if (back > 0.005) { b.cash += back; flowIn(W, b, back); if (!W.gov) tre(W, 'packs', -back); led(W, 'packs', -back); W.house.packRevenue -= back; W.house.packRefunds = (W.house.packRefunds || 0) + back; if (ptx) govPackTaxPay(W, b, -ptx * back / cost, ptx); } // a short pack is charged only for the copies it held
  packCache = null; packCacheT = null;
  jot(W, { type: 'pack', bot: b.name, free, packType: type, price: free ? 0 : r2(cost), pulls: out.map((x) => (x.uid ? x.label : x.key)) });
  return out;
}

/* ---------- Order helpers ---------- */
let bids, asks, passBids, passAsks;
function bid(b, c, p, x) {
  if (!(p > 0)) return; if (b._bidT !== W_.t) { b._bidT = W_.t; b._bidC = 0; } if (b.cash - b._bidC < p) return; // the cash check is cumulative: a bot's bids this week never add up to more than its cash
  const lim = W_.cfg.positionLimit;
  if (lim > 0 && (b.h.get(c.id) || 0) >= Math.max(3, Math.floor(lim * c.circ))) return;
  b._bidC += p;
  if (c.dorm) wakePlayer(W_, W_.players[c.pid]);
  (bids[c.id] ||= []).push(x ? { b, p, x } : { b, p });
}
let W_ = null; // the world the module-level order helpers act on
function ask(b, c, p, pend, x) { const q = b.h.get(c.id) || 0, used = pend.get(c.id) || 0; if (q > used && p > 0) { (asks[c.id] ||= []).push(x ? { b, p, x } : { b, p }); pend.set(c.id, used + 1); } }
function sample(W, k) { const live = W._live || W.cards; const o = []; for (let i = 0; i < k * 3 && o.length < k; i++) { const c = live[Math.floor(W.rand() * live.length)]; if (c && c.on !== false) o.push(c); } return o; }
let hot = [], mood = { drop: 0 };

/* ---------- Notes (social) ---------- */
// Will x take a note swap that y offers? Each kind decides through its own decision-maker: a neural bot its 'accept
// swaps' output, an AI bot its accept list, a genome bot its scripted social style
function willing(W, x, y) { return x.g?.nn ? !!x._nnAccept : x.kind === 'ai' ? (x.pendingShares || []).includes(y.id) || !!x.acceptAll : x.social === 'sharer' || (x.social === 'reciprocator' && (x.friends.has(y.id) || y.flaggedBy === 0)) || (x.social === 'thief' && W.rand() < 0.5); }
// A neural bot's pick among candidates: its partner weights (PARTNER_IN) times what it sees of each; ties go to a uniform draw
function nnPickBot(W, b, xs, w, ok, age) { // ok: which of xs are candidates (all when absent); age: each one's log1p(weeks in the market), worked out once
  let best = -Infinity, top = [];
  for (let i = 0; i < xs.length; i++) { const y = xs[i]; if (ok && !ok(y)) continue; const v = w[0] * (b.friends.has(y.id) ? 1 : 0) + w[1] * clamp((y.flaggedBy || 0) / 5, 0, 2) + w[2] * (age ? age[i] : Math.log1p(Math.max(0, W.t - (y.joined ?? y.born ?? 0)))) / 5;
    if (v > best) { best = v; top = [y]; } else if (v === best) top.push(y); }
  return top.length ? (top.length > 1 ? W.pick(top) : top[0]) : null;
}
// Neural bots act on their own outputs: steal when 'steal notes' > 0, offer a swap when 'share notes' > 0, the target
// chosen by their partner weights; nothing filters candidates by notes they hold (a bot can't see another's notes), so an
// empty victim or partner is a lost try. Genome bots keep their scripted styles (the 0.5 and 0.4 draws, the filters).
function socialPhase(W) {
  const cfg = W.cfg;
  const rule = W.bots.filter((b) => b.kind === 'rule'); let age = null; // (no bot joins or leaves in this phase, so W.bots[i] keeps its age)
  for (const b of rule) {
    if (b.g?.nn) { if (!age && ((b._nnSteal && cfg.stealing) || (b._nnShare && cfg.sharing && b.notes.size))) age = W.bots.map((y) => Math.log1p(Math.max(0, W.t - (y.joined ?? y.born ?? 0))));
      if (b._nnSteal && cfg.stealing) { const v = nnPickBot(W, b, W.bots, b._nnStealW || [0, 0, 0], (v) => v !== b, age); if (v) steal(W, b, v); }
      if (b._nnShare && cfg.sharing && b.notes.size) { const p = nnPickBot(W, b, W.bots, b._nnShareW || [0, 0, 0], (p) => p !== b && !b.flags.has(p.id) && !p.flags.has(b.id), age); if (p && willing(W, p, b)) swap(W, b, p); }
      continue;
    }
    if (b.notes.size === 0 && b.social !== 'thief') continue;
    if (b.social === 'thief' && cfg.stealing && W.rand() < 0.5) {
      const victims = W.bots.filter((v) => v !== b && v.notes.size > 2);
      if (victims.length) steal(W, b, W.pick(victims));
      continue;
    }
    if (!cfg.sharing || W.rand() > 0.4) continue;
    const partners = W.bots.filter((p) => p !== b && !b.flags.has(p.id) && !p.flags.has(b.id) && p.notes.size > 0);
    if (!partners.length) continue;
    const p = W.pick(partners);
    if (willing(W, p, b)) swap(W, b, p);
  }
}
export function swap(W, a, b) {
  const give3 = (from, to) => {
    const mine = [...from.notes.entries()].filter(([, n]) => fresh(W, n)).sort((x, y) => y[1].week - x[1].week).slice(0, W.cfg.notesPerSwap);
    let k = 0;
    for (const [id, n] of mine) { const cur = to.notes.get(id); if (!cur || cur.week < n.week) { to.notes.set(id, { est: n.est, week: n.week, from: `shared by ${from.name}`, ...(n.facts ? { facts: n.facts } : {}), ...(n.lib ? { lib: n.lib, z: n.z } : {}) }); k++; } }
    return k;
  };
  const k = give3(a, b) + give3(b, a);
  trimNotes(W, a); trimNotes(W, b);
  a.friends.add(b.id); b.friends.add(a.id); a.stats.shared++; b.stats.shared++; W.week.shares++;
  jot(W, { type: 'share', a: a.name, b: b.name, notesMoved: k });
  return k;
}
export function steal(W, thief, victim) {
  if (victim.flags.has(thief.id) && W.rand() < W.cfg.guardChance) { jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: false, reason: 'guarded' }); return { ok: false, reason: 'guarded' }; } // a bot that flagged you watches you
  const notes = [...victim.notes.entries()].filter(([, n]) => fresh(W, n)).sort((x, y) => y[1].week - x[1].week).slice(0, W.cfg.notesPerTheft);
  for (const [id, n] of notes) thief.notes.set(id, { est: n.est, week: n.week, from: `taken from ${victim.name}`, ...(n.facts ? { facts: n.facts } : {}), ...(n.lib ? { lib: n.lib, z: n.z } : {}) });
  trimNotes(W, thief); thief.stats.stolen++; W.week.thefts++;
  if (W.rand() < W.cfg.detectChance) {
    W.week.caught++; thief.stats.caught++; thief.lastCaught = W.t;
    const flaggers = [victim, ...(W.cfg.gossip ? W.bots.filter((f) => victim.friends.has(f.id)) : [])];
    for (const f of flaggers) if (!f.flags.has(thief.id)) { f.flags.add(thief.id); f.friends.delete(thief.id); thief.flaggedBy++; }
    jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: true, notes: notes.length, caught: true, flaggedBy: flaggers.length });
    if (thief.flaggedBy >= 5 && !thief.announced) { thief.announced = true; log(W, 'flag', `${thief.name} (${ARCH[thief.a].label}) is caught stealing notes again. ${thief.flaggedBy} bots now refuse to share or trade with it.`); }
    return { ok: true, caught: true, notes: notes.length };
  }
  jot(W, { type: 'steal', thief: thief.name, victim: victim.name, ok: true, notes: notes.length, caught: false });
  return { ok: true, caught: false, notes: notes.length };
}
function trimNotes(W, b) { while (W.cfg.memoryCap > 0 && b.notes.size > W.cfg.memoryCap) { let o = null; for (const [id, n] of b.notes) if (!o || n.week < o[1].week) o = [id, n]; b.notes.delete(o[0]); } }

/* ---------- Rule bots: research and passes ---------- */
// Passes and game tickets trade the same way: each bot keeps the ones it needs, sells spares to bots that want more,
// and everything clears in one weekly call auction per token at a single price.
function tokenMarket(W, kind) {
  const cfg = W.cfg, field = kind === 'pass' ? 'passes' : 'tickets', cap = kind === 'pass' ? cfg.maxResearchPerWeek : cfg.maxGamesPerWeek;
  const tradable = kind === 'pass' ? cfg.passesTradable : cfg.ticketsTradable;
  const B = [], A = [], S = kind === 'pass' ? (SNAP = snapCards(W)) : null;
  for (const b of W.bots) {
    if (b.kind === 'ai') {
      if (!tradable) continue;
      for (const x of (kind === 'pass' ? b.pending?.passOrders : b.pending?.ticketOrders) || []) {
        const price = Number(x.price); if (!(price > 0)) continue;
        const n = Math.max(1, Math.floor(Number(x.qty) || 1)); // buys up to the weekly cap, sells up to what it holds
        if (x.side === 'sell') for (let k = 0; k < Math.min(n, b[field].length); k++) A.push({ b, p: price }); else for (let k = 0; k < Math.min(n, Math.max(0, cap - b[field].length)); k++) B.push({ b, p: price });
      }
      continue;
    }
    const want = kind === 'pass' ? (b._wish = b.g.nn ? nnResearchWish(W, b) : researchWish(W, b)).length : b.g.nn ? Math.min(W.cfg.maxGamesPerWeek, (b._nnGames || []).length) : ticketWish(W, b);
    if (!tradable) continue;
    const spare = b[field].length - want;
    if (spare > 0) for (let k = 0; k < spare; k++) A.push({ b, p: kind === 'pass' ? b.g.passAsk : b.g.ticketAsk });
    else if (spare < 0) for (let k = 0; k < Math.min(-spare, cap - b[field].length); k++) B.push({ b, p: kind === 'pass' ? b.g.passBid : b.g.ticketBid });
  }
  if (S) endSnap(W, S);
  B.sort((x, y) => y.p - x.p); A.sort((x, y) => x.p - y.p);
  // A pair is matched only if it can settle: the buyer can pay its bid (the price is never above it) on top of what it has
  // already been matched for and stays under the cap, and the seller still has a token; so the price comes from a pair that settles
  const m = [], spent = new Map(), got = new Map(), gave = new Map(), skip = (o) => { const k = got.get(o.b) || 0; return o.b.cash < (spent.get(o.b) || 0) + o.p || o.b[field].length + k >= cap; }; let i = 0, j = 0;
  while (i < B.length && j < A.length && B[i].p >= A[j].p) {
    if (skip(B[i])) { i++; continue; } if ((gave.get(A[j].b) || 0) >= A[j].b[field].length) { j++; continue; }
    if (B[i].b === A[j].b || blocked(B[i].b, A[j].b)) { j++; continue; }
    m.push([B[i], A[j]]); spent.set(B[i].b, (spent.get(B[i].b) || 0) + B[i].p); got.set(B[i].b, (got.get(B[i].b) || 0) + 1); gave.set(A[j].b, (gave.get(A[j].b) || 0) + 1); i++; j++; }
  let traded = 0, price = null;
  if (m.length) {
    const last = m[m.length - 1]; price = (last[0].p + last[1].p) / 2;
    for (const [bd, ak] of m) {
      if (bd.b.cash < price || !ak.b[field].length || bd.b[field].length >= cap) continue; // (cannot happen now; kept as a guard)
      ak.b[field].sort((x, y) => y - x); const exp = ak.b[field].shift();
      const fe = feeOf(W, price); bd.b[field].push(exp); bd.b.cash -= price; ak.b.cash += price * (1 - fe); feeTo(W, price * fe); traded++;
      flowOut(W, bd.b, price); flowIn(W, ak.b, price * (1 - fe));
      jot(W, { type: kind === 'pass' ? 'passTrade' : 'ticketTrade', buyer: bd.b.name, seller: ak.b.name, price: r2(price) });
    }
  }
  if (kind === 'pass') { W.passTrades = traded; if (traded) W.passPrice = price; }
  else { W.ticketTrades = traded; if (traded) W.ticketPrice = price; }
}
function passPhase(W) {
  const cfg = W.cfg;
  tokenMarket(W, 'pass');
  for (const b of W.bots) {
    if (b.kind === 'ai') {
      for (const key of (b.pending?.research || []).slice(0, cfg.maxResearchPerWeek)) {
        const c = resolvePlayer(W, key); if (!c || !usePass(W, b)) continue;
        research(W, b, c); (b.inbox ||= []).push(libraryPage(W, c.id));
      }
      continue;
    }
    for (const c of (b._wish || []).slice(0, cfg.maxResearchPerWeek)) { if (!usePass(W, b)) break; research(W, b, c); }
  }
}

/* ---------- Auctions ---------- */
// A bot lists one card with a reserve. The next week every bot may send one sealed bid; the highest bid at or above the
// reserve wins and pays the second-highest bid (or the reserve, whichever is higher). Unsold cards go back.
function listAuction(W, b, c, reserve) {
  if (!W.cfg.auctions || !(reserve > 0) || (b.h.get(c.id) || 0) < 1) return null;
  give(b, c, -1); tkAdd(W, b, 'lists');
  const a = { id: `A${W.t}-${(W.auctionSeq = (W.auctionSeq || 0) + 1)}`, seller: b, cardId: c.id, reserve: r2(reserve), listed: W.t, bids: [] };
  W.auctions.push(a);
  jot(W, { type: 'auctionList', id: a.id, seller: b.name, card: c.key, reserve: a.reserve });
  return a;
}
// A one-of-a-kind card (autograph, Prizm parallel, alternate or throwback kit) can only change hands at auction
function listItem(W, seller, it, reserve) {
  if (!W.cfg.auctions || !(reserve > 0) || !it || W.auctions.some((a) => a.uid === it.uid)) return null;
  if (seller !== 'liq') { if (it.owner !== seller) return null; seller.items.delete(it.uid); }
  it.owner = null; tkAdd(W, seller, 'lists');
  const a = { id: `A${W.t}-${(W.auctionSeq = (W.auctionSeq || 0) + 1)}`, seller, uid: it.uid, cardId: mktId(it.pid, it.d === 4 ? 0 : it.d, it.f), reserve: r2(reserve), listed: W.t, bids: [] };
  W.auctions.push(a);
  jot(W, { type: 'auctionList', id: a.id, seller: seller === 'liq' ? 'liquidator' : seller.name, card: it.label, item: it.uid, reserve: a.reserve });
  return a;
}
function auctionPhase(W) {
  const open = W.auctions.filter((a) => a.listed < W.t);
  W.auctions = W.auctions.filter((a) => a.listed >= W.t);
  W.auctionResults = []; const markBefore = new Map(); // each card's mark before this week's sales (last week's), for the fire-sale count
  for (const a of open) if (!a.uid && !markBefore.has(a.cardId)) markBefore.set(a.cardId, W.cards[a.cardId].P);
  // Each neural bot's worth, kept between auctions until a result touches it: the buyer and seller, and on a card's sale
  // every bot holding, lending, owing or owning a one-of-a-kind copy of that card (its price moved). Same numbers, fewer sums.
  const wc = new Map(), ctx = marketCtx(W), nwOf = (b) => { let v = wc.get(b); if (v === undefined) wc.set(b, (v = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)))); return v; };
  const touch = (b) => { if (b && typeof b === 'object') wc.delete(b); };
  const moved = (id) => { for (const b of wc.keys()) if (b.h.has(id) || b.lentOut?.has(id) || b.owed?.has(id) || (b.items?.size && heldCardIds(W, b).has(id))) wc.delete(b); };
  for (const a of open) {
    const c = W.cards[a.cardId], it = a.uid ? W.items.get(a.uid) : null, sellerName = a.seller === 'liq' ? 'liquidator' : a.seller.name, label = it ? it.label : c.key;
    for (const b of W.bots) {
      if (b === a.seller || (a.seller !== 'liq' && blocked(b, a.seller))) continue;
      let bidv = null;
      if (b.kind === 'ai') bidv = Number((b.pending?.auctionBids || []).find((x) => x.auctionId === a.id)?.bid) || null;
      else { const base = b.g.nn ? nnAuctionBid(W, b, c, it, nwOf(b), ctx) : ruleAuctionBid(W, b, c); bidv = base && it ? (base * it.mult) / c.mult : base; }
      if (bidv && bidv > 0 && b.cash >= bidv) { a.bids.push({ b, p: bidv }); tkAdd(W, b, 'sealed'); }
    }
    a.bids.sort((x, y) => y.p - x.p);
    const top = a.bids[0], second = a.bids[1];
    let result;
    if (top && top.p >= a.reserve) {
      const price = second ? Math.max(a.reserve, second.p) : W.cfg.singleBidder === 'reserve' ? a.reserve : top.p, fe = feeOf(W, price), net = price * (1 - fe); tkTrade(W, top.b, a.seller, c, price, it ? markItem(W, it) : c.P, 'auc', it); if (W.cfg.attention > 0) attTraded(W, c, top.b, a.seller); // one bidder: no second price, so it pays its own bid ('reserve': the old rule)
      top.b.cash -= price; flowOut(W, top.b, price);
      if (it) { it.owner = top.b; (top.b.items ||= new ItemSet()).add(it.uid); const cost0 = it.cost; it.cost = price; it.last = price; if (a.seller !== 'liq') { const pnl = net - (cost0 ?? 0); a.seller.stats.realized = (a.seller.stats.realized || 0) + pnl; if (W.flow) W.flow.realized[a.seller._grp ?? 2] += pnl; } }
      else { give(top.b, c, 1); addLot(top.b, c, price, W.t); if (a.seller !== 'liq') sellLot(W, a.seller, c, net);
        { const A = (W.aucStats ||= { sold: 0, coins: 0, free: 0, vs: [] }); A.sold++; A.coins += price; if (price <= 1 || price < 0.1 * top.p) A.freeOld = (A.freeOld || 0) + 1; if (price < (W.cfg.fireShare ?? 0.3) * (markBefore.get(c.id) ?? c.P)) A.free++; if (c.P > 0) A.vs.push(price / c.P); } // measurement for the health board: before the sale re-marks the card
        c.P = price; noteTrade(W, c, price, 1); { const pl = W.players[c.pid]; pl.aucBaseP = price / c.mult; pl.aucBaseT = W.t; } c.aucN = (c.aucT === W.t ? c.aucN : 0) + 1; c.aucT = W.t; W.aucWeek = (W.aucWeek || 0) + 1; if (W.ord) W.ord.coins += price; } // a card sold at auction is a trade: it sets the price, feeds comparable sales and the Vault index, and counts
      feeTo(W, price * fe);
      if (a.seller !== 'liq') { a.seller.cash += net; flowIn(W, a.seller, net); if (a.fk > 0) a.seller.fpC = (a.seller.fpC || 0) + net * a.fk; } else { W.house.outside -= net; led(W, 'liqOut', net); liqPay(W, it ? it.claim : a.claim, net); if (it) it.claim = null; } // the buyer paid net to the liquidator and the fee to the treasury; the liquidator pays any claim on the copy
      result = { type: 'auctionResult', id: a.id, card: label, item: a.uid || null, seller: sellerName, winner: top.b.name, price: r2(price), bids: a.bids.length, topBid: r2(top.p) };
      const ref = it ? markItem(W, it) : c.P;
      if (price > ref * 1.5 && price > 20 * W.cfg.coinScale) log(W, 'auction', `Auction: ${top.b.name} wins ${label} from ${sellerName} for ${r2(price)} coins against ${a.bids.length} sealed bids, ${Math.round((price / ref - 1) * 100)}% above its market mark.`);
    } else {
      if (it) { if (a.seller === 'liq') W.liqItems.push(it.uid); else { it.owner = a.seller; (a.seller.items ||= new ItemSet()).add(it.uid); } } // (an heir that took over the listing may hold no items yet)
      else if (a.seller !== 'liq') give(a.seller, c, 1); else { W.liq.set(a.cardId, (W.liq.get(a.cardId) || 0) + 1); liqPut(W, a.cardId, a.claim); }
      result = { type: 'auctionResult', id: a.id, card: label, item: a.uid || null, seller: sellerName, winner: null, bids: a.bids.length, topBid: top ? r2(top.p) : null, reserve: a.reserve };
    }
    jot(W, result); W.auctionResults.push(result);
    if (result.winner) { touch(top.b); touch(a.seller); if (!it) moved(c.id); } else touch(a.seller);
  }
  // This week's new listings (shown to everyone next week)
  for (const b of W.bots) {
    if (b.kind === 'ai') { for (const x of (b.pending?.auction || []).slice(0, W.cfg.maxListings ?? 1)) { const it = W.items.get(x.player); if (it && it.owner === b) { listItem(W, b, it, Number(x.reserve)); continue; } const c = resolveMarket(W, x.player); if (c) listAuction(W, b, c, Number(x.reserve)); } continue; }
    if (!W.cfg.auctions || b.g.nn) continue;
    ruleAuctionList(W, b);
  }
  // The liquidator auctions the one-of-a-kind cards of bots that left or defaulted, a few a week, at half their mark
  if (W.cfg.liquidation === 'auction') { // seized copies and one-of-a-kind cards, liqListings a week, no minimum price
    let n = W.cfg.liqListings ?? 30;
    for (const uid of W.liqItems.splice(0, Math.min(n, W.liqItems.length))) { const it = W.items.get(uid); if (it && listItem(W, 'liq', it, NO_MIN)) n--; }
    while (n > 0 && W.liq.size) { let any = false; for (const [id, q] of [...W.liq]) { if (n <= 0) break; if (!(q > 0)) continue; q > 1 ? W.liq.set(id, q - 1) : W.liq.delete(id); const c = W.cards[id];
        const a = { id: `A${W.t}-${(W.auctionSeq = (W.auctionSeq || 0) + 1)}`, seller: 'liq', cardId: id, reserve: NO_MIN, listed: W.t, bids: [], claim: liqTake(W, id) }; W.auctions.push(a); jot(W, { type: 'auctionList', id: a.id, seller: 'liquidator', card: c.key, reserve: a.reserve }); n--; any = true; }
      if (!any) break; }
  } else for (const uid of W.liqItems.splice(0, 5)) { const it = W.items.get(uid); if (it) listItem(W, 'liq', it, Math.max(0.05 * W.cfg.coinScale, markItem(W, it) * 0.5)); }
}
const r2 = (x) => Math.round(x * 100) / 100;
const WHO = ['bot', 'buyer', 'seller', 'a', 'b', 'thief', 'victim', 'winner', 'from', 'to'];
export function jot(W, e) {
  const entry = { t: W.t, ...e }; W.journal.push(entry);
  for (const k of WHO) { const n = entry[k]; if (typeof n !== 'string') continue; let l = W.botLog.get(n); if (!l) W.botLog.set(n, (l = [])); l.push(entry); if (l.length > 400) l.shift(); }
  if (entry.type === 'pack' && typeof entry.bot === 'string') { let q = (W.botPacks ||= new Map()).get(entry.bot); if (!q) W.botPacks.set(entry.bot, (q = [])); q.push(entry); if (q.length > 12) q.shift(); }
  const ck = entry.card || entry.player; if (typeof ck === 'string') { let l = (W.cardLog ||= new Map()).get(ck); if (!l) W.cardLog.set(ck, (l = [])); l.push(entry); if (l.length > 60) l.shift(); }
}
// Cost basis: every copy a bot holds remembers what it paid (FIFO), so sales realize a profit or loss
export function addLot(b, c, price, t) { let l = (b.lots ||= new Map()).get(c.id); if (!l) b.lots.set(c.id, (l = [])); l.push([price, t]); }
function sellLot(W, b, c, net) {
  const l = b.lots?.get(c.id), has = l && l.length, lot = has ? l.shift() : [net, W.t]; // no recorded cost: no profit is booked (never the hidden value)
  if (has) { const T = tk(W, b); if (T) { T.hold += W.t - lot[1]; T.holdN++; } } // tactic tracker: weeks this copy was held
  const pnl = net - lot[0]; b.stats.realized = (b.stats.realized || 0) + pnl;
  if (W.flow) { W.flow.realized[b._grp ?? 2] += pnl; if (W.t - lot[1] <= 12 && lot[1] > 0) W.flow.trips[b._grp ?? 2]++; }
  return pnl;
}
// The money ledger: every coin that enters or leaves the bots' hands (cash plus short collateral) is booked once, as a
// positive amount under a tag whose direction record() knows; the treasury keeps its own ledger the same way
const led = (W, k, x) => { const m = (W.house.mint ||= {}); m[k] = (m[k] || 0) + x; };
const tre = (W, k, x) => { W.treasury += x; const m = (W.house.tre ||= {}); m[k] = (m[k] || 0) + x; };
const feeTo = (W, x) => { if (W.gov && x < 0) { govSubsidy(W, 'feeSubsidy', -x); return; } W.house.fees += x; tre(W, 'fees', x); led(W, 'fees', x); }; // a government's negative fee is a subsidy from its treasury
// The trade fee on one sale: the setting, or (a government run) a negative fee paid only while the treasury holds it
const feeOf = (W, price) => (W.gov ? govRate(W, W.cfg.fee, price) : W.cfg.fee);
// Which ledger tags are lump sums taken out of fitness (fitnessExo): the owner's booking, or the old one
const EXO = { lumpSums: new Set(['allowance', 'taxBack', 'living', 'shocks', 'transfer', 'pollTax', 'levy']), legacy: new Set(['allowance', 'living', 'lifestyle']) }; // transfer, pollTax, levy: a government's lump sums (spec 22.1)
// A non-market flow between a bot and the world (x > 0 paid to it, x < 0 charged): its cash, the ledger and, for a lump
// sum it did not choose, its exogenous money b.exo all move together, so fitness can never see one without the other
function transfer(W, b, x, k) { b.cash += x; led(W, k, Math.abs(x)); if ((EXO[W.cfg.fitnessExo] || EXO.lumpSums).has(k)) { b.exo = (b.exo || 0) + x; W.exoWk = (W.exoWk || 0) + x; } }
function flowIn(W, b, x) { if (W.flow && b && typeof b === 'object') W.flow.net[b._grp ?? 2] += x; }
function flowOut(W, b, x) { if (W.flow && b && typeof b === 'object') W.flow.net[b._grp ?? 2] -= x; }
export function avgCost(b, id) { const l = b.lots?.get(id); return l && l.length ? l.reduce((s, x) => s + x[0], 0) / l.length : null; }

/* ---------- Arcade games (weekly contests) ---------- */
// Every game runs one contest a week. Each entrant spends a ticket and stakes coins into the game's pot, every entrant
// answers the SAME questions (published a week ahead, with the topic), and the best scores share the pot. Nothing is
// printed: games move coins from worse players to better ones. Each game's metrics include a skill index: the rank
// correlation between how much an entrant knew about the players asked (fresh notes) and how well it scored.
export const TOPICS = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'];
export const GAMES = {
  valuation: { label: 'Valuation contest', skill: 'Estimate each card\'s hidden value', answer: 'a number of coins per card' },
  prediction: { label: 'Price prediction league', skill: 'Will each card be higher in 4 weeks?', answer: 'a probability 0 to 1 per card (scored by Brier, settled in 4 weeks)' },
  blindRank: { label: 'Blind Rank', skill: 'Rank 5 players on a stat, highest first', answer: 'the five letters in order, e.g. "C,A,E,B,D"' },
  closest: { label: 'Closest guess', skill: 'Guess career stats', answer: 'a number per question' },
  keepCut: { label: 'Keep 3 / Cut 3', skill: 'Keep the 3 of 6 with the highest Career Legacy', answer: 'three letters, e.g. "A,D,F"' },
  imposter: { label: 'Imposter', skill: 'Which of 4 players is not the same play-style family?', answer: 'a letter per question' },
  grid: { label: 'League Grid', skill: 'Name a player who fits position × award × club', answer: 'a player key per square; rarer correct answers score more' },
  higherLower: { label: 'Higher or Lower', skill: 'Which of two players has the higher career rate?', answer: 'A or B per question' },
  overUnder: { label: 'Over / Under', skill: 'Is a career rate over or under the line?', answer: 'over or under per question' },
  duel: { label: 'Head-to-head duel', skill: 'Beat one paired opponent on 5 Higher or Lower questions', answer: 'A or B per question; the winner takes both stakes' },
};
const GKEYS = Object.keys(GAMES);
const L5 = ['A', 'B', 'C', 'D', 'E', 'F'];

// What a bot can know about a player in this era (the timeline's season, or the latest library)
export function eraOf(W, id) {
  const e = W.era?.[id]; if (e) return e;
  const p = W.library.players[id];
  return { on: true, ovr: p.ovr, skill: p.skill, grade: p.grade, legacy: p.careerLegacy, totals: p.stats, perGame: p.rates };
}
const onCards = (W) => W.players.filter((c) => c.on !== false);
const pickOn = (W, pos) => { const xs = onCards(W).filter((c) => !pos || c.pos === pos); return xs.length ? W.pick(xs) : null; };
function rateOf(W, id) { const e = eraOf(W, id); const ks = Object.keys(e.perGame || {}); return ks.length ? ks : null; }
function sharedRate(W, ids) { const sets = ids.map((id) => new Set(rateOf(W, id) || [])); const first = [...sets[0]]; const both = first.filter((k) => sets.every((s) => s.has(k))); return both.length ? W.pick(both) : null; }

function makeContest(W, game) {
  const on = onCards(W), nPos = {}; for (const c of on) nPos[c.pos] = (nPos[c.pos] || 0) + 1; // the players in the market, read once
  const topic = W.pick(TOPICS.filter((t) => (nPos[t] || 0) >= 6)) || 'WR';
  const group = on.filter((c) => c.pos === topic);
  const draw = (k) => { const out = new Set(); let tries = 0; while (out.size < Math.min(k, group.length) && tries++ < 200) out.add(W.pick(group).id); return [...out]; };
  const q = [];
  switch (game) {
    case 'valuation': case 'prediction': { if (game === 'valuation' && W.cfg.priceOnly) break; const ids = draw(5); for (const id of ids) q.push({ ids: [id], text: `${W.players[id].key}${game === 'prediction' ? `: higher than ${r2(W.players[id].P)} in 4 weeks?` : ': hidden value in coins?'}` }); break; }
    case 'blindRank': { for (let t = 0; t < 10 && !q.length; t++) { const ids = draw(5), stat = sharedRate(W, ids); if (!stat) continue; const order = ids.slice().sort((a, b) => eraOf(W, b).perGame[stat] - eraOf(W, a).perGame[stat]); q.push({ ids, stat, truth: order.map((id) => L5[ids.indexOf(id)]), text: `Rank by career "${stat}", highest first: ${ids.map((id, i) => `${L5[i]}) ${W.players[id].key}`).join(' ')}` }); } break; }
    case 'closest': { for (const id of draw(3)) { const e = eraOf(W, id), ks = Object.keys(e.totals || {}).filter((k) => typeof e.totals[k] === 'number' && e.totals[k] > 0 && !/rings|mvp|opoy|dpoy|roty|sbmvp/i.test(k)); if (!ks.length) continue; const k = W.pick(ks); const vals = group.map((c) => eraOf(W, c.id).totals?.[k]).filter((v) => typeof v === 'number'); const mu = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / vals.length) || 1; q.push({ ids: [id], stat: k, truth: e.totals[k], sd, med: vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)], text: `${W.players[id].key}: career "${k}"?` }); } break; }
    case 'keepCut': { const ids = draw(6); const best = ids.slice().sort((a, b) => eraOf(W, b).legacy - eraOf(W, a).legacy).slice(0, 3); q.push({ ids, truth: best.map((id) => L5[ids.indexOf(id)]), text: `Keep the 3 with the highest Career Legacy: ${ids.map((id, i) => `${L5[i]}) ${W.players[id].key}`).join(' ')}` }); break; }
    case 'imposter': { const byFam = {}; for (const c of group) (byFam[c.fam] ||= []).push(c.id); const fams = Object.values(byFam).filter((x) => x.length >= 3); for (let t = 0; t < 4 && fams.length; t++) { const fam = W.pick(fams), others = group.filter((c) => !fam.includes(c.id)); if (!others.length) break; const three = []; while (three.length < 3) { const x = W.pick(fam); if (!three.includes(x)) three.push(x); } const odd = W.pick(others).id; const ids = W.shuffle([...three, odd]); q.push({ ids, truth: L5[ids.indexOf(odd)], text: `Which plays a different style? ${ids.map((id, i) => `${L5[i]}) ${W.players[id].key}`).join(' ')}` }); } break; }
    case 'grid': { const AW = ['rings', 'mvp', 'sbmvp', 'opoy']; for (let t = 0; t < 30 && q.length < 3; t++) { const c0 = W.pick(group), team = c0.team, aw = W.pick(AW); const valid = group.filter((c) => c.team === team && (eraOf(W, c.id).totals?.[aw] || 0) > 0).map((c) => c.key); if (!valid.length) continue; q.push({ ids: group.filter((c) => c.team === team).map((c) => c.id), valid, aw, text: `A ${topic} for the ${team} with at least one ${aw.toUpperCase()}` }); } break; }
    case 'higherLower': case 'duel': { for (let t = 0; t < 40 && q.length < (game === 'duel' ? 5 : 8); t++) { const ids = draw(2); if (ids.length < 2) break; const stat = sharedRate(W, ids); if (!stat) continue; const a = eraOf(W, ids[0]).perGame[stat], b = eraOf(W, ids[1]).perGame[stat]; if (a === b) continue; q.push({ ids, stat, truth: a > b ? 'A' : 'B', text: `Higher career "${stat}": A) ${W.players[ids[0]].key} or B) ${W.players[ids[1]].key}?` }); } break; }
    case 'overUnder': { for (const id of draw(5)) { const ks = rateOf(W, id); if (!ks) continue; const stat = W.pick(ks), v = eraOf(W, id).perGame[stat]; let line = Math.round(v * lerp(0.8, 1.2, W.rand()) * 100) / 100; if (line === v) line = Math.round((v * 1.05 + 0.01) * 100) / 100; q.push({ ids: [id], stat, line, truth: v > line ? 'over' : 'under', text: `${W.players[id].key}, career "${stat}": over or under ${line}?` }); } break; }
  }
  return { game, topic, week: W.t + 1, questions: q };
}
// Contests are published two weeks ahead: what a bot sees as "in two weeks" this week is what it answers next week, so
// research it orders now arrives in time
export function publishContests(W) { W.contests = W.contestsAhead || null; W.contestsAhead = Object.fromEntries(GKEYS.map((g) => [g, makeContest(W, g)])); if (!W.contests) W.contests = Object.fromEntries(GKEYS.map((g) => [g, makeContest(W, g)])); }

// Scores: higher is better for every game
const num = (x) => { const v = Number(String(x).replace(/[^0-9.\-e]/gi, '')); return isFinite(v) ? v : null; };
function scoreOf(W, game, con, ans) {
  const qs = con.questions; if (!qs.length) return 0;
  switch (game) {
    case 'valuation': return -qs.reduce((s, q, i) => { const v = num(ans[i]); const F = W.players[q.ids[0]].F; return s + (v && v > 0 ? Math.min(3, Math.abs(Math.log(v / F))) : 3); }, 0) / qs.length;
    case 'prediction': return null; // settled in 4 weeks
    case 'blindRank': { const q = qs[0], got = String(ans[0] ?? ans.join(',')).toUpperCase().split(/[^A-F]+/).filter(Boolean); let d = 0; q.truth.forEach((l, i) => { const j = got.indexOf(l); d += j < 0 ? 4 : Math.abs(j - i); }); return 1 - d / 12; }
    case 'closest': return -qs.reduce((s, q, i) => { const v = num(ans[i]); return s + (v == null ? 3 : Math.min(3, Math.abs(v - q.truth) / q.sd)); }, 0) / qs.length;
    case 'keepCut': { const got = new Set(String(ans[0] ?? ans.join(',')).toUpperCase().split(/[^A-F]+/).filter(Boolean).slice(0, 3)); return qs[0].truth.filter((l) => got.has(l)).length / 3; }
    case 'imposter': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toUpperCase().startsWith(q.truth) ? 1 : 0), 0) / qs.length;
    case 'grid': return qs.reduce((s, q, i) => { const a = String(ans[i] ?? '').trim(); return s + (q.valid.includes(a) ? 1 + 1 / q.valid.length : 0); }, 0) / qs.length;
    case 'higherLower': case 'duel': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toUpperCase().startsWith(q.truth) ? 1 : 0), 0) / qs.length;
    case 'overUnder': return qs.reduce((s, q, i) => s + (String(ans[i] ?? '').trim().toLowerCase() === q.truth ? 1 : 0), 0) / qs.length;
  }
  return 0;
}
// How a rule bot answers: from its fresh notes when it has them (its research error blurs them), else a guess
function knows(W, b, id) { return estimate(W, b, W.players[id]) !== null; }
function ruleAnswers(W, b, game, con) {
  const e = b.g.err, noisy = (v) => v * Math.exp(W.gauss() * e), coin = (p) => W.rand() < p;
  const flip = (t) => ({ A: 'B', B: 'A', over: 'under', under: 'over' }[t] ?? t);
  return con.questions.map((q) => {
    const k = q.ids.filter((id) => knows(W, b, id)).length / q.ids.length;
    switch (game) {
      case 'valuation': return String(r2(knows(W, b, q.ids[0]) ? estimate(W, b, W.players[q.ids[0]]) : W.players[q.ids[0]].P));
      case 'prediction': { const c = W.players[q.ids[0]], est0 = estimate(W, b, c); const tilt = b.g.w.momentum > 0.3 ? clamp(ret(c, 4) * 3, -0.3, 0.3) : est0 !== null ? (est0 > c.P ? 0.18 : -0.18) : 0; return String(r2(clamp(0.5 + tilt + W.gauss() * 0.05, 0.02, 0.98))); }
      case 'blindRank': return q.ids.map((id, i) => [L5[i], knows(W, b, id) ? noisy(eraOf(W, id).perGame[q.stat]) : W.rand() * eraOf(W, q.ids[0]).perGame[q.stat] * 2]).sort((x, y) => y[1] - x[1]).map((x) => x[0]).join(',');
      case 'closest': return String(Math.round(knows(W, b, q.ids[0]) ? noisy(q.truth) : q.med));
      case 'keepCut': return q.ids.map((id, i) => [L5[i], knows(W, b, id) ? noisy(eraOf(W, id).legacy) : W.players[id].P * 30]).sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]).join(',');
      case 'imposter': return coin(0.25 + 0.6 * k * (1 - e)) ? q.truth : W.pick(L5.slice(0, 4));
      case 'grid': { const mine = q.valid.filter((key) => knows(W, b, W.byKey.get(key).id)); if (mine.length && coin(0.9)) return W.pick(mine); const pool = q.ids.map((id) => W.players[id].key); return coin(0.5) ? W.pick(pool) : ''; }
      default: return coin(0.5 + 0.42 * k * (1 - e)) ? q.truth : flip(q.truth);
    }
  });
}
// How a neural bot answers: every answer is computed from what it holds (its fresh notes' page facts, seen through its
// research error; its card network for the price prediction) and the public prices, with no draw deciding whether it is
// right. A player it has no note on is given the mean of the ones it has in that question (ties then go to the dearer
// card, the public signal); where nothing it holds tells the options apart (an unnoted Over / Under, an Imposter it can't
// narrow down) it guesses uniformly among the options it can't rule out.
function nnAnswers(W, b, game, con) {
  const err = b.g.err ?? 0, fact = (id) => { const n = b.notes.get(id); return fresh(W, n) && n.lib ? { ...n.lib, f: Math.exp((n.z ?? 0) * err) } : null; };
  const px = (id) => W.players[id].P, rank = (ids, val) => { const v = ids.map((id) => { const f = fact(id); const x = f ? val(f) : null; return Number.isFinite(x) ? x : null; }), kn = v.filter((x) => x != null), mu = kn.length ? kn.reduce((a, x) => a + x, 0) / kn.length : 0;
    return ids.map((id, i) => [L5[i], v[i] ?? mu, px(id)]).sort((x, y) => y[1] - x[1] || y[2] - x[2]).map((x) => x[0]); };
  const nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctx = marketCtx(W);
  return con.questions.map((q) => {
    switch (game) {
      case 'valuation': return String(r2(knows(W, b, q.ids[0]) ? estimate(W, b, W.players[q.ids[0]]) : W.players[q.ids[0]].P));
      case 'prediction': { const o = cardNet(W, b, W.cards[mktId(q.ids[0], 0, 0)], nw, ctx); return String(r2(clamp(sigm(o[0] - o[1]), 0.01, 0.99))); } // its card network: buy over sell
      case 'blindRank': return rank(q.ids, (f) => f.pg[q.stat] * f.f).join(',');
      case 'closest': { const f = fact(q.ids[0]); if (f && Number.isFinite(f.tot[q.stat])) return String(Math.round(f.tot[q.stat] * f.f));
        const pos = W.players[q.ids[0]].pos, xs = []; for (const [id] of b.notes) { const g = fact(id); if (g && W.players[id]?.pos === pos && Number.isFinite(g.tot[q.stat])) xs.push(g.tot[q.stat] * g.f); } // else the median of what it knows at his position
        return xs.length ? String(Math.round(xs.sort((a, c) => a - c)[xs.length >> 1])) : ''; }
      case 'keepCut': return rank(q.ids, (f) => f.leg * f.f).slice(0, 3).join(',');
      case 'imposter': { const fam = q.ids.map((id) => fact(id)?.fam ?? null), ok = q.ids.filter((_, x) => { const others = fam.filter((v, i) => i !== x && v != null); return others.every((v) => v === others[0]) && !(fam[x] != null && others.length && fam[x] === others[0]); });
        return L5[q.ids.indexOf(W.pick(ok.length ? ok : q.ids))]; }
      case 'grid': { const kn = q.ids.map((id) => [id, fact(id)]), yes = kn.filter(([, f]) => f && (f.tot[q.aw] || 0) > 0).map(([id]) => id), maybe = kn.filter(([, f]) => !f).map(([id]) => id), pool = yes.length ? yes : maybe; // a noted winner, else an unnoted teammate
        return pool.length ? W.players[pool.sort((x, y) => px(y) - px(x))[0]].key : ''; }
      case 'overUnder': { const f = fact(q.ids[0]), v = f ? f.pg[q.stat] * f.f : null; return Number.isFinite(v) ? (v > q.line ? 'over' : 'under') : W.pick(['over', 'under']); }
      default: return rank(q.ids, (f) => f.pg[q.stat] * f.f)[0]; // higherLower, duel: A or B
    }
  });
}
function bestTopic(W, b) {
  const n = {}; for (const [id, note] of b.notes) if (fresh(W, note)) n[W.players[id].pos] = (n[W.players[id].pos] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 3 ? top[0] : null;
}
// A rule bot enters the contests whose topic it knows best (or a couple at random), one ticket each
function ruleEntries(W, b) {
  const known = {}; for (const [id, note] of b.notes) if (fresh(W, note)) known[W.players[id].pos] = (known[W.players[id].pos] || 0) + 1;
  const ranked = GKEYS.map((g) => [g, (known[W.contests[g].topic] || 0) + W.rand()]).sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, b.tickets.length).filter(([, s]) => s >= 1 || W.rand() < 0.35).map(([g]) => g);
}
function rankCorr(xs, ys) {
  const n = xs.length; if (n < 4) return null;
  const rk = (a) => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = Array(n); o.forEach(([, i], k) => (r[i] = k)); return r; };
  const rx = rk(xs), ry = rk(ys), mx = (n - 1) / 2; let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}
function payout(W, game, entries, prize = 0) {
  // entries: [{b, score, know}] — the top share of scorers split the pot (stakes + the house's prize; ties at the cut included)
  if (!entries.length) prize = 0; else prize = Math.min(prize, Math.max(0, W.treasury)); // the house's prize comes out of its treasury, never more than it holds
  const pot = entries.length * W.cfg.gameStake + prize, st = W.gameStats[game];
  if (entries.length) { st.prize = (st.prize || 0) + prize; W.prizePaid = (W.prizePaid || 0) + prize; tre(W, 'prizes', -prize); } // a transfer from the treasury, not new coins
  st.entrants += entries.length; st.pot += pot;
  if (!entries.length) return;
  const sorted = entries.slice().sort((a, b) => b.score - a.score);
  const k = Math.max(1, Math.round(entries.length * (W.cfg.gamePaid?.[game] ?? 0))), cut = sorted[k - 1].score, winners = sorted.filter((e) => e.score >= cut);
  const alive = new Set(W.bots), share = pot / winners.length, fromPrize = prize / winners.length;
  for (const w of winners) { w.b.cash += share; flowIn(W, w.b, share); if (alive.has(w.b)) { led(W, 'prizes', fromPrize); led(W, 'stakesBack', share - fromPrize); } } // a winner that has left since it entered takes its share with it
  for (const e of entries) { const won = winners.includes(e), net = (won ? pot / winners.length : 0) - W.cfg.gameStake; const a = W.gameArch[e.b._grp ?? 2]; a[0]++; if (won) a[1]++; a[2] += net; e.b.stats.gameNet = (e.b.stats.gameNet || 0) + net; jot(W, { type: 'game', bot: e.b.name, game, topic: W.contests[game]?.topic, score: r2(e.score), won, net: r2(net) }); }
  st.scoreSum += entries.reduce((s, e) => s + e.score, 0); st.top = Math.max(st.top ?? -Infinity, sorted[0].score);
  const r = rankCorr(entries.map((e) => e.know), entries.map((e) => e.score)); if (r !== null) { st.skillSum += r; st.skillN++; }
}
function gamePhase(W) {
  const cfg = W.cfg, con = W.contests; if (!con) { publishContests(W); return; }
  W.gameStats = Object.fromEntries(GKEYS.map((g) => [g, { entrants: 0, pot: 0, scoreSum: 0, top: null, skillSum: 0, skillN: 0 }]));
  W.gameArch = GROUPS.map(() => [0, 0, 0]);
  const entries = Object.fromEntries(GKEYS.map((g) => [g, []]));
  for (const b of W.bots) {
    b.gameResults = [];
    const picks = b.kind === 'ai' ? (b.gameAnswers || []).filter((x) => GAMES[x?.game]).map((x) => x.game) : b.g.nn ? b._nnGames || [] : ruleEntries(W, b);
    const seen = new Set();
    for (const g of picks) {
      if (seen.has(g) || !b.tickets.length || b.cash < cfg.gameStake || !con[g]?.questions.length) continue;
      seen.add(g); b.tickets.shift(); b.cash -= cfg.gameStake; flowOut(W, b, cfg.gameStake); led(W, 'stakes', cfg.gameStake);
      const ans = b.kind === 'ai' ? (b.gameAnswers.find((x) => x.game === g)?.answers || []) : b.g.nn ? nnAnswers(W, b, g, con[g]) : ruleAnswers(W, b, g, con[g]);
      const know = con[g].questions.reduce((s, q) => s + q.ids.filter((id) => knows(W, b, id)).length / q.ids.length, 0) / con[g].questions.length;
      if (g === 'prediction') { (W.predictions ||= []).push({ b, settle: W.t + 4, qs: con[g].questions.map((q) => [q.ids[0], W.players[q.ids[0]].P]), probs: con[g].questions.map((q, i) => clamp(Number(ans[i]) || 0.5, 0, 1)), know }); continue; }
      entries[g].push({ b, score: scoreOf(W, g, con[g], ans), know, ans });
    }
  }
  // Duels: entrants are paired at random; the better score takes both stakes (a tie splits them back)
  const duel = W.shuffle(entries.duel); W.gameStats.duel.entrants += duel.length; W.gameStats.duel.pot += duel.length * cfg.gameStake;
  for (let i = 0; i + 1 < duel.length; i += 2) {
    const [x, y] = [duel[i], duel[i + 1]], pot = 2 * cfg.gameStake;
    const shares = x.score === y.score ? [pot / 2, pot / 2] : x.score > y.score ? [pot, 0] : [0, pot];
    [[x, shares[0]], [y, shares[1]]].forEach(([e, got]) => { e.b.cash += got; flowIn(W, e.b, got); led(W, 'stakesBack', got); const a = W.gameArch[e.b._grp ?? 2]; a[0]++; if (got > cfg.gameStake) a[1]++; a[2] += got - cfg.gameStake; e.b.stats.gameNet = (e.b.stats.gameNet || 0) + got - cfg.gameStake; jot(W, { type: 'game', bot: e.b.name, game: 'duel', opponent: (e === x ? y : x).b.name, score: r2(e.score), won: got > cfg.gameStake, net: r2(got - cfg.gameStake) }); });
  }
  if (duel.length % 2) { const e = duel[duel.length - 1]; e.b.cash += cfg.gameStake; flowIn(W, e.b, cfg.gameStake); led(W, 'stakesBack', cfg.gameStake); jot(W, { type: 'game', bot: e.b.name, game: 'duel', opponent: null, score: r2(e.score), won: false, net: 0, refunded: r2(cfg.gameStake) }); } // an unpaired duelist gets its stake back
  { const r = rankCorr(duel.map((e) => e.know), duel.map((e) => e.score)); if (r !== null) { W.gameStats.duel.skillSum += r; W.gameStats.duel.skillN++; } W.gameStats.duel.scoreSum += duel.reduce((s, e) => s + e.score, 0); }
  // The house's prize pool: half of last week's takings, shared between games by how many entered each
  const takings = (W.house.fees - (W.prevFees ?? W.house.fees)) + ((W.house.packRevenue || 0) - (W.prevPackRev ?? (W.house.packRevenue || 0))) + (W.living?.spent || 0);
  W.prevFees = W.house.fees; W.prevPackRev = W.house.packRevenue || 0; W.prizePaid = 0;
  const pool = Math.max(0, takings) * cfg.prizeShare, dueN = (W.predictions || []).filter((p) => p.settle <= W.t).length;
  const counts = Object.fromEntries(GKEYS.filter((g) => g !== 'duel').map((g) => [g, g === 'prediction' ? dueN : entries[g].length])), totN = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  W.prizePool = pool;
  for (const g of GKEYS) if (g !== 'duel' && g !== 'prediction') payout(W, g, entries[g], (pool * counts[g]) / totN);
  // Prediction league: settle the predictions made 4 weeks ago (Brier score: lower is better, so score = −Brier)
  const due = (W.predictions || []).filter((p) => p.settle <= W.t); W.predictions = (W.predictions || []).filter((p) => p.settle > W.t);
  if (due.length) payout(W, 'prediction', due.map((p) => ({ b: p.b, know: p.know, score: -p.qs.reduce((s, [id, P0], i) => s + (p.probs[i] - (W.players[id].P > P0 ? 1 : 0)) ** 2, 0) / p.qs.length })), (pool * counts.prediction) / totN);
  { const by = new Map(); for (const j of W.journal) if (j.type === 'game' && j.t === W.t) { const l = by.get(j.bot); l ? l.push(j) : by.set(j.bot, [j]); } // this week's game entries by bot, in journal order
    for (const b of W.bots) b.gameResults = (by.get(b.name) || []).map(({ game, won, net }) => ({ game, won, net })); } // no score: a valuation score inverts to the hidden value
  publishContests(W);
}
// A rule bot wants game tickets in proportion to what it knows
function ticketWish(W, b) {
  const topic = bestTopic(W, b);
  if (!topic) return W.rand() < 0.5 ? 1 : 0;
  const n = [...b.notes.entries()].filter(([id, note]) => fresh(W, note) && W.players[id].pos === topic).length;
  return clamp(1 + Math.floor(n / 3), 1, W.cfg.maxGamesPerWeek);
}

/* ---------- Strategy genome (no assigned strategies) ---------- */
// Every rule bot runs the same policy. What differs is its genome: how much weight it puts on each signal it can see,
// plus how aggressive, patient, leveraged, generous and sociable it is. Strategies are not assigned; a bot's "style"
// is just a label for its dominant weight, recomputed as its genome mutates down the generations. Whatever pays,
// spreads (if evolution is on); whatever doesn't, dies out.
//   value    the gap between its notes' estimate and the price
//   make     posting quotes on both sides (market making)
//   momentum the card's recent trend
//   herd     what the crowd is doing (recent volume and the market's mood)
//   pack     the gap between what a pack's pulls sell for and the pack's price
//   hoard    accumulating a few favourite players
//   revert   distance below the card's recent average (buying dips)
export const SIGNALS = ['value', 'make', 'momentum', 'herd', 'pack', 'hoard', 'revert'];
function socialStyle(W) { const s = W.cfg.social, r = W.rand(); return r < s.sharer ? 'sharer' : r < s.sharer + s.reciprocator ? 'reciprocator' : 'thief'; }
function gammaish(W, k) { let x = 0; for (let i = 0; i < 3; i++) x -= Math.log(W.rand() || 1e-9); return Math.pow(x / 3, 1 / k); } // skewed draw: most weights small, a few large
function norm(w) { const s = SIGNALS.reduce((a, k) => a + w[k], 0) || 1; for (const k of SIGNALS) w[k] /= s; return w; }
const styleOf = (w) => w.__nn ? NN_KIND : SIGNALS.reduce((best, k, i) => (w[k] > w[SIGNALS[best]] ? i : best), 0);
function collectorTargets(W) { const pool = (W._live || W.cards).filter((c) => c.on !== false && c.F > 4 * W.cfg.coinScale && c.F < 600 * W.cfg.coinScale); return pool.length ? [W.pick(pool).id, W.pick(pool).id] : []; }
function randomGenome(W) {
  const r = W.rand, w = {}; for (const k of SIGNALS) w[k] = gammaish(W, 0.45);
  return {
    w: norm(w), horizon: 2 + Math.floor(r() * 11), aggr: lerp(0.01, 0.08, r()), margin: lerp(0.04, 0.25, r()), keep: lerp(0.08, 0.4, r()),
    err: lerp(0.06, 0.35, r()), panic: lerp(0.06, 0.3, r()), spread: lerp(0.02, 0.1, r()), size: 5 + Math.floor(r() * 11),
    lev: r() < 0.5 ? 0 : -Math.log(r() || 1e-9) * 0.4, lendShare: r() < 0.5 ? 0 : r() * 0.6, lendRate: lerp(0.001, 0.008, r()), maxRate: lerp(0.002, 0.012, r()),
    passBid: lerp(2, 30, r()) * W.cfg.coinScale, passAsk: lerp(1, 12, r()) * W.cfg.coinScale, ticketBid: lerp(0.5, 8, r()) * W.cfg.coinScale, ticketAsk: lerp(0.2, 4, r()) * W.cfg.coinScale,
    targets: collectorTargets(W), book: [],
  };
}
function mutate(W, g) {
  if (g.nn) return mutateBrain(W, g);
  const o = { ...g, w: { ...g.w }, book: [], targets: g.targets.slice() };
  for (const k of SIGNALS) o.w[k] *= Math.exp(W.gauss() * 0.3);
  if (W.rand() < 0.1) o.w[W.pick(SIGNALS)] *= 3; // now and then a bigger jump: innovation
  norm(o.w);
  for (const k of ['aggr', 'margin', 'keep', 'err', 'panic', 'spread', 'lev', 'lendShare', 'lendRate', 'maxRate', 'passBid', 'passAsk', 'ticketBid', 'ticketAsk']) o[k] = Math.max(0, o[k] * lerp(0.85, 1.15, W.rand()) + (o[k] === 0 && W.rand() < 0.05 ? 0.05 : 0));
  o.horizon = clamp(Math.round(o.horizon * lerp(0.8, 1.25, W.rand())), 2, 16); o.size = clamp(Math.round(o.size * lerp(0.8, 1.25, W.rand())), 3, 20);
  if (W.rand() < 0.2) o.targets = collectorTargets(W);
  return o;
}
export function newBot(W, a, parent, extra = {}) {
  const ai = a === AI, g = ai ? randomGenome(W) : parent ? mutate(W, parent.g) : W.cfg.brain === 'nn' ? randomBrain(W) : randomGenome(W);
  const b = {
    id: W.nextId++, a: ai ? AI : styleOf(g.w), kind: ai ? 'ai' : 'rule', g, cash: W.cfg.startCash,
    h: new Map(), n: 0, nwh: [], gen: parent ? parent.gen + 1 : 1, born: W.t, seasons: 0,
    passes: [], tickets: [], notes: new Map(), debt: 0, lent: 0, flags: new Set(), friends: new Set(), flaggedBy: 0,
    social: parent ? (W.rand() < 0.1 ? socialStyle(W) : parent.social) : socialStyle(W),
    stats: { shared: 0, stolen: 0, caught: 0, researched: 0 }, memo: '', ...extra,
  };
  b.name = extra.name || (g.nn ? randomName(W, parent) : null) || `BOT-${String(b.id).padStart(3, '0')}`;
  b.surname = parent?.surname || b.name.split(' ')[1] || b.name;
  b.lineage = parent ? parent.lineage ?? parent.id : b.id;
  return b;
}

// The signals one bot reads for one card (all roughly in −1…1)
function signals(W, b, c) {
  const e = estimate(W, b, c), g = b.g;
  return {
    value: e === null ? 0 : clamp((e - c.P) / c.P, -1, 1),
    momentum: clamp(ret(c, g.horizon), -0.5, 0.5),
    revert: clamp(1 - c.P / ma(c, 12), -0.5, 0.5),
    herd: (recentVol(c, 4) > 2 ? clamp(ret(c, 2), -0.3, 0.3) + 0.05 : 0) - mood.drop * 2,
  };
}
const scoreCard = (b, s) => 3 * (b.g.w.value * s.value + b.g.w.momentum * s.momentum + b.g.w.revert * s.revert + b.g.w.herd * s.herd);

// Which players a bot wants to research this week: bots that weigh value, hoarding or dips read the library; pure
// momentum, herd and pack bots mostly sell their passes
function researchWish(W, b) {
  const w = b.g.w, want = clamp(Math.round(W.cfg.passesPerWeek * 1.6 * (w.value + w.hoard + 0.5 * w.revert + 0.5 * w.make)), 0, W.cfg.maxResearchPerWeek);
  if (!want) return [];
  const known = (c) => { const n = b.notes.get(c.isPlayer === false ? c.pid : c.id); return fresh(W, n) && W.t - n.week < W.cfg.knowledgeWeeks - 2; };
  const held = [...b.h.keys()].map((id) => W.cards[id]), tg = (b.g.targets || []).map((id) => W.cards[id]);
  return [...tg, ...held, ...hot.slice(0, W.cfg.hotResearch ?? 40), ...sample(W, 8)].filter((c, i, a) => c && c.on !== false && !known(c) && a.indexOf(c) === i).slice(0, want);
}

function act(W, b) {
  const pend = new Map(), g = b.g, w = g.w, nw = b.nwh[b.nwh.length - 1] || b.cash, pk = packInfo(W);
  const held = [...b.h.keys()].map((id) => W.cards[id]);
  const cand = [...held, ...[...b.notes.keys()].map((id) => W.cards[mktId(id, 0, 0)]), ...hot.slice(0, W.cfg.hotOrders ?? 30), ...sample(W, 10)].filter((c, i, a) => c && c.on !== false && a.indexOf(c) === i);
  const scored = cand.map((c) => [c, scoreCard(b, signals(W, b, c))]);
  // Panic: a bot that weighs the crowd dumps cards after a drawdown
  const dd = b.nwh.length > 4 ? 1 - b.nwh[b.nwh.length - 1] / Math.max(...b.nwh.slice(-5)) : 0;
  if (w.herd > 0.2 && Math.max(dd, mood.drop) > g.panic) { let k = 0; for (const c of held) { if (k++ > 6) break; ask(b, c, c.P * 0.85, pend); } return; }
  // Buy what scores well, sell what scores badly (one copy each; two on a strong signal)
  let spare = b.cash - g.keep * nw, orders = 0;
  for (const [c, s] of scored.sort((x, y) => y[1] - x[1])) {
    const q = b.h.get(c.id) || 0;
    if (s > 0.03 && spare > c.P && orders < W.cfg.deployOrders) { bid(b, c, c.P * (1 + Math.min(g.aggr, s))); spare -= c.P; orders++; if (s > 0.15 && spare > c.P) { bid(b, c, c.P * (1 + g.aggr)); spare -= c.P; } }
    else if (q && s < -0.03) ask(b, c, c.P * (1 - Math.min(g.aggr, -s) / 2), pend);
  }
  // Value exit: sell above the notes' estimate by the bot's margin
  if (w.value > 0.15) for (const c of held) { const e = estimate(W, b, c); if (e !== null && c.P > e * (1 + g.margin)) ask(b, c, Math.max(e * (1 + g.margin), c.P * 0.98), pend); }
  // Hoarding: keep buying two favourite players, rarely sell
  if (w.hoard > 0.15) for (const id of g.targets) { const c = W.cards[id]; if (!c || c.on === false) continue; const e = est(W, b, c); if (c.P < e * (1 + 2 * w.hoard) && b.cash > c.P) bid(b, c, c.P * 1.05); if ((b.h.get(id) || 0) && c.P > e * 3) ask(b, c, c.P, pend); }
  // Market making: quote both sides on a book of liquid cards, skewed by inventory
  if (w.make > 0.15) {
    if (!g.book.length || W.t % W.cfg.weeksPerGeneration === 1) g.book = W.shuffle(hot.slice(0, W.cfg.hotBook ?? 50)).slice(0, g.size).map((c) => c.id);
    for (const id of g.book) { const c = W.cards[id], inv = b.h.get(id) || 0, e = estimate(W, b, c), mid = e === null ? c.P : lerp(c.P, e, 0.3), skew = (inv - 3) * 0.012; if (inv < 10 && b.cash > c.P * 2) bid(b, c, mid * (1 - g.spread - skew)); if (inv > 0) ask(b, c, mid * (1 + g.spread - skew), pend); }
  }
  // Packs: rip when the pulls sell for more than the pack, then flip them; the crowd-minded rip for the thrill
  if (w.pack > 0.1 && pk.evMarket * (1 - W.cfg.fee) > pk.price * 1.02) for (let k = 0; k < 1 + Math.floor(w.pack * 4); k++) if (!buyPack(W, b)) break;
  if (w.pack > 0.2) for (const c of held) if (W.rand() < w.pack) ask(b, c, c.P * 0.985, pend);
  if (w.herd > 0.25 && W.rand() < w.herd * 0.3 && b.cash > pk.price * 1.5) buyPack(W, b);
  // Raise cash when below half the cash target: sell what scores worst
  if (b.cash < g.keep * nw * 0.5) for (const [c] of scored.filter(([c]) => b.h.get(c.id)).sort((x, y) => x[1] - y[1]).slice(0, 2)) ask(b, c, c.P * 0.98, pend);
}
// A rule bot's sealed bid for an auctioned card: what its signals say the card is worth to it
function ruleAuctionBid(W, b, c) {
  const s = scoreCard(b, signals(W, b, c)), e = estimate(W, b, c);
  if (b.g.w.hoard > 0.15 && b.g.targets.includes(c.id)) return est(W, b, c) * (1 + 2 * b.g.w.hoard) * 0.9;
  if (e !== null && b.g.w.value > 0.2) return e * (1 - b.g.margin * 0.5);
  return s > 0.05 ? c.P * (1 + Math.min(0.2, s)) : null;
}
function ruleAuctionList(W, b) {
  if (b.items?.size && W.rand() < 0.06 + (b.g.w?.pack || 0) * 0.3) { const it = W.items.get(W.pick([...b.items])); if (it) { listItem(W, b, it, markItem(W, it) * (1 + (b.g.margin || 0.1))); return; } }
  if (b.g.w.pack > 0.25) for (const [id] of b.h) { const c = W.cards[id]; if (c.circ < 12 && W.rand() < 0.3) { listAuction(W, b, c, c.P); return; } }
  if (b.g.w.herd > 0.3 && W.rand() < 0.04 && b.h.size) { const c = [...b.h.keys()].map((id) => W.cards[id]).sort((x, y) => y.P - x.P)[0]; listAuction(W, b, c, c.P * 0.9); }
}


/* ---------- Neural bots ("primitive AI") ---------- */
// Each neural bot carries two small networks and nothing else: no strategy, no signals picked for it, no rules of
// thumb. The card network looks at one card at a time (every live card market, every week) and answers buy, sell,
// how far from the last price, how many, whether to research him and whether to auction it. The bot network looks at
// the bot's own balance sheet and the world once a week and sets everything else: its cash target, lending and
// borrowing, what it pays for passes and tickets, packs, sharing and stealing, and which contests to enter. The
// weights start random. Whatever earns money survives: at each generation's end the worst-returning 10% (averaged
// over their last 3 generations) copy the networks of the top 10% with small random changes.
// Games per topic this week and next (what the contest board shows everyone), counted once a week
function topicCount(W) { if (W._tcT === W.t) return W._tc; const n = {}; for (const cs of [W.contests, W.contestsAhead]) for (const c of Object.values(cs || {})) if (c?.topic) n[c.topic] = (n[c.topic] || 0) + 1; W._tcT = W.t; return (W._tc = n); }
export const CARD_IN_BASE = ['bias', 'price (log)', 'rarity premium (log)', 'design', 'finish', 'change 1w', 'change 4w', 'change 12w', 'below 12w average', 'trades 4w', 'copies out', 'pool left', 'has a note', 'note vs price', 'note age', 'OVR (from research)', 'copies held', 'gain on cost', 'share of worth', 'cash share', 'debt share', 'market drawdown', 'market 4w', 'season phase', 'one of a kind', 'its premium', 'risk rating (from research)', 'royalty yield (from note)', 'my weeks of life left', 'copies I am short', 'copies lendable', 'card lending fee', 'royalty paid last gen ÷ price', 'games on its position (this + next wk)', 'best bid ÷ price', 'best ask ÷ price', 'weeks out injured', 'form vs career pace', 'reigning award winner', 'retired', 'rookie'];
export const CARD_OUT_BASE = ['buy', 'sell', 'price offset', 'size', 'research', 'auction', 'short', 'anchor to my estimate'];
// The public price guide (priceGuide) adds two card-network inputs and one output. They exist only in a world where the
// guide is or was on, so with it off the networks, their random draws and every frame stay exactly as before.
export const GUIDE_IN = ['guide ÷ price', 'weeks since the guide updated'], GUIDE_OUT = ['anchor to the guide'];
export let CARD_IN = CARD_IN_BASE, CARD_OUT = CARD_OUT_BASE;
export const BOT_IN_BASE = ['bias', 'cash share', 'debt share', 'lent share', 'worth vs median', 'own 4w return', 'age', 'credit rate', 'weeks to my loan due', 'weeks to a loan I made is due', 'pass price', 'ticket price', 'prize pool', 'notes held', 'fresh notes', 'flags on me', 'friends', 'market drawdown', 'market 4w', 'season phase', 'pack value vs price', 'last week games', 'royalty rate', 'living cost share', 'weeks of life left', 'allowance share', 'trade fee', 'pack markup', 'card lending fee', 'short margin', 'my short exposure', 'my cards lent', ...TOPICS.map((t) => `games on ${t} (this + next wk)`)];
export let BOT_IN = BOT_IN_BASE; // government runs append their policy and board inputs (govBotIn)
// What a bot sees of another bot when it picks whom to swap notes with or steal from (all public or its own record, never
// the other's notes): the bot network's last outputs weigh these, and the best-scoring candidate is chosen (socialPhase)
export const PARTNER_IN = ['a friend of mine', 'its public flags', 'its weeks in the market'];
export const BOT_OUT = ['cash target', 'lend share', 'lend rate', 'borrow share', 'max borrow rate', 'pass bid', 'pass ask', 'ticket bid', 'ticket ask', 'research count', 'Standard packs', 'Premium packs', 'Elite packs', 'Holo packs', 'share notes', 'steal notes', 'accept swaps', ...GKEYS.map((g) => `enter ${g}`), 'lend cards share', ...TOPICS.map((t) => `research aim ${t}`), ...Object.keys(PACK_TYPES).map((t) => `pack bid ${t}`), 'quit', ...PARTNER_IN.map((f) => `share partner: ${f}`), ...PARTNER_IN.map((f) => `steal victim: ${f}`)];
const OUT_QUIT = 17 + GKEYS.length + 1 + TOPICS.length + Object.keys(PACK_TYPES).length, OUT_SHARE_W = OUT_QUIT + 1, OUT_STEAL_W = OUT_SHARE_W + 3; // where the quit and partner-weight outputs sit
let CARD_SHAPE = [CARD_IN.length, 16, 8, CARD_OUT.length], BOT_SHAPE = [BOT_IN.length, 12, BOT_OUT.length];
const NN = 8;
const sigm = (x) => 1 / (1 + Math.exp(-x));
const NW_FLOOR = 50; // × coinScale: the worth a bot's shares (cash, debt, holdings) are measured against when its own is lower, so a broke bot's inputs stay finite
function netSize(sh) { let n = 0; for (let i = 0; i + 1 < sh.length; i++) n += (sh[i] + 1) * sh[i + 1]; return n; }
// Each weight's initialization scale, 1/√fan-in of its layer (nnResetScale 'layer' redraws at it)
const initScales = (sh) => { const o = new Float64Array(netSize(sh)); let k = 0; for (let i = 0; i + 1 < sh.length; i++) { const s = 1 / Math.sqrt(sh[i]); for (let j = 0; j < (sh[i] + 1) * sh[i + 1]; j++) o[k++] = s; } return o; };
function randomNet(W, sh) { const w = new Float64Array(netSize(sh)); let k = 0; for (let i = 0; i + 1 < sh.length; i++) { const s = 1 / Math.sqrt(sh[i]); for (let j = 0; j < (sh[i] + 1) * sh[i + 1]; j++) w[k++] = W.gauss() * s; } return w; }
// Forward pass: tanh hidden layers, linear outputs. `buf` holds the layers so nothing is allocated per card.
function forward(sh, w, x, buf) {
  if (sh === CARD_SHAPE) return forwardCard(w, x, buf);
  let k = 0, a = x;
  for (let l = 0; l + 1 < sh.length; l++) {
    const n = sh[l], m = sh[l + 1], o = buf[l];
    for (let j = 0; j < m; j++) { let s = w[k + n]; for (let i = 0; i < n; i++) s += w[k + i] * a[i]; k += n + 1; o[j] = l + 2 < sh.length ? Math.tanh(s) : s; }
    a = o;
  }
  return a;
}
const bufs = (sh) => sh.slice(1).map((m) => new Float64Array(m));
// The card network's forward pass with its shape fixed (it runs about 350,000 times a week)
// Inputs 0 and 19–23 are the same for every card a bot looks at in a week, so their share of the first layer is folded
// into a bias once per bot and week (`fold`); inputs that are zero are skipped. The result is the same.
const VARY_BASE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 24, 25, 26, 27, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40]; let VARY = VARY_BASE; const FIXED = [0, 19, 20, 21, 22, 23, 28, 31];
const FOLD = new Float64Array(16), FOLD_X = new Float64Array(16); let foldKey = null, foldT = -1;
// FOLDS (only while the sealed auctions run, when bots take turns card by card and no network changes): each network's last
// fold, so a bot's next bid reuses it when its fixed inputs are bit-for-bit the same instead of working it out again
let FOLDS = null;
function foldFor(w, x, t, o = 0) {
  if (foldKey === w && foldT === t) { let same = true; for (let k = 0; k < FIXED.length; k++) if (x[o + FIXED[k]] !== FOLD_X[k]) { same = false; break; } if (same) return; }
  foldFill(w, x, t, o);
}
function foldFill(w, x, t, o) {
  const e = FOLDS ? FOLDS.get(w) : undefined;
  if (e && e.t === t) { let same = true; for (let k = 0; k < FIXED.length; k++) if (!Object.is(x[o + FIXED[k]], e.x[k])) { same = false; break; } if (same) { FOLD.set(e.f); FOLD_X.set(e.x); foldKey = w; foldT = t; return; } }
  const N0 = CARD_SHAPE[0]; for (let j = 0, k = 0; j < CARD_SHAPE[1]; j++, k += N0 + 1) { let s = w[k + N0]; for (const i of FIXED) s += w[k + i] * x[o + i]; FOLD[j] = s; }
  foldKey = w; foldT = t; for (let k = 0; k < FIXED.length; k++) FOLD_X[k] = x[o + FIXED[k]];
  if (FOLDS) { if (e) { e.t = t; e.x.set(FOLD_X); e.f.set(FOLD); } else FOLDS.set(w, { t, x: Float64Array.from(FOLD_X), f: Float64Array.from(FOLD) }); }
}
function forwardCard(w, x, buf) { foldFor(w, x, CUR_T); cardKernel(w, x, 0, buf[2], 0, buf); return buf[2]; }
// One card's pass through the card network: inputs x[o..], outputs to out[oo..]. The 16 first-layer sums run side by side
// (one pass over the inputs feeds all of them) and the later layers are written out: every sum adds the same terms in
// the same order as the plain loops did, so each result is bit-identical, but the CPU overlaps the chains (2.5× faster).
function cardKernel(w, x, o, out, oo, buf, j0 = 0, j1 = CARD_SHAPE[3]) { // j0..j1: the outputs wanted (all by default)
  const R = CARD_SHAPE[0] + 1, V = VARY, NV = V.length, F = FOLD;
  let s0 = F[0], s1 = F[1], s2 = F[2], s3 = F[3], s4 = F[4], s5 = F[5], s6 = F[6], s7 = F[7], s8 = F[8], s9 = F[9], s10 = F[10], s11 = F[11], s12 = F[12], s13 = F[13], s14 = F[14], s15 = F[15];
  for (let v = 0; v < NV; v++) { const i = V[v], xi = x[o + i]; if (xi === 0) continue; // zero inputs are skipped, as before
    s0 += w[i] * xi; s1 += w[i + R] * xi; s2 += w[i + 2 * R] * xi; s3 += w[i + 3 * R] * xi; s4 += w[i + 4 * R] * xi; s5 += w[i + 5 * R] * xi; s6 += w[i + 6 * R] * xi; s7 += w[i + 7 * R] * xi;
    s8 += w[i + 8 * R] * xi; s9 += w[i + 9 * R] * xi; s10 += w[i + 10 * R] * xi; s11 += w[i + 11 * R] * xi; s12 += w[i + 12 * R] * xi; s13 += w[i + 13 * R] * xi; s14 += w[i + 14 * R] * xi; s15 += w[i + 15 * R] * xi; }
  const a0 = fastTanh(s0), a1 = fastTanh(s1), a2 = fastTanh(s2), a3 = fastTanh(s3), a4 = fastTanh(s4), a5 = fastTanh(s5), a6 = fastTanh(s6), a7 = fastTanh(s7), a8 = fastTanh(s8), a9 = fastTanh(s9), a10 = fastTanh(s10), a11 = fastTanh(s11), a12 = fastTanh(s12), a13 = fastTanh(s13), a14 = fastTanh(s14), a15 = fastTanh(s15);
  if (buf) { const h = buf[0]; h[0] = a0; h[1] = a1; h[2] = a2; h[3] = a3; h[4] = a4; h[5] = a5; h[6] = a6; h[7] = a7; h[8] = a8; h[9] = a9; h[10] = a10; h[11] = a11; h[12] = a12; h[13] = a13; h[14] = a14; h[15] = a15; }
  let k = 16 * R; const h2 = KERN_H2;
  for (let j = 0; j < 8; j++, k += 17) h2[j] = fastTanh(w[k + 16] + w[k] * a0 + w[k + 1] * a1 + w[k + 2] * a2 + w[k + 3] * a3 + w[k + 4] * a4 + w[k + 5] * a5 + w[k + 6] * a6 + w[k + 7] * a7 + w[k + 8] * a8 + w[k + 9] * a9 + w[k + 10] * a10 + w[k + 11] * a11 + w[k + 12] * a12 + w[k + 13] * a13 + w[k + 14] * a14 + w[k + 15] * a15);
  const b0 = h2[0], b1 = h2[1], b2 = h2[2], b3 = h2[3], b4 = h2[4], b5 = h2[5], b6 = h2[6], b7 = h2[7]; if (buf) buf[1].set(h2);
  for (let j = j0, k3 = k + 9 * j0; j < j1; j++, k3 += 9) out[oo + j] = w[k3 + 8] + w[k3] * b0 + w[k3 + 1] * b1 + w[k3 + 2] * b2 + w[k3 + 3] * b3 + w[k3 + 4] * b4 + w[k3 + 5] * b5 + w[k3 + 6] * b6 + w[k3 + 7] * b7;
}
const KERN_H2 = new Float64Array(8);
// Many cards for one bot: rows from..to of X (inputs, CARD_SHAPE[0] wide) into O (outputs, CARD_SHAPE[3] wide)
function scoreRows(w, X, O, from, to, j0 = 0, j1 = CARD_SHAPE[3]) { const NI = CARD_SHAPE[0], N3 = CARD_SHAPE[3]; for (let r = from; r < to; r++) { foldFor(w, X, CUR_T, r * NI); cardKernel(w, X, r * NI, O, r * N3, null, j0, j1); } }
function fastTanh(v) { if (v > 9) return 1; if (v < -9) return -1; const e = Math.exp(2 * v); return (e - 1) / (e + 1); }
let CB = bufs(CARD_SHAPE), XC = new Float64Array(CARD_SHAPE[0]); let SHAPE_G = false, SHAPE_B = false, SHAPE_V = false, B0 = 41; // SHAPE_B, SHAPE_V: a government run's board and policy inputs (B0: the first board input of the card network)
// Switch the card network's shape to this world's (the guide inputs and output, or not)
function useShape(W) {
  const g = !!W.guideNet, gb = !!W.gov?.boardIn, gv = !!W.gov; if (g === SHAPE_G && gb === SHAPE_B && gv === SHAPE_V) return; SHAPE_G = g;
  if (gb !== SHAPE_B || gv !== SHAPE_V) { SHAPE_B = gb; SHAPE_V = gv; BOT_IN = gv ? [...BOT_IN_BASE, ...govBotIn(gb)] : BOT_IN_BASE; BOT_SHAPE = [BOT_IN.length, 12, BOT_OUT.length]; BB = bufs(BOT_SHAPE); XB = new Float64Array(BOT_SHAPE[0]); }
  CARD_IN = g ? [...CARD_IN_BASE, ...GUIDE_IN] : CARD_IN_BASE; CARD_OUT = g ? [...CARD_OUT_BASE, ...GUIDE_OUT] : CARD_OUT_BASE;
  if (gb) CARD_IN = [...CARD_IN, ...BOARD_CARD_IN]; B0 = CARD_IN_BASE.length + (g ? GUIDE_IN.length : 0); // government runs: the board's two inputs per card come last
  CARD_SHAPE = [CARD_IN.length, 16, 8, CARD_OUT.length]; CB = bufs(CARD_SHAPE); XC = new Float64Array(CARD_SHAPE[0]); VARY = g ? [...VARY_BASE, 41, 42] : VARY_BASE; if (gb) VARY = [...VARY, B0, B0 + 1]; foldKey = null;
}
// A network from before the guide was turned on: the new input and output weights start small and random, the rest
// unchanged, so nothing breaks and the bot must learn to use the guide
function widenCard(W, w) {
  const N0 = CARD_IN_BASE.length, M = CARD_OUT_BASE.length, A = CARD_SHAPE[0], O = CARD_SHAPE[3], NB = SHAPE_B ? BOARD_CARD_IN.length : 0; // NB: a government run's board inputs, kept after the new ones
  if (w.length === netSize(CARD_SHAPE) || w.length !== netSize([N0 + NB, 16, 8, M])) return w;
  const out = new Float64Array(netSize(CARD_SHAPE)); let i = 0, k = 0;
  for (let j = 0; j < 16; j++) { for (let q = 0; q < N0; q++) out[k++] = w[i++]; for (let q = N0; q < A - NB; q++) out[k++] = W.gauss() * W.cfg.nnWidenScale; for (let q = 0; q < NB; q++) out[k++] = w[i++]; out[k++] = w[i++]; }
  for (let q = 0; q < 17 * 8 + M * 9; q++) out[k++] = w[i++];
  for (let q = M; q < O; q++) for (let r = 0; r < 9; r++) out[k++] = W.gauss() * W.cfg.nnWidenScale;
  return out;
}
// A bot network from before the partner-weight outputs (one output fewer per weight): the new outputs' weights start small
// and random, every other weight unchanged (the output layer is the array's end, one row of hidden + 1 per output)
function widenBot(W, w) { const n = netSize(BOT_SHAPE), h = BOT_SHAPE[1] + 1; if (w.length > n || (n - w.length) % h) return w; const out = new Float64Array(n); out.set(w); for (let i = w.length; i < n; i++) out[i] = W.gauss() * 0.1; return out; }
let BB = bufs(BOT_SHAPE), XB = new Float64Array(BOT_SHAPE[0]);
const FLAT = Object.fromEntries(SIGNALS.map((k) => [k, 0]));
function startBias(W, card, bot) {
  const b = W.cfg.nnStartBias; if (!b) return;
  const cOut = (CARD_SHAPE[0] + 1) * CARD_SHAPE[1] + (CARD_SHAPE[1] + 1) * CARD_SHAPE[2], cN = CARD_SHAPE[2] + 1; // the output layer's weights start here; each output has N2 weights then its bias
  for (const j of [0, 1]) card[cOut + j * cN + CARD_SHAPE[2]] -= b; // buy, sell
  const bOut = (BOT_SHAPE[0] + 1) * BOT_SHAPE[1], bN = BOT_SHAPE[1] + 1;
  for (const j of [3, 10, 11, 12, 13]) bot[bOut + j * bN + BOT_SHAPE[1]] -= b; // borrow, the four pack types
}
function randomBrain(W) { const card = randomNet(W, CARD_SHAPE), bot = randomNet(W, BOT_SHAPE); startBias(W, card, bot); return { nn: true, card, bot, w: { ...FLAT, __nn: true }, err: W.cfg.nnResearchError, targets: [], book: [], keep: 0.2, lev: 0, lendShare: 0, lendRate: 0.004, maxRate: 0.006, passBid: 100, passAsk: 100, ticketBid: 20, ticketAsk: 20 }; }
function mutateBrain(W, g) {
  const s = W.cfg.nnMutation, o = { ...g, card: Float64Array.from(g.card), bot: Float64Array.from(g.bot), w: { ...g.w }, targets: [], book: [] };
  const rs = W.cfg.nnResetScale, layer = rs === 'layer';
  for (const [net, sh] of [[o.card, CARD_SHAPE], [o.bot, BOT_SHAPE]]) { const sc = layer && net.length === netSize(sh) ? initScales(sh) : null; // a network of another shape (before widening) redraws at 1
    for (let i = 0; i < net.length; i++) { net[i] += W.gauss() * s; if (W.rand() < W.cfg.nnReset) net[i] = sc ? W.gauss() * sc[i] : layer || rs === 1 ? W.gauss() : W.gauss() * rs; } }
  return o;
}
let CUR_T = -1;
function marketCtx(W) {
  CUR_T = W.t;
  if (W.gov && !W.gov.pub.vaultIndex) return { drop: 0, m4: 0, phase: (W.t % W.cfg.weeksPerGeneration) / W.cfg.weeksPerGeneration }; // a government withheld the Vault index: its inputs read as constants
  const ph = W.hist.p; return { drop: clamp(mood.drop * 3, 0, 1), m4: ph.length > 4 ? clamp((ph[ph.length - 1] / ph[ph.length - 5] - 1) * 3, -1, 1) : 0, phase: (W.t % W.cfg.weeksPerGeneration) / W.cfg.weeksPerGeneration };
}
// What the card market shows everyone this week, kept for each card in one flat array per world and filled at the card's
// first look of the week (as the per-card cache always was), so each bot's look reads numbers instead of the card
// object (each card inherits from its own player, so its properties are slow to reach). Also its fixed facts (player,
// design, finish, premium) and the week's games on its position (topicCount is itself fixed for the week once read).
const CWN = 16;
function cardWeek(W, c, id) {
  let T = W._cwT; if (!T || id >= T.length) { const n = Math.max(W.cards.length, id + 1), A = new Float64Array(n * CWN), T2 = new Int32Array(n).fill(-1); if (T) { A.set(W._cw); T2.set(T); } W._cw = A; W._cwT = T = T2; }
  const o = id * CWN; if (T[id] === W.t) return o;
  const m = W._cw, P = Math.max(0.01, c.P);
  m[o + 5] = clamp(ret(c, 1), -0.5, 0.5) * 2; m[o + 6] = clamp(ret(c, 4), -0.5, 0.5) * 2; m[o + 7] = clamp(ret(c, 12), -1, 1); m[o + 8] = clamp(1 - P / ma(c, 12), -0.5, 0.5) * 2; m[o + 9] = Math.log1p(recentVol(c, 4)) / 3; m[o + 10] = Math.log1p(c.circ) / 4; m[o + 11] = Math.log1p(c.pool || 0) / 5; m[o + 2] = Math.log(c.mult) / 2; m[o + 1] = Math.log10(P) / 5;
  m[o] = c.pid; m[o + 3] = c.d / 3; m[o + 4] = c.f / 3; m[o + 12] = c.mult; m[o + 13] = (topicCount(W)[c.pos] || 0) / 4; // games whose topic is this card's position, this week and next
  T[id] = W.t; return o;
}
// The card network's inputs for one bot and one card (or one-of-a-kind item), into x from offset xo
function cardInputs(W, b, c, nw, ctx, it, x = XC, xo = 0, id = c.id) {
  const o = cardWeek(W, c, id), m = W._cw, pid = m[o], cm = m[o + 12];
  const S = SNAP && id < SNAP.n ? snapRow(SNAP, id) : null, n = b.notes.get(pid), q = b.h.get(id) || 0, P = Math.max(0.01, S ? S.P[id] : c.P), mult = it ? it.mult : cm, price = it ? markItem(W, it) : P, fr = fresh(W, n);
  x[xo] = 1; x[xo + 1] = it ? Math.log10(price) / 5 : m[o + 1]; x[xo + 2] = it ? Math.log(mult) / 2 : m[o + 2]; x[xo + 3] = m[o + 3]; x[xo + 4] = m[o + 4];
  x[xo + 5] = m[o + 5]; x[xo + 6] = m[o + 6]; x[xo + 7] = m[o + 7]; x[xo + 8] = m[o + 8]; x[xo + 9] = m[o + 9]; x[xo + 10] = m[o + 10]; x[xo + 11] = m[o + 11];
  x[xo + 12] = fr ? 1 : 0; x[xo + 13] = fr ? clamp((n.est * mult - price) / price, -1, 1) : 0; x[xo + 14] = n ? clamp((W.t - n.week) / W.cfg.knowledgeWeeks, 0, 2) : 1; x[xo + 15] = fr && n.ovr ? (n.ovr - 80) / 20 : 0;
  x[xo + 16] = it ? 1 : q ? Math.log1p(q) / 2 : 0; const ac = q ? avgCost(b, id) : null; x[xo + 17] = it ? clamp(it.cost ? price / it.cost - 1 : 0, -1, 1) : ac ? clamp(P / ac - 1, -1, 1) : 0; x[xo + 18] = clamp(((it ? 1 : q) * price) / nw, 0, 1);
  x[xo + 19] = clamp(b.cash / nw, -1, 1); x[xo + 20] = clamp((b.debt || 0) / nw, 0, 2); x[xo + 21] = ctx.drop; x[xo + 22] = ctx.m4; x[xo + 23] = ctx.phase;
  x[xo + 24] = it ? 1 : 0; x[xo + 25] = it ? Math.log(it.mult / cm) / 2 : 0; x[xo + 26] = fr && n.risk != null ? (n.risk - 80) / 20 : 0;
  x[xo + 27] = W.cfg.royalties && !W.cfg.priceOnly ? clamp(W.cfg.royaltyRate * 10 * (fr ? (n.est * mult) / price : 1), 0, 3) : 0; // the PROMISED yield: the configured royaltyRate × (its note's estimate ÷ price), not what was paid (input 32 carries that)
  x[xo + 28] = b._life ?? 1; const ow = b.owed?.get(id), ld = W.lendable?.get(id); x[xo + 29] = ow ? Math.log1p(ow) : 0; x[xo + 30] = ld ? Math.log1p(ld) / 3 : 0; x[xo + 31] = W.cfg.shorting ? W.cfg.cardLendFee * 100 : 0; // (log1p(0) is 0, so absent counts skip it)
  const N = S ? S.news : playerNews(W, W.players[pid], NEWS1, 0), no = S ? pid * NWN : 0;
  if (S && !it) { const k = snapCx(S, c, id), X = S.cx; x[xo + 32] = X[k]; x[xo + 33] = m[o + 13]; x[xo + 34] = X[k + 1]; x[xo + 35] = X[k + 2]; if (SHAPE_G) x[xo + 41] = X[k + 3]; } // the same for every bot in a snapshot phase
  else { cardMarketInputs(it ? itemRoy(W, it) : S ? S.roy[id] : cardRoy(W, c), S ? S.bb[id] : c.bb, S ? S.ba[id] : c.ba, price, P, N, no, mult, x, xo); x[xo + 33] = m[o + 13]; }
  x[xo + 36] = N[no]; x[xo + 37] = N[no + 1]; x[xo + 38] = N[no + 2]; x[xo + 39] = N[no + 3]; x[xo + 40] = N[no + 4];
  if (SHAPE_G) x[xo + 42] = N[no + 5] === 1 ? N[no + 7] : 0;
  if (SHAPE_B) { const bi = W.gov.bIn; x[xo + B0] = bi[2 * pid] || 0; x[xo + B0 + 1] = bi[2 * pid + 1] || 0; } // the board: mentions of this player and their direction (government runs)
  return x;
}
// cardInputs for a plain card in a snapshot phase (SNAP set, the card in it), for the batches of nnAct and nnResearchWish:
// the inputs that are the same for all of one bot's cards are worked out once per batch (rowConsts, while its cash and
// debt can't change) and the rest line for line as cardInputs does, so every value is the same. TF_CHECK_ROWS=1 in the
// environment checks each row against cardInputs and throws on any difference.
const RK = { b: null, nw: 1, ctx: null, x19: 0, x20: 0, roy: false, rr: 0, x27: 0, x28: 1, x31: 0, kw: 0, t: 0 };
const CHECK_ROWS = typeof process !== 'undefined' && process.env?.TF_CHECK_ROWS === '1', XCHK = new Float64Array(64);
function rowConsts(W, b, nw, ctx) {
  const K = RK, cfg = W.cfg; K.b = b; K.nw = nw; K.ctx = ctx; K.x19 = clamp(b.cash / nw, -1, 1); K.x20 = clamp((b.debt || 0) / nw, 0, 2);
  K.roy = !!(cfg.royalties && !cfg.priceOnly); K.rr = cfg.royaltyRate; K.x27 = K.roy ? clamp(cfg.royaltyRate * 10 * 1, 0, 3) : 0; K.x28 = b._life ?? 1; K.x31 = cfg.shorting ? cfg.cardLendFee * 100 : 0; K.kw = cfg.knowledgeWeeks; K.t = W.t;
  return K;
}
function cardInputsSnap(W, K, c, id, x, xo) {
  const o = cardWeek(W, c, id), m = W._cw, pid = m[o], cm = m[o + 12], S = snapRow(SNAP, id), b = K.b, nw = K.nw, ctx = K.ctx;
  const n = b.notes.get(pid), q = b.h.get(id) || 0, P = Math.max(0.01, S.P[id]), fr = n && K.t - n.week <= K.kw;
  x[xo] = 1; x[xo + 1] = m[o + 1]; x[xo + 2] = m[o + 2]; x[xo + 3] = m[o + 3]; x[xo + 4] = m[o + 4];
  x[xo + 5] = m[o + 5]; x[xo + 6] = m[o + 6]; x[xo + 7] = m[o + 7]; x[xo + 8] = m[o + 8]; x[xo + 9] = m[o + 9]; x[xo + 10] = m[o + 10]; x[xo + 11] = m[o + 11];
  x[xo + 12] = fr ? 1 : 0; x[xo + 13] = fr ? clamp((n.est * cm - P) / P, -1, 1) : 0; x[xo + 14] = n ? clamp((K.t - n.week) / K.kw, 0, 2) : 1; x[xo + 15] = fr && n.ovr ? (n.ovr - 80) / 20 : 0;
  x[xo + 16] = q ? Math.log1p(q) / 2 : 0; const ac = q ? avgCost(b, id) : null; x[xo + 17] = ac ? clamp(P / ac - 1, -1, 1) : 0; x[xo + 18] = clamp((q * P) / nw, 0, 1);
  x[xo + 19] = K.x19; x[xo + 20] = K.x20; x[xo + 21] = ctx.drop; x[xo + 22] = ctx.m4; x[xo + 23] = ctx.phase;
  x[xo + 24] = 0; x[xo + 25] = 0; x[xo + 26] = fr && n.risk != null ? (n.risk - 80) / 20 : 0;
  x[xo + 27] = K.roy ? (fr ? clamp(K.rr * 10 * ((n.est * cm) / P), 0, 3) : K.x27) : 0;
  x[xo + 28] = K.x28; const ow = b.owed?.get(id), ld = W.lendable?.get(id); x[xo + 29] = ow ? Math.log1p(ow) : 0; x[xo + 30] = ld ? Math.log1p(ld) / 3 : 0; x[xo + 31] = K.x31;
  const k = snapCx(S, c, id), X = S.cx, N = S.news, no = pid * NWN; x[xo + 32] = X[k]; x[xo + 33] = m[o + 13]; x[xo + 34] = X[k + 1]; x[xo + 35] = X[k + 2]; if (SHAPE_G) x[xo + 41] = X[k + 3];
  x[xo + 36] = N[no]; x[xo + 37] = N[no + 1]; x[xo + 38] = N[no + 2]; x[xo + 39] = N[no + 3]; x[xo + 40] = N[no + 4];
  if (SHAPE_G) x[xo + 42] = N[no + 5] === 1 ? N[no + 7] : 0;
  if (SHAPE_B) { const bi = W.gov.bIn; x[xo + B0] = bi[2 * pid] || 0; x[xo + B0 + 1] = bi[2 * pid + 1] || 0; }
  if (CHECK_ROWS) { cardInputs(W, b, c, nw, ctx, undefined, XCHK, 0, id); for (let i = 0; i < CARD_SHAPE[0]; i++) if (!Object.is(XCHK[i], x[xo + i])) throw new Error(`cardInputsSnap: input ${i} of card ${id} is ${x[xo + i]}, cardInputs gives ${XCHK[i]}`); }
}
// Inputs 32, 34, 35 and 41 (with the guide): royalty yield, last week's book and the guide, each against the price
function cardMarketInputs(roy, bb, ba, price, P, N, no, mult, x, xo) {
  x[xo + 32] = roy ? clamp((roy / price) * 5, 0, 3) : 0; // what one copy paid holders over the last generation, against its price now (public to every bot, and a near-direct read of F: see the header)
  x[xo + 34] = bb > 0 ? clamp(Math.log(bb / P), -1, 1) : -1.5; x[xo + 35] = ba > 0 ? clamp(Math.log(ba / P), -1, 1) : 1.5; // last week's best unfilled bid and ask (none = off the scale)
  if (SHAPE_G) x[xo + 41] = N[no + 5] === 1 ? clamp(Math.log((N[no + 6] * mult) / price), -1, 1) : 0; // the public price guide: everyone sees it
}
// What everyone sees about a player: the league's public news (hidden value itself stays hidden) and the price guide
const NWN = 8, NEWS1 = new Float64Array(NWN);
function playerNews(W, pl, a, o) {
  const lg = pl?.lg, L = W.L;
  if (lg && L) { const out = lg.out && L.week >= lg.out[0] && L.week <= lg.out[1] ? lg.out[1] - L.week + 1 : 0;
    a[o] = out / L.full; a[o + 1] = lg.active ? clamp(Math.log(Math.max(0.05, lg.formRatio ?? 1)), -1.5, 1.5) : 0; a[o + 2] = lg.awardSeason != null && lg.awardSeason === L.season ? 1 : 0; a[o + 3] = lg.active ? 0 : 1; a[o + 4] = pl.rookie && lg.seasons <= 1 ? 1 : 0; }
  else { a[o] = 0; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; }
  const on = guideOn(W.cfg) && pl?.guide > 0; a[o + 5] = on ? 1 : 0; a[o + 6] = on ? pl.guide : 0; a[o + 7] = on ? clamp((W.t - pl.guideT) / 4, 0, 2) : 0;
  return a;
}
const cardNet = (W, b, c, nw, ctx, it) => forward(CARD_SHAPE, b.g.card, cardInputs(W, b, c, nw, ctx, it), CB);
function nnThink(W, b, med) {
  const g = b.g, x = XB, nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctx = marketCtx(W), lw = W.cfg.loanWeeks;
  const mine = (W.loans || []).filter((L) => L.borrower === b), lent = (W.loans || []).filter((L) => L.lender === b);
  x[0] = 1; x[1] = clamp(b.cash / nw, -1, 1); x[2] = clamp((b.debt || 0) / nw, 0, 2); x[3] = clamp((b.lent || 0) / nw, 0, 2); x[4] = clamp(Math.log(nw / Math.max(1, med)) / 3, -2, 2);
  x[5] = b.nwh.length > 4 ? clamp(b.nwh[b.nwh.length - 1] / b.nwh[b.nwh.length - 5] - 1, -1, 1) : 0; x[6] = b.lifespan ? clamp(b.seasons / b.lifespan, 0, 1.5) : 0;
  x[7] = clamp((W.credit?.rate || 0) * 100, 0, 3); x[8] = mine.length ? clamp((Math.min(...mine.map((L) => L.due)) - W.t) / lw, -1, 1) : 1; x[9] = lent.length ? clamp((Math.min(...lent.map((L) => L.due)) - W.t) / lw, -1, 1) : 1;
  x[10] = Math.log1p(W.passPrice || 0) / 5; x[11] = Math.log1p(W.ticketPrice || 0) / 5; x[12] = Math.log1p((W.prizePool || 0) / Math.max(1, W.bots.length)) / 5;
  let fr = 0; for (const n of b.notes.values()) if (fresh(W, n)) fr++;
  { const ns = W.cfg.memoryCap > 0 ? W.cfg.memoryCap : 25; x[13] = b.notes.size / ns; x[14] = fr / ns; } // scaled as when the cap was 25 x[15] = clamp((b.flaggedBy || 0) / 5, 0, 2); x[16] = clamp(b.friends.size / 10, 0, 2);
  x[17] = ctx.drop; x[18] = ctx.m4; x[19] = ctx.phase; const pk = packInfo(W); x[20] = clamp(pk.evMarket / Math.max(0.01, pk.price) - 1, -1, 1);
  x[21] = clamp((b.gameResults || []).reduce((s, r) => s + (r.net || 0), 0) / Math.max(1, W.cfg.gameStake * 3), -2, 2);
  const cfg = W.cfg, gw = cfg.weeksPerGeneration, life = cfg.mortality ? ((b.lifespan ?? (cfg.lifespan[0] + cfg.lifespan[1]) / 2) - b.seasons) * gw - (W.t % gw) : 400;
  b._life = clamp(life / 200, 0, 2);
  x[22] = cfg.royalties && !cfg.priceOnly ? cfg.royaltyRate * 10 : 0; x[23] = clamp(((cfg.livingCost + cfg.lifestyle * nw) / nw) * 10, 0, 3); x[24] = b._life; x[25] = clamp(((cfg.allowance * (W.fillK ?? 1) / (W.botK ?? 1)) / nw) * 10, 0, 3);
  x[26] = cfg.fee * 10; x[27] = cfg.packEdge; x[28] = cfg.shorting ? cfg.cardLendFee * 100 : 0; x[29] = cfg.shorting ? cfg.shortMargin : 0;
  x[30] = clamp(owedValue(W, b) / nw, 0, 3); x[31] = clamp(lentValue(W, b) / nw, 0, 3);
  { const tc = W.cfg.games ? topicCount(W) : {}; TOPICS.forEach((t, i) => { x[32 + i] = (tc[t] || 0) / 4; }); }
  if (SHAPE_V) govBotInputs(W, b, x, nw); // government runs: every policy dial, the board and the placebo (inputs 22, 25-27 become the policy's own)
  if (g.bot.length !== netSize(BOT_SHAPE)) g.bot = widenBot(W, g.bot);
  const o = forward(BOT_SHAPE, g.bot, x, BB);
  g.lendCards = Math.max(0, Math.tanh(o[27]));
  g.keep = (W.cfg.keepMax ?? 0.95) * sigm(o[0]); g.lendShare = Math.max(0, Math.tanh(o[1])) * (W.cfg.lendShareMax ?? 1); g.lendRate = nnRate(W, o[2]); g.lev = Math.max(0, Math.tanh(o[3])); g.maxRate = nnRate(W, o[4]); // lev: the share of what it may borrow (maxLTV × its cards) it asks for
  { const D = W.limDiag, rm = W.cfg.rateMax ?? 0.05, wall = (v) => (W.cfg.rateMap === 'log' ? v >= (W.cfg.rateClamp ?? 10) * 0.999 : (v - 0.001) / (rm - 0.001) > 0.95); // measurement only: is each output at its wall?
    if (D) { D.bots++; if (sigm(o[0]) > 0.95) D.keep++; if (wall(g.lendRate)) D.lendRate++; if (wall(g.maxRate)) D.maxRate++; if (g.lendRate > 0.05) D.lendOver++; if (g.maxRate > 0.05) D.maxOver++; if (Math.tanh(o[1]) > 0.9) D.lendShare++; if (Math.tanh(o[3]) > 0.9) D.lev++; } }
  const K = W.cfg.coinScale, lpc = Math.log(W.cfg.priceClamp ?? 50), plog = W.cfg.priceMap === 'log', tok = (v, ref) => ref * Math.exp(plog ? clamp(v, -lpc, lpc) : Math.tanh(v)); // a pass or ticket price: around the last clearing price, bids and asks alike, on the pack bid's scale
  const pRef = W.passPrice > 0 ? W.passPrice : (W.cfg.passOpen ?? 10) * K, tRef = W.ticketPrice > 0 ? W.ticketPrice : (W.cfg.ticketOpen ?? 4) * K;
  g.passBid = tok(o[5], pRef); g.passAsk = tok(o[6], pRef); g.ticketBid = tok(o[7], tRef); g.ticketAsk = tok(o[8], tRef);
  b._nnResearch = Math.min(W.cfg.maxResearchPerWeek, Math.round((W.cfg.passesPerWeek || 1) * Math.exp(Math.min(o[9], 20)))); // an open scale: the pass price binds, maxResearchPerWeek is only a safety bound
  { const mp = W.cfg.maxPacks ?? 3; b._nnPacks = Object.keys(PACK_TYPES).map((t, i) => [t, o[10 + i] > 0 ? 1 + Math.min(mp - 1, Math.floor(mp * Math.tanh(o[10 + i]))) : 0]); } // 0 to maxPacks of each type; maxPacks (all types together) is the only ceiling
  b.social = o[15] > Math.max(o[14], 0) ? 'thief' : o[14] > 0 ? 'sharer' : 'reciprocator'; b._nnAccept = o[16] > 0; // the label is its dominant wish; each act below is its own output
  b._nnShare = o[14] > 0; b._nnSteal = o[15] > 0; b._nnShareW = [o[OUT_SHARE_W], o[OUT_SHARE_W + 1], o[OUT_SHARE_W + 2]]; b._nnStealW = [o[OUT_STEAL_W], o[OUT_STEAL_W + 1], o[OUT_STEAL_W + 2]];
  const aim0 = 17 + GKEYS.length + 1; b._nnAim = Object.fromEntries(TOPICS.map((t, i) => [t, Math.tanh(o[aim0 + i])])); // added to each card's research score by position
  b._nnQuit = sigm(o[OUT_QUIT]); // its own wish to leave the market (quitRule 'network')
  b._nnPackBid = Object.fromEntries(Object.keys(PACK_TYPES).map((t, i) => { const v = o[aim0 + TOPICS.length + i]; if (W.limDiag) { W.limDiag.packBid++; if (plog ? Math.abs(v) >= lpc : Math.abs(Math.tanh(v)) > 0.9) W.limDiag.packBidEdge++; } return [t, Math.exp(plog ? clamp(v, -lpc, lpc) : Math.tanh(v))]; })); // its bid: ×0.37 to ×2.7 the last clearing price ('range'), or as far as the safety clamp ('log')
  b._nnGames = GKEYS.map((k, i) => [k, o[17 + i]]).filter(([, v]) => v > 0).sort((p, q) => q[1] - p[1]).map(([k]) => k);
}
// A loan-rate output as a weekly rate: 'range' a sigmoid between 0.1% and rateMax; 'log' rateLogMid × exp(output), held only at rateClamp
const nnRate = (W, v) => (W.cfg.rateMap === 'log' ? Math.min(W.cfg.rateClamp ?? 10, (W.cfg.rateLogMid ?? 0.025) * Math.exp(Math.min(v, 50))) : 0.001 + ((W.cfg.rateMax ?? 0.05) - 0.001) * sigm(v));
// Every card's price, last week's best unfilled bid and ask, and last royalty, read once at the start of a phase in which
// none of them can change (the bots' research wishes; the weekly orders) instead of once per card per bot. The check at
// the phase's end makes sure of it: a rule that changes one of them inside such a phase must clear SNAP before it does.
let SNAP = null;
function snapCards(W) {
  const n = W.cards.length, S = { n, W, ok: new Uint8Array(n), P: new Float64Array(n), bb: new Float64Array(n), ba: new Float64Array(n), roy: new Float64Array(n), off: new Uint8Array(n) }; // a card's row is copied when the phase first reads it (snapRow): nothing it holds can change in the phase, so it is what a copy at the start would hold
  S.news = new Float64Array(W.players.length * NWN); W.players.forEach((pl, i) => playerNews(W, pl, S.news, i * NWN)); // (players are indexed by id)
  S.cx = new Float64Array(n * 4); S.cxOk = new Uint8Array(n); S.T = new Float64Array(43); // each plain card's inputs 32, 34, 35, 41, as cardInputs reads them: worked out from the snapshot the first time a bot reads the card (snapCx)
  return S;
}
// A card's inputs 32, 34, 35 and 41 in a snapshot phase, from the snapshot's own values (so the same whenever they are worked out); returns their offset in S.cx
// What one copy of a card paid over the last generation: his player's roySum (set by payRoyalties) × the card's multiplier,
// as payRoyalties used to store on every card each week (undefined before the first payment, which every reader takes as none)
// The same for a one-of-a-kind card: none until a payment has been made since it was minted (W._itRoyN: uid -> the payments
// made before it; a plain Map, as a WeakMap this large slows every full garbage collection)
function itemRoy(W, it) { const n0 = W._itRoyN?.get(it.uid) ?? 0; return (W._royN || 0) > n0 ? (W.players[it.pid]?.roySum || 0) * (it.mult / Math.max(1e-9, W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)]?.mult || 1)) : undefined; }
function cardRoy(W, c) { return W._royPaid ? (W.players[c.pid].roySum || 0) * c.mult : undefined; }
// The snapshot with card id's row filled in (undefined is stored as NaN: both read as "none")
function snapRow(S, id) { if (!S.ok[id]) { const c = S.W.cards[id]; S.P[id] = c.P; S.bb[id] = c.bb; S.ba[id] = c.ba; S.roy[id] = cardRoy(S.W, c); S.off[id] = c.on === false ? 1 : 0; S.ok[id] = 1; } return S; }
function snapCx(S, c, id) {
  const k = id * 4; if (S.cxOk[id]) return k; snapRow(S, id);
  const T = S.T, P = Math.max(0.01, S.P[id]); cardMarketInputs(S.roy[id], S.bb[id], S.ba[id], P, P, S.news, c.pid * NWN, c.mult, T, 0); S.cx[k] = T[32]; S.cx[k + 1] = T[34]; S.cx[k + 2] = T[35]; S.cx[k + 3] = T[41]; S.cxOk[id] = 1;
  return k;
}
function endSnap(W, S) {
  if (SNAP !== S) return; SNAP = null; const same = (a, v) => Object.is(a, v) || (Number.isNaN(a) && v == null) || (a === 0 && v === null); // null and undefined were stored as 0 and NaN
  for (let id = 0; id < S.n; id++) { if (!S.ok[id]) continue; const c = W.cards[id]; if (!same(S.P[id], c.P) || !same(S.bb[id], c.bb) || !same(S.ba[id], c.ba) || !same(S.roy[id], cardRoy(W, c)) || S.off[id] !== (c.on === false ? 1 : 0)) throw new Error(`card ${c.key}: price, quotes, royalty or status changed during a phase that reads them from a snapshot`); }
  for (let i = 0; i < W.players.length && (i + 1) * NWN <= S.news.length; i++) { playerNews(W, W.players[i], NEWS1, 0); for (let k = 0; k < NWN; k++) if (!Object.is(NEWS1[k], S.news[i * NWN + k])) throw new Error(`player ${W.players[i].key}: league news or guide changed during a phase that reads them from a snapshot`); }
}
// Row buffers for scoring many cards for one bot at once (reused, grown when needed)
let ROW_X = new Float64Array(0), ROW_O = new Float64Array(0), ROW_C = [], ROW_I = new Int32Array(0), ROW_ID = new Int32Array(0);
function rowBufs(n) { const NI = CARD_SHAPE[0], N3 = CARD_SHAPE[3]; if (ROW_X.length < n * NI) ROW_X = new Float64Array(n * NI); if (ROW_O.length < n * N3) ROW_O = new Float64Array(n * N3); if (ROW_I.length < n) { ROW_I = new Int32Array(n); ROW_ID = new Int32Array(n); } }
// Research: the players whose cards most make the network want to look them up (players it has no fresh note on)
function nnResearchWish(W, b) {
  const want = b._nnResearch || 0; if (!want) return [];
  const nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctx = marketCtx(W), NI = CARD_SHAPE[0], N3 = CARD_SHAPE[3];
  const pidOf = cardIndex(W), live = W._live, lid = W._liveId, ids = [];
  if (!W._seen || W._seen.length < W.players.length) { W._seen = new Int32Array(W.players.length + 64); W._seenN = 0; } const seen = W._seen, sn = ++W._seenN; // players already looked at: seen[pid] === sn
  const S = SNAP, look = (id) => { const pid = pidOf[id]; if (seen[pid] === sn || (S && id < S.n ? snapRow(S, id).off[id] === 1 : W.players[pid].on === false)) return; seen[pid] = sn; if (!fresh(W, b.notes.get(pid))) ids.push(id); }; // a card's status is its player's
  if (W.cfg.attention > 0) { for (const c of attended(W, b)) if (c) look(c.id); } // (attention budget) only the cards it looks at this week, in that order
  else { for (const id of b.h.keys()) look(id); for (let i = 0; i < live.length; i++) look(lid[i]); } // the cards it holds first, then every live card
  rowBufs(ids.length); const K = rowConsts(W, b, nw, ctx); for (let r = 0; r < ids.length; r++) { const id = ids[r]; S && id < S.n ? cardInputsSnap(W, K, W.cards[id], id, ROW_X, r * NI) : cardInputs(W, b, W.cards[id], nw, ctx, undefined, ROW_X, r * NI, id); } // nothing changes while it looks, so all its cards are scored in one batch
  scoreRows(b.g.card, ROW_X, ROW_O, 0, ids.length, 4, 5); // only the research output is read here
  if (!(Number.isInteger(want) && want <= 64)) { const sc = ids.map((id, r) => { const pl = W.players[pidOf[id]]; return [pl, ROW_O[r * N3 + 4] + (b._nnAim?.[pl.pos] || 0)]; });
    return sc.filter((x) => x[1] > 0).sort((p, q) => q[1] - p[1]).slice(0, want).map((x) => x[0]); }
  // the best `want` positive scores, ranked as the stable sort ranked them (higher first, ties in the order looked at)
  const tv = [], tp = [];
  for (let r = 0; r < ids.length; r++) { const pl = W.players[pidOf[ids[r]]], v = ROW_O[r * N3 + 4] + (b._nnAim?.[pl.pos] || 0); if (!(v > 0)) continue;
    let L = tv.length; if (L >= want) { if (!(v > tv[L - 1])) continue; tv.pop(); tp.pop(); L--; }
    let p = L; tv.push(v); tp.push(pl); while (p > 0 && tv[p - 1] < v) { tv[p] = tv[p - 1]; tp[p] = tp[p - 1]; p--; } tv[p] = v; tp[p] = pl; }
  return tp;
}
// Attention budget (cfg.attention > 0): each week every neural bot gets K live cards drawn at random (uniformly, or by public
// trade volume), never by its own network or by hidden values; with its holdings and watchlist they are all it looks at.
function attendWeek(W, nn) { W.attDiag = { bots: 0, cards: 0, sampled: 0, watch: 0, live: W._live.length }; W._attCum = null; for (const b of nn) attendBot(W, b); }
function attendBot(W, b) {
  const cfg = W.cfg, live = W._live, N = live.length, K = cfg.attention, mem = cfg.attentionMemory ?? 8;
  let cum = W._attCum; if (cfg.attentionSample === 'volume' && !cum) { cum = W._attCum = new Float64Array(N); let s = 0; for (let i = 0; i < N; i++) cum[i] = s += 1 + recentVol(live[i], 4); }
  const pick = () => { if (!cum) return live[Math.floor(W.rand() * N)]; const r = W.rand() * cum[N - 1]; let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi) >> 1; cum[m] > r ? (hi = m) : (lo = m + 1); } return live[lo]; };
  const w = new Set(); if (b._attTr) for (const [id, t] of [...b._attTr]) W.t - t > mem ? b._attTr.delete(id) : w.add(id); // traded lately
  for (const a of W.auctions) if (a.seller === b) w.add(a.cardId); if (b.owed) for (const id of b.owed.keys()) w.add(id); for (const it of itemsOf(W, b)) w.add(mktId(it.pid, it.d === 4 ? 0 : it.d, it.f));
  const s = new Set(); if (N) { const k = Math.min(K, N); for (let tries = 0; s.size < k && tries < 20 * k; tries++) { const c = pick(); if (!b.h.has(c.id) && !b.notes.has(c.pid) && !w.has(c.id)) s.add(c.id); } }
  b._attW = w; b._attS = s; b._attT = W.t; const A = W.attDiag; if (A) { A.bots++; A.sampled += s.size; A.watch += w.size; }
}
// A bot that arrived after this week's draw (a newcomer or an heir) gets its own draw on first look
const attNow = (W, b) => { if (b._attT !== W.t) attendBot(W, b); };
// Does a neural bot look at this card this week? (always, with no attention budget)
const attends = (W, b, c) => { if (!(W.cfg.attention > 0)) return true; attNow(W, b); return b.h.has(c.id) || b.notes.has(c.pid) || b._attS.has(c.id) || b._attW.has(c.id); };
// The cards a neural bot scores this week: every live card, or (attention budget) its holdings, noted players' live cards, watchlist and sample
function attended(W, b) {
  if (!(W.cfg.attention > 0)) { const cand = new Set(W._live); for (const id of b.h.keys()) cand.add(W.cards[id]); for (const pid of b.notes.keys()) cand.add(W.cards[mktId(pid, 0, 0)]); return cand; }
  attNow(W, b); const cand = new Set(); for (const id of b.h.keys()) cand.add(W.cards[id]);
  for (const pid of b.notes.keys()) { cand.add(W.cards[mktId(pid, 0, 0)]); for (let j = 0; j < 16; j++) { const c = W.cards[pid * 16 + j]; if (c && c.on !== false && c.circ > 0) cand.add(c); } }
  for (const id of b._attW) cand.add(W.cards[id]); for (const id of b._attS) cand.add(W.cards[id]);
  return cand;
}
// Each card's player (fixed), and this week's live cards' ids, read once instead of once per bot
function cardIndex(W) {
  if (!W._cpid || W._cpid.length !== W.cards.length) { const a = (W._cpid = new Int32Array(W.cards.length)); for (const c of W.cards) a[c.id] = c.pid; }
  if (W._liveM !== W._live) { const m = (W._inLive = new Uint8Array(W.cards.length + 1)), l = (W._liveId = new Int32Array(W._live.length)); W._live.forEach((c, i) => { l[i] = c.id; m[c.id] = 1; }); W._liveM = W._live; }
  return W._cpid;
}
// Every live card, then the cards a bot holds or has notes on that aren't live (or missing: -1), each once, in that order
// (returned as the week's live ids and the extras after them, read through candAt, instead of one copied array)
function candidates(W, b) {
  cardIndex(W); const lid = W._liveId, m = W._inLive, ex = new Set(), extra = [], add = (id) => { const c = W.cards[id]; if (c && m[id]) return; const k = c ? id : -1; if (!ex.has(k)) { ex.add(k); extra.push(k); } };
  for (const id of b.h.keys()) add(id); for (const pid of b.notes.keys()) add(mktId(pid, 0, 0));
  return { lid, extra, length: lid.length + extra.length };
}
const ROW_OUT = new Float64Array(16); let ACT_BX = new Float64Array(0);
// Copies per order from the size output: 1 to qMax in equal bins of the sigmoid, so every size up to qMax is reachable (qtyEdge counts the top bin)
const qtyOf = (qMax, v) => 1 + Math.min(qMax - 1, Math.floor(qMax * sigm(v)));
function nnAct(W, b) {
  const pend = new Map(), g = b.g, nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctx = marketCtx(W);
  const att = W.cfg.attention > 0 ? attended(W, b) : null, cand = att ? { lid: Int32Array.from(att, (c) => (c ? c.id : -1)), extra: [], length: att.size } : candidates(W, b), cL = cand.lid, cE = cand.extra, nL = cL.length, NI = CARD_SHAPE[0], N3 = CARD_SHAPE[3], CH = 256; if (att && W.attDiag) W.attDiag.cards += att.size;
  const buys = [], D = W.limDiag; let listed = 0, shorts = 0, lBlock = 0, sBlock = 0, oBlock = 0, iBlock = 0;
  // The cards are scored in batches of up to CH. Only a short sale changes what the bot sees of its later cards (its
  // cash), so after one the rest of the batch is scored again from that state: every score is the one it saw before.
  const pidOf = W._cpid, qMax = W.cfg.maxOrderQty ?? 3, S = SNAP; rowBufs(CH); let ci = 0, nB = 0;
  // The buy wishes are placed strongest first, and the loop below reads at most the first ceil(deployOrders) + 1 of them
  // (the last one only to see whether the count stopped an order). So only that many are kept, ranked as the stable sort
  // ranked them (a stronger wish first, equal wishes in the order the cards were scored); each keeps its inputs in a slot of
  // BX that an evicted wish frees. With no finite deployOrders (or a huge one) every wish is kept and sorted, as before.
  const dO = W.cfg.deployOrders, K = Number.isFinite(dO) ? Math.max(0, Math.ceil(dO)) + 1 : Infinity, topK = K <= 4096;
  let BX = topK ? (ACT_BX.length >= K * NI ? ACT_BX : (ACT_BX = new Float64Array(K * NI))) : new Float64Array(64 * NI);
  while (ci < cand.length) {
    const KR = rowConsts(W, b, nw, ctx); let nR = 0, j = ci; for (; j < cand.length && nR < CH; j++) { const id = j < nL ? cL[j] : cE[j - nL]; if (id < 0 || (S && id < S.n ? snapRow(S, id).off[id] === 1 : W.players[pidOf[id]].on === false)) continue; const c = W.cards[id]; ROW_C[nR] = c; ROW_I[nR] = j; ROW_ID[nR] = id; S && id < S.n ? cardInputsSnap(W, KR, c, id, ROW_X, nR * NI) : cardInputs(W, b, c, nw, ctx, undefined, ROW_X, nR * NI, id); nR++; }
    scoreRows(g.card, ROW_X, ROW_O, 0, nR); ci = j;
    for (let r = 0; r < nR; r++) {
      const c = ROW_C[r], id = ROW_ID[r], o = ROW_OUT; for (let k = 0; k < N3; k++) o[k] = ROW_O[r * N3 + k];
      // the price in two parts: the guide's pull (it feeds a running measurement, so it runs for every card, in order) and the
      // rest only for a card that gets an order; the same operations as one nnPrice call, so the same price
      const q = b.h.get(id) || 0, kw = id * CWN, base = nnPriceStart(W, c, o, undefined, undefined, id); let px = 0, pxOk = false, pEdge = false, pFar = false;
      if (o[0] > 0 && o[0] > o[1]) { px = nnPriceEnd(W, b, o, undefined, W._cw[kw], W._cw[kw + 12], base); pxOk = true; pEdge = NP.edge; pFar = NP.far;
        if (!topK) { if (BX.length < (nB + 1) * NI) { const B2 = new Float64Array(BX.length * 2); B2.set(BX); BX = B2; } BX.set(ROW_X.subarray(r * NI, r * NI + NI), nB * NI); // its inputs, kept in one buffer and copied out only for the orders it places
          buys.push([c, o[0], px, qtyOf(qMax, o[3]), nB++, Math.tanh(o[2]), pEdge, pFar, sigm(o[3]) >= (qMax - 1) / qMax]); }
        else { const v = o[0], L = buys.length; if (L < K || v > buys[L - 1][1]) { let slot; if (L < K) slot = L; else slot = buys.pop()[4];
          BX.set(ROW_X.subarray(r * NI, r * NI + NI), slot * NI); const e = [c, v, px, qtyOf(qMax, o[3]), slot, Math.tanh(o[2]), pEdge, pFar, sigm(o[3]) >= (qMax - 1) / qMax];
          let p = buys.length; buys.push(e); while (p > 0 && buys[p - 1][1] < v) { buys[p] = buys[p - 1]; p--; } buys[p] = e; } } }
      else if (q && o[1] > 0) { px = nnPriceEnd(W, b, o, undefined, W._cw[kw], W._cw[kw + 12], base); pxOk = true; pEdge = NP.edge; pFar = NP.far; const x = ROW_X.slice(r * NI, r * NI + NI); (W.offDiag ||= { bid: [], ask: [] }).ask.push(Math.tanh(o[2])); if (D) { D.ask++; if (pEdge) D.askEdge++; if (pFar) D.askFar++; D.qty++; if (sigm(o[3]) >= (qMax - 1) / qMax) D.qtyEdge++; } for (let k = 0; k < Math.min(q, qtyOf(qMax, o[3])); k++) ask(b, c, px, pend, x); }
      if (q && o[5] > 1 && W.cfg.auctions && (b.h.get(id) || 0) - (pend.get(id) || 0) > 0) { if (listed < (W.cfg.maxListings ?? 1)) { listAuction(W, b, c, nnPrice(W, b, c, o, undefined, undefined, id)); listed++; } else lBlock = 1; }
      if (W.cfg.shorting && !q && o[6] > 0.5 && o[6] > o[0] && (W.lendable?.get(id) || 0) > 0) { if (shorts < (W.cfg.maxShorts ?? 3)) { if (!pxOk) px = nnPriceEnd(W, b, o, undefined, W._cw[kw], W._cw[kw + 12], base); if (borrowCard(W, b, c)) { ask(b, c, px, pend); shorts++;
          // the short sale moved its cash (input 19); nothing else the later cards in this batch show it changed (its holding,
          // lots, borrowed count and the lendable count moved only for this card), so their rows get the new cash and debt
          // shares, as cardInputs writes them, and are scored again
          for (let r2 = r + 1; r2 < nR; r2++) { const xo = r2 * NI; ROW_X[xo + 19] = clamp(b.cash / nw, -1, 1); ROW_X[xo + 20] = clamp((b.debt || 0) / nw, 0, 2); }
          scoreRows(g.card, ROW_X, ROW_O, r + 1, nR); } } else sBlock = 1; }
    }
  }
  let spare = b.cash - g.keep * nw, n = 0;
  for (const [c, , px, qn, xi, off, pEdge, pFar, qE] of topK ? buys : buys.sort((p, q) => q[1] - p[1])) { if (n >= W.cfg.deployOrders) { if (spare > px) oBlock = 1; break; } const x = BX.slice(xi * NI, xi * NI + NI); if (spare > px) { (W.offDiag ||= { bid: [], ask: [] }).bid.push(off); if (D) { D.bid++; if (pEdge) D.bidEdge++; if (pFar) D.bidFar++; D.qty++; if (qE) D.qtyEdge++; } } for (let k = 0; k < qn && spare > px; k++) { bid(b, c, px, x); spare -= px; } n++; }
  for (const it of itemsOf(W, b)) { const c = W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)], o = cardNet(W, b, c, nw, ctx, it); if (o[1] > 0 && o[5] > 0) { if (listed >= (W.cfg.maxListings ?? 1) + 1) { iBlock = 1; break; } listItem(W, b, it, nnPrice(W, b, c, o, it)); listed++; } }
  let packs = 0, want = 0; for (const [, k] of b._nnPacks || []) want += k;
  for (const [t, k] of b._nnPacks || []) for (let i = 0; i < k && packs < (W.cfg.maxPacks ?? 3); i++, packs++) { const pm = b._nnPackBid?.[t] ?? 1, pp = packInfo(W, t).price * (W.cfg.packSale === 'auction' ? pm : 1); if (!(spare >= pp) || !buyPack(W, b, t, pm)) break; spare -= pp; } // packs spend the same spare cash (above its 'cash target') as its card bids
  if (D) { D.acts++; D.orders += oBlock; D.listings += lBlock; D.items += iBlock; D.shorts += sBlock; if (want > (W.cfg.maxPacks ?? 3)) D.packs++; }
}
// A sealed bid: the card network's view of the card, or of the one-of-a-kind card, in plain-card coins
// A neural bot's price for a card: a base between the current price and its own fresh research estimate (the 'anchor'
// output chooses how far toward the estimate), then moved up to ±priceRange by the 'price offset' output
const NP = { edge: false, far: false }; // the last nnPrice call: at its wall, and beyond the default range's edge (×0.46 or ×1.54); measurement only
function nnPrice(W, b, c, o, it, base0, id) { // id: a plain card cardInputs read this week (its player and premium are in the week's array)
  const k = id != null && !it ? id * CWN : -1, pid = k >= 0 ? W._cw[k] : c.pid, cm = k >= 0 ? W._cw[k + 12] : c.mult;
  return nnPriceEnd(W, b, o, it, pid, cm, nnPriceStart(W, c, o, it, base0, id));
}
// nnPrice's first part: the base price, pulled toward the public guide (which adds to the guideUse measurement)
function nnPriceStart(W, c, o, it, base0, id) {
  const k = id != null && !it ? id * CWN : -1, pid = k >= 0 ? W._cw[k] : c.pid, cm = k >= 0 ? W._cw[k + 12] : c.mult;
  const P = base0 ?? (it ? markItem(W, it) : k >= 0 && SNAP && id < SNAP.n ? snapRow(SNAP, id).P[id] : c.P);
  let base = P; const pl = W.players[pid];
  if (SHAPE_G && guideOn(W.cfg) && pl?.guide > 0) { const a = sigm(o[8]); base += (pl.guide * (it ? it.mult : cm) - base) * a; const U = (W.guideUse ||= { s: 0, n: 0 }); U.s += a; U.n++; } // first toward the public guide
  return base;
}
// nnPrice's second part: toward the bot's own fresh research, then the price-offset output (pid, cm: the card's player and premium)
function nnPriceEnd(W, b, o, it, pid, cm, base) {
  const n = b.notes.get(pid), est = fresh(W, n) && n.est > 0 ? n.est * (it ? it.mult : cm) : null;
  if (est != null && W.cfg.priceAnchor !== false) base += (est - base) * sigm(o[7]); // then toward its own research
  if (W.cfg.priceMap === 'log') { const lc = Math.log(W.cfg.priceClamp ?? 50), z = (W.cfg.priceLogK ?? 0.6) * o[2]; NP.edge = Math.abs(z) >= lc; NP.far = z > 0.4318 || z < -0.7765; return base * Math.exp(clamp(z, -lc, lc)); } // ln 1.54 and ln 0.46: the edges of the default range at |tanh| 0.9
  const t = Math.tanh(o[2]); NP.edge = Math.abs(t) > 0.9; NP.far = NP.edge; return base * (1 + (W.cfg.priceRange ?? 0.6) * t);
}
function nnAuctionBid(W, b, c, it, nw, ctx) { if (!attends(W, b, c)) return null; nw ??= Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)); ctx ??= marketCtx(W); const o = cardNet(W, b, c, nw, ctx, it); return o[0] > 0 && o[0] > o[1] ? nnPrice(W, b, c, o, null, c.P) : null; }
// What the population learned: how much each input moves "buy minus sell", averaged over sample cards, for the
// richest 10% and for everyone (finite differences on each bot's own card network)
export function nnSensitivity(W, k = 24) {
  const nn = W.bots.filter((b) => b.g?.nn); if (!nn.length || !W._live?.length) return null;
  const top = nn.slice().sort((x, y) => worth(W, y) - worth(W, x)).slice(0, Math.max(1, Math.round(nn.length * 0.1)));
  const cards = Array.from({ length: k }, (_, i) => W._live[Math.floor((i * W._live.length) / k)]), ctx = marketCtx(W);
  const sens = (bots) => { const s = new Float64Array(CARD_IN.length); let m = 0;
    for (const b of bots) { const nw = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)); for (const c of cards) { const x0 = Float64Array.from(cardInputs(W, b, c, nw, ctx)); const base = forward(CARD_SHAPE, b.g.card, x0, CB); const y0 = base[0] - base[1];
      for (let i = 1; i < x0.length; i++) { const x1 = Float64Array.from(x0); x1[i] += 0.25; const o = forward(CARD_SHAPE, b.g.card, x1, CB); s[i] += (o[0] - o[1] - y0) / 0.25; } m++; } }
    return [...s].map((v) => Math.round((v / Math.max(1, m)) * 100) / 100); };
  const sample = nn.length > 60 ? nn.filter((_, i) => i % Math.ceil(nn.length / 60) === 0) : nn;
  return { inputs: CARD_IN, top: sens(top), all: sens(sample), week: W.t };
}
// Random names: a given name and a surname; an heir keeps the family name
function randomName(W, parent) {
  const N = W.library.names; if (!N) return null;
  const used = W.usedNames ||= new Set(W.bots.map((b) => b.name));
  for (let k = 0; k < 40; k++) { const nm = `${W.pick(N.first)} ${parent?.surname || W.pick(N.last)}`; if (!used.has(nm)) { used.add(nm); return nm; } }
  const base = `${W.pick(N.first)} ${parent?.surname || W.pick(N.last)}`; let i = 2; while (used.has(`${base} ${ROMAN[i] || i}`)) i++; const nm = `${base} ${ROMAN[i] || i}`; used.add(nm); return nm;
}

/* ---------- Credit between bots ---------- */
// There is no bank. Bots with idle cash offer loans at the rate they ask; bots with an appetite for leverage request
// them up to the most they will pay. Offers and requests clear once a week at one rate. Loans are secured by the
// borrower's cards: past the margin line the borrower must sell; at maturity it must repay or sell; an insolvent
// borrower defaults and its lenders lose what can't be recovered. No coins are created: credit only moves them.
// A default's collateral: the seized cards go to the liquidator carrying the unpaid lenders' claim (W.claimNew, filled just
// before); each sale pays them pro rata to what each is still owed, and anything over goes to the borrower (liqPay)
function seize(W, b) {
  const lenders = W.claimNew || []; W.claimNew = null; const cl = lenders.length ? { lenders, borrower: b, left: 0 } : null; if (cl) (W.claims ||= []).push(cl);
  for (const [id, q] of b.h) { toLiq(W, id, q, cl); if (cl) cl.left += q; }
  for (const uid of b.items || []) { const it = W.items.get(uid); if (it) { it.owner = null; it.claim = cl; if (cl) cl.left++; W.liqItems.push(uid); } } b.items = new ItemSet();
  for (const a of W.auctions) if (a.seller === b) { a.seller = 'liq'; if (cl) { cl.left++; const it = a.uid != null ? W.items.get(a.uid) : null; if (it) it.claim = cl; else a.claim = cl; } } // its open listings go with its other cards (else an unsold copy would come back with no cost lot)
  if (cl && !cl.left) W.claims = W.claims.filter((x) => x !== cl);
}
// The liquidator sold a seized copy for net: its claimants are paid first, pro rata to what each is still owed; the rest goes
// to the borrower (or, if it has left the market, to the treasury). A copy with no claim (a leaver without debts) pays no one.
function liqPay(W, cl, net) {
  if (!cl) return; cl.left--; const live = cl.lenders.filter((e) => !e[0].gone && e[1] > 0), tot = live.reduce((a, e) => a + e[1], 0), x = Math.min(Math.max(0, net), tot), m = (W.house.mint ||= {}); let paid = 0;
  for (const e of live) { const y = tot > 0 ? (x * e[1]) / tot : 0; if (!(y > 0)) continue; e[0].cash += y; e[1] -= y; flowIn(W, e[0], y); paid += y; e[0].stats.recovered = (e[0].stats.recovered || 0) + y; }
  const rest = Math.max(0, net) - paid; if (rest > 0) { if (!cl.borrower.gone) { cl.borrower.cash += rest; flowIn(W, cl.borrower, rest); led(W, 'liqClaims', rest); } else if (!W.gov) tre(W, 'liqClaims', rest); } // a government run: a gone borrower's share leaves the economy, never to the treasury
  led(W, 'liqClaims', paid); if (W.credit) W.credit.recovered = (W.credit.recovered || 0) + paid;
  if (cl.left <= 0) W.claims = (W.claims || []).filter((c) => c !== cl);
}
// Bills a bot couldn't pay are owed, by cause (b.arrears); each payment goes where the bill was going. The forced-sale cause
// each one raises:
const BILLS = { living: 'living costs', lifestyle: 'living costs', holding: 'holding costs', wealthTax: 'wealth tax', shocks: 'cash shock', pollTax: 'poll tax', levy: 'targeted levy', outsideTax: 'sales tax' }; // the last three: government runs
const CREDIT_CAUSES = ['margin call', 'loan default'];
function arrearsOf(b) { let s = 0; if (b.arrears) for (const k in b.arrears) s += b.arrears[k]; return s; }
function routeBill(W, b, k, x) {
  if (!(x > 0)) return;
  led(W, k, x); // the money ledger books what was paid, when it was paid
  if (k === 'living' || k === 'lifestyle') { if (W.living) W.living.spent += x; } // leaves the economy
  else if (k === 'holding') tre(W, 'holding', x);
  else if (k === 'pollTax' || k === 'levy' || k === 'outsideTax') tre(W, k, x); // government runs
  else if (k === 'wealthTax') { if (W.cfg.wealthTaxTo === 'house') tre(W, 'wealthTax', x); else W.taxPot = (W.taxPot || 0) + x; if (W.flow) W.flow.tax += x; flowOut(W, b, x); }
  // shocks: leave the economy
}
// A bill: paid from cash; the rest is owed and, when its cause forces sales (force), put up for a forced sale
function bill(W, b, k, amt, force = true) {
  if (!(amt > 0)) return 0; if ((EXO[W.cfg.fitnessExo] || EXO.lumpSums).has(k)) { b.exo = (b.exo || 0) - amt; W.exoWk = (W.exoWk || 0) - amt; } // a lump sum it did not choose leaves fitness in full when charged (worth counts what it still owes), so paying it later moves nothing
  const pay = Math.min(amt, Math.max(0, b.cash)); b.cash -= pay; routeBill(W, b, k, pay);
  if (amt > pay) { (b.arrears ||= {})[k] = (b.arrears[k] || 0) + amt - pay; if (force) forceSale(b, BILLS[k], amt - pay); }
  return pay;
}
function collectArrears(W, b) {
  if (!b.arrears) return; for (const k of Object.keys(b.arrears)) { const pay = Math.min(b.arrears[k], Math.max(0, b.cash)); if (pay > 0) { b.cash -= pay; b.arrears[k] -= pay; routeBill(W, b, k, pay); W.arrearsPaid = (W.arrearsPaid || 0) + pay; } if (!(b.arrears[k] > 1e-6)) delete b.arrears[k]; }
  if (!Object.keys(b.arrears).length) b.arrears = null;
}
function holdingsValue(W, b) { let v = 0; for (const [id, q] of b.h) v += q * W.cards[id].P; for (const it of heldItems(W, b)) v += markItem(W, it) * W.cfg.itemHaircut; return v; } // items at itemHaircut × mark (no fee, unlike worth)
function repayLoan(W, L, amt) { const x = Math.min(amt, L.amount); L.amount -= x; L.borrower.debt -= x; L.borrower.cash -= x; L.lender.cash += x; L.lender.lent -= x; return x; }
function creditMarket(W) {
  const cfg = W.cfg, C = (W.credit ||= {}); Object.assign(C, { lent: 0, repaid: 0, repaidForced: 0, offered: 0, asked: 0, calls: 0, defaults: 0, writtenOff: 0, rate: C.rate ?? null });
  if (!cfg.credit) return;
  const bot = new Set(W.bots); W.loans = (W.loans || []).filter((L) => L.amount > 0.01 && bot.has(L.borrower) && bot.has(L.lender));
  // Interest, maturity
  for (const L of W.loans) {
    const i = L.amount * L.rate, b = L.borrower;
    if (b.cash >= i) { b.cash -= i; L.lender.cash += i; } else { L.amount += i - b.cash; b.debt += i - b.cash; L.lender.lent += i - b.cash; L.lender.cash += b.cash; b.cash = 0; }
    if (L.due <= W.t) { const paid = repayLoan(W, L, b.cash); C.repaid += paid; if (L.amount > 0.01) { forceSale(b, 'loan default', L.amount / (W.cfg.forcedSale === 'discount' ? 0.88 : 1)); L.due = W.t + 1; L.late = (L.late || 0) + 1; } }
  }
  // Margin calls and defaults
  for (const b of W.bots) {
    if (!(b.debt > 0)) continue;
    const hv = holdingsValue(W, b);
    if (b.debt > b.cash + hv || W.loans.some((L) => L.borrower === b && L.late >= 3)) { // default: lenders recover the cash, lose the rest
      const mine = W.loans.filter((L) => L.borrower === b), tot = mine.reduce((s, L) => s + L.amount, 0), cash = Math.max(0, b.cash); let recT = 0;
      for (const L of mine) { const rec = tot ? Math.min(L.amount, (cash * L.amount) / tot) : 0; recT += rec; L.lender.cash += rec; L.lender.lent -= L.amount; C.writtenOff += L.amount - rec; if (L.amount - rec > 0.01) (W.claimNew ||= []).push([L.lender, L.amount - rec]); L.amount = 0; }
      seize(W, b); // its cards, items and open listings to the liquidator, carrying the lenders' claim
      b.h.clear(); b.n = 0; b.lots = new Map([...(b.lots || [])].filter(([id]) => b.lentOut?.get(id) > 0).map(([id, l]) => [id, l.slice(-b.lentOut.get(id))])); b.cash = cash - recT; b.debt = 0; C.defaults++; jot(W, { type: 'default', bot: b.name, debt: r2(tot) }); continue; // copies it lent out are still its own: they keep their cost
    }
    if (b.debt > cfg.marginCall * hv) { forceSale(b, 'margin call', (b.debt - cfg.maxLTV * hv) / (cfg.forcedSale === 'discount' ? 0.88 : 1)); C.calls++; if (!b.calledAt || W.t - b.calledAt > 8) { b.calledAt = W.t; jot(W, { type: 'marginCall', bot: b.name, debt: r2(b.debt), cards: r2(hv) }); } }
  }
  // New loans: one weekly call auction for credit
  const offers = [], asks2 = [];
  for (const b of W.bots) {
    const hv = holdingsValue(W, b), eq = b.cash + hv + (b.lent || 0) - b.debt;
    if (b.kind === 'ai') {
      const o = b.pending?.lend; if (o && Number(o.amount) > 0) offers.push({ b, amt: Math.min(Number(o.amount), b.cash), rate: Math.max(0, Number(o.rate) || 0) });
      const q = b.pending?.borrowReq; if (q && Number(q.amount) > 0) asks2.push({ b, amt: Math.min(Number(q.amount), Math.max(0, cfg.maxLTV * hv - b.debt)), rate: Math.max(0, Number(q.maxRate) || 0) });
      continue;
    }
    const idle = b.cash - b.g.keep * Math.max(0, eq); if (b.g.lendShare > 0 && idle * b.g.lendShare > 0.5) offers.push({ b, amt: idle * b.g.lendShare, rate: b.g.lendRate }); // only the matcher's dust floor (0.5 coins)
    const want = (b.g.nn ? b.g.lev * cfg.maxLTV * hv : Math.min(b.g.lev * Math.max(0, eq), cfg.maxLTV * hv)) - b.debt; if (b.g.lev > 0 && want > 0.5) asks2.push({ b, amt: want, rate: b.g.maxRate }); // a neural bot asks for a share of what it may borrow
  }
  C.offered = offers.reduce((a, o) => a + o.amt, 0); C.asked = asks2.reduce((a, o) => a + o.amt, 0);
  asks2.sort((x, y) => y.rate - x.rate); offers.sort((x, y) => x.rate - y.rate);
  const fills = []; let i = 0, j = 0;
  while (i < asks2.length && j < offers.length && asks2[i].rate >= offers[j].rate) {
    if (asks2[i].b === offers[j].b) { j++; continue; }
    if (blocked(asks2[i].b, offers[j].b)) { let k = j + 1; while (k < offers.length && offers[k].rate <= asks2[i].rate && (blocked(asks2[i].b, offers[k].b) || asks2[i].b === offers[k].b)) k++; if (k < offers.length && offers[k].rate <= asks2[i].rate) [offers[j], offers[k]] = [offers[k], offers[j]]; else { i++; continue; } }
    const x = Math.min(asks2[i].amt, offers[j].amt); if (x > 0.5) fills.push([asks2[i], offers[j], x]);
    asks2[i].amt -= x; offers[j].amt -= x; if (asks2[i].amt <= 0.5) i++; if (offers[j].amt <= 0.5) j++;
  }
  if (fills.length) {
    const [lb, lo] = fills[fills.length - 1], rate = (lb.rate + lo.rate) / 2; C.rate = rate;
    for (const [rq, of, x] of fills) { const amt = Math.min(x, of.b.cash); if (amt <= 0.5) continue; of.b.cash -= amt; of.b.lent = (of.b.lent || 0) + amt; rq.b.cash += amt; rq.b.debt += amt; tkAdd(W, of.b, 'lend', amt); tkAdd(W, rq.b, 'borrow', amt); W.loans.push({ lender: of.b, borrower: rq.b, amount: amt, rate, due: W.t + cfg.loanWeeks }); C.lent += amt; jot(W, { type: 'loan', lender: of.b.name, borrower: rq.b.name, amount: r2(amt), rate: Math.round(rate * 10000) / 10000 }); }
  }
  if (C.defaults >= 2) log(W, 'margin', `${C.defaults} bots default: their lenders lose ${Math.round(C.writtenOff).toLocaleString()} coins and the cards are dumped.`);
  if (C.calls >= 5) log(W, 'margin', `Margin calls: ${C.calls} borrowers are forced to sell cards at a discount.`);
}
// Living costs are a law of the world: every bot pays to stay in the market, richer bots more
function livingAndCredit(W) {
  const cfg = W.cfg; W.living = { spent: 0, broke: 0 };
  for (const b of W.bots) {
    b.forced = 0; b.forcedBy = {}; b.fpC = 0;
    collectArrears(W, b); if (b.arrears) for (const k in b.arrears) if (k !== 'wealthTax' || cfg.wealthTaxForced) forceSale(b, BILLS[k], b.arrears[k]); // still owed: sold for again
    const eq = b.cash + holdingsValue(W, b) + (b.lent || 0) - b.debt - arrearsOf(b), flat = cfg.livingCost, life = cfg.lifestyle * Math.max(0, eq);
    if (bill(W, b, 'living', flat) + bill(W, b, 'lifestyle', life) < flat + life) W.living.broke++; // the flat cost is paid first: a lump sum; the lifestyle part follows the bot's equity (a bot already below zero stays there: setting it to 0 would print money)
  }
  creditMarket(W);
  // AI repayments
  for (const b of W.bots) { const r = Number(b.pending?.repay) || 0; if (b.kind === 'ai' && r > 0) for (const L of W.loans.filter((L) => L.borrower === b)) repayLoan(W, L, Math.min(r, b.cash)); }
}
export function totalDebt(W) { return W.bots.reduce((s, b) => s + (b.debt || 0), 0); }
// The population's genome, one vote per bot: what selection and inheritance are spreading
function genomeMix(W) {
  const rule = W.bots.filter((b) => b.kind === 'rule'), ws = rule.map(() => 1), tot = ws.length || 1; // every bot counts once: genes spread by being copied, not by wealth
  const out = SIGNALS.map((k) => rule.reduce((s, b, i) => s + b.g.w[k] * ws[i], 0) / tot);
  out.push(rule.reduce((s, b, i) => s + Math.min(2, b.g.lev) * ws[i], 0) / tot, rule.reduce((s, b, i) => s + b.g.lendShare * ws[i], 0) / tot);
  return out.map((x) => Math.round(x * 1000) / 1000);
}

/* ---------- AI bots: apply their parsed actions ---------- */
// actions: { research: [playerKey], orders: [{player, side, price, qty}], packs, passOrders: [{side, price, qty}],
//            notes: [{player, estimate}], share: [botName], steal: botName|null, acceptShares: [botName] | 'all', memo }
export function setActions(W, b, a = {}) {
  const byName = (n) => W.bots.find((x) => x.name === n), cap = W.cfg.aiCaps || {}, mp = W.cfg.maxPacks ?? 3; // AI caps: the neural bots' where they have one, else aiCaps
  b.pending = {
    research: Array.isArray(a.research) ? a.research.slice(0, W.cfg.maxResearchPerWeek) : [],
    orders: Array.isArray(a.orders) ? a.orders.slice(0, cap.orders ?? 40) : [],
    packs: Array.isArray(a.packs) ? a.packs.filter((x) => PACK_TYPES[x?.type]).map((x) => ({ type: x.type, count: clamp(Math.floor(Number(x.count) || 0), 0, mp), ...(Number(x.price) > 0 ? { price: Number(x.price) } : {}) })).slice(0, 4) : [{ type: 'standard', count: clamp(Math.floor(Number(a.packs) || 0), 0, mp) }],
    passOrders: Array.isArray(a.passOrders) ? a.passOrders.slice(0, W.cfg.maxResearchPerWeek) : [],
    ticketOrders: Array.isArray(a.ticketOrders) ? a.ticketOrders.slice(0, W.cfg.maxGamesPerWeek) : [],
    auction: Array.isArray(a.auction) ? a.auction.slice(0, W.cfg.maxListings ?? 1) : [],
    auctionBids: Array.isArray(a.auctionBids) ? a.auctionBids.slice(0, cap.auctionBids ?? 10) : [],
    short: Array.isArray(a.short) ? a.short.slice(0, W.cfg.maxShorts ?? 3) : [],
    lendCards: clamp(Number(a.lendCards) || 0, 0, 1),
  };
  // Credit between bots: offer a loan, request one, or repay
  b.pending.lend = a.lend && typeof a.lend === 'object' ? a.lend : null;
  b.pending.borrowReq = a.borrow && typeof a.borrow === 'object' ? a.borrow : null;
  b.pending.repay = Number(a.repay) || 0;
  jot(W, { t: W.t + 1, type: 'aiActions', bot: b.name, actions: a });
  if (W.cfg.messages) {
    const lim = W.cfg.messageLimits, cut = (x) => String(x ?? '').slice(0, lim.chars).trim();
    const post = cut(a.post);
    if (post) { W.board.push({ t: W.t + 1, from: b.name, text: post }); if (W.board.length > 40) W.board.shift(); jot(W, { t: W.t + 1, type: 'post', from: b.name, text: post }); }
    for (const m of (Array.isArray(a.messages) ? a.messages : []).slice(0, lim.direct)) {
      const to = byName(m?.to), text = cut(m?.text);
      if (!to || to === b || !text) continue;
      (to.mailbox ||= []).push({ t: W.t + 1, from: b.name, text });
      jot(W, { t: W.t + 1, type: 'message', from: b.name, to: to.name, text });
    }
  }
  const acc = Array.isArray(a.acceptShares) ? a.acceptShares : a.acceptShares === 'all' ? ['all'] : [];
  b.pendingShares = acc.map(byName).filter(Boolean).map((x) => x.id);
  b.acceptAll = acc.includes('all');
  for (const n of Array.isArray(a.notes) ? a.notes.slice(0, cap.notes ?? 12) : []) { const c = W.mktByKey.get(n.player) || resolvePlayer(W, n.player); const e = Number(n.estimate); if (c && e > 0) writeNote(W, b, c, e, 'own analysis', n.facts); }
  b.marketPage = Math.max(0, Math.floor(Number(a.marketPage) || 0)); // which page of the most-traded list it sees next week
  b.gameAnswers = Array.isArray(a.games) ? a.games.slice(0, W.cfg.maxGamesPerWeek) : [];
  b.socialOut = { share: (Array.isArray(a.share) ? a.share.slice(0, 2) : []).map(byName).filter(Boolean), steal: a.steal ? byName(a.steal) : null };
  if (typeof a.memo === 'string') b.memo = a.memo.slice(0, 600);
}
function aiSocial(W) {
  for (const b of W.bots) {
    if (b.kind !== 'ai' || !b.socialOut) continue;
    for (const p of b.socialOut.share) {
      if (b.flags.has(p.id) || p.flags.has(b.id)) continue;
      if (willing(W, p, b)) swap(W, b, p); // the partner accepts through its own decision-maker
    }
    if (b.socialOut.steal && W.cfg.stealing) b.lastSteal = steal(W, b, b.socialOut.steal);
    b.socialOut = null;
  }
}
function aiOrders(W, b) {
  const pend = new Map(), p = b.pending || {};
  // a pack bid at its own price (bounded only by its cash), or the last clearing price when it names none
  let nPacks = 0; for (const x of p.packs || []) { const last = packInfo(W, x.type).price, m = x.price > 0 && last > 0 ? x.price / last : 1; for (let k = 0; k < x.count && nPacks < (W.cfg.maxPacks ?? 3); k++, nPacks++) if (!buyPack(W, b, x.type, m)) break; }
  for (const o of p.orders || []) {
    const c = resolveMarket(W, o.player); const price = Number(o.price);
    if (!c || !(price > 0)) continue;
    for (let k = 0; k < clamp(Math.floor(Number(o.qty) || 1), 1, Math.max(5, W.cfg.maxOrderQty ?? 3)); k++) o.side === 'sell' ? ask(b, c, price, pend) : bid(b, c, price);
  }
}

// After the forced sales: bills owed are paid first (from any cash), then lenders, but only from the proceeds of sales that a
// margin call or a loan default forced (b.fpC); the rest of a bot's cash stays its own
function settleForced(W) {
  for (const b of W.bots) { collectArrears(W, b); if (b.fpC > 0 && b.debt > 0) { let left = Math.min(b.fpC, Math.max(0, b.cash)); for (const L of (W.loans || []).filter((L) => L.borrower === b)) { if (left <= 0.01) break; const x = repayLoan(W, L, left); left -= x; (W.credit ||= {}).repaidForced = (W.credit.repaidForced || 0) + x; } } b.fpC = 0; }
}
/* ---------- One week ---------- */
export function step(W) {
  const cfg = W.cfg;
  W.t++; packCache = null; W_ = W; useShape(W); SNAP = null; W.shockWeek = 0; W.aucWeek = 0; W.aucStats = { sold: 0, coins: 0, free: 0, vs: [] };
  for (const p of W.players) p.Fpub = p.F; // last week's value: what the public (and the value collectors) know this week
  if (W.gov) govWeekStart(W); // a government run: its rule-based dials, the board's fade and the placebo, before anything reads them
  W.guideUse = { s: 0, n: 0 }; W.offDiag = { bid: [], ask: [] }; W.limDiag = { bots: 0, keep: 0, lendRate: 0, maxRate: 0, lendOver: 0, maxOver: 0, lendShare: 0, lev: 0, packBid: 0, packBidEdge: 0, acts: 0, orders: 0, listings: 0, items: 0, shorts: 0, packs: 0, bid: 0, bidEdge: 0, bidFar: 0, ask: 0, askEdge: 0, askFar: 0, qty: 0, qtyEdge: 0 };
  if (guideOn(cfg)) priceGuide(W);
  if (W.timeline && W.t % cfg.seasonWeeks === 0) nextSeason(W);
  if (cfg.lossRate > 0 && W.t % cfg.seasonWeeks === 0) { // card loss: each copy in a bot's hands (not lent out) is lost with chance lossRate, never picked by value
    let lost = 0; for (const b of W.bots) for (const [id, q] of [...b.h]) { const free = q - (b.lentOut?.get(id) || 0); let k = 0; for (let j = 0; j < free; j++) if (W.rngPeople.rand() < cfg.lossRate) k++; // the people stream
      if (k) { const c = W.cards[id]; give(b, c, -k); c.circ = Math.max(0, c.circ - k); const L = b.lots?.get(id); if (L) L.splice(0, k); lost += k; } }
    W.lostSeason = lost; if (lost) jot(W, { type: 'lost', count: lost }); (W.house.mint ||= {}).lostCards = (W.house.mint.lostCards || 0) + lost; }
  if (cfg.valueModel === 'league') { // the simulated league takes over after the last real season
    if (!W.L && W.timeline && W.seasonIx >= W.timeline.seasons.length - 1) leagueStart(W);
    if (W.L) { if (W.t % cfg.seasonWeeks === 0 && W.seasonIx >= W.timeline.seasons.length) leagueSeasonEnd(W); leagueWeek(W); leagueValues(W); }
  } else if (cfg.valueModel === 'ovrWalk') ovrWalk(W); else if (cfg.valueModel === 'factors') factorValues(W);
  if (cfg.royalties && !cfg.priceOnly && cfg.royaltyEvery !== 'generation' && !W.gov) payRoyalties(W, 1 / cfg.weeksPerGeneration); // a government run pays them with its other lines (govPay)
  W.flow = { net: GROUPS.map(() => 0), realized: GROUPS.map(() => 0), trips: GROUPS.map(() => 0), tax: 0, paidOut: 0 };
  assignGroups(W);
  W.week = { shares: 0, thefts: 0, caught: 0, researched: new Map() };
  W.ord = { bids: 0, asks: 0, pullUp: 0, pullDown: 0, coins: 0, minted: 0, packs: W.house.packs }; W.exoWk = 0; // this week's lump sums booked to b.exo (measurement: the ledger's own check)
  W.journal = W.journal.filter((j) => j.t === W.t); // keep this week's decisions, logged before the week ran
  for (const b of W.bots) {
    b.passes = b.passes.filter((e) => e > W.t); for (let k = 0; k < cfg.passesPerWeek; k++) b.passes.push(W.t + cfg.passLife);
    if (!(cfg.memoryCap > 0)) { const old = 2 * cfg.knowledgeWeeks; for (const [id, n] of b.notes) if (W.t - n.week > old) b.notes.delete(id); } // notes are forgotten by age, not by count
    b.tickets = b.tickets.filter((e) => e > W.t); if (cfg.games) for (let k = 0; k < cfg.gameTickets; k++) b.tickets.push(W.t + cfg.ticketLife);
    b.inbox = [];
  }
  // Allowance: printed each week, or (closed economy) paid out of the treasury, at most all of it a week
  const lastBub = W.hist.bub[W.hist.bub.length - 1] ?? 1;
  W.bankRate = cfg.centralBank ? clamp(1 + cfg.bankGain * (cfg.bankTarget - lastBub), 0, 4) : 1;
  if (W.gov) govPay(W); else { // a government run: every spending line paid together, pro rata (or in its payOrder) when the treasury is short
  const want = cfg.allowance * (W.fillK ?? 1) / (W.botK ?? 1) * W.bots.length * W.bankRate, pay = cfg.closedEconomy ? Math.min(want, W.treasury) : want;
  if (cfg.closedEconomy) tre(W, 'allowance', -pay); else tre(W, 'wiped', -W.treasury); // without a closed economy, the house's takings leave circulation
  for (const b of W.bots) transfer(W, b, pay / W.bots.length, 'allowance');
  W.flow.paidOut = pay; }
  { const every = Math.max(1, Math.round(cfg.wealthTaxEvery ?? 4)), thr = cfg.wealthTaxThreshold ?? 2; if (cfg.wealthTax > 0 && W.t % every === 0) {
    const ws = W.bots.map((b) => [b, worth(W, b)]), med = ws.map((x) => x[1]).sort((a, b) => a - b)[Math.floor(ws.length / 2)] || 0;
    for (const [b, w] of ws) { if (w <= med * thr) continue; bill(W, b, 'wealthTax', (w - med * thr) * cfg.wealthTax * every, false); } // what it can't pay is owed; wealthTaxForced sells for it (livingAndCredit raises the forced sale each week while it is owed)
    if (W.taxPot > 0 && cfg.wealthTaxTo !== 'house') { // paid back out: to every bot equally, or to the bots below the median worth
      const to = cfg.wealthTaxTo === 'belowMedian' ? ws.filter(([, w]) => w < med).map(([b]) => b) : W.bots; const each = to.length ? W.taxPot / to.length : 0;
      for (const b of to) { transfer(W, b, each, 'taxBack'); flowIn(W, b, each); } W.taxPot = 0; }
  } }
  if (cfg.leagueUpdates && W.t % cfg.updateEvery === 0) leagueUpdate(W);
  { const ph = W.hist.p, peak = Math.max(...ph.slice(-cfg.moodWeeks)); mood.drop = ph.length ? 1 - ph[ph.length - 1] / peak : 0; }
  if (W.fullL) dormancy(W);
  W._live = W.cards.filter((c) => c.on !== false && c.circ > 0);
  { const hv = cfg.hotVolWeeks, hr = cfg.hotRetWeeks, hf = cfg.hotFloor, mo = cfg.hotRank === 'momentum', hs = (c) => recentVol(c, hv) * (mo ? Math.max(hf, 1 + ret(c, hr)) : 1); const L = W._live, sc = new Float64Array(L.length); for (let i = 0; i < L.length; i++) sc[i] = hs(L[i]); const ix = Array.from({ length: L.length }, (_, i) => i).sort((x, y) => sc[y] - sc[x]); hot = ix.map((i) => L[i]); } // (each score worked out once: the same comparisons, so the same order) // the most-traded list (hotRank)
  for (const b of W.bots) if (b.kind === 'rule') b.a = styleOf(b.g.w); // a style is just the dominant weight, which mutation can change
  { const nn = W.bots.filter((b) => b.g?.nn); if (nn.length) { const ws = nn.map((b) => worth(W, b)).sort((x, y) => x - y), med = ws[Math.floor(ws.length / 2)]; for (const b of nn) nnThink(W, b, med); if (cfg.attention > 0) attendWeek(W, nn); } }
  livingAndCredit(W); peopleChange(W); fashionStep(W);
  if (cfg.holdCost > 0) for (const b of W.bots) { // a cost per card held, a share of its mark a week, to the house: a cash squeeze shows up as selling
    let cost = 0; for (const [id, q] of b.h) cost += q * W.cards[id].P * cfg.holdCost; if (cost > 0) bill(W, b, 'holding', cost); } // unpaid: owed, and sold for
  { const ch = cfg.cashShockChance ?? 0, sz = cfg.cashShockSize ?? 0; if (ch > 0 && sz > 0) for (const b of W.bots) { if (!(W.rngPeople.rand() < ch)) continue; // a life event (the people stream): a need for cash that doesn't come from the market
    const need = sz * Math.max(0, worth(W, b)), paidS = bill(W, b, 'shocks', need); jot(W, { type: 'shock', bot: b.name, need: r2(need), short: r2(need - paidS) }); (W.shockWeek ||= 0); W.shockWeek++; } }
  liftFlags(W);
  socialPhase(W); aiSocial(W);
  passPhase(W);
  if (cfg.games) { tokenMarket(W, 'ticket'); gamePhase(W); }
  FOLDS = new Map(); try { auctionPhase(W); } finally { FOLDS = null; }
  bids = new Array(W.cards.length); asks = new Array(W.cards.length); // a card's list is made by its first order (or by clear)
  if (cfg.shorting) shortUpkeep(W);
  const order = W.shuffle(W.bots.slice()); // a uniform order: no seat acts first more often (first-come resources, ties in the book)
  { const S = (SNAP = snapCards(W)); for (const b of order) b.kind === 'ai' ? aiOrders(W, b) : b.g.nn ? nnAct(W, b) : act(W, b); endSnap(W, S); }
  if (cfg.packSale === 'auction') packAuction(W);
  if (cfg.liquidation !== 'auction') for (const [id, q] of W.liq) { const p = cfg.liquidation === 'chase' ? W.cards[id].P * 0.8 : liqAsk(W, id); for (let k = 0; k < Math.min(q, 4); k++) (asks[id] ||= []).push({ b: 'liq', p }); }
  // Forced sellers (margin calls, bills they can't pay) dump cards at a discount
  if (cfg.forcedSale === 'discount') for (const b of W.bots) if (b.forced > 0) { if (CREDIT_CAUSES.some((k) => b.forcedBy?.[k] > 0)) b.fpC = Infinity; /* legacy: its book proceeds aren't traced, so a credit-forced bot repays from all its cash as before */ const pend = new Map(); let need = b.forced; for (const id of [...b.h.keys()].sort((x, y) => W.cards[y].P - W.cards[x].P)) { if (need <= 0) break; const c = W.cards[id]; const q = b.h.get(id); for (let k = 0; k < q && need > 0; k++) { ask(b, c, c.P * 0.88, pend); need -= c.P * 0.88; } }
    for (const uid of [...(b.items || [])]) { if (need <= 0) break; const it = W.items.get(uid); if (!it) continue; const r = markItem(W, it) * 0.7; if (listItem(W, b, it, r)) need -= r; } }
  clear(W);
  if (cfg.outsideCollectors && cfg.outsideMode === 'value') valueCollectors(W); else if (cfg.outsideCollectors && cfg.outsideMode === 'budget') outsideFlow(W);
  if (cfg.forcedSale !== 'discount') forcedSales(W);
  if (cfg.shorting || W.cardLoans?.length) settleShorts(W);
  liqCut(W);
  settleForced(W);
  for (const b of W.bots) { b.nwh.push(worth(W, b)); (b.exoh ||= []).push(b.exo || 0); if (b.nwh.length > 12) b.nwh.shift(); if (b.exoh.length > 12) b.exoh.shift(); b.pending = null; b.pendingShares = []; b.acceptAll = false; }
  detect(W);
  adaptStep(W);
  if (W.t % cfg.weeksPerGeneration === 0) generationEnd(W);
  for (const b of W.bots.slice()) if (b.kind === 'ai' && b.lifespanW && W.t - b.born >= b.lifespanW) aiSuccession(W, b);
  record(W);
  if (W.gov) govWeekEnd(W);
}
// One copy changes hands at a price outside the weekly cross (outside collectors, forced sellers hitting bids)
// A card traded at this price: remember it (for comparable-sales marks), and pair it with the card's previous trade (for
// the repeat-sales Vault index). A card's opening price counts as its first trade.
// Comparable sales: a player's 16 card markets differ only by their rarity multiplier, so a trade in any of them is news
// about all of them. A market that didn't trade this week is marked at the median of the player's trades in the last
// compsWeeks weeks (each brought back to a base card by its multiplier), times its own multiplier. A market that traded
// keeps its own price; a player none of whose cards traded keeps his old marks.
function compsMark(W) {
  const k = W.cfg.compsWeeks ?? 4, bk = (W.cfg.compsSource ?? 'trades+book') !== 'trades'; // compsSource 'trades': book-moved marks are not comparable sales
  for (const p of W.players) { if (p.dorm) continue;
    const base = []; for (let j = 0; j < 16; j++) { const m = W.cards[p.id * 16 + j]; const tradeT = m.lastTradeT ?? -1, bookT = bk ? m.bookT ?? -1 : -1; if (bookT > tradeT && W.t - bookT < k) base.push(m.bookP / m.mult); else if (tradeT > 0 && W.t - tradeT < k) base.push(m.lastTradeP / m.mult); }
    if (!base.length) continue; base.sort((a, b) => a - b); const med = base.length % 2 ? base[base.length >> 1] : (base[base.length / 2 - 1] + base[base.length / 2]) / 2;
    for (let j = 0; j < 16; j++) { const m = W.cards[p.id * 16 + j]; if (m.lastTradeT === W.t) continue; m.P = med * m.mult; if (m.Ph.length) m.Ph[m.Ph.length - 1] = m.P; }
  }
}
// Why a neural bot made a trade: the card-network input that pushed hardest toward it (setting that input to zero lowers
// "buy minus sell", or "sell minus buy", the most). Worked out only for orders that filled.
function tradeWhy(b, x, side) {
  if (!x || !b?.g?.nn) return null;
  const score = (v) => { const o = forward(CARD_SHAPE, b.g.card, v, CB); return side === 'buy' ? o[0] - o[1] : o[1] - o[0]; };
  const base = score(x), v = Float64Array.from(x); let best = -Infinity, at = -1;
  for (let i = 1; i < x.length; i++) { if (x[i] === 0) continue; const keep = v[i]; v[i] = 0; const d = base - score(v); v[i] = keep; if (d > best) { best = d; at = i; } }
  return at > 0 ? CARD_IN[at] : null;
}
function noteWhy(W, j, bd, ak) {
  const wb = bd ? tradeWhy(bd.b, bd.x, 'buy') : null, ws = ak ? tradeWhy(ak.b, ak.x, 'sell') : null; const w = (W.whyWeek ||= { buy: {}, sell: {} });
  if (wb) { j.buyerWhy = wb; w.buy[wb] = (w.buy[wb] || 0) + 1; } if (ws) { j.sellerWhy = ws; w.sell[ws] = (w.sell[ws] || 0) + 1; }
}
// Repeat-sales pairs come from one chain per kind of sale (kind 0: order-book and dealer trades; 1: sealed-auction sales),
// since the two clear at different levels (auction sales ran a median ~40% above trades of the same card). Mixing them
// made the index drift up on flat prices: rises came as trade→auction pairs over longer gaps, falls as auction→trade
// pairs a week later, and least squares gives long-gap pairs more weight. Within a chain the first sale of a week is
// paired with the chain's last sale of an earlier week (at most rsMaxGap weeks back); a card's opening price starts chain 0, dated the week the card opened (openT; 0 for the save's cards).
function noteTrade(W, c, price, kind = 0) {
  const R = (c.rs ||= [{ t0: null, p0: null, wt: c.openT ?? 0, wp: c.P0 }, { t0: null, p0: null, wt: null, wp: null }]), r = R[kind];
  if (r.wt !== W.t) { if (r.wt != null) { r.t0 = r.wt; r.p0 = r.wp; } if (r.t0 != null && W.t - r.t0 <= W.cfg.rsMaxGap && r.p0 > 0 && price > 0) (W.rsPairs ||= []).push([r.t0, Math.log(price / r.p0)]); r.wt = W.t; r.wp = price; } else r.wp = price;
  if (c.lastTradeT !== W.t) { c.lastTradeT = W.t; c.lastTradeP = price; } else c.lastTradeP = price;
}
// A forced sale is owed: remember why (margin call, loan default, living costs, holding costs, wealth tax, estate, cash shock)
function attTraded(W, c, ...xs) { for (const x of xs) if (x && typeof x === 'object' && x.g?.nn) (x._attTr ||= new Map()).set(c.id, W.t); } // the watchlist's "traded lately"
function forceSale(b, cause, amount) { if (!(amount > 0)) return; if (b._tk) b._tk.forced += amount; b.forced = (b.forced || 0) + amount; (b.forcedBy ||= {})[cause] = (b.forcedBy[cause] || 0) + amount; }
function xfer(W, c, buyer, seller, price, bd = null, ak = null) {
  const cfg = W.cfg;
  if (buyer !== 'out' && buyer && buyer.cash < price) return false;
  if (buyer && buyer !== 'out' && buyer.cash < price) return false;
  if (W.gov && buyer && buyer !== 'out' && (seller === 'out' || seller === 'store') && buyer.cash < price + govOutsideTax(W, price)) return false; // a government's sales tax on buying from outside
  if (seller === 'out') { const q = W.outside.get(c.id) || 0; if (!q) return false; q > 1 ? W.outside.set(c.id, q - 1) : W.outside.delete(c.id); c.circ++; W.house.outside -= price; }
  else if (seller === 'liq') { const q = W.liq.get(c.id) || 0; if (!q) return false; q > 1 ? W.liq.set(c.id, q - 1) : (W.liq.delete(c.id), W.liqPrice?.delete(c.id)); (W.liqSold ||= new Set()).add(c.id); }
  else if (seller === 'store') { if (c.pool < 1) return false; c.pool--; c.circ++; W.house.store = (W.house.store || 0) + price; if (!W.gov) tre(W, 'store', price); packCache = null; } // a government run: the store is outside, its takings leave
  else { if ((seller.h.get(c.id) || 0) < 1) return false; give(seller, c, -1); const fe = feeOf(W, price); seller.cash += price * (1 - fe); feeTo(W, price * fe); flowIn(W, seller, price * (1 - fe)); sellLot(W, seller, c, price * (1 - fe)); }
  if (buyer === 'out') { W.outside.set(c.id, (W.outside.get(c.id) || 0) + 1); c.circ--; W.house.outside += price; if (typeof seller === 'object') led(W, 'outsideIn', price); }
  else { buyer.cash -= price; give(buyer, c, 1); flowOut(W, buyer, price); addLot(buyer, c, price, W.t); if (typeof seller !== 'object') led(W, seller === 'liq' ? 'liqOut' : seller === 'store' ? 'storeOut' : 'outsideOut', price); } // a bot pays someone outside the economy (booked after the checks, so a refused transfer books nothing)
  if (W.gov) { if (buyer === 'out' && typeof seller === 'object') govOutside(W, seller, price, 'sell'); else if (buyer && buyer !== 'out' && (seller === 'out' || seller === 'store')) govOutside(W, buyer, price, 'buy'); }
  if (seller === 'liq') liqPay(W, liqTake(W, c.id), price); // the liquidator pays any claim on the copy out of what it got
  tkTrade(W, buyer, seller, c, price, c.P, 'x'); if (cfg.attention > 0) attTraded(W, c, buyer, seller);
  c.P = price; noteTrade(W, c, price); if (c.Ph.length) c.Ph[c.Ph.length - 1] = price; if (c.volH.length) c.volH[c.volH.length - 1]++; W.lastTrades = (W.lastTrades || 0) + 1; if (W.ord) W.ord.coins += price;
  { const j = { type: 'trade', card: c.key, price: r2(price), buyer: buyer === 'out' ? 'outside collector' : buyer.name, seller: seller === 'out' ? 'outside collector' : seller === 'liq' ? 'liquidator' : seller === 'store' ? 'Vault store' : seller.name }; noteWhy(W, j, bd, ak); jot(W, j); }
  return true;
}
const leftBids = (c) => (bids[c.id] || []).filter((o) => !o.used && o.b && o.b !== 'liq').sort((x, y) => y.p - x.p);
const leftAsks = (c) => (asks[c.id] || []).filter((o) => !o.used).sort((x, y) => x.p - y.p);
// 1. Outside collectors: a budget of coins, spread by real popularity, buys the lowest asks; a share of what they hold
// goes back into the best bids. They never name a price.
function outsideFlow(W) {
  const cfg = W.cfg, out = (W.outside ||= new Map()), news = cfg.outsideNews !== false; // outsideNews: budget follows the public news too (an assumption, not measured)
  const pops = W.players.filter((p) => p.on !== false).map((p) => [p, Math.max(0, W.era?.[p.id]?.legacy ?? W.library.players[p.id].careerLegacy ?? 0) * (news && p.lg?.active ? Math.max(0, p.lg.formRatio ?? 1) : 1)]);
  const tot = pops.reduce((a, x) => a + x[1], 0) || 1; let spent = 0;
  for (const [p, w] of pops) {
    const share = (cfg.outsideBudget * (W.fillK ?? 1) * w) / tot, save = (W.outsideSave ||= new Map()); let coins = Math.min(cfg.outsideSaveWeeks * share, (save.get(p.id) || 0) + share); if (coins <= 0) continue; // unspent money waits, up to outsideSaveWeeks' worth
    const book = []; for (let j = 0; j < 16; j++) { const c = W.cards[p.id * 16 + j]; for (const o of leftAsks(c)) book.push([c, o]); }
    book.sort((x, y) => x[1].p - y[1].p);
    for (const [c, o] of book) { if (o.p > coins) break; if (xfer(W, c, 'out', o.b, o.p, null, o)) { o.used = true; coins -= o.p; spent += o.p; } }
    save.set(p.id, coins);
  }
  let sold = 0;
  for (const [id, q] of [...out]) {
    const want = q * cfg.outsideResale, k = Math.floor(want) + (W.rand() < want - Math.floor(want) ? 1 : 0), c = W.cards[id];
    for (const o of leftBids(c).slice(0, k)) if (xfer(W, c, o.b, 'out', o.p, o)) { o.used = true; sold++; }
  }
  W.outsideWeek = { spent: Math.round(spent), resold: sold, held: [...out.values()].reduce((a, b) => a + b, 0) };
}
// Value collectors (outsideMode 'value', the default): `collectors` outside dealers who know last week's value from the
// site formula (never this week's, so a bot that reads the news can be earlier). Each has its own error (a fixed bias drawn
// from collectorError, plus a per-card wobble half that size) and a share of outsideBudget a week (savings capped at 4
// weeks). They start out holding collectorStart of every card's copies (outside the market), so they can sell into any
// card priced above value, and hold at most collectorPerCard copies of any one card, so a full card never stops them
// buying others. Both ways: they buy asks at or below their reference and sell to bids within collectorSpread of it. A
// bubble can still outrun them: their stock of a card and their money run out.
// The public price guide: every `every` weeks it publishes each player's value as of `lag` weeks earlier (the site's
// formula, from the values stored each week), and holds it in between. Everyone, the page included, sees the same number.
// Its settings: guideOn, guideEvery, guideLag (an old run file's priceGuide object is mapped onto them in createWorld)
const guideOn = (cfg) => !!cfg.guideOn;
function priceGuide(W) {
  const cfg = W.cfg, every = cfg.guideEvery ?? 4, lag = Math.max(1, cfg.guideLag ?? 1);
  if (!W.guideNet) { W.guideNet = true; useShape(W); }
  for (const b of W.bots) if (b.g?.nn) { b.g.card = widenCard(W, b.g.card); if (b._ad?.saved) b._ad.saved.card = widenCard(W, b._ad.saved.card); }
  for (const p of W.players) { (p.Fq ||= []).push(p.F); if (p.Fq.length > lag) p.Fq.shift(); } // values at the ends of the last `lag` weeks
  if (W.guideT != null && W.t - W.guideT < every) return;
  W.guideT = W.t; for (const p of W.players) { p.guide = p.Fq[0]; p.guideT = W.t; }
}
const DEALER_TILT = new WeakMap(); // dealer -> Math.exp(its error + its wobble on card id), by card id (both fixed for the dealer's life)
function valueCollectors(W) {
  const cfg = W.cfg, N = cfg.collectors ?? 25, share = ((cfg.outsideBudget || 0) * (W.fillK ?? 1)) / Math.max(1, N), err = cfg.collectorError ?? 0.15;
  if (!W.coll || W.coll.length !== N) {
    const old = W.coll || []; W.coll = Array.from({ length: N }, (_, i) => old[i] || { cash: 0, stock: new Map(), n: 0, err: W.gauss() * err });
    if (!W.collSeeded) { W.collSeeded = true; const out = (W.outside ||= new Map()); let k = 0; // starting stock: a share of every card's copies
      for (const c of W.cards) { if (!(c.circ > 0) || c.on === false) continue; const p = W.players[c.pid], q = Math.min(p.pool, Math.ceil((cfg.collectorStart ?? 0.1) * c.circ)); if (!(q > 0)) continue; p.pool -= q; (W.house.mint ||= {}).dealerStock = (W.house.mint.dealerStock || 0) + q; // taken from the unminted pool, so no copy comes from nothing
        for (let j = 0; j < q; j++) { const C = W.coll[k++ % N]; C.stock.set(c.id, (C.stock.get(c.id) || 0) + 1); C.n++; out.set(c.id, (out.get(c.id) || 0) + 1); } }
      packCache = null; packCacheT = null; }
  }
  const wob = (i, id) => { const h = Math.sin((i + 1) * 12.9898 + (id + 1) * 78.233) * 43758.5453; return ((h - Math.floor(h)) * 2 - 1) * err * 0.5; };
  const gd = guideOn(cfg); // with the guide on, dealers see what bots see: the guide, not last week's value
  const tilt = (k, id) => { const C = W.coll[k]; let a = DEALER_TILT.get(C); if (!a || a.length <= id) { const n = Math.max(W.cards.length, id + 1), a2 = new Float64Array(n).fill(NaN); if (a) a2.set(a); DEALER_TILT.set(C, (a = a2)); } let x = a[id]; if (x !== x) a[id] = x = Math.exp(C.err + wob(k, id)); return x; }; // a dealer's fixed tilt on a card, worked out once
  const ref = (k, c) => { const p = W.players[c.pid], v = gd ? p.guide : p.Fpub ?? p.F; return v > 0 ? v * c.mult * tilt(k, c.id) : null; };
  const per = cfg.collectorPerCard ?? 4, spread = cfg.collectorSpread ?? 0.05; let bought = 0, sold = 0, spent = 0;
  const askBook = []; for (const c of W.cards) { if (c.on === false) continue; for (const o of asks[c.id] || []) if (!o.used && o.b !== 'store') askBook.push([c, o]); }
  for (const k of W.shuffle(Array.from({ length: N }, (_, i) => i))) { // a fresh order each week: no dealer always picks first
    const C = W.coll[k], capC = (cfg.collectorSaveWeeks ?? 26) * share; C.cash = Math.min(capC, C.cash + share);
    // sell: any card they hold, to the best bids within `spread` of their reference
    for (const [id, q] of [...C.stock]) { const c = W.cards[id]; let left = q; const r = ref(k, c);
      for (const o of r == null ? [] : leftBids(c)) { if (left <= 0 || o.p < r * (1 - spread)) break; if (xfer(W, c, o.b, 'out', o.p, o)) { o.used = true; left--; C.cash += o.p; C.n--; sold++; const m = (W.house.mint ||= {}); m.outsideOut -= o.p; m.dealerOut = (m.dealerOut || 0) + o.p; } }
      left > 0 ? C.stock.set(id, left) : C.stock.delete(id); }
    C.cash = Math.min(capC, C.cash);
    // buy: the asks furthest below their reference, at most `per` copies of any one card, while money lasts
    const cand = []; for (const e of askBook) { const c = e[0], o = e[1]; if (o.used) continue; const r = ref(k, c); if (r != null && o.p <= r && (C.stock.get(c.id) || 0) < per) cand.push([c, o, o.p / r]); } // each reference worked out once (nothing it reads changes here)
    cand.sort((a, b) => a[2] - b[2]);
    for (const [c, o] of cand) { if (o.p > C.cash || o.used || (C.stock.get(c.id) || 0) >= per) continue; if (xfer(W, c, 'out', o.b, o.p, null, o)) { const m = (W.house.mint ||= {}); m.outsideIn -= o.p; m.dealerIn = (m.dealerIn || 0) + o.p; o.used = true; C.cash -= o.p; C.n++; C.stock.set(c.id, (C.stock.get(c.id) || 0) + 1); bought++; spent += o.p; } }
  }
  W.outsideWeek = { spent: Math.round(spent), bought, resold: sold, held: W.coll.reduce((a, C) => a + C.n, 0) };
}
// 3. Forced sellers: sell into the best bids until the debt is covered; whatever is left goes to auction with no minimum
// One order for both stages, the bot's own: a neural bot's card network ranks its cards and its one-of-a-kind cards by its
// wish to sell (sell − buy output; forcedOrder 'price': dearest first, as for every other bot). It sells into the best bids
// in that order, then lists what is still needed at auction with no minimum in the same order, then its items.
function forcedSales(W) {
  const tally = (W.forcedWeek ||= {});
  for (const b of W.bots) {
    if (!(b.forced > 0)) continue; let need = b.forced; const cause = Object.entries(b.forcedBy || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || 'other', count = () => { tally[cause] = (tally[cause] || 0) + 1; };
    const fk = Math.min(1, CREDIT_CAUSES.reduce((a, k) => a + (b.forcedBy?.[k] || 0), 0) / b.forced); // the share of this sale that a margin call or loan default forced: that share of its proceeds goes to the lenders
    const nwF = Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), ctxF = marketCtx(W), rankF = new Map(), net = W.cfg.forcedOrder !== 'price' && b.g?.nn;
    if (net) for (const id of b.h.keys()) { const o = cardNet(W, b, W.cards[id], nwF, ctxF); rankF.set(id, o[1] - o[0]); } // its network's wish to sell
    const ids = [...b.h.keys()].sort((x, y) => net ? rankF.get(y) - rankF.get(x) : W.cards[y].P - W.cards[x].P);
    for (const id of ids) {
      const c = W.cards[id];
      for (const o of leftBids(c)) { if (need <= 0 || !(b.h.get(id) > 0)) break; if (o.b === b || blocked(o.b, b)) continue; if (xfer(W, c, o.b, b, o.p, o)) { o.used = true; need -= o.p * (1 - W.cfg.fee); if (fk > 0) b.fpC = (b.fpC || 0) + o.p * (1 - W.cfg.fee) * fk; count(); } }
      if (need <= 0) break;
    }
    for (const id of ids) { const c = W.cards[id]; while (need > 0 && (b.h.get(id) || 0) > 0) { const a = listAuction(W, b, c, NO_MIN); if (!a) break; a.fk = fk; need -= c.P; count(); } if (need <= 0) break; }
    const its = [...(b.items || [])].map((uid) => W.items.get(uid)).filter(Boolean), rk = new Map(its.map((it) => { const c = W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)]; if (!net) return [it, markItem(W, it)]; const o = cardNet(W, b, c, nwF, ctxF, it); return [it, o[1] - o[0]]; }));
    for (const it of its.sort((x, y) => rk.get(y) - rk.get(x))) { if (need <= 0) break; const a = listItem(W, b, it, NO_MIN); if (a) { a.fk = fk; need -= markItem(W, it); count(); } }
  }
}
const NO_MIN = 0.01; // an auction with no minimum price (the reserve must be above zero)
function clear(W) {
  const cfg = W.cfg; let trades = 0; W.whyWeek = { buy: {}, sell: {} }; W.forcedWeek = {}; W.bookDiag = { n: 0, both: 0, onlyBid: 0, onlyAsk: 0, neither: 0, gap: [], bidD: [], askD: [], unit: cfg.priceMap === 'log' ? 'log' : 'range' };
  W.arcsWeek = [];
  W.fills = new Map(); // bot id -> [{player, side, price}] this week (AI observations)
  const fill = (b, c, side, price) => { if (!b || b === 'liq' || b.kind !== 'ai') return; if (!W.fills.has(b.id)) W.fills.set(b.id, []); W.fills.get(b.id).push({ player: c.key, side, price: +price.toFixed(2) }); };
  for (const c of W.cards) {
    if (c.dorm) continue; // set aside (dormantAfter): no orders, no holders; wakePlayer() fills in the weeks it skipped
    let B = bids[c.id], A = asks[c.id], done = 0; const nB = B ? B.length : 0, nA = A ? A.length : 0;
    if (W.fullL && (nB || nA || c.circ)) W.players[c.pid].actT = W.t;
    if (!nB && !nA && !c.circ) continue; // a card nobody holds or trades: its week's 0 volume is appended when its history is next read (volSync)
    B ||= bids[c.id] = []; A ||= asks[c.id] = [];
    const P0 = c.P, lim = cfg.priceLimit > 0 ? [P0 * (1 - cfg.priceLimit), P0 * (1 + cfg.priceLimit)] : [0, Infinity];
    if (cfg.store && c.pool > 0) { const p = storeAsk(W, c); for (let k = 0; k < Math.min(cfg.storeCopies ?? 3, c.pool); k++) A.push({ b: 'store', p }); }
    c.wk = { o: P0, h: P0, l: P0, v: 0 };
    B.sort((x, y) => y.p - x.p); A.sort((x, y) => x.p - y.p);
    if (c.on !== false && c.circ > 0 && P0 > 0) { const D = W.bookDiag, pr = cfg.priceRange ?? 0.6, lg = cfg.priceMap === 'log', dist = (p) => (lg ? Math.log(p / P0) : (p / P0 - 1) / pr); for (const o of B) if (o.b && typeof o.b === 'object') D.bidD.push(dist(o.p)); for (const o of A) if (o.b && typeof o.b === 'object') D.askD.push(dist(o.p)); } // distance of bots' orders from the mark: in priceRange units ('range'), or the log of price ÷ mark ('log'); bookDiag.unit says which
    c.book = { bids: B.slice(0, 6).map((o) => [r2(o.p), o.b ? (o.b === 'liq' ? 'liquidator' : o.b.name) : 'outside']), asks: A.slice(0, 6).map((o) => [r2(o.p), o.b === 'store' ? 'Vault store' : o.b === 'liq' ? 'liquidator' : o.b.name]) };
    if (B.length && A.length) {
      // Each bid, best first, takes the cheapest ask still free that it may trade with (not its own, not a flagged pair) and that
      // can settle (the buyer can pay its bid on top of what it already took here; the seller still has the copy). An order that
      // can't trade takes nothing, so the asks it passed over stay for the next bidder; only orders that can settle set the price.
      const m = [], taken = new Uint8Array(A.length), cashUsed = new Map(), sold = new Map(); let j0 = 0;
      const canSell = (s) => (s === 'liq' ? W.liq.get(c.id) || 0 : s === 'store' ? c.pool : s.h.get(c.id) || 0) > (sold.get(s) || 0);
      for (let i = 0; i < B.length; i++) {
        const bd = B[i], buyer = bd.b; while (j0 < A.length && taken[j0]) j0++; if (j0 >= A.length || A[j0].p > bd.p) break;
        if (buyer && buyer.cash - (cashUsed.get(buyer) || 0) < bd.p) continue;
        let k = j0; for (; k < A.length && A[k].p <= bd.p; k++) { const s = A[k].b; if (!taken[k] && !(buyer && buyer === s) && !blocked(buyer, s) && canSell(s)) break; }
        if (k >= A.length || A[k].p > bd.p) continue;
        taken[k] = 1; m.push([bd, A[k]]); if (buyer) cashUsed.set(buyer, (cashUsed.get(buyer) || 0) + bd.p); sold.set(A[k].b, (sold.get(A[k].b) || 0) + 1);
      }
      if (m.length) {
        const last = m[m.length - 1], price = clamp((last[0].p + last[1].p) / 2, lim[0], lim[1]);
        for (const [bd, ak] of m) {
          if (bd.p < price || ak.p > price) continue; // the price limit (or the marginal pair's price) kept this pair from crossing
          const buyer = bd.b, seller = ak.b;
          if (buyer && buyer.cash < price) continue;
          if (W.gov && buyer && seller === 'store' && buyer.cash < price + govOutsideTax(W, price)) continue;
          if (seller === 'liq') { const q = W.liq.get(c.id) || 0; if (!q) continue; q > 1 ? W.liq.set(c.id, q - 1) : (W.liq.delete(c.id), W.liqPrice?.delete(c.id)); (W.liqSold ||= new Set()).add(c.id); }
          else if (seller === 'store') { if (c.pool < 1) continue; c.pool--; c.circ++; W.house.store = (W.house.store || 0) + price; if (!W.gov) tre(W, 'store', price); packCache = null; }
          else { if ((seller.h.get(c.id) || 0) < 1) continue; give(seller, c, -1); const fe = feeOf(W, price); seller.cash += price * (1 - fe); feeTo(W, price * fe); fill(seller, c, 'sell', price); flowIn(W, seller, price * (1 - fe)); sellLot(W, seller, c, price * (1 - fe)); }
          bd.used = ak.used = true; // only orders that traded are used
          if (buyer) { buyer.cash -= price; give(buyer, c, 1); fill(buyer, c, 'buy', price); flowOut(W, buyer, price); addLot(buyer, c, price, W.t); if (typeof seller !== 'object') led(W, seller === 'liq' ? 'liqOut' : 'storeOut', price); } else { c.circ--; W.house.outside += price; (W.outside ||= new Map()).set(c.id, (W.outside.get(c.id) || 0) + 1); if (typeof seller === 'object') led(W, 'outsideIn', price); } // an outside buyer keeps the copy (no card is destroyed)
          if (W.gov) { if (!buyer && typeof seller === 'object') govOutside(W, seller, price, 'sell'); else if (buyer && seller === 'store') govOutside(W, buyer, price, 'buy'); }
          if (seller === 'liq') liqPay(W, liqTake(W, c.id), price); // the liquidator pays any claim on the copy out of what it got
          c.wk.h = Math.max(c.wk.h, price); c.wk.l = Math.min(c.wk.l, price); c.wk.v++;
          if (W.ord) W.ord.coins += price; tkTrade(W, buyer, seller, c, price, P0, 'x');
          { const j = { type: 'trade', card: c.key, price: r2(price), buyer: buyer ? buyer.name : 'outside collector', seller: seller === 'liq' ? 'liquidator' : seller === 'store' ? 'Vault store' : seller.name }; noteWhy(W, j, bd, ak); jot(W, j); }
          done++;
          if (W.arcsWeek.length < 60 && buyer && seller !== 'liq' && seller !== 'store' && W.drand() < 0.5) W.arcsWeek.push([seller.id, buyer.id]); // display only: its own stream
        }
        if (done) { c.P = price; noteTrade(W, c, price); }
      }
    }
    // Quote pressure: unfilled bids above the price (or asks below it) move the quote even without a trade.
    let topBid = 0, lowAsk = Infinity;
    for (const o of B) if (!o.used && o.p > topBid) topBid = o.p;
    for (const o of A) if (!o.used && o.p < lowAsk) lowAsk = o.p;
    const O = W.ord; if (O) { O.bids += B.length; O.asks += A.length; }
    c.bb = topBid; c.ba = lowAsk < Infinity ? lowAsk : 0;
    if (c.on !== false && c.circ > 0 && P0 > 0) { const D = W.bookDiag; let bb = 0, ba = Infinity; for (const o of B) if (!o.used && o.b && typeof o.b === 'object' && o.p > bb) bb = o.p; for (const o of A) if (!o.used && o.b && typeof o.b === 'object' && o.p < ba) ba = o.p; // the bots' own standing book after the cross
      D.n++; if (bb > 0 && ba < Infinity) { D.both++; D.gap.push((ba - bb) / P0); } else if (bb > 0) D.onlyBid++; else if (ba < Infinity) D.onlyAsk++; else D.neither++; }
    { // the book's levels for markRule 'book': the median of the markDepth best standing orders (fewer if fewer exist)
      const k = cfg.markDepth ?? 3, med = (xs) => xs.length % 2 ? xs[xs.length >> 1] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
      const a = A.filter((o) => !o.used && o.b && o.b !== 'liq' && o.b !== 'store').map((o) => o.p).sort((x, y) => x - y).slice(0, k), bq = B.filter((o) => !o.used && o.b && o.b !== 'liq').map((o) => o.p).sort((x, y) => y - x).slice(0, k);
      c.askLvl = a.length ? med(a) : null; c.bidLvl = bq.length ? med(bq) : null; } // the book's best bid and ask: shown and seen, never moving the price under 'lastTrade'
    if (cfg.priceRule !== 'quotes') { /* last trade only */ } else if (cfg.twoSidedQuotes) {
      // Marked to the spread: only a two-sided book (an unfilled bid and an unfilled offer) moves the quote, toward the
      // nearest edge of the spread when the last price sits outside it. Offers with no bids (or bids with no offers) don't.
      if (topBid > 0 && lowAsk < Infinity) { const tgt = clamp(c.P, topBid, lowAsk); if (tgt > c.P) { c.P = lerp(c.P, tgt, cfg.quotePull); if (O) O.pullUp++; } else if (tgt < c.P) { c.P = lerp(c.P, tgt, cfg.quotePull); if (O) O.pullDown++; } }
    } else if (topBid > c.P) { c.P = lerp(c.P, topBid, cfg.quotePull); if (O) O.pullUp++; } else if (lowAsk < c.P) { c.P = lerp(c.P, lowAsk, cfg.quotePull); if (O) O.pullDown++; }
    c.P = clamp(c.P, lim[0], lim[1]);
    (c.ohlc ||= []).push([r2(c.wk.o), r2(Math.max(c.wk.h, c.P)), r2(Math.min(c.wk.l, c.P)), r2(c.P), c.wk.v]); if (c.ohlc.length > 120) c.ohlc.shift();
    { const vh = volSync(W, c, W.t - 1); vh.push(done + (c.aucT === W.t ? c.aucN : 0)); if (vh.length > 60) vh.shift(); c._vT = W.t; }
    c.Ph.push(c.P); if (c.Ph.length > 80) c.Ph.shift();
    trades += done;
  }
  W.lastTrades = trades + (W.aucWeek || 0); // auction sales count as trades
  if (cfg.priceRule === 'comps') compsMark(W);
  if (cfg.markRule === 'book' && cfg.priceRule !== 'quotes') { // the last trade (or comparable-sales mark), kept inside the standing book
    const fade = cfg.markHalfLife > 0 ? 1 - 0.5 ** (1 / cfg.markHalfLife) : 0, need = cfg.markWeeks ?? 2;
    for (const c of W.cards) { if (!(c.circ > 0)) continue; const to = bookMark(c, W.t, fade, need); if (to !== c.P) { c.P = to; c.bookT = W.t; c.bookP = to; if (c.Ph.length) c.Ph[c.Ph.length - 1] = to; } } }
  W._clrT = W.t; // the last week cleared: card volume histories are padded up to it when read (volSync)
  impliedPrices(W); if (W.fullL) W._cleared = W.t; // a player woken after this has missed this week's upkeep too
}
// markRule 'book': where the book leaves a card's mark this week (exported for the unit check)
export function bookMark(c, t, fade, need) {
  // persistence: count the weeks running that the ask median sat below the mark (or the bid median above it)
  c.askBelow = c.askLvl != null && c.askLvl < c.P ? (c.askBelow || 0) + 1 : 0; c.bidAbove = c.bidLvl != null && c.bidLvl > c.P ? (c.bidAbove || 0) + 1 : 0;
  let to = c.P; if (c.askBelow >= need) to = c.askLvl; else if (c.bidAbove >= need) to = c.bidLvl;
  if (fade && c.lastTradeT !== t) { // the appraiser: an old sale counts for less as it ages. Asks only pull a mark down, bids only push it up
    const A = c.askLvl, B = c.bidLvl, last = c.lastTradeP ?? c.P0; let target = null;
    if (A != null && B != null) { if (to < Math.min(A, B) || to > Math.max(A, B)) target = (A + B) / 2; } // both: only a mark outside the spread moves (toward the middle); inside it neither order tests it, so it holds
    else if (A != null) { const tg = Math.min(A, last); if (tg < to) target = tg; } // only asks: down toward the lower of the ask level and the last trade
    else if (B != null) { const tg = Math.max(B, last); if (tg > to) target = tg; } // only bids: up toward the higher of the bid level and the last trade
    if (target != null) to += (target - to) * fade; } // neither: it holds
  return to;
}
function leagueUpdate(W) {
  const moved = [];
  for (const c of W.players) if (W.rngLeague.rand() < 0.12) { const k = Math.exp(W.rngLeague.gauss() * 0.3); c.F = Math.max(0.05 * W.cfg.coinScale, c.F * k); moved.push([c, k]); }
  moved.sort((a, b) => b[1] - a[1]);
  const up = moved[0], dn = moved[moved.length - 1];
  log(W, 'update', `League update (test): ${moved.length} players' values moved${up ? `, led by ${up[0].pos} ${up[0].name} up ${Math.round((up[1] - 1) * 100)}%` : ''}${dn ? ` and ${dn[0].pos} ${dn[0].name} down ${Math.round((1 - dn[1]) * 100)}%` : ''}. Every note on them is now out of date.`);
}
// Royalties: a card pays its holders royaltyRate of its hidden value per weeksPerGeneration weeks. 'week' (default) pays
// each week a 1/weeksPerGeneration share, scaled under the league by that week's game: his production ÷ his career pace
// (a big game pays more, an injured, idle or retired player pays nothing). 'generation': the old lump at each generation's end.
function payRoyalties(W, share, scaleOf = null) { // scaleOf (government runs): owed -> the share of it paid
  const cfg = W.cfg, league = cfg.valueModel === 'league' && W.L;
  const gameK = (p) => { if (!league || !p.lg) return 1; if (!p.lg.active || !p._game || p._gameT !== W.t) return 0; const g = p.lg.tot.g || 0, cpg = g ? lgProduction(p.pos, p.lg.tot) / g : 0; return cpg > 0 ? Math.max(0, lgProduction(p.pos, p._game) / cpg) : 1; };
  const k = new Map(W.players.map((p) => [p.id, gameK(p)]));
  const perCard = (c) => cfg.royaltyRate * share * c.F * (k.get(c.pid) ?? 1), perItem = (it) => cfg.royaltyRate * share * intrinsicItem(W, it) * (k.get(it.pid) ?? 1);
  let owed = 0; for (const b of W.bots) { for (const [id, q] of b.h) owed += perCard(W.cards[id]) * q; for (const it of heldItems(W, b)) owed += perItem(it); }
  const house = cfg.royaltyFunding === 'house', scaleR = scaleOf ? scaleOf(owed) : house ? Math.min(1, Math.max(0, W.treasury) / Math.max(1, owed)) : cfg.closedEconomy ? Math.min(1, (W.treasury * 0.5) / Math.max(1, owed)) : 1; let paid = 0;
  for (const b of W.bots) { let d = 0; for (const [id, q] of b.h) d += perCard(W.cards[id]) * q * scaleR; for (const it of heldItems(W, b)) d += perItem(it) * scaleR; b.cash += d; flowIn(W, b, d); paid += d; } // royalties count in a bot's return: what it holds is its choice
  for (const L of W.cardLoans || []) shortPay(W, L, perCard(W.cards[L.id]) * scaleR); // a short seller pays the lender what the card would have earned, from cash it has (an unpaid royalty calls the short next week)
  if (cfg.closedEconomy || house) tre(W, 'royalties', -paid); led(W, 'royalties', paid); W.house.royalties += paid; W.royGen = (W.royGen || 0) + paid;
  // what each card paid over the last weeksPerGeneration weeks, per copy (a disclosed channel of hidden value: it is F × the
  // royalty rate × his games, so with royalties on F is close to public; public: every holder saw it)
  const n = cfg.weeksPerGeneration; for (const p of W.players) { const r = (p.royWin ||= []); r.push(cfg.royaltyRate * share * p.F * (k.get(p.id) ?? 1) * scaleR); if (r.length > (share >= 1 ? 1 : n)) r.shift(); p.roySum = r.reduce((a, b) => a + b, 0); }
  W._royPaid = true; W._royN = (W._royN || 0) + 1; // a card's or one-of-a-kind card's last royalty is worked out when read (cardRoy, itemRoy)
}
// Learning within a lifetime (adapt): every `every` weeks each neural bot scores the period just ended exactly as fitness
// (fitnessValue applies; allowance and the like excluded). If it was running a trial (its networks plus W.gauss() × size),
// it keeps the trial when that score beat the one before, else restores the saved networks. Then it starts a new trial.
// Nothing says what to learn: its own results decide. Adopting another's networks (evolution, inheritance) resets it.
function adaptStep(W) {
  const cfg = W.cfg, on = cfg.adaptOn, every = cfg.adaptEvery ?? 10, size = cfg.adaptSize ?? 0.05, bar = cfg.adaptBar || 'kept';
  if (!on || W.t % every) return; const st = (W.adaptStats ||= { run: 0, kept: 0 }), bidFit = cfg.fitnessValue === 'bid';
  // every score this period first, so each can also be read against the period's median (the market's common move)
  const sc = new Map(); for (const b of W.bots) { if (!b.g?.nn || !b._ad) continue; const A = b._ad, val = bidFit ? realValue(W, b) : worth(W, b); sc.set(b, [val, (val - ((b.exo || 0) - A.exo)) / Math.max(50 * cfg.coinScale, A.start) - 1]); }
  const all = [...sc.values()].map((v) => v[1]).sort((x, y) => x - y), mid = all.length ? all[all.length >> 1] : 0;
  for (const b of W.bots) { if (!b.g?.nn) continue;
    const A = b._ad;
    if (!A) { const val = bidFit ? realValue(W, b) : worth(W, b); b._ad = { start: val, exo: b.exo || 0 }; continue; } // first period: just measure
    const [val, raw] = sc.get(b), rel = raw - mid, score = bar === 'market' ? rel : raw; let base = score;
    if (A.keptScore != null) { (W.adaptPairs ||= []).push([A.keptScore, raw]); (W.adaptPairsM ||= []).push([A.keptRel, rel]); } else if (A.rejected) (W.adaptRej ||= []).push(raw); // diagnostics: how the period after a kept (or rejected) trial scored, raw and against the median
    let kept = null, keptRel = null, rejected = false;
    if (A.saved) { st.run++; if (score > A.saved.score) { st.kept++; kept = raw; keptRel = rel; } else { b.g.card = A.saved.card; b.g.bot = A.saved.bot; base = A.saved.score; rejected = true; } }
    if (bar === 'fresh' && rejected) { b._ad = { start: val, exo: b.exo || 0, saved: null, keptScore: null, rejected, fresh: true }; continue; } // the restored networks run one period untouched: that score becomes the bar
    const saved = { card: Float64Array.from(b.g.card), bot: Float64Array.from(b.g.bot), score: base };
    for (const net of [b.g.card, b.g.bot]) for (let i = 0; i < net.length; i++) net[i] += W.gauss() * size; // the trial
    b._ad = { start: val, exo: b.exo || 0, saved, keptScore: kept, keptRel, rejected }; }
}
// Where the networks press against their limits this week (measurement only): price offsets at the wall (range: |tanh| > 0.9;
// log: at the safety clamp) and beyond the default range's edge; bots whose cash target, loan rates, lending share or leverage
// output sits in the top 5% (sigmoid > 0.95, tanh > 0.9) of its range, or at rateMax; order sizes at the top; and the share of
// acting bots that had one more order, auction listing, item listing or short they wanted to place but the weekly count stopped
// (packs: wanted more than maxPacks)
function limitsSummary(W) {
  const D = W.limDiag; if (!D || !D.bots) return null; const sh = (a, n) => (n ? r2x(a / n) : null);
  return { bots: D.bots, keep: sh(D.keep, D.bots), lendRate: sh(D.lendRate, D.bots), maxRate: sh(D.maxRate, D.bots), lendOver5: sh(D.lendOver, D.bots), maxOver5: sh(D.maxOver, D.bots), lendShare: sh(D.lendShare, D.bots), lev: sh(D.lev, D.bots),
    bids: D.bid, bidEdge: sh(D.bidEdge, D.bid), bidFar: sh(D.bidFar, D.bid), asks: D.ask, askEdge: sh(D.askEdge, D.ask), askFar: sh(D.askFar, D.ask), qtyEdge: sh(D.qtyEdge, D.qty), packBidEdge: sh(D.packBidEdge, D.packBid),
    acts: D.acts, orders: sh(D.orders, D.acts), listings: sh(D.listings, D.acts), items: sh(D.items, D.acts), shorts: sh(D.shorts, D.acts), packs: sh(D.packs, D.acts) };
}
// The bots' book this week (4c): spread between their best bid and best ask (share of the mark) over cards with both,
// cards with only bids, only asks or neither, and where their orders sit: distance from the mark in priceRange units, and
// the price-offset output itself (tanh, −1…1; at ±1 an order is at the edge of the range its network allows)
function bookSummary(W) {
  const D = W.bookDiag, O = W.offDiag; if (!D) return null; const med = (xs) => { if (!xs.length) return null; const s2 = xs.slice().sort((a, b) => a - b); return r2x(s2[s2.length >> 1]); }, edge = (xs) => (xs.length ? r2x(xs.filter((v) => Math.abs(v) > 0.9).length / xs.length) : null), n = Math.max(1, D.n);
  return { cards: D.n, gap: med(D.gap), both: r2x(D.both / n), onlyBid: r2x(D.onlyBid / n), onlyAsk: r2x(D.onlyAsk / n), neither: r2x(D.neither / n), bidDist: med(D.bidD), askDist: med(D.askD), bidOff: med(O?.bid || []), askOff: med(O?.ask || []), bidEdge: edge(O?.bid || []), askEdge: edge(O?.ask || []), bids: D.bidD.length, asks: D.askD.length, distUnit: D.unit || 'range' };
}
/* ---------- Diagnostics (round 3): measurement only. No W.rand, nothing in the world changes ---------- */
const prng = (seed) => { let s = seed | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
function spearman(xs, ys) { const n = xs.length; if (n < 5) return null; const rank = (a) => { const s2 = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(n); s2.forEach(([, i], k) => (r[i] = k)); return r; }, a = rank(xs), b = rank(ys); let d = 0; for (let k = 0; k < n; k++) d += (a[k] - b[k]) ** 2; return Math.round((1 - (6 * d) / (n * (n * n - 1))) * 1000) / 1000; }
const pctl = (xs) => { const s = xs.filter((v) => Number.isFinite(v)).sort((a, b) => a - b), at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return s.length ? [r2x(s.reduce((a, b) => a + b, 0) / s.length), r2x(at(0.1)), r2x(at(0.5)), r2x(at(0.9))] : null; };
function cosDist(a, b) { const n = Math.min(a.length, b.length); let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? 1 - ab / Math.sqrt(aa * bb) : 0; }
// 24 fixed sample cards (inputs drawn once from a private generator, the same in every run), for the strategy clusters
let PROBES = null;
function probeCards() { const n = CARD_SHAPE[0]; if (PROBES && PROBES[0].length === n) return PROBES; const r = prng(24601); PROBES = Array.from({ length: 24 }, () => { const x = new Float64Array(n); x[0] = 1; for (let i = 1; i < n; i++) x[i] = r() < 0.25 ? 0 : (r() * 2 - 1) * 0.8; return x; }); return PROBES; }
// Strategy clusters: each bot's card-network outputs on the sample cards (z-scored per output), k-means for k = 2..8
// (k-means++ starts from the private generator), k chosen by the mean silhouette
function strategyClusters(bots) {
  const P = probeCards(), buf = bufs(CARD_SHAPE), V = bots.map((b) => { const v = []; for (const x of P) { const o = forwardCard(b.g.card, x, buf); for (let j = 0; j < o.length; j++) v.push(o[j]); } return v; }); foldKey = null;
  const n = V.length, d = n ? V[0].length : 0; if (n < 12) return null;
  for (let j = 0; j < d; j++) { let m = 0, q = 0; for (const v of V) m += v[j]; m /= n; for (const v of V) q += (v[j] - m) ** 2; const sd = Math.sqrt(q / n) || 1; for (const v of V) v[j] = (v[j] - m) / sd; }
  const D = Array.from({ length: n }, () => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let s2 = 0; const a = V[i], b = V[j]; for (let k = 0; k < d; k++) s2 += (a[k] - b[k]) ** 2; D[i][j] = D[j][i] = Math.sqrt(s2); }
  let best = null;
  for (let k = 2; k <= Math.min(8, n - 1); k++) {
    const r = prng(1000 + k), C = [V[Math.floor(r() * n)].slice()];
    while (C.length < k) { const w = V.map((v) => Math.min(...C.map((c) => { let s2 = 0; for (let j = 0; j < d; j++) s2 += (v[j] - c[j]) ** 2; return s2; }))), tot = w.reduce((a, b) => a + b, 0); let u = r() * tot, i = 0; while (i < n - 1 && (u -= w[i]) > 0) i++; C.push(V[i].slice()); }
    const lab = new Int32Array(n);
    for (let it = 0; it < 30; it++) { let moved = false;
      for (let i = 0; i < n; i++) { let bi = 0, bd = Infinity; for (let c = 0; c < k; c++) { let s2 = 0; for (let j = 0; j < d; j++) s2 += (V[i][j] - C[c][j]) ** 2; if (s2 < bd) { bd = s2; bi = c; } } if (lab[i] !== bi) { lab[i] = bi; moved = true; } }
      for (let c = 0; c < k; c++) { const m = new Float64Array(d); let cnt = 0; for (let i = 0; i < n; i++) if (lab[i] === c) { cnt++; for (let j = 0; j < d; j++) m[j] += V[i][j]; } if (cnt) for (let j = 0; j < d; j++) C[c][j] = m[j] / cnt; }
      if (!moved) break; }
    const size = new Array(k).fill(0); for (let i = 0; i < n; i++) size[lab[i]]++;
    let sil = 0; for (let i = 0; i < n; i++) { const sum = new Array(k).fill(0); for (let j = 0; j < n; j++) if (j !== i) sum[lab[j]] += D[i][j]; const own = size[lab[i]] > 1 ? sum[lab[i]] / (size[lab[i]] - 1) : 0; let other = Infinity; for (let c = 0; c < k; c++) if (c !== lab[i] && size[c]) other = Math.min(other, sum[c] / size[c]); sil += size[lab[i]] > 1 && other < Infinity ? (other - own) / Math.max(own, other) : 0; }
    sil /= n; if (!best || sil > best.sil) best = { k, sil, top: Math.max(...size) / n };
  }
  return best && { clusters: best.k, clusterTop: r2x(best.top), clusterSil: r2x(best.sil) };
}
/* ---------- Tactic tracker: measurement only. No W.rand, nothing in the world changes ---------- */
// What each bot actually did this generation is tallied as it happens (b._tk); at the generation end the profiles are
// z-scored and clustered (k-means, k = 2..8 by silhouette, private generator), each cluster is named by its most
// distinctive features, and matched to the last generation's tactics by centroid distance, so a tactic keeps its id
// for as long as bots keep doing it. Hidden value never enters a profile: prices are compared with the mark, the public
// price guide and the bot's own research note, all things the bot sees.
const tkNew = () => ({ b: [0, 0, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0, 0], bot: 0, auc: 0, hold: 0, holdN: 0, lend: 0, borrow: 0, shorts: 0, cardsLent: 0, packs: 0, lists: 0, sealed: 0, forced: 0 });
const tk = (W, b) => (W.cfg.tactics && b && typeof b === 'object' && b.kind === 'rule' ? (b._tk ||= tkNew()) : null);
// one side of a trade: [count, coins, Σ log(price ÷ mark), Σ log(price ÷ guide), guide n, Σ log(price ÷ own note), note n]
function tkSide(W, b, side, c, price, mark, it, other, via) {
  const T = tk(W, b); if (!T || !(price > 0)) return; const s = T[side], mult = it ? it.mult : c.mult, pl = W.players[c.pid], n = b.notes?.get(c.pid);
  s[0]++; s[1] += price; if (mark > 0) s[2] += Math.log(price / mark);
  if (guideOn(W.cfg) && pl?.guide > 0) { s[3] += Math.log(price / (pl.guide * mult)); s[4]++; }
  if (fresh(W, n) && n.est > 0) { s[5] += Math.log(price / (n.est * mult)); s[6]++; }
  if (other && typeof other === 'object') T.bot++; if (via === 'auc') T.auc++;
}
function tkTrade(W, buyer, seller, c, price, mark, via, it) { if (!W.cfg.tactics) return; tkSide(W, buyer, 'b', c, price, mark, it, seller, via); tkSide(W, seller, 's', c, price, mark, it, buyer, via); }
const tkAdd = (W, b, k, x = 1) => { const T = tk(W, b); if (T) T[k] += x; };
// the profile: raw values in plain units (for the names), then the transform the clustering uses
const TAC_F = ['buys', 'sells', 'turn', 'netBuy', 'bMark', 'sMark', 'bGuide', 'sGuide', 'bEst', 'sEst', 'hold', 'cash', 'conc', 'lend', 'borrow', 'shorts', 'cardsLent', 'packs', 'lists', 'sealed', 'botShare', 'aucShare', 'forced'];
const TAC_GRP = { buys: 'act', sells: 'act', turn: 'act', bMark: 'bp', bGuide: 'bp', bEst: 'bp', sMark: 'sp', sGuide: 'sp', sEst: 'sp' }; // a name uses one feature per group
const lg1 = (v) => Math.log1p(Math.max(0, v)), lg10 = (v) => Math.log1p(10 * Math.max(0, v)), cl1 = (v) => clamp(v, -1, 1);
const TAC_X = { buys: lg1, sells: lg1, turn: lg1, bMark: cl1, sMark: cl1, bGuide: cl1, sGuide: cl1, bEst: cl1, sEst: cl1, hold: lg1, lend: lg10, borrow: lg10, forced: lg10, shorts: lg1, cardsLent: lg1, packs: lg1, lists: lg1, sealed: lg1 };
function tacProfile(W, b) {
  const T = b._tk || tkNew(), B = T.b, S = T.s, cs = W.cfg.coinScale, base = Math.max(50 * cs, ((b.genStart ?? 0) + Math.max(0, worth(W, b))) / 2), avg = (s, n) => (n ? s / n : null);
  let hv = 0; const byP = new Map(); for (const [id, q] of b.h) { const c = W.cards[id], v = q * c.P; hv += v; byP.set(c.pid, (byP.get(c.pid) || 0) + v); }
  for (const it of heldItems(W, b)) { const v = markItem(W, it); hv += v; byP.set(it.pid, (byP.get(it.pid) || 0) + v); }
  let hold = T.hold, holdN = T.holdN; if (b.lots) for (const l of b.lots.values()) for (const x of l) { hold += W.t - x[1]; holdN++; } // sold copies and the ones still held
  const tr = B[0] + S[0], cn = B[1] + S[1], cash = Math.max(0, b.cash);
  return { buys: B[0], sells: S[0], turn: cn / base, netBuy: cn ? (B[1] - S[1]) / cn : null, bMark: avg(B[2], B[0]), sMark: avg(S[2], S[0]), bGuide: avg(B[3], B[4]), sGuide: avg(S[3], S[4]), bEst: avg(B[5], B[6]), sEst: avg(S[5], S[6]),
    hold: holdN ? hold / holdN : null, cash: cash + hv > 0 ? cash / (cash + hv) : null, conc: hv > 0 ? Math.max(...byP.values()) / hv : null, lend: T.lend / base, borrow: T.borrow / base, shorts: T.shorts, cardsLent: T.cardsLent, packs: T.packs, lists: T.lists, sealed: T.sealed,
    botShare: tr ? T.bot / tr : null, aucShare: tr ? T.auc / tr : null, forced: T.forced / base };
}
const tP = (x) => `${Math.round(Math.abs(x) * 100)}%`, tN = (x) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10)), tRel = (lg) => { const r = Math.exp(lg) - 1; return Math.abs(r) < 0.005 ? 'at' : `${tP(r)} ${r < 0 ? 'below' : 'above'}`; };
// a feature below the average reads as "never" when it is about zero, else "less than most"
const tLo = (v, none, less, ratio) => (v < (ratio ? 0.005 : 0.5) ? none : `${less} (~${ratio ? tP(v) + ' of its worth' : tN(v)} a gen)`);
const TAC_SAY = {
  buys: (v, z) => (z > 0 ? `buys a lot (~${tN(v)} a gen)` : tLo(v, 'hardly buys', 'buys less than most')), sells: (v, z) => (z > 0 ? `sells a lot (~${tN(v)} a gen)` : tLo(v, 'hardly sells', 'sells less than most')),
  turn: (v, z) => (z > 0 ? `trades ${tN(v)}× its worth a gen` : `barely trades (${tP(v)} of its worth a gen)`), netBuy: (v) => { const x = (1 + Math.abs(v)) / Math.max(0.02, 1 - Math.abs(v)); return v >= 0 ? `net buyer (buys ${tN(x)}× the coins it sells)` : `net seller (sells ${tN(x)}× the coins it buys)`; },
  bMark: (v) => `buys ${tRel(v)} the mark`, sMark: (v) => `sells ${tRel(v)} the mark`, bGuide: (v) => `buys ${tRel(v)} the price guide`, sGuide: (v) => `sells ${tRel(v)} the price guide`,
  bEst: (v) => `buys ${tRel(v)} its own research estimate`, sEst: (v) => `sells ${tRel(v)} its own research estimate`, hold: (v) => `holds ~${tN(v)} weeks`, cash: (v) => `keeps ${tP(v)} in cash`,
  conc: (v, z) => (z > 0 ? `concentrated (top player ${tP(v)} of its cards)` : `spread out (top player ${tP(v)} of its cards)`),
  lend: (v, z) => (z > 0 ? `lends coins (${tP(v)} of its worth a gen)` : tLo(v, 'never lends coins', 'lends less than most', true)), borrow: (v, z) => (z > 0 ? `borrows (${tP(v)} of its worth a gen)` : tLo(v, 'never borrows', 'borrows less than most', true)),
  shorts: (v, z) => (z > 0 ? `sells short (~${tN(v)} a gen)` : tLo(v, 'never shorts', 'shorts less than most')), cardsLent: (v, z) => (z > 0 ? `lends cards to short sellers (~${tN(v)} a gen)` : tLo(v, 'never lends cards', 'lends fewer cards than most')),
  packs: (v, z) => (z > 0 ? `opens packs (~${tN(v)} a gen)` : tLo(v, 'opens no packs', 'opens fewer packs than most')),
  lists: (v, z) => (z > 0 ? `sells into auctions (~${tN(v)} listings a gen)` : tLo(v, 'never lists at auction', 'lists at auction less than most')), sealed: (v, z) => (z > 0 ? `bids in sealed auctions (~${tN(v)} bids a gen)` : tLo(v, 'never bids at auction', 'bids at auction less than most')),
  botShare: (v) => (v >= 0.5 ? `trades with other bots (${tP(v)} of its trades)` : `trades with dealers and outsiders (${tP(1 - v)} of its trades)`), aucShare: (v, z) => (z > 0 ? `trades at auction (${tP(v)} of its trades)` : `rarely trades at auction (${tP(v)} of its trades)`),
  forced: (v, z) => (z > 0 ? `forced to sell (${tP(v)} of its worth a gen)` : tLo(v, 'never forced to sell', 'forced to sell less than most', true)),
};
// k-means (k-means++ starts from the private generator) for k = 2..kMax, k by the mean silhouette
function kmeansSil(V, kMax, seed) {
  const n = V.length, d = n ? V[0].length : 0; if (n < 12) return null;
  const D = Array.from({ length: n }, () => new Float64Array(n)); for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let s2 = 0; const a = V[i], b = V[j]; for (let k = 0; k < d; k++) s2 += (a[k] - b[k]) ** 2; D[i][j] = D[j][i] = Math.sqrt(s2); }
  const d2 = (v, c) => { let s2 = 0; for (let j = 0; j < d; j++) s2 += (v[j] - c[j]) ** 2; return s2; }; let best = null;
  for (let k = 2; k <= Math.min(kMax, n - 1); k++) {
    const r = prng(seed + k), C = [V[Math.floor(r() * n)].slice()];
    while (C.length < k) { const w = V.map((v) => Math.min(...C.map((c) => d2(v, c)))), tot = w.reduce((a, b) => a + b, 0); let u = r() * tot, i = 0; while (i < n - 1 && (u -= w[i]) > 0) i++; C.push(V[i].slice()); }
    const lab = new Int32Array(n);
    for (let it = 0; it < 40; it++) { let moved = false;
      for (let i = 0; i < n; i++) { let bi = 0, bd = Infinity; for (let c = 0; c < k; c++) { const s2 = d2(V[i], C[c]); if (s2 < bd) { bd = s2; bi = c; } } if (lab[i] !== bi) { lab[i] = bi; moved = true; } }
      for (let c = 0; c < k; c++) { const m = new Float64Array(d); let cnt = 0; for (let i = 0; i < n; i++) if (lab[i] === c) { cnt++; for (let j = 0; j < d; j++) m[j] += V[i][j]; } if (cnt) for (let j = 0; j < d; j++) C[c][j] = m[j] / cnt; }
      if (!moved) break; }
    const size = new Array(k).fill(0); for (let i = 0; i < n; i++) size[lab[i]]++;
    let sil = 0; for (let i = 0; i < n; i++) { const sum = new Array(k).fill(0); for (let j = 0; j < n; j++) if (j !== i) sum[lab[j]] += D[i][j]; const own = size[lab[i]] > 1 ? sum[lab[i]] / (size[lab[i]] - 1) : 0; let other = Infinity; for (let c = 0; c < k; c++) if (c !== lab[i] && size[c]) other = Math.min(other, sum[c] / size[c]); sil += size[lab[i]] > 1 && other < Infinity ? (other - own) / Math.max(own, other) : 0; }
    sil /= n; if (!best || sil > best.sil) best = { k, sil, lab: Array.from(lab) };
  }
  return best;
}
const tMean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null), tMed = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function tacticTrack(W, rule, gen) {
  const cfg = W.cfg, wpg = cfg.weeksPerGeneration, S = (W.tac ||= { next: 1, live: new Map(), of: new Map(), prevT: null }), win = Math.max(1, Math.round(cfg.tacticWindow ?? 2)), thr = cfg.tacticMatch ?? 1;
  const bots = rule.filter((b) => W.t - (b.joined ?? b.born ?? 0) >= wpg / 2); // in the market at least half the generation (a newcomer's half-week says nothing)
  const R = bots.map((b) => tacProfile(W, b)), F = TAC_F, nf = F.length;
  const X = R.map((r) => F.map((k) => (r[k] == null ? null : TAC_X[k] ? TAC_X[k](r[k]) : r[k])));
  const mu = new Array(nf).fill(0), sd = new Array(nf).fill(0);
  for (let j = 0; j < nf; j++) { const xs = X.map((x) => x[j]).filter((v) => v != null); mu[j] = tMean(xs) ?? 0; sd[j] = xs.length > 1 ? Math.sqrt(xs.reduce((a, v) => a + (v - mu[j]) ** 2, 0) / xs.length) : 0; }
  const Z = X.map((x) => x.map((v, j) => (v == null || !(sd[j] > 1e-9) ? 0 : (v - mu[j]) / sd[j]))); // a missing value sits at the mean
  for (const b of W.bots) b._tk = null; // the next generation's tally starts now
  const km = kmeansSil(Z, cfg.tacticKMax ?? 8, 7000); if (!km) return null;
  // clusters, largest first: centroid (z and the transformed scale), raw means, members
  let cl = Array.from({ length: km.k }, (_, c) => ({ c, idx: [] })); km.lab.forEach((c, i) => cl[c].idx.push(i)); cl = cl.filter((x) => x.idx.length).sort((a, b) => b.idx.length - a.idx.length || a.c - b.c);
  for (const x of cl) { x.z = F.map((_, j) => tMean(x.idx.map((i) => Z[i][j]))); x.cx = F.map((_, j) => tMean(x.idx.map((i) => X[i][j]).filter((v) => v != null))); x.raw = F.map((k) => tMean(x.idx.map((i) => R[i][k]).filter((v) => v != null)));
    const used = new Set(), top = []; for (const j of F.map((_, j) => j).sort((a, b) => Math.abs(x.z[b]) - Math.abs(x.z[a]) || a - b)) { if (top.length >= 3 || Math.abs(x.z[j]) < 0.4) break; const g = TAC_GRP[F[j]]; if (g && used.has(g)) continue; if (g) used.add(g); if (x.raw[j] != null) top.push(j); }
    x.top = top; x.name = top.length ? top.map((j) => TAC_SAY[F[j]](x.raw[j], x.z[j])).join(', ') : 'close to the market average on every count'; }
  // match to the last generation's tactics: centroid distance (RMS over features, in this generation's spread), greedy, one to one
  const dist = (a, b) => { let s2 = 0, m = 0; for (let j = 0; j < nf; j++) { if (a[j] == null || b[j] == null || !(sd[j] > 1e-9)) continue; s2 += ((a[j] - b[j]) / sd[j]) ** 2; m++; } return m ? Math.sqrt(s2 / m) : Infinity; };
  const prev = [...S.live.values()], pairs = []; cl.forEach((x, i) => prev.forEach((p, q) => pairs.push([dist(x.cx, p.cx), i, q]))); pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const gotC = new Map(), gotP = new Set(); for (const [d, i, q] of pairs) { if (d > thr) break; if (gotC.has(i) || gotP.has(q)) continue; gotC.set(i, [prev[q], d]); gotP.add(q); }
  const live = new Map(), alive = new Map(W.bots.map((b) => [b.id, b])), of = new Map(), n = bots.length;
  cl.forEach((x, i) => { const m = gotC.get(i); let t;
    if (m) { t = m[0]; x.d = m[1]; } else { let near = null; for (const p of prev) { const d = dist(x.cx, p.cx); if (!near || d < near[1]) near = [p, d]; } t = { id: S.next++, born: gen, parent: near ? near[0].id : null, pd: near ? near[1] : null, hist: [] }; x.d = null; }
    t.cx = x.cx; t.name = x.name; x.t = t; live.set(t.id, t); for (const k of x.idx) of.set(bots[k].id, t.id); });
  // where each tactic's bots came from: stayed, switched from another tactic, copied a bot's networks (evolution), heir, new
  for (const x of cl) { const fr = { stay: 0, switch: 0, copy: 0, heir: 0, new: 0 }, src = new Map();
    for (const k of x.idx) { const b = bots[k], was = S.of.get(b.id), net = b.srcT != null && S.prevT != null && b.srcT >= S.prevT, from = net ? S.of.get(b.src) : null; let o, s = null;
      if (was != null) { if (net && b.adopted && from != null) { o = 'copy'; s = from; } else if (was === x.t.id) o = 'stay'; else { o = 'switch'; s = was; } } else if (net && from != null) { o = b.offspring ? 'copy' : 'heir'; s = from; } else o = 'new';
      fr[o]++; if (s != null && s !== x.t.id) src.set(s, (src.get(s) || 0) + 1); }
    x.from = fr; x.src = [...src].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3);
    const ret = x.idx.map((k) => bots[k].roc).filter(Number.isFinite), retM = x.idx.map((k) => bots[k].rocMark).filter(Number.isFinite), fit = x.idx.map((k) => bots[k].fit).filter(Number.isFinite);
    x.ret = [tMean(ret), tMed(ret)]; x.retM = [tMean(retM), tMed(retM)]; x.fit = tMed(fit); x.share = x.idx.length / n;
    x.t.hist.push({ gen, share: x.share, ret: x.ret[0] }); if (x.t.hist.length > 12) x.t.hist.shift(); }
  // crowding: share up and mean return down in each of the last `win` generations. Cannibalized: share and return both
  // down while the tactic nearest it (centroid) has risen over the same stretch
  const run = (t) => { const h = t.hist; if (h.length < win + 1) return null; const w = h.slice(-win - 1); for (let i = 1; i < w.length; i++) if (w[i].gen !== w[i - 1].gen + 1) return null; return w; };
  const up = (w, k) => w.every((v, i) => !i || v[k] > w[i - 1][k]), down = (w, k) => w.every((v, i) => !i || v[k] < w[i - 1][k]);
  const rose = (t) => { const w = run(t); if (w) return up(w, 'share'); return t.born > gen - win && t.hist.length >= 1 && t.hist.every((v, i) => !i || v.share > t.hist[i - 1].share); }; // a tactic born inside the window rose from nothing
  for (const x of cl) { const w = run(x.t); x.crowd = !!(w && up(w, 'share') && down(w, 'ret')); x.cannibal = null;
    if (w && down(w, 'share') && w[w.length - 1].ret < w[0].ret) { let near = null; for (const y of cl) { if (y === x) continue; const d = dist(x.cx, y.cx); if (!near || d < near[1]) near = [y, d]; } if (near && rose(near[0].t)) x.cannibal = near[0].t.id; } }
  const died = prev.filter((p) => !live.has(p.id)).map((p) => { let near = null; for (const y of cl) { const d = dist(p.cx, y.cx); if (!near || d < near[1]) near = [y.t.id, d]; } const L = p.hist[p.hist.length - 1]; return { id: p.id, name: p.name, age: gen - p.born, lastShare: L ? r2x(L.share) : null, into: near ? near[0] : null }; });
  S.live = live; S.of = of; S.prevT = W.t;
  const r3x = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  const list = cl.map((x) => ({ id: x.t.id, name: x.name, n: x.idx.length, share: r3x(x.share), ret: x.ret.map(r3x), retMark: x.retM.map(r3x), fit: r3x(x.fit), age: gen - x.t.born, born: x.t.born, parent: x.t.parent, parentDist: x.t.born === gen && x.t.pd != null && Number.isFinite(x.t.pd) ? r2(x.t.pd) : null, dist: x.d == null ? null : r2(x.d),
    from: x.from, src: x.src, crowding: x.crowd, cannibalizedBy: x.cannibal, top: x.top.map((j) => [F[j], r2(x.z[j]), r3x(x.raw[j])]) }));
  const out = { k: km.k, sil: r3x(km.sil), bots: n, unprofiled: rule.length - n, list, died, born: list.filter((t) => t.born === gen).map((t) => t.id) };
  (W.tacticHist ||= []).push({ gen, t: W.t, k: km.k, sil: out.sil, tactics: list.map((t) => [t.id, t.n, t.share, t.ret[0], t.retMark[0], t.crowding ? 1 : 0, t.cannibalizedBy]), born: out.born, died: died.map((d) => d.id) });
  return out;
}
// Exits and entries between generation ends (population diagnostics)
function noteExit(W, b, cause) { const io = (W.genIO ||= { exits: [], newcomers: 0, heirs: 0 }); const ws = W.bots.map((x) => x.nwh?.[x.nwh.length - 1] ?? 0).sort((a, b) => a - b), w = b.nwh?.[b.nwh.length - 1] ?? 0; let lo = 0; while (lo < ws.length && ws[lo] < w) lo++; io.exits.push([cause, W.t - (b.joined ?? b.born ?? 0), Math.min(9, Math.floor((10 * lo) / Math.max(1, ws.length)))]); }
const AGE_BINS = [20, 40, 100, 200, Infinity], AGE_LABELS = ['<20', '20–40', '40–100', '100–200', '200+'];
function genDiag(W, rule) {
  const cfg = W.cfg, G = { gen: W.t / cfg.weeksPerGeneration, t: W.t }, nn = rule.filter((b) => b.g?.nn);
  // returns at marks and at selling value (whatever fitnessValue is), and how each carries over between generations
  for (const b of rule) { const rb = (realValue(W, b) - (b.exo || 0)) / Math.max(50 * cfg.coinScale, b.genStartBid ?? b.genStart ?? realValue(W, b)) - 1; b.rocM = [...(b.rocM || []), b.rocMark].slice(-2); b.rocB = [...(b.rocB || []), rb].slice(-2); }
  const both = (k) => rule.filter((b) => b[k]?.length === 2), pm = both('rocM'), pb = both('rocB');
  G.persistMark = pm.length > 10 ? spearman(pm.map((b) => b.rocM[0]), pm.map((b) => b.rocM[1])) : null;
  G.persistBid = pb.length > 10 ? spearman(pb.map((b) => b.rocB[0]), pb.map((b) => b.rocB[1])) : null;
  // crowding: the share of the population that got its networks (copied or inherited) from the last generation's top 10%
  const prevTop = W.genTop || null, since = W.genPrevT ?? 0;
  G.fromTop = prevTop && rule.length ? r2x(rule.filter((b) => b.srcT != null && b.srcT >= since && prevTop.has(b.src)).length / rule.length) : null;
  { const lin = new Map(); for (const b of rule) lin.set(b.lineage, (lin.get(b.lineage) || 0) + 1); G.lineTop = rule.length ? r2x(Math.max(...lin.values()) / rule.length) : null; }
  // how alike the card networks are: mean pairwise cosine distance on 50 bots spread evenly by id; copies against their sources
  if (nn.length > 2) { const byId = nn.slice().sort((a, b) => a.id - b.id), m = Math.min(50, byId.length), smp = Array.from({ length: m }, (_, i) => byId[Math.floor((i * byId.length) / m)]); let s2 = 0, c = 0; for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) { s2 += cosDist(smp[i].g.card, smp[j].g.card); c++; } G.netDist = c ? r2x(s2 / c) : null;
    const alive = new Map(W.bots.map((b) => [b.id, b])), pairs = nn.filter((b) => b.srcT != null && b.srcT >= since && alive.get(b.src)?.g?.nn); G.netDistCopies = pairs.length ? r2x(pairs.reduce((a, b) => a + cosDist(b.g.card, alive.get(b.src).g.card), 0) / pairs.length) : null; G.copies = pairs.length; }
  Object.assign(G, strategyClusters(nn) || { clusters: null, clusterTop: null, clusterSil: null });
  { // behaviour distance (the one fitness sharing uses): median RMS distance between bots' responses, all pairs on the sample and copies vs sources
    const P = probeCards(), buf = bufs(CARD_SHAPE), resp = (b) => { const v = []; for (const x of P) { const o = forwardCard(b.g.card, x, buf); for (let j = 0; j < o.length; j++) v.push(Math.tanh(o[j])); } return v; }, rms = (a, c) => { let s2 = 0; for (let k = 0; k < a.length; k++) s2 += (a[k] - c[k]) ** 2; return Math.sqrt(s2 / a.length); }, med = (xs) => (xs.length ? r2x(xs.sort((a, b) => a - b)[xs.length >> 1]) : null);
    const byId = nn.slice().sort((a, b) => a.id - b.id), m = Math.min(50, byId.length), smp = Array.from({ length: m }, (_, i) => byId[Math.floor((i * byId.length) / m)]).map(resp), ds = []; for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) ds.push(rms(smp[i], smp[j]));
    const alive = new Map(W.bots.map((b) => [b.id, b])), cp = nn.filter((b) => b.srcT != null && b.srcT >= since && alive.get(b.src)?.g?.nn).map((b) => rms(resp(b), resp(alive.get(b.src)))); foldKey = null;
    G.respDist = med(ds); G.respDistCopies = med(cp); G.respNear = ds.length ? r2x(ds.filter((d) => d < (W.cfg.sharingRadius ?? 0.5)).length / ds.length) : null; }
  // learning within a lifetime: trials kept, and whether a kept trial's score predicts the next period's
  const ad = W.adaptGen && W.adaptGen.gen === G.gen ? W.adaptGen : null, AP = W.adaptPairs || [];
  G.adaptKept = ad && ad.run ? r2x(ad.kept / ad.run) : null; G.adaptRun = ad ? ad.run : 0;
  G.adaptFollow = AP.length >= 10 ? spearman(AP.map((x) => x[0]), AP.map((x) => x[1])) : null; G.adaptPairs = AP.length; { const AM = W.adaptPairsM || []; G.adaptFollowMkt = AM.length >= 10 ? spearman(AM.map((x) => x[0]), AM.map((x) => x[1])) : null; W.adaptPairsM = []; }
  { const RJ = W.adaptRej || [], mean = (xs) => (xs.length ? r2x(xs.reduce((a, b) => a + b, 0) / xs.length) : null); G.adaptNextKept = mean(AP.map((x) => x[1])); G.adaptNextRejected = mean(RJ); }
  W.adaptPairs = []; W.adaptRej = [];
  // the wish to leave (quit output), everyone and bots under 40 weeks in the market
  G.quitAll = pctl(nn.map((b) => b._nnQuit)); G.quitNew = pctl(nn.filter((b) => W.t - (b.joined ?? b.born ?? 0) < 40).map((b) => b._nnQuit));
  // the next generation's top 10% by this generation's return
  if (cfg.tactics) G.tactics = tacticTrack(W, rule, G.gen); // what the bots actually did, clustered into tactics followed across generations
  const ranked = rule.slice().sort((x, y) => y.roc - x.roc); W.genTop = new Set(ranked.slice(0, Math.max(1, Math.round(ranked.length / 10))).map((b) => b.id)); W.genPrevT = W.t;
  return G;
}
// Fitness sharing: fitness (shifted positive) ÷ niche count^strength, the niche count = Σ max(0, 1 − d/sharingRadius) over bots
// (itself included), d the RMS distance between two card networks' responses (tanh) to the 24 sample cards
function sharedFitness(rule, strength, radius = 0.5) {
  const P = probeCards(), buf = bufs(CARD_SHAPE), R = rule.map((b) => { if (!b.g?.nn) return null; const v = []; for (const x of P) { const o = forwardCard(b.g.card, x, buf); for (let j = 0; j < o.length; j++) v.push(Math.tanh(o[j])); } return v; }); foldKey = null;
  const fs = rule.map((b) => (Number.isFinite(b.fit) ? b.fit : 0)), lo = Math.min(...fs), hi = Math.max(...fs), eps = 0.01 * Math.max(1e-9, hi - lo), out = new Map();
  rule.forEach((b, i) => { let m = 1; const a = R[i]; if (a) for (let j = 0; j < rule.length; j++) { if (j === i || !R[j]) continue; const c = R[j]; let s2 = 0; for (let k = 0; k < a.length; k++) s2 += (a[k] - c[k]) ** 2; const d = Math.sqrt(s2 / a.length); if (d < radius) m += 1 - d / radius; }
    b._niche = Math.round(m * 100) / 100; out.set(b, (fs[i] - lo + eps) / m ** strength); });
  return out;
}
// A newcomer: a brand-new random network, or (entrants 'offspring') a mutated copy of a parent from the last generation's top
function newcomer(W) { return onStream(W, W.rngPeople, () => newcomerOn(W)); } // every draw of an arrival (parent, network, name, cash) from the people stream
function newcomerOn(W) {
  const cfg = W.cfg; let parent = null;
  if (cfg.entrants === 'offspring' && W.parentIds?.length) { const alive = new Map(W.bots.map((b) => [b.id, b])), ps = W.parentIds.map((id) => alive.get(id)).filter((b) => b?.g?.nn); if (ps.length) parent = W.pick(ps); }
  const b = parent ? newBot(W, null, parent) : newBot(W, null); if (parent) { b.src = parent.id; b.srcT = W.t; b.offspring = true; }
  b.cash = cfg.startCash * Math.exp(W.gauss() * cfg.newcomerCashSd); led(W, 'newcomers', b.cash); b.nwh = [b.cash]; b.joined = W.t; b.genStart = b.genStartBid = b.cash; b.exo = 0; W.bots.push(b); (W.genIO ||= { exits: [], newcomers: 0, heirs: 0 }).newcomers++; // the opening grant is its starting capital, never part of its return
  jot(W, { type: 'entered', bot: b.name, kind: ARCH[b.a].label, cash: r2(b.cash), ...(parent ? { parent: parent.name } : {}) }); return b;
}
function genIOClose(W, G) {
  const io = W.genIO || { exits: [], newcomers: 0, heirs: 0 }, cause = {}, age = Object.fromEntries(AGE_LABELS.map((l) => [l, 0])), dec = new Array(10).fill(0);
  for (const [c, a, d] of io.exits) { cause[c] = (cause[c] || 0) + 1; age[AGE_LABELS[AGE_BINS.findIndex((x) => a < x)]]++; dec[d]++; }
  G.exits = io.exits.length; G.exitCause = cause; G.exitAge = age; G.exitDecile = dec; G.entries = io.newcomers; G.heirs = io.heirs; G.population = W.bots.filter((b) => b.kind === 'rule').length;
  W.genIO = { exits: [], newcomers: 0, heirs: 0 };
}
function generationEnd(W) {
  const cfg = W.cfg, gen = W.t / cfg.weeksPerGeneration;
  if (cfg.royalties && !cfg.priceOnly && cfg.royaltyEvery === 'generation') payRoyalties(W, 1);
  if (W.adaptStats) { W.adaptGen = { gen, ...W.adaptStats }; if (W.adaptStats.run) log(W, 'gen', `Generation ${gen}: bots kept ${W.adaptStats.kept} of ${W.adaptStats.run} trial changes to their own networks.`); W.adaptStats = { run: 0, kept: 0 }; }
  if (cfg.royalties && !cfg.priceOnly) { let held = 0; for (const b of W.bots) for (const [id, q] of b.h) held += q * W.cards[id].P; W.royYield = held > 0 ? (W.royGen || 0) / held / cfg.weeksPerGeneration : 0; // the weekly yield actually paid, against marked value
    log(W, 'gen', `Generation ${gen} royalties: ${Math.round(W.royGen || 0).toLocaleString()} coins to card holders (${(W.royYield * 100).toFixed(3)}% of marked value a week).`); W.royGen = 0; }
  for (const b of W.bots) b.seasons++;
  // Fitness: return on the capital the bot started the generation with (floored at 50 × coinScale so a near-empty bot's
  // ratio stays finite), net of the lump sums booked to b.exo (fitnessExo: by default the allowance, the wealth tax paid
  // back, the flat living cost and cash shocks). Royalties, fees, taxes and costs tied to its holdings count: they follow its choices
  const rule = W.bots.filter((b) => b.kind === 'rule');
  const bidFit = cfg.fitnessValue === 'bid', fst = { copies: 0, noBid: 0 };
  for (const b of rule) { const start = Math.max(50 * W.cfg.coinScale, bidFit ? b.genStartBid ?? b.genStart ?? worth(W, b) : b.genStart ?? worth(W, b)); b.roc = ((bidFit ? realValue(W, b, fst) : worth(W, b)) - (b.exo || 0)) / start - 1; b.rocHist = [...(b.rocHist || []), b.roc].slice(-10); const h = b.rocHist.slice(-cfg.nnFitnessGens); b.fit = b.g.nn ? h.reduce((x, y) => x + y, 0) / h.length : b.roc; }
  { // measurement: rank correlation of bots' returns this generation against the last, over bots alive for both
    const xs = rule.filter((b) => b.rocHist?.length >= 2).map((b) => [b.rocHist[b.rocHist.length - 2], b.rocHist[b.rocHist.length - 1]]);
    if (xs.length > 10) { const rank = (a) => { const s2 = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = []; s2.forEach(([, i], k) => (r[i] = k)); return r; }, r1 = rank(xs.map((x) => x[0])), r2_ = rank(xs.map((x) => x[1])), n = xs.length; let dd = 0; for (let k = 0; k < n; k++) dd += (r1[k] - r2_[k]) ** 2; W.genPersist = Math.round((1 - (6 * dd) / (n * (n * n - 1))) * 1000) / 1000; } }
  for (const b of rule) b.rocMark = bidFit ? (worth(W, b) - (b.exo || 0)) / Math.max(50 * W.cfg.coinScale, b.genStart ?? worth(W, b)) - 1 : b.roc;
  const G = genDiag(W, rule);
  const shF = (cfg.fitnessSharing || 0) > 0 ? sharedFitness(rule, cfg.fitnessSharing, cfg.sharingRadius ?? 0.5) : null, fitOf = (b) => (shF ? shF.get(b) : b.fit);
  if (shF) G.sharing = { strength: cfg.fitnessSharing, niche: pctl(rule.map((b) => b._niche ?? 1)) };
  { const rk = rule.slice().sort((x, y) => fitOf(y) - fitOf(x)); W.parentIds = rk.slice(0, Math.max(1, Math.round(rk.length * cfg.evolveShare))).map((b) => b.id); } // the parents newcomers come from (entrants 'offspring')
  if (cfg.evolve && rule.length > 4) {
    const ranked = rule.slice().sort((x, y) => fitOf(y) - fitOf(x)), n = Math.max(1, Math.round(ranked.length * cfg.evolveShare));
    const best = ranked.slice(0, n), worst = ranked.slice(-n);
    for (const b of worst) { const m = W.pick(best); const before = ARCH[b.a].label; b.g = mutate(W, m.g); b._ad = null; b.a = styleOf(b.g.w); b.gen = m.gen + 1; b.lineage = m.lineage ?? m.id; b.adopted = (b.adopted || 0) + 1; b.src = m.id; b.srcT = W.t; jot(W, { type: 'adopted', bot: b.name, from: m.name, before, after: ARCH[b.a].label, roc: r2(b.roc), mentorRoc: r2(m.roc) }); }
    const kinds = (xs) => Object.entries(xs.reduce((o, b) => ((o[ARCH[b.a].label] = (o[ARCH[b.a].label] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ');
    log(W, 'evolve', `Generation ${gen}: best returns ${best.slice(0, 3).map((b) => `${b.name} ${b.roc >= 0 ? '+' : ''}${Math.round(b.roc * 100)}%`).join(', ')}. The ${n} worst-returning bots adopt their strategies and keep their own capital (now ${kinds(worst)}).`);
  }
  if (cfg.mortality) onStream(W, W.rngPeople, () => { // deaths: lifespans, heirs (their networks and names) and the estate's rounding draw from the people stream
    let died = 0, born = 0;
    for (const b of rule) {
      if (b.lifespan == null) b.lifespan = cfg.lifespan[0] + Math.floor(W.rand() * (cfg.lifespan[1] - cfg.lifespan[0] + 1));
      if (b.seasons < b.lifespan) continue;
      const heirs = Array.from({ length: cfg.heirs }, () => { const h = newBot(W, null, b); h.cash = 0; h.lineage = b.lineage ?? b.id; h.src = b.id; h.srcT = W.t; h.lifespan = cfg.lifespan[0] + Math.floor(W.rand() * (cfg.lifespan[1] - cfg.lifespan[0] + 1)); return h; });
      const lots = cfg.estateSale > 0 ? estateSale(W, b) : [];
      noteExit(W, b, 'died (heirs took over)'); (W.genIO ||= { exits: [], newcomers: 0, heirs: 0 }).heirs += heirs.length; settleEstate(W, b, heirs); died++; born += heirs.length;
      for (const [id, q, ls] of lots) { const c = W.cards[id]; give(heirs[0], c, q); for (let u = 0; u < q; u++) addLot(heirs[0], c, ls[u]?.[0] ?? c.P, ls[u]?.[1] ?? W.t); for (let k = 0; k < q; k++) { if (!listAuction(W, heirs[0], c, NO_MIN)) break; (W.forcedWeek ||= {}).estate = (W.forcedWeek.estate || 0) + 1; } }
    }
    // OLD RULE capPoorest: too many heirs and the poorest leave the market (their cards are sold, their loans settled)
    const cap = cfg.capPoorest ? Math.round(popOf(W) * cfg.populationCap) : Infinity;
    const poorest = W.bots.filter((b) => b.kind === 'rule').map((b) => [b, worth(W, b)]).sort((x, y) => x[1] - y[1]);
    let out = 0; while (W.bots.filter((b) => b.kind === 'rule').length > cap && poorest.length) { removeBot(W, poorest.shift()[0], 'priced out'); out++; }
    if (died) log(W, 'evolve', `Generation ${gen}: ${died} bots die of old age; their estates pass to ${born} heirs carrying their strategies${out ? `, and ${out} of the poorest bots leave the market` : ''}.`);
  });
  for (const b of W.bots) { b.genStart = worth(W, b); b.genStartBid = realValue(W, b); b.exo = 0; } // the selling-value start is kept whatever fitnessValue is (diagnostics); only 'bid' fitness reads it
  genIOClose(W, G); W.genRec = G;
  if (bidFit) W.fitStats = { gen, copies: fst.copies, noBid: fst.noBid, shareNoBid: fst.copies ? fst.noBid / fst.copies : 0 };
}
// Estate sale: estateSale of each holding (an even share, the fraction rounded with W.rand, so no card is picked) is sold
// before the heirs inherit: into the best standing bids, the proceeds joining the estate's cash; what doesn't sell is
// returned for the heir to put up at auction with no minimum
function estateSale(W, b) {
  const unsold = [], alive = new Set(W.bots); // a bid left by a bot that died earlier in this loop is gone with it
  for (const [id, q] of [...b.h]) { const want = q * W.cfg.estateSale, k = Math.floor(want) + (W.rand() < want - Math.floor(want) ? 1 : 0); if (!k) continue; const c = W.cards[id]; let left = k;
    for (const o of leftBids(c)) { if (left <= 0) break; if (o.b === b || blocked(o.b, b) || (typeof o.b === 'object' && !alive.has(o.b))) continue; if (xfer(W, c, o.b, b, o.p, o)) { o.used = true; left--; (W.forcedWeek ||= {}).estate = (W.forcedWeek.estate || 0) + 1; } }
    if (left > 0) { const have = b.h.get(id) || 0, take = Math.min(left, have); if (take) { give(b, c, -take); unsold.push([id, take, b.lots?.get(id)?.splice(0, take) || []]); } } } // the copies go with their cost lots (first in, first out, as a sale would)
  return unsold;
}
// An estate passes to heirs in equal shares: cash, every card copy (with its cost), loans in both directions, notes
function settleEstate(W, b, heirs) {
  const k = heirs.length;
  for (const h of heirs) { h.cash = b.cash / k; h.notes = new Map(b.notes); h.friends = new Set(b.friends); h.flags = new Set(b.flags); h.social = b.social; h.gen = b.gen + 1; W.bots.push(h); }
  let i = 0;
  for (const [id, q] of b.h) { const lots = b.lots?.get(id) || []; for (let u = 0; u < q; u++) { const h = heirs[i++ % k]; give(h, W.cards[id], 1); addLot(h, W.cards[id], lots[u]?.[0] ?? W.cards[id].P, lots[u]?.[1] ?? W.t); } } // a copy with no recorded cost takes the mark, never the hidden value
  for (const [id, ls] of b.lots || []) for (const l of ls.slice(b.h.get(id) || 0)) addLot(heirs[0], W.cards[id], l[0], l[1]); // the cost of copies lent out or listed at auction goes to heirs[0], who takes those loans and listings
  for (const uid of b.items || []) { const it = W.items.get(uid), h = heirs[i++ % k]; if (!it) continue; it.owner = h; (h.items ||= new ItemSet()).add(uid); }
  for (const L of W.loans || []) {
    if (L.lender === b) { const h = heirs[i++ % k]; L.lender = h; h.lent = (h.lent || 0) + L.amount; }
    if (L.borrower === b) { const h = heirs[i++ % k]; L.borrower = h; h.debt = (h.debt || 0) + L.amount; }
  }
  { const h = heirs[0]; for (const L of W.cardLoans || []) { if (L.lender === b) { L.lender = h; bump(h, 'lentOut', L.id, 1); } if (L.borrower === b) { L.borrower = h; bump(h, 'owed', L.id, 1); } } h.shortColl = (h.shortColl || 0) + (b.shortColl || 0);
    for (const p of W.predictions || []) if (p.b === b) p.b = h; // its pending predictions are the estate's claims
    for (const cl of W.claims || []) { for (const e of cl.lenders) if (e[0] === b) e[0] = h; if (cl.borrower === b) cl.borrower = h; } } // and its claims on seized cards
  if (b.arrears) for (const h of heirs) { h.arrears = {}; for (const k in b.arrears) h.arrears[k] = b.arrears[k] / heirs.length; } // bills it owed pass with the estate
  for (const a of W.auctions) if (a.seller === b) a.seller = heirs[0]; // its open listings pass to the heir (else the proceeds would go to a bot no longer in the market)
  for (const h of heirs) { h.nwh = [worth(W, h)]; h.genStart = h.nwh[0]; h.genStartBid = realValue(W, h); }
  W.bots = W.bots.filter((x) => x !== b);
  for (const x of W.bots) { if (x.flags.delete(b.id)) for (const h of heirs) { x.flags.add(h.id); h.flaggedBy = (h.flaggedBy || 0) + 1; h.lastCaught = b.lastCaught ?? W.t; } if (x.friends.delete(b.id)) for (const h of heirs) x.friends.add(h.id); }
  jot(W, { type: 'died', bot: b.name, age: b.seasons, estate: r2(heirs.reduce((s, h) => s + worth(W, h), 0)), heirs: heirs.map((h) => h.name) });
}
// A bot leaving the market: its cards go to the liquidator; loans it made are forgiven, loans it owes default
export function removeBot(W, b, reason) {
  noteExit(W, b, reason);
  const w = worth(W, b);
  for (const p of (W.predictions || []).filter((p) => p.b === b)) { b.cash += W.cfg.gameStake; flowIn(W, b, W.cfg.gameStake); led(W, 'stakesBack', W.cfg.gameStake); } W.predictions = (W.predictions || []).filter((p) => p.b !== b); // a leaver's pending predictions are withdrawn, stakes refunded
  for (const L of W.loans || []) if (L.borrower === b && L.amount > 0) repayLoan(W, L, Math.max(0, Math.min(L.amount, b.cash))); // it repays what it owes from its cash before it goes
  for (const L of W.loans || []) if (L.borrower === b && L.amount > 0) { L.lender.lent -= L.amount; (W.claimNew ||= []).push([L.lender, L.amount]); L.amount = 0; } // the rest: its lenders keep a claim on its cards
  if (W.claimNew?.length) { if (W.credit) W.credit.writtenOff = (W.credit.writtenOff || 0) + W.claimNew.reduce((a, e) => a + e[1], 0); }
  if (b.arrears) { (W.house.mint ||= {}).arrearsExcused = (W.house.mint.arrearsExcused || 0) + arrearsOf(b); b.arrears = null; } // bills it owed leave with it (recorded)
  b.gone = true; seize(W, b); // its cards, items and open listings to the liquidator (carrying its lenders' claim, if any)
  for (const cl of W.claims || []) for (const e of cl.lenders) if (e[0] === b) e[1] = 0; // claims it held as a lender lapse
  for (const L of W.loans || []) if (L.lender === b && L.amount > 0) { L.borrower.debt -= L.amount; L.amount = 0; }
  for (const L of (W.cardLoans || []).slice()) { if (L.lender === b) closeLoan(W, L, 'lender left', W.cards[L.id].P, true); else if (L.borrower === b) closeLoan(W, L, 'borrower left', W.cards[L.id].P, false); }
  if (W.gov) govExit(W, b, reason); // a government run: the exit tax on its cash, and the term's record of who left
  led(W, 'leavers', b.cash + (b.shortColl || 0)); // booked after its loans close: what it still holds leaves with it (a bot below zero takes its debt to the world)
  W.bots = W.bots.filter((x) => x !== b);
  for (const x of W.bots) { x.flags.delete(b.id); x.friends.delete(b.id); }
  jot(W, { type: 'exited', bot: b.name, kind: ARCH[b.a].label, worth: r2(w), reason });
}
function detect(W) {
  const p = W.hist.p;
  if (p.length > 5) {
    const now = p[p.length - 1], past = p[p.length - 5]; // the Vault index against its own value 4 weeks earlier (like with like)
    if (now < past * 0.88 && !(W.cool.crash > W.t)) { log(W, 'crash', `Crash: the price index fell ${Math.round((1 - now / past) * 100)}% in four weeks.`); W.cool.crash = W.t + 12; }
    if (now > past * 1.15 && !(W.cool.boom > W.t)) { log(W, 'bubble', `Rally: the price index rose ${Math.round((now / past - 1) * 100)}% in four weeks.`); W.cool.boom = W.t + 12; }
  }
  const pm = W.hist.pMark || []; if (pm.length > 5) { const now = pm[pm.length - 1], past = pm[pm.length - 5]; // the same detector on the marks index
    if (now < past * 0.88 && !(W.cool.crashM > W.t)) { log(W, 'crash', `Crash in marks: every card's mark fell ${Math.round((1 - now / past) * 100)}% in four weeks.`); W.cool.crashM = W.t + 12; }
    if (now > past * 1.15 && !(W.cool.boomM > W.t)) { log(W, 'bubble', `Rally in marks: every card's mark rose ${Math.round((now / past - 1) * 100)}% in four weeks.`); W.cool.boomM = W.t + 12; } }
  const bub = bubble(W);
  if (bub > 1.3 && !W.bubbleOn) { W.bubbleOn = true; log(W, 'bubble', `Bubble: cards trade at ${bub.toFixed(2)}× their hidden value on average.`); }
  if (bub < 1.12) W.bubbleOn = false;
  if (W.t % 4 === 0) for (const b of W.bots) for (const [id, q] of b.h) {
    const c = W.cards[id], key = b.id + ':' + id;
    if (c.circ >= 8 && q / c.circ > 0.5 && !W.cornered.has(key)) { W.cornered.add(key); log(W, 'corner', `Corner: ${b.name} (${ARCH[b.a].label}) holds ${q} of the ${c.circ} ${c.name} cards in circulation (${Math.round((q / c.circ) * 100)}%).`); }
  }
}

/* ---------- Metrics ---------- */
// The Vault index, repeat-sales (as house-price indices are built): every card that traded is paired with its own previous
// trade. Each week the last 104 weeks of the index are estimated together from all their pairs by least squares (each pair:
// log index then − log index at the earlier trade = that card's log change), with the weeks before fixed. A very small
// smoothness term bridges weeks without trades; the pairs decide everything else. Cards that didn't trade drop out instead of
// holding it flat. Earlier weeks are revised as new pairs arrive; the chart shows each week's value as it was published.
function repeatSales(W) {
  const L = (W.rsLog ||= [0]), WIN = W.cfg.rsWindow, CL = W.cfg.rsClamp, all = (W.rsAll ||= []);
  for (const [t0, d] of W.rsPairs || []) all.push([t0, W.t, Math.max(-CL, Math.min(CL, d))]); W.rsPairs = [];
  W.rsAll = all.filter((x) => x[1] > W.t - WIN);
  const start = Math.max(1, W.t - WIN + 1), n = W.t - start + 1; if (n <= 0) return 100 * Math.exp(L[W.t] ?? 0);
  const A = Array.from({ length: n }, () => new Float64Array(n)), rhs = new Float64Array(n), known = (t) => L[t] ?? L[L.length - 1] ?? 0;
  for (const [t0, t1, d] of W.rsAll) { const i1 = t1 - start; if (i1 < 0) continue;
    if (t0 >= start) { const i0 = t0 - start; A[i1][i1] += 1; A[i0][i0] += 1; A[i1][i0] -= 1; A[i0][i1] -= 1; rhs[i1] += d; rhs[i0] -= d; }
    else { A[i1][i1] += 1; rhs[i1] += d + known(t0); } }
  const lam = W.cfg.rsSmooth; // smoothness between neighbouring weeks
  for (let i = 0; i < n; i++) { if (i === 0) { A[0][0] += lam; rhs[0] += lam * known(start - 1); } else { A[i][i] += lam; A[i - 1][i - 1] += lam; A[i][i - 1] -= lam; A[i - 1][i] -= lam; } }
  for (let c = 0; c < n; c++) { let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r; [A[c], A[piv]] = [A[piv], A[c]]; [rhs[c], rhs[piv]] = [rhs[piv], rhs[c]];
    const d = A[c][c] || 1e-12; for (let r = c + 1; r < n; r++) { const f = A[r][c] / d; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; rhs[r] -= f * rhs[c]; } }
  const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let v = rhs[r]; for (let k = r + 1; k < n; k++) v -= A[r][k] * x[k]; x[r] = v / (A[r][r] || 1e-12); }
  for (let i = 0; i < n; i++) L[start + i] = x[i];
  return 100 * Math.exp(L[W.t]);
}
export function idx(W, which) { let a = 0, b = 0; for (const c of W.cards) { a += (which === 'P' ? c.P : c.F) * c.S0; b += c.P0 * c.S0; } return (100 * a) / b; }
export function bubble(W) { let a = 0, b = 0; for (const c of W.cards) { a += c.P * c.circ; b += c.F * c.circ; } return b ? a / b : 1; }
export function gini(xs) { const s = xs.slice().sort((a, b) => a - b), n = s.length, tot = s.reduce((a, b) => a + b, 0); if (!tot) return 0; let g = 0; s.forEach((x, i) => (g += (2 * (i + 1) - n - 1) * x)); return g / (n * tot); }
function record(W) {
  const nws = W.bots.map((b) => worth(W, b)), tot = nws.reduce((a, b) => a + b, 0) || 1;
  assignGroups(W); const share = GROUPS.map(() => 0); W.bots.forEach((b, i) => (share[b._grp] += nws[i] / tot));
  const h = W.hist;
  h.p.push(W.cfg.vaultIndex === 'basket' ? idx(W, 'P') : repeatSales(W)); (h.pMark ||= []).push(idx(W, 'P')); /* the marks index: a basket of every card's mark */ h.f.push(idx(W, 'F')); h.bub.push(bubble(W)); h.gini.push(gini(nws)); h.share.push(share); h.trades.push(W.lastTrades);
  h.money.push(W.bots.reduce((s, b) => s + b.cash, 0));
  { // what the bots chose about cash and credit this week (network outputs), and what the credit market did
    const nn = W.bots.filter((b) => b.g?.nn), byW = nn.map((b) => [b, worth(W, b)]).sort((a, b) => b[1] - a[1]), top = byW.slice(0, Math.max(1, Math.round(byW.length / 10))).map((x) => x[0]);
    const q = (xs) => { const s = xs.slice().sort((a, b) => a - b), at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return s.length ? [r2x(s.reduce((a, b) => a + b, 0) / s.length), r2x(at(0.1)), r2x(at(0.5)), r2x(at(0.9))] : null; };
    const stat = (bs) => Object.fromEntries(['keep', 'lendShare', 'lendRate', 'lev', 'maxRate'].map((k) => [k, q(bs.map((b) => b.g[k] ?? 0))]));
    const C = W.credit || {}; W.creditLog = { all: stat(nn), top: stat(top), offered: Math.round(C.offered || 0), asked: Math.round(C.asked || 0), lent: Math.round(C.lent || 0), repaidMaturity: Math.round(C.repaid || 0), repaidForced: Math.round(C.repaidForced || 0) };
  }
  { // coins created and removed this week, by tag: the bots' money is their cash plus short collateral; every movement in or
    // out is booked once at its source (led), so "other" is zero up to rounding, and the treasury moves only by its own lines (tre)
    const m = W.house.mint || {}, pv = W._mPrev || {}, d = (k) => (m[k] || 0) - (pv[k] || 0); W._mPrev = { ...m };
    const IN = { allowance: 'allowance', royalties: 'royalties', outsideIn: 'outside buyers', dealerIn: 'dealers buying', prizes: 'prizes', stakesBack: 'game pots paid', newcomers: 'newcomers', taxBack: 'wealth tax paid back', liqClaims: 'liquidator to lenders and borrowers' };
    const OUT = { living: 'living costs', lifestyle: 'lifestyle', fees: 'trade fees', packs: 'packs', liqOut: 'liquidator sales', storeOut: 'Vault store', outsideOut: 'outside sellers', dealerOut: 'dealers selling', holding: 'holding costs', wealthTax: 'wealth tax', shocks: 'cash shocks', stakes: 'game stakes', leavers: 'bots that left', loanLeavers: 'card loans settled with leavers' };
    if (W.gov) { Object.assign(IN, GOV_IN); Object.assign(OUT, GOV_OUT); } // a government's lines
    const created = Object.fromEntries(Object.entries(IN).map(([k, l]) => [l, d(k)])), removed = Object.fromEntries(Object.entries(OUT).map(([k, l]) => [l, d(k)]));
    const c = Object.values(created).reduce((a, b) => a + b, 0), r = Object.values(removed).reduce((a, b) => a + b, 0), moneyNow = W.bots.reduce((s, b) => s + b.cash + (b.shortColl || 0), 0), moneyPrev = W._moneyPrev ?? moneyNow; W._moneyPrev = moneyNow;
    const T = W.house.tre || {}, tp = W._tPrev || {}, dt = Object.fromEntries(Object.keys(T).map((k) => [k, T[k] - (tp[k] || 0)])); W._tPrev = { ...T };
    const tNow = W.treasury, tPrev = W._trePrev ?? tNow; W._trePrev = tNow; const tSum = Object.values(dt).reduce((a, b) => a + b, 0);
    W.moneyWeek = { created, removed, other: moneyNow - moneyPrev - (c - r), net: moneyNow - moneyPrev, totalIn: c, totalOut: r, exo: W.exoWk || 0, treasury: { lines: dt, other: tNow - tPrev - tSum, net: tNow - tPrev } };
  } h.pass.push(W.passPrice); h.shares.push(W.week.shares); h.thefts.push(W.week.thefts); h.gamePacks.push(W.gamePacksWeek || 0);
  let known = 0; for (const b of W.bots) for (const n of b.notes.values()) if (fresh(W, n)) known++;
  h.informed.push(known / Math.max(1, W.bots.length)); h.flags.push(W.bots.reduce((s, b) => s + b.flags.size, 0));
}
export function log(W, kind, text) { if (W.t > 0 && LEAGUE_NEWS.has(kind)) (W.newsWk ||= [])[W.t] = ((W.newsWk[W.t]) || 0) + 1; W.events.unshift({ t: W.t, kind, text }); if (W.events.length > 160) W.events.pop(); }

/* ---------- Observation for an AI bot ---------- */
export function observe(W, b, { marketRows = W.cfg.marketRows ?? 40, marketPage = b.marketPage || 0 } = {}) {
  const r2 = (x) => Math.round(x * 100) / 100;
  const row = (c) => { const n = b.notes.get(c.pid); return [c.key, c.team, r2(c.P), r2(ret(c, 4) * 100), recentVol(c, 4), c.circ, b.h.get(c.id) || 0, r2(c.mult), n ? r2(n.est * c.mult) : null]; };
  const notes = {}; for (const [pid, n] of b.notes) { const p = W.players[pid]; if (p) notes[p.key] = { estimatePrizmBase: r2(n.est), weeksOld: W.t - n.week, from: n.from, ...(n.facts ? { facts: n.facts } : {}) }; }
  const ids = new Set([...hot.slice(marketPage * marketRows, (marketPage + 1) * marketRows).map((c) => c.id), ...b.h.keys(), ...[...b.notes.keys()].map((pid) => mktId(pid, 0, 0))].filter((id) => W.cards[id] && W.cards[id].on !== false));
  const packs = Object.fromEntries(Object.keys(PACK_TYPES).map((t) => { const pk = packInfo(W, t), P = PACK_TYPES[t], dt = P.des.reduce((a, x) => a + x, 0); return [t, { name: P.label, price: r2(pk.price), cards: P.size, playerTierOdds: Object.fromEntries(TIERS.map((x, i) => [x, P.tiers[i] + '%'])), designOdds: Object.fromEntries(DESIGNS.map((x, i) => [x, r2((P.des[i] / dt) * 100) + '%'])), altKitChance: P.kit[0], throwbackKitChance: P.kit[1], prizmParallelOdds: Object.fromEntries(PRIZM.map((z, i) => [`${z.c} /${z.run}`, P.prizm[i]])) }]; }));
  const label = (a) => (a.uid ? W.items.get(a.uid)?.label : W.cards[a.cardId].key);
  // Other bots it knows from its own dealings (note partners, thieves, loans either way), by name: never others' worth, style or notes
  const dealt = new Set([...b.friends, ...b.flags]); for (const L of W.loans || []) { if (L.borrower === b) dealt.add(L.lender.id); if (L.lender === b) dealt.add(L.borrower.id); } for (const L of W.cardLoans || []) { if (L.borrower === b) dealt.add(L.lender.id); if (L.lender === b) dealt.add(L.borrower.id); }
  const others = W.bots.filter((x) => x !== b && (dealt.has(x.id) || x.flags.has(b.id))).sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)).slice(0, 12).map((x) => ({ name: x.name, friendsWithYou: x.friends.has(b.id), flaggedYou: x.flags.has(b.id) }));
  return {
    week: W.t + 1, generation: Math.floor(W.t / W.cfg.weeksPerGeneration) + 1, season: W.seasonLabel || W.timeline?.seasons[0].season || null,
    you: { name: b.name, ...(b.kind === 'ai' && b.lifespanW ? { ageWeeks: W.t - b.born, lifespanWeeksRange: W.cfg.aiLifespanWeeks, generationOfYourLine: b.line || 1 } : {}), cash: r2(b.cash), worth: r2(worth(W, b)), debt: r2(b.debt || 0), lentOut: r2(b.lent || 0), borrowLimit: r2(W.cfg.credit ? Math.max(0, W.cfg.maxLTV * holdingsValue(W, b) - (b.debt || 0)) : 0), creditMarketRate: W.credit?.rate ?? null, yourLoans: (W.loans || []).filter((L) => L.borrower === b || L.lender === b).slice(0, 12).map((L) => ({ role: L.borrower === b ? 'borrowed' : 'lent', with: (L.borrower === b ? L.lender : L.borrower).name, amount: r2(L.amount), weeklyRate: L.rate, dueWeek: L.due })), livingCostNextWeek: r2(W.cfg.livingCost + W.cfg.lifestyle * Math.max(0, worth(W, b))), researchPasses: b.passes.filter((e) => e > W.t + 1).length + W.cfg.passesPerWeek, notesKept: b.notes.size, botsThatFlaggedYou: W.bots.filter((x) => x.flags.has(b.id)).length, friends: [...b.friends].map((id) => W.bots.find((x) => x.id === id)?.name).filter(Boolean), memo: b.memo },
    lastWeek: { yourFills: W.fills?.get(b.id) || [], researchResults: b.inbox || [], lastSteal: b.lastSteal || null },
    market: { page: marketPage, pages: Math.max(1, Math.ceil(hot.length / Math.max(1, marketRows))), columns: ['card', 'team', 'price', 'change4wPct', 'trades4w', 'inCirculation', 'youHold', 'rarityPremium', 'yourEstimateForThisCard'], rows: [...ids].map((id) => row(W.cards[id])).sort((x, y) => y[4] - x[4] || y[2] - x[2]) },
    yourNotes: notes,
    yourShorts: (W.cardLoans || []).filter((L) => L.borrower === b).map((L) => ({ card: W.cards[L.id].key, soldAt: r2(L.entry), priceNow: r2(W.cards[L.id].P), weeksLeft: L.due - W.t, forcedToBuyBack: !!L.force })),
    cardsYouLentOut: (W.cardLoans || []).filter((L) => L.lender === b).length,
    cardLending: W.cfg.shorting ? { weeklyFeeShareOfPrice: W.cfg.cardLendFee, collateralShareOfPrice: W.cfg.shortMargin, returnWithinWeeks: W.cfg.cardLoanWeeks, lendableCopiesInTheMarket: [...(W.lendable?.values() || [])].reduce((x, y) => x + y, 0) } : null,
    yourOneOfAKindCards: { columns: ['id', 'card', 'youPaid', 'plainCardPrice', 'premiumOverPlainCard'], rows: itemsOf(W, b).map((it) => [it.uid, it.label, it.cost == null ? null : r2(it.cost), r2(W.cards[mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)].P), r2(it.mult / (it.d === 4 ? FINISH_MULT[it.f] : FINISH_MULT[it.f] * DESIGN_MULT[it.d]))]) },
    packs: { types: packs, cardsLeftInPool: packInfo(W).tot },
    researchPassMarket: { lastPrice: W.passPrice === null ? null : r2(W.passPrice), tradedLastWeek: W.passTrades },
    gameTicketMarket: { lastPrice: W.ticketPrice === null ? null : r2(W.ticketPrice), tradedLastWeek: W.ticketTrades, yourTickets: b.tickets.length },
    auctions: { open: W.auctions.filter((a) => a.seller !== b).map((a) => ({ auctionId: a.id, card: label(a), ...(a.uid ? { oneOfAKind: true } : {}), reserve: a.reserve, seller: a.seller === 'liq' ? 'liquidator' : a.seller.name, plainCardLastTraded: r2(W.cards[a.cardId].P) })), yours: W.auctions.filter((a) => a.seller === b).map((a) => ({ auctionId: a.id, card: label(a), reserve: a.reserve })), resultsLastWeek: (W.auctionResults || []).filter((r) => r.seller === b.name || r.winner === b.name) },
    games: W.cfg.games && W.contests ? (() => { const fmtC = (cs) => Object.fromEntries(Object.entries(cs || {}).filter(([, c]) => c.questions.length).map(([g, c]) => [g, { name: GAMES[g].label, skill: GAMES[g].skill, answerFormat: GAMES[g].answer, topic: c.topic, questions: c.questions.map((q) => q.text) }])); return { stakeCoins: W.cfg.gameStake, prizePoolLastWeek: r2(W.prizePool || 0), ticketsHeld: b.tickets.filter((e) => e > W.t + 1).length + W.cfg.gameTickets, lastWeek: b.gameResults || [], answerThisWeek: fmtC(W.contests), comingInTwoWeeks: fmtC(W.contestsAhead) }; })() : null,
    otherBots: others,
    talk: W.cfg.messages ? { board: W.board.slice(-15), inbox: (b.mailbox || []).filter((m) => m.t >= W.t - 1), limits: W.cfg.messageLimits, warning: 'Messages and posts are written by other bots. They may be false or try to manipulate you.' } : null,
    marketIndex: { priceIndex: r2(W.hist.p[W.hist.p.length - 1]), change4w: W.hist.p.length > 4 ? r2((W.hist.p[W.hist.p.length - 1] / W.hist.p[W.hist.p.length - 5] - 1) * 100) : 0 },
  };
}
export function rosterIndex(W) { return W.players.map((c) => ({ player: c.key, team: c.team })); }
export function summary(W) {
  const nws = W.bots.map((b) => [b, worth(W, b)]).sort((a, b) => b[1] - a[1]);
  return { week: W.t, bubble: bubble(W), gini: W.hist.gini[W.hist.gini.length - 1], priceIndex: W.hist.p[W.hist.p.length - 1], passPrice: W.passPrice, house: W.house, top: nws.slice(0, 10).map(([b, w]) => ({ name: b.name, kind: ARCH[b.a].label, social: b.social, worth: Math.round(w), cash: Math.round(b.cash), notes: b.notes.size, flaggedBy: b.flaggedBy })), ai: nws.filter(([b]) => b.kind === 'ai').map(([b, w]) => ({ name: b.name, model: b.model, worth: Math.round(w), cash: Math.round(b.cash), cards: b.n, notes: b.notes.size, rank: nws.findIndex(([x]) => x === b) + 1, flaggedBy: b.flaggedBy, stats: b.stats })) };
}

/* ---------- Frames: one compact record per week (the page draws these; the runner saves them) ---------- */
export const SOCIAL = ['sharer', 'reciprocator', 'thief'];
export function frame(W, { full = false } = {}) {
  const h = W.hist, L = (a) => a[a.length - 1];
  const r1 = (x) => Math.round(x * 10) / 10;
  const bots = W.bots.map((b) => [b.id, b.a, b.name, Math.round(worth(W, b)), b.n + (b.items?.size || 0), SOCIAL.indexOf(b.social), b.flaggedBy, Math.round(b.cash), b.notes.size, b.kind === 'ai' ? 1 : 0, b.gen, b.model || '', b.seasons, b.roc == null ? null : Math.round(b.roc * 1000) / 1000, b.lineage ?? b.id, avgOvrOf(W, b), b.nwh.length > 4 ? Math.round((b.nwh[b.nwh.length - 1] / Math.max(1, b.nwh[b.nwh.length - 5]) - 1) * 1000) / 1000 : 0, b._grp ?? 2, b.g?.nn ? 1 : 0]);
  const hotNow = W.players.slice().sort((x, y) => recentVol(y, 20) - recentVol(x, 20)).slice(0, 6).map((c) => [c.id, r1(c.P), r1(c.F), recentVol(c, 20), circOf(W, c), c.pool]);
  const f = {
    t: W.t,
    pk: Object.fromEntries(Object.keys(PACK_TYPES).map((t) => [t, [Math.round(packInfo(W, t).price || 0), W.packWeek?.[t]?.sold ?? 0]])), // each pack type's price now and packs sold this week
    ...(guideOn(W.cfg) ? { guideT: W.guideT ?? null, guideUse: W.guideUse?.n ? Math.round((W.guideUse.s / W.guideUse.n) * 1000) / 1000 : null, ...(W.guideT === W.t ? { guide: W.players.map((p) => (p.guide > 0 ? Math.round(p.guide * 100) / 100 : null)) } : {}) } : {}),
    h: { p: L(h.p), pMark: h.pMark?.length ? L(h.pMark) : null, f: L(h.f), bub: L(h.bub), gini: L(h.gini), share: L(h.share), trades: L(h.trades), money: Math.round(L(h.money)), pass: L(h.pass), informed: L(h.informed), flags: L(h.flags), shares: L(h.shares), thefts: L(h.thefts), gamePacks: L(h.gamePacks) },
    bots, arcs: W.arcsWeek.slice(), hot: hotNow,
    events: W.events.filter((e) => e.t === W.t),
    researched: [...W.week.researched].sort((a, b) => b[1] - a[1]).slice(0, 5),
    jn: [...W.journal.filter((j) => j.type === 'aiActions' || j.type === 'post' || j.type === 'message'), ...W.journal.filter((j) => !['aiActions', 'post', 'message'].includes(j.type) && (j.type !== 'game' || j.packs > 0)).slice(-30)].slice(-40),
    tickets: W.ticketPrice,
    gs: W.gameStats ? Object.fromEntries(Object.entries(W.gameStats).map(([g, x]) => [g, [x.entrants, x.pot, x.entrants ? r2(x.scoreSum / x.entrants) : null, x.skillN ? r2(x.skillSum / x.skillN) : null]])) : null,
    garch: W.gameArch ? W.gameArch.map(([e, w, net]) => [e, w, Math.round(net)]) : null,
    topics: W.contests ? Object.fromEntries(Object.entries(W.contests).map(([g, c]) => [g, c.topic])) : null,
    season: W.seasonLabel || W.timeline?.seasons[0].season || null,
    fashion: W.fashion ? W.fashion.map((x) => r2(x)) : null,
    genome: genomeMix(W),
    lineages: lineageStats(W),
    people: W.turnover || null,
    ...(W.entryDiag ? { entry: W.entryDiag } : {}), // the entry multiplier and its components (measurement only)
    mkt: marketStats(W),
    flow: W.flow ? { net: W.flow.net.map(Math.round), realized: W.flow.realized.map(Math.round), trips: W.flow.trips, tax: Math.round(W.flow.tax), paidOut: Math.round(W.flow.paidOut) } : null,
    movers: movers(W),
    top: topCards(W),
    ord: W.ord ? (() => { const ar = W.auctionResults || [], sold = ar.filter((r) => r.winner); const AS = W.aucStats || { sold: 0, coins: 0, free: 0, vs: [] }, vsS = AS.vs.slice().sort((x, y) => x - y); return { aucCardSold: AS.sold, aucFree: AS.free, aucFreeOld: AS.freeOld || 0, aucVsMark: vsS.length >= 5 ? Math.round(vsS[vsS.length >> 1] * 1000) / 1000 : null, bids: W.ord.bids, asks: W.ord.asks, pullUp: W.ord.pullUp, pullDown: W.ord.pullDown, coins: Math.round(W.ord.coins), minted: W.ord.minted, packs: W.house.packs - W.ord.packs, aucListed: ar.length, aucSold: sold.length, aucCoins: Math.round(sold.reduce((s, r) => s + r.price, 0)), flagged: W.bots.filter((b) => b.flaggedBy >= 5).length, due4: (W.loans || []).filter((L) => L.due - W.t <= 4).length, shortCopies: (W.cardLoans || []).length, shortValue: Math.round((W.cardLoans || []).reduce((x, L) => x + W.cards[L.id].P, 0)), shorts: W.ord.shorts || 0, covers: W.ord.covers || 0, forced: W.ord.forced || 0, lendable: [...(W.lendable?.values() || [])].reduce((x, y) => x + y, 0), due4Coins: Math.round((W.loans || []).filter((L) => L.due - W.t <= 4).reduce((x, L) => x + L.amount, 0)), allowance: Math.round(W.flow?.paidOut || 0), prizes: Math.round(W.prizePool || 0) }; })() : null,
    bands: bandBubble(W),
    bandHold: bandHoldings(W),
    sens: W.t % 4 === 0 ? (W.nnSens = nnSensitivity(W)) : null,
    house: { fees: Math.round(W.house.fees), packs: W.house.packs, gamePacks: W.house.gamePacks || 0 },
    newPlayers: W.newPlayers?.length ? W.newPlayers.splice(0) : undefined,
    predPending: W.predictions?.length ? { n: W.predictions.length, coins: Math.round(W.predictions.length * W.cfg.gameStake) } : null, // stakes in predictions not yet settled (a run that ends holds them)
    arrears: (() => { let n = 0, v = 0; for (const b of W.bots) { const a = arrearsOf(b); if (a > 0) { n++; v += a; } } return n ? { bots: n, coins: Math.round(v), paidToDate: Math.round(W.arrearsPaid || 0) } : null; })(), // bills owed and not yet paid
    persist: W.genPersist ?? null, gen: W.genRec ?? null, bookD: bookSummary(W), limits: limitsSummary(W), ...(W.cfg.attention > 0 && W.attDiag ? { attention: { ...W.attDiag } } : {}), adapt: W.adaptGen ? { ...W.adaptGen } : null, lost: W.lostSeason ?? 0,
    why: W.whyWeek || null, forced: W.forcedWeek || null, shocks: W.shockWeek || 0, credit: W.creditLog || null, royYield: W.royYield ?? null, fit: W.fitStats || null,
    money: W.moneyWeek ? (() => { const M = W.moneyWeek, R = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)])); return { created: R(M.created), removed: R(M.removed), other: Math.round(M.other), net: Math.round(M.net), totalIn: Math.round(M.totalIn), totalOut: Math.round(M.totalOut), exo: Math.round(M.exo), treasury: { lines: R(M.treasury.lines), other: Math.round(M.treasury.other), net: Math.round(M.treasury.net) } }; })() : null,
    inj: W.L ? W.players.filter((p) => W.era[p.id]?.injured).map((p) => p.id) : undefined,
    league: W.L ? { week: W.L.week, season: W.L.season, champion: W.L.champions[W.L.champions.length - 1] || null, active: W.players.filter((p) => p.lg?.active).length, injured: W.players.filter((p) => W.era[p.id]?.injured).length } : null,
    ...(W.gov ? { gov: govFrame(W) } : {}), // government runs only: the treasury, its own account, the dials and the board's signals
  };
  if (full) {
    f.vol = W.players.map((c) => c.volH[c.volH.length - 1] || 0);
    f.aiDetail = Object.fromEntries(W.bots.filter((b) => b.kind === 'ai').map((b) => [b.name, { cash: Math.round(b.cash), debt: Math.round(b.debt || 0), realized: Math.round(b.stats.realized || 0), positions: [...b.h].map(([id, q]) => [id, q, r1(avgCost(b, id) ?? 0)]), notes: [...b.notes].map(([id, n]) => [id, r1(n.est), n.week]) }]));
    { const ai = new Set(); for (const b of W.bots) if (b.kind === 'ai') ai.add(b.name); f.aiLog = W.journal.filter((j) => WHO.some((k) => typeof j[k] === 'string' && ai.has(j[k]))); }
    f.si = W.players.map(() => 0); for (const L of W.cardLoans || []) f.si[W.cards[L.id].pid]++;
    { const own = ownedItemCounts(W); f.circ = W.players.map((c) => circOf(W, c, own)); } f.pool = W.players.map((c) => c.pool); f.ovr = W.players.map((c) => W.era?.[c.id]?.ovr ?? null); f.risk = W.players.map((c) => (c.on === false ? null : Math.round(riskRating(W, c) * 10) / 10));
    f.prices = W.players.map((c) => r1(c.P)); if (W.t === 0 || W.cfg.valueModel !== 'formula' || (W.cfg.leagueUpdates && W.t % W.cfg.updateEvery === 0)) f.values = W.players.map((c) => r1(c.F)); }
  return f;
}

// Price ÷ hidden value per family (by circulating supply), and the value each strategy holds in each family.
function famBubble(W) {
  const a = W.families.map(() => 0), b = W.families.map(() => 0);
  for (const c of W.cards) { a[c.fam] += c.P * c.circ; b[c.fam] += c.F * c.circ; }
  return a.map((x, i) => (b[i] ? Math.round((x / b[i]) * 1000) / 1000 : null));
}
function holdings(W) {
  const m = ARCH.map(() => W.families.map(() => 0));
  for (const b of W.bots) for (const [id, q] of b.h) { const c = W.cards[id]; m[b.a][c.fam] += q * c.P; }
  return m.map((row) => row.map((v) => Math.round(v)));
}

// Families (the site's play-style clusters), ordered by position then size. The page uses the same list.
export function familyList(library) {
  const ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'], key = (p) => `${p.family || p.pos}|${p.pos}`;
  const n = {}; library.players.forEach((p) => (n[key(p)] = (n[key(p)] || 0) + 1));
  return Object.keys(n).sort((a, b) => { const [, pa] = a.split('|'), [, pb] = b.split('|'); return ORDER.indexOf(pa) - ORDER.indexOf(pb) || n[b] - n[a] || a.localeCompare(b); }).map((k) => { const [name, pos] = k.split('|'); return { name, pos, n: n[k] }; });
}
export const familyIndex = (fams, p) => fams.findIndex((f) => f.name === (p.family || p.pos) && f.pos === p.pos);

function marketStats(W) {
  let mcap = 0, vcap = 0, cards = 0; for (const c of W.cards) { mcap += c.P * c.circ; vcap += c.F * c.circ; cards += c.circ; }
  for (const it of W.items.values()) if (it.owner) { mcap += markItem(W, it); vcap += intrinsicItem(W, it); cards++; }
  const cash = W.bots.map((b) => b.cash).sort((a, b) => b - a), tot = cash.reduce((a, b) => a + b, 0) || 1, k = Math.max(1, Math.round(cash.length * 0.1));
  return { rate: W.credit?.rate ?? null, defaults: W.credit?.defaults || 0, debt: Math.round(totalDebt(W)), calls: W.credit?.calls || 0, broke: W.living?.broke || 0, spent: Math.round(W.living?.spent || 0), mcap: Math.round(mcap), vcap: Math.round(vcap), cards, cash: Math.round(tot), cashTop10: Math.round((cash.slice(0, k).reduce((a, b) => a + b, 0) / tot) * 1000) / 1000, cashShare: (() => { const h = Math.max(1, Math.round(cash.length * 0.5)), sum = (a) => a.reduce((x, y) => x + y, 0) / tot; return [sum(cash.slice(0, k)), sum(cash.slice(k, h)), sum(cash.slice(h))].map((x) => Math.round(x * 1000) / 1000); })(), treasury: Math.round(W.treasury), bank: Math.round((W.bankRate ?? 1) * 100) / 100 };
}
function movers(W) {
  const rows = W.players.filter((c) => recentVol(c, 4) >= 2 && c.Ph.length > 4).map((c) => [c.id, Math.round(c.P * 100) / 100, Math.round(ret(c, 4) * 1000) / 1000, recentVol(c, 4)]);
  rows.sort((a, b) => b[2] - a[2]);
  return { up: rows.slice(0, 8), down: rows.slice(-6).reverse() };
}

/* ---------- The league (valueModel 'league'): simulated football after the last real season drives hidden value ----------
   Every rate comes from sandbox/data/league_rates.json, measured from the save's real seasons (sandbox/measure_league.mjs).
   Each week every active, healthy player plays one game (weeks 1–17 of each 20-week season); at season's end come awards,
   a Super Bowl, retirements (each replaced by a rookie at the same position and club), and changes in form. Value is the
   site's own formula (OVR percentile within position over the game's pool, skill, Career Legacy, Hall of Fame, tier)
   recomputed every week from the simulated totals. It never reads a price or a bot. */
const LSTATS = { QB: ['yds', 'td', 'int', 'ryds', 'rtd'], RB: ['ryds', 'rtd', 'recyds', 'rectd', 'fum', 'rec'], WR: ['rec', 'yds', 'td', 'fum'], TE: ['rec', 'yds', 'td', 'fum'], OL: ['blk'], LB: ['tkl', 'int', 'sck', 'ff'], DB: ['tkl', 'int', 'sck', 'ff'], DL: ['tkl', 'int', 'sck', 'ff'] };
const LYARDS = new Set(['yds', 'ryds', 'recyds']), LAWARDS = ['rings', 'mvp', 'opoy', 'dpoy', 'sbmvp', 'roty'];
const LDEF = new Set(['LB', 'DB', 'DL']);
const pyRound = (x) => { const f = Math.floor(x), d = x - f; return d === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(x); };
// League Score (data/y80/formula/ovr.py, src/config/ovr.ts): production by position plus award points
function lgProduction(pos, t) {
  const g = (k) => t[k] || 0;
  if (pos === 'QB') return g('yds') / 80 + 0.9 * g('td') + 0.9 * g('rtd') - 0.6 * g('int');
  if (pos === 'RB') return g('ryds') / 18 + 2.2 * g('rtd') + g('recyds') / 30 + 2.2 * g('rectd') - 0.8 * g('fum');
  if (pos === 'WR' || pos === 'TE') { const td = t.td != null ? t.td : g('yds') / 95; return pos === 'WR' ? g('yds') / 14 + 2.5 * td - g('fum') : g('yds') / 8 + 3 * td - g('fum'); }
  if (pos === 'OL') return 5 * g('blk') + 2 * g('g');
  return 0.7 * g('tkl') + 12 * g('int') + 14 * g('sck') + 14 * g('ff');
}
const lgAwards = (pos, t) => 40 * (t.rings || 0) + 90 * (t.mvp || 0) + (LDEF.has(pos) ? 90 : 45) * ((t.opoy || 0) + (t.dpoy || 0)) + 40 * (t.sbmvp || 0) + 10 * (t.roty || 0);
const lgScore = (pos, t) => lgProduction(pos, t) + lgAwards(pos, t);
// The site's library stat names → the timeline's keys
function libTotals(p) {
  const t = {}, M = { Games: 'g', 'Pass Yds': 'yds', 'Pass TD': 'td', 'Rush Yds': 'ryds', 'Rush TD': 'rtd', Fum: 'fum', Fumbles: 'fum', Blocks: 'blk', Tackles: 'tkl', FF: 'ff', Rings: 'rings', MVP: 'mvp', OPOY: 'opoy', DPOY: 'dpoy', SBMVP: 'sbmvp', ROTY: 'roty', Rec: 'rec', INT: 'int', 'Rec TD': 'rectd', TDs: 'td' };
  for (const [k, v] of Object.entries(p.stats || {})) { let key = M[k]; if (k === 'Rec Yds') key = p.pos === 'RB' ? 'recyds' : 'yds'; if (k === 'Sacks') key = p.pos === 'QB' ? null : 'sck'; if (key && typeof v === 'number') t[key] = v; }
  return t;
}
const LIB_NAMES = { g: 'Games', yds: (pos) => (pos === 'QB' ? 'Pass Yds' : 'Rec Yds'), td: (pos) => (pos === 'QB' ? 'Pass TD' : 'TDs'), int: 'INT', ryds: 'Rush Yds', rtd: 'Rush TD', recyds: 'Rec Yds', rectd: 'Rec TD', fum: (pos) => (pos === 'RB' ? 'Fum' : 'Fumbles'), rec: 'Rec', blk: 'Blocks', tkl: 'Tackles', sck: 'Sacks', ff: 'FF', rings: 'Rings', mvp: 'MVP', opoy: 'OPOY', dpoy: 'DPOY', sbmvp: 'SBMVP', roty: 'ROTY' };
const libStats = (pos, t) => Object.fromEntries(Object.entries(t).map(([k, v]) => { const n = LIB_NAMES[k]; return [typeof n === 'function' ? n(pos) : n || k, Math.round(v)]; }));
const lgStage = (seasons) => (seasons <= 1 ? '1-2' : seasons <= 4 ? '3-5' : seasons <= 7 ? '6-8' : '9+');
function poisson1(S, lam) { if (!(lam > 0)) return 0; if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * S.gauss())); let k = 0, p = Math.exp(-lam), s = p; const u = S.rand(); while (u > s && k < 200) { k++; p *= lam / k; s += p; } return k; } // S: a stream (the league's)

function leagueStart(W) {
  const R = W.library.leagueRates; if (!R || W.L) return;
  const T = W.timeline, last = T?.seasons[T.seasons.length - 1].players || {}, prev = T?.seasons[T.seasons.length - 2]?.players || {}, ci = 5;
  W.L = { t0: W.t - 1, full: R.fullSeason.all, week: 0, season: 0, champions: [], news: [], hofed: new Set(), names: (W.library.rookieNames?.names || []).slice(), nameIx: 0 };
  for (const p of W.players) {
    const lp = W.library.players[p.id], tot = libTotals(lp), row = last[p.key], pr = prev[p.key];
    const lastG = row && pr ? (row[ci].g || 0) - (pr[ci].g || 0) : row && !pr ? row[ci].g || 0 : 0;
    const line = {}; if (row && pr && lastG >= W.cfg.lastSeasonMinGames) for (const k of LSTATS[p.pos]) line[k] = Math.max(0, (row[ci][k] || 0) - (pr[ci][k] || 0));
    const rates = {}; for (const k of LSTATS[p.pos]) rates[k] = line[k] != null && k !== 'fum' && pr ? line[k] / lastG : (tot[k] || 0) / Math.max(1, tot.g || 1);
    const cpg = (tot.g || 0) > 0 ? lgProduction(p.pos, tot) / tot.g : 0, N = (W.cfg.formSeasons ?? 2) * W.L.full;
    p.lg = { tot, season: { g: 0 }, last: row && pr && lastG >= 1 ? { ...line, g: lastG } : null, win: Array(N).fill(cpg), rates, active: p.on !== false && lastG > 0, seasons: Math.round((tot.g || 0) / W.L.full), legacy: lp.careerLegacy || 0, skill: lp.skill ?? null, inducted: !!lp.hallOfFame, out: null };
  }
  const A = W.library.nflAge; for (const p of W.players) if (p.lg) p.lg.age0 = A?.rookieAge?.draws?.length ? W.rngLeague.pick(A.rookieAge.draws) : W.cfg.entryAgeFallback; // the save has no ages: his entry age is a random draw from real NFL rookie ages (an assumption, not his real age)
  leagueInjuries(W); leagueValues(W); for (const p of W.players) if (p.lg) p.lg.v0 = p.F;
}
// Injuries: each active player's games missed this season, drawn from the real active seasons at his position and stage;
// a miss comes as one spell starting at a random week (an assumption: only season totals are known)
function leagueInjuries(W) {
  const R = W.library.leagueRates, pool = R.activeMissedAll, full = W.L.full, A = W.library.nflAge?.relativeRiskByAge;
  // How often a season has an injury is the save's (only 16 injured seasons, too few to split); how that chance changes with
  // age is the real NFL's (nflverse weekly rosters: share of weeks on reserve by age), scaled so the league's average is the save's
  const hurt = pool.filter((x) => x[2] > 0), base = hurt.length / Math.max(1, pool.length);
  const ages = Object.keys(A || {}).map(Number).sort((a, b) => a - b), rrAt = (age) => (!ages.length ? 1 : A[Math.min(ages[ages.length - 1], Math.max(ages[0], Math.round(age)))] ?? 1);
  const act = W.players.filter((p) => p.lg?.active), mean = act.reduce((a, p) => a + rrAt(lgAge(p)), 0) / Math.max(1, act.length);
  for (const p of act) { const L = p.lg; L.out = null; if (W.cfg.injuries === false) continue;
    let chance = base * (W.cfg.injuryByAge !== false ? rrAt(lgAge(p)) / mean : 1);
    const hi = W.cfg.hypeInjury || 0; if (hi > 0 && (L.hype || 0) > 0) chance += base * hi * L.hype; // the owner's setting, not measured
    if (!(W.rngLeague.rand() < Math.min(1, chance))) continue;
    let xs = hurt.filter((x) => x[0] === p.pos); if (xs.length < W.cfg.injuryPoolMin) { xs = hurt; if (!(W.L.injuryFallback ||= []).includes(p.pos)) W.L.injuryFallback.push(p.pos); } // the spell: a real injured season's games missed (too few at his position: any position's)
    const miss = Math.min(full, W.rngLeague.pick(xs)[2]); const from = 1 + Math.floor(W.rngLeague.rand() * (full - miss + 1)); L.out = [from, from + miss - 1]; }
}
const lgAge = (p) => (p.lg.age0 ?? 23) + (p.lg.seasons || 0);
// One game at a player's per-game rates: yards log-normal around the rate, counts Poisson
function lgGame(W, pos, rates, noise) { const game = { g: 1 }; for (const k of LSTATS[pos]) { const r = rates[k] || 0; game[k] = LYARDS.has(k) ? Math.max(0, Math.round(r * Math.exp(noise * W.rngLeague.gauss() - (noise * noise) / 2))) : poisson1(W.rngLeague, r); } return game; }
// One week of football
function leagueWeek(W) {
  const L = W.L, wk = ((W.t - 1) % W.cfg.seasonWeeks) + 1; L.week = wk; if (wk > L.full) return;
  const noise = W.cfg.gameNoise ?? 0.4;
  const N = Math.max(1, (W.cfg.formSeasons ?? 1) * L.full); // the form window follows the setting, even mid-run
  for (const p of W.players) { const w = p.lg?.win; if (!w || w.length === N) continue; if (w.length > N) w.splice(0, w.length - N); else { const m = w.reduce((a, b) => a + b, 0) / Math.max(1, w.length); while (w.length < N) w.unshift(m); } }
  for (const p of W.players) {
    const s = p.lg; if (!s?.active) continue;
    if (s.out && wk >= s.out[0] && wk <= s.out[1]) { if (W.cfg.injuryCountsInForm !== false) { s.win.push(0); s.win.shift(); } if (wk === s.out[0]) { const n = s.out[1] - s.out[0] + 1; jot(W, { type: 'injury', player: p.key, name: `${p.pos} ${p.name}`, games: n }); if (n >= 2) log(W, 'injury', `${p.pos} ${p.name} is out for ${n >= L.full ? 'the season' : `${n} games`}.`); } continue; }
    if (s.out && wk === s.out[1] + 1) { jot(W, { type: 'return', player: p.key, name: `${p.pos} ${p.name}` }); if (s.out[1] - s.out[0] >= 3) log(W, 'return', `${p.pos} ${p.name} is back after ${s.out[1] - s.out[0] + 1} games out.`); }
    const game = lgGame(W, p.pos, s.rates, noise);
    for (const [k, v] of Object.entries(game)) { s.season[k] = (s.season[k] || 0) + v; s.tot[k] = (s.tot[k] || 0) + v; }
    const G = W.library.leagueRates.legacyGrowth[p.pos]; if (G) s.legacy += G.perScore * lgProduction(p.pos, game) + G.perGame;
    p._game = game; p._gameT = W.t; s.win.push(lgProduction(p.pos, game)); s.win.shift();
  }
}
// The season ends: awards, the Super Bowl, retirements and rookies, then each player's form changes
function leagueSeasonEnd(W) {
  const L = W.L, R = W.library.leagueRates, cfg = W.cfg; L.season++;
  const act = W.players.filter((p) => p.lg?.active && (p.lg.season.g || 0) > 0), prod = (p) => lgProduction(p.pos, p.lg.season);
  const give = (p, a, n = 1) => { if (a !== 'rings') p.lg.awardSeason = L.season; p.lg.tot[a] = (p.lg.tot[a] || 0) + n; p.lg.season[a] = (p.lg.season[a] || 0) + n; const G = R.legacyGrowth[p.pos]; if (G) p.lg.legacy += G.perScore * (lgAwards(p.pos, { [a]: n })); };
  const won = [];
  if (cfg.awards !== false) {
    // Super Bowl: the champion club, weighted by the season production of its card players (championWeight, an assumption; with
    // leagueFill 'save' it favours clubs with more card players) or evenly; every active player on it gets a ring
    const eq = cfg.championWeight === 'equal', clubs = new Map(); for (const p of act) clubs.set(p.team, eq ? 1 : (clubs.get(p.team) || 0) + Math.max(0, prod(p)));
    const tot = [...clubs.values()].reduce((a, b) => a + b, 0); let r = W.rngLeague.rand() * tot, champ = null; for (const [c, v] of clubs) { r -= v; if (r <= 0) { champ = c; break; } }
    if (champ) { const roster = act.filter((p) => p.team === champ); for (const p of roster) give(p, 'rings'); L.champions.push([W.seasonLabel, champ]); log(W, 'champion', `${champ} win the Super Bowl: ${roster.length} card players get rings.`);
      if (W.rngLeague.rand() < (R.awards.sbmvp.meanPerSeason || 0)) { const best = roster.slice().sort((a, b) => prod(b) - prod(a))[0]; if (best) { give(best, 'sbmvp'); won.push(['Super Bowl MVP', best]); } } }
    // MVP, OPOY, DPOY: as many a season as the save had, at the positions they went to, to that position's top producer this season
    // (awardWinner 'top', an assumption: the save's winners were not always the top producer)
    for (const [a, label] of [['mvp', 'MVP'], ['opoy', 'Offensive Player of the Year'], ['dpoy', 'Defensive Player of the Year']]) {
      const A = R.awards[a]; if (!A || !(W.rngLeague.rand() < Math.min(1, A.meanPerSeason))) continue;
      const pos = Object.entries(A.positions); if (!pos.length) continue; const t = pos.reduce((x, [, n]) => x + n, 0); let rr = W.rngLeague.rand() * t, at = pos[0][0]; for (const [ps, n] of pos) { rr -= n; if (rr <= 0) { at = ps; break; } }
      const best = act.filter((p) => p.pos === at).sort((x, y) => prod(y) - prod(x))[0]; if (best) { give(best, a); won.push([label, best]); }
    }
    for (const [label, p] of won) log(W, 'award', `${label}: ${p.pos} ${p.name}.`);
  }
  // Retirement at the measured rate for his career stage and where his season ranked at his position; a rookie takes his place
  const retired = [];
  if (cfg.retirement !== false) {
    // retirementByAge: how often careers end is the save's (11% of active players a season); how that changes with age is the
    // real NFL's (nflverse: the chance a career ends at each age, 19% at 22–29 rising to 30–42% by 32–38). Past the oldest age
    // the NFL data covers (40), the rate of the oldest ages pooled until they hold 100 careers (38–40) carries forward (no
    // cliff where every career ends). Off: the save's rate by seasons played and production third.
    const E = W.library.nflAge?.careerEndByAge, eAges = Object.keys(E || {}).map(Number).sort((a, b) => a - b), tail = retireTail(W.library.nflAge);
    const all = Object.values(R.retirement.rates), saveRate = all.reduce((a, c) => a + c.retired, 0) / Math.max(1, all.reduce((a, c) => a + c.n, 0));
    const endAt = (age) => (!eAges.length ? 0 : age > eAges[eAges.length - 1] ? tail : E[Math.max(eAges[0], Math.round(age))] ?? 0);
    const actP = W.players.filter((p) => p.lg?.active), meanEnd = actP.reduce((a, p) => a + (endAt(lgAge(p)) ?? 0), 0) / Math.max(1, actP.length);
    const byAge = W.cfg.retirementByAge !== false && eAges.length && meanEnd > 0;
    const rank = new Map(); for (const pos of Object.keys(LSTATS)) { const xs = act.filter((p) => p.pos === pos).sort((a, b) => prod(a) / a.lg.season.g - prod(b) / b.lg.season.g); xs.forEach((p, i) => rank.set(p, xs.length > 1 ? i / (xs.length - 1) : 1)); }
    for (const p of W.players) { const s = p.lg; if (!s?.active) continue; const st = lgStage(s.seasons), r = rank.get(p) ?? 0, third = r < 1 / 3 ? 'bottom third' : r < 2 / 3 ? 'middle third' : 'top third';
      let cell = R.retirement.rates[`${st}|${third}`]; if (!cell || cell.n < 20) { const all = ['bottom third', 'middle third', 'top third'].map((t) => R.retirement.rates[`${st}|${t}`]); const n = all.reduce((a, c) => a + c.n, 0), k = all.reduce((a, c) => a + c.retired, 0); cell = { rate: n ? k / n : 0 }; }
      const e = byAge ? endAt(lgAge(p) + 1) : null; // next season's age
      const chance = byAge ? (e == null ? 1 : Math.min(1, (saveRate * e) / meanEnd)) : cell.rate;
      if (W.rngLeague.rand() < chance) { s.active = false; retired.push(p); jot(W, { type: 'retired', player: p.key, name: `${p.pos} ${p.name}`, seasons: s.seasons }); log(W, 'retire', `${p.pos} ${p.name} retires at ${Math.round(lgAge(p))} after ${s.seasons + ((s.season.g || 0) > 0 ? 1 : 0)} seasons (${Math.round(s.legacy).toLocaleString()} Career Legacy).`); } }
    if (cfg.rookies !== false && W.fullL) fillRosters(W, retired); // a full league: back to rosterSize at every club × position, nothing on top
    else if (cfg.rookies !== false) {
      if (cfg.rookieRule === 'replace' || cfg.rookieRule === 'replacePlus') for (const p of retired) addRookie(W, p);
      if (cfg.rookieRule === 'replacePlus') { // and extraRookies more a season, at positions in the save's real mix of new players, at clubs drawn from the league
        const mix = Object.entries(R.arrivals?.positionMix || {}).filter(([, k]) => k > 0), tot = mix.reduce((a, [, k]) => a + k, 0);
        for (let k = 0; k < (cfg.extraRookies ?? 3) && tot > 0; k++) { let r = W.rngLeague.rand() * tot, pos = mix[0][0]; for (const [ps, m] of mix) { r -= m; if (r <= 0) { pos = ps; break; } } const like = W.players.filter((p) => p.pos === pos), model = like.length ? W.rngLeague.pick(like) : W.rngLeague.pick(W.players); addRookie(W, { ...model, id: model.id, pos, team: W.rngLeague.pick(W.players).team, fam: model.fam, name: null }); }
      } else if (cfg.rookieRule === 'measured') { // arrivals at the measured rate: as many as one real season brought (league_rates.json arrivals), positions in the real mix,
        // independent of who retired; each joins a club drawn from the league's players
        const A = R.arrivals, n = A?.perSeason?.length ? W.rngLeague.pick(A.perSeason).n : 0, mix = Object.entries(A?.positionMix || {}).filter(([, k]) => k > 0), tot = mix.reduce((a, [, k]) => a + k, 0);
        for (let k = 0; k < n && tot > 0; k++) { let r = W.rngLeague.rand() * tot, pos = mix[0][0]; for (const [ps, m] of mix) { r -= m; if (r <= 0) { pos = ps; break; } }
          const like = W.players.filter((p) => p.pos === pos), model = like.length ? W.rngLeague.pick(like) : W.rngLeague.pick(W.players); addRookie(W, { ...model, id: model.id, pos, team: W.rngLeague.pick(W.players).team, fam: model.fam, name: null }); } }
    }
  }
  // Hall of Fame: Career Legacy 7,500
  for (const p of W.players) { const s = p.lg; if (s && s.legacy >= 7500 && !s.inducted) { s.inducted = true; log(W, 'hof', `${p.pos} ${p.name} enters the Hall of Fame (${Math.round(s.legacy).toLocaleString()} Career Legacy).`); jot(W, { type: 'hof', player: p.key, name: `${p.pos} ${p.name}` }); } }
  // Form: each active player's per-game rates move by one real season-to-season change at his position and stage
  for (const p of W.players) { const s = p.lg; if (!s?.active) continue;
    if ((s.season.g || 0) > 0) { s.last = { ...s.season }; s.seasons++; }
    if (!s.rookieNew) { const cell = R.formSwings.cells[`${p.pos}|${lgStage(s.seasons)}`]; let sw = W.rngLeague.pick(cell?.draws?.length ? cell.draws : [0]);
      const P = R.pressure, dv = s.v0 > 0 ? Math.log(p.F / s.v0) : 0; // pressure: how his card moved this season shifts next season's form, as measured in the save
      if (P && W.cfg.pressure !== false) sw += (W.cfg.pressureStrength ?? 1) * P.shift[dv < P.cuts[0] ? 0 : dv < P.cuts[1] ? 1 : 2];
      s.hype = dv; for (const st of Object.keys(s.rates)) s.rates[st] *= Math.exp(sw); }
    s.rookieNew = false; s.season = { g: 0 }; s.v0 = p.F; }
  leagueInjuries(W);
}
// Past the oldest measured age: the career-end rate of the oldest ages, pooled (weighted by careers) until they hold 100 careers
function retireTail(A) { const E = A?.careerEndByAge, EN = A?.careerEndN || {}, ages = Object.keys(E || {}).map(Number).sort((a, b) => a - b); let n = 0, k = 0; for (let i = ages.length - 1; i >= 0 && n < 100; i--) { const m = EN[ages[i]] ?? 0; n += m; k += E[ages[i]] * m; } return n > 0 ? k / n : ages.length ? E[ages[ages.length - 1]] : 0; }
// A rookie replaces a retiree: same position and club, a new name, his first-season rates from a real early-career season
// at that position, and new card markets with a print run
function addRookie(W, old) {
  const { p, lib, name } = leaguePlayer(W, old), id = p.id;
  for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) { const m = makeMarket(W, p, d, f); W.cards.push(m); W.mktByKey.set(m.key, m); }
  (W.newPlayers ||= []).push(lib); packCache = null; packCacheT = null;
  jot(W, { type: 'rookie', player: p.key, name: `${old.pos} ${name}`, replaces: old.name ? `${old.pos} ${old.name}` : null, club: old.team });
  log(W, 'rookie', old.name ? `Rookie ${old.pos} ${name} joins ${old.team}, taking ${old.name}'s place.` : `Rookie ${old.pos} ${name} joins ${old.team}.`);
  return p;
}
// The shared core of a new league player (a rookie, or a generated veteran before his burn-in): name, measured first-season
// rates, library entry, league record and era; no card markets yet. old.teamFull (a generated player) names his club
function leaguePlayer(W, old) {
  const R = W.library.leagueRates, L = W.L, id = W.players.length;
  let name; do { name = L.names[L.nameIx++ % Math.max(1, L.names.length)] || `Rookie ${id}`; } while (W.byKey.has(`${old.pos}:${name}`) && L.nameIx < L.names.length * 2);
  const key = `${old.pos}:${name}`, tpl = W.rngLeague.pick(R.earlySeasons.filter((x) => x.pos === old.pos).length ? R.earlySeasons.filter((x) => x.pos === old.pos) : R.earlySeasons);
  const rates = {}; for (const k of LSTATS[old.pos]) rates[k] = (tpl.d[k] || 0) / tpl.g;
  if (!rates.fum && LSTATS[old.pos].includes('fum')) { const lp = W.library.players[old.id], t = libTotals(lp); rates.fum = (t.fum || 0) / Math.max(1, t.g || 1); }
  const src = W.library.players[W.byKey.get(tpl.key)?.id ?? old.id]; // he inherits the template player's skill and grade (an assumption: skill moves value 0.8–1.2×)
  const lib = { key, name, pos: old.pos, team: old.teamFull ?? W.library.players[old.id].team, nickname: null, hallOfFame: false, ovr: W.cfg.rookieOvr, skill: src?.skill ?? null, grade: src?.grade ?? null, careerLegacy: 0, stats: { Games: 0 }, rates: {}, hidden: { value: 0 }, playsLike: [], family: W.library.players[old.id].family, rookie: true };
  W.library.players.push(lib);
  const pool = W.players.filter((p) => p.pos === old.pos && p.S0).map((p) => p.S0).sort((a, b) => a - b), S0 = pool[Math.floor(pool.length / 2)] || W.cfg.rookieS0Fallback; // print run: the median at his position (an assumption)
  const p = { id, key, name, pos: old.pos, team: old.team, F: 1, F0: 1, P: 1, P0: 1, S0, circ: 0, pool: S0 * W.cfg.poolMultiplier, Ph: [1], volH: [], isPlayer: true, fam: old.fam, rookie: true };
  const tplPg = lgProduction(old.pos, Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, v]))), N = (W.cfg.formSeasons ?? 2) * W.L.full;
  const A = W.library.nflAge;
  p.lg = { age0: A?.rookieAge?.draws?.length ? W.rngLeague.pick(A.rookieAge.draws) : W.cfg.entryAgeFallback, tot: { g: 0 }, season: { g: 0 }, last: null, win: Array(N).fill(tplPg), rates, active: true, seasons: 0, legacy: 0, skill: lib.skill, inducted: false, out: null, rookieNew: true };
  W.players.push(p); W.byKey.set(key, p); W.era[id] = { on: true, ovr: W.cfg.rookieOvr, skill: lib.skill, grade: lib.grade, legacy: 0, totals: { g: 0 }, perGame: {} };
  return { p, lib, name };
}
// Hidden value, every week: the site's formula on the simulated totals
function leagueValues(W) {
  const cfg = W.cfg, form = (cfg.valueBasis ?? 'form') === 'form', on = W.players.filter((p) => p.on !== false && p.lg);
  // 'form': everyone is ranked within his position on League Score PER GAME: career per game for retired players and the real
  // NFL players in the pool, the last formSeasons × 17 games for active players (games missed injured count as zero). Career
  // totals only grow, so ranking on them makes every active player climb just by playing; per game, a breakout lifts a card
  // and a slump, an injury or the falloff after a rise pulls it back. Career Legacy still builds (it is a career measure).
  // At the open each card moves from the site's own OVR (career totals) to this one over the first formBlendSeasons (2) seasons, so the market
  // opens at the real values. 'career': the site's OVR throughout.
  const blend = form ? Math.max(0, 1 - (W.t - (W.L.t0 ?? 0)) / (W.cfg.formBlendSeasons * W.cfg.seasonWeeks)) : 1;
  const careerPg = (p) => { const g = p.lg.tot.g || 0; return g ? lgScore(p.pos, p.lg.tot) / g : 0; };
  const formPg = (p) => { const w = p.lg.win, g = p.lg.tot.g || 0, aw = g ? lgAwards(p.pos, p.lg.tot) / g : 0; return w?.length ? w.reduce((a, b) => a + b, 0) / w.length + aw : careerPg(p); };
  const rank = (rows) => { rows.sort((a, b) => a[1] - b[1]); const m = new Map(); rows.forEach(([p], i) => { if (p) m.set(p, 62 + 37 * (rows.length > 1 ? i / (rows.length - 1) : 1) ** 0.85); }); return m; };
  // a full league: ranked against a fixed reference, the save's own players and the legends; anyone else gets the OVR of
  // the place his score would take in it (the number of reference scores below his)
  const full = !!W.fullL, rankIn = (rows, others) => { const m = rank(rows), xs = rows.map((r) => r[1]), n = xs.length;
    for (const [p, x] of others) { let lo = 0, hi = n; while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < x) lo = mid + 1; else hi = mid; } m.set(p, 62 + 37 * (n > 1 ? Math.min(lo, n - 1) / (n - 1) : 1) ** 0.85); } return m; };
  const rankBy = (mine, legRows, f) => (!full ? rank([...mine.map((p) => [p, f(p)]), ...legRows]) : rankIn([...mine.filter((p) => p.ref).map((p) => [p, f(p)]), ...legRows], mine.filter((p) => !p.ref).map((p) => [p, f(p)])));
  const ovr = new Map();
  for (const pos of Object.keys(LSTATS)) {
    const mine = on.filter((p) => p.pos === pos), legends = (W.library.leagueRates?.legendScores || []).filter((x) => x[0] === pos);
    const site = blend > 0 ? rankBy(mine, legends.map((x) => [null, x[1]]), (p) => lgScore(pos, p.lg.tot)) : null;
    const pg = form ? rankBy(mine, legends.map((x) => [null, x[2] ? x[1] / x[2] : 0]), (p) => (p.lg.active ? formPg(p) : careerPg(p))) : null;
    for (const p of mine) { const c = careerPg(p); p.lg.formRatio = p.lg.active && c > 0 ? formPg(p) / c : 1; }
    for (const p of mine) ovr.set(p, pyRound(!form ? site.get(p) : p.rookie || !site ? pg.get(p) : blend * site.get(p) + (1 - blend) * pg.get(p)));
  }
  const isHof = (s) => s.legacy >= 7500 || (s.inducted && s.legacy >= 7300);
  const tierOfP = (p) => { const s = p.lg, o = ovr.get(p); return s.legacy >= 10000 ? 'legendary' : isHof(s) || o >= 90 ? 'epic' : o >= 80 ? 'rare' : 'common'; };
  const tiers = new Map(on.map((p) => [p, tierOfP(p)])), counts = {}; for (const [p, t] of tiers) if (!full || p.ref) counts[t] = (counts[t] || 0) + 1; // a full league counts tiers in the reference only
  const nOn = full ? on.filter((p) => p.ref).length : on.length;
  const TM = { common: 1, rare: 1.25, epic: 1.6, legendary: 2 }, opening = [];
  for (const p of on) {
    const s = p.lg, o = ovr.get(p), c = clamp((o - 60) / 39, 0, 1), skillM = s.skill == null ? 1 : 0.8 + 0.4 * clamp((s.skill - 62) / 37, 0, 1), legacy = Math.round(s.legacy);
    const v = Math.max(1, Math.round((25 + 2400 * c ** 3) * skillM * ((1 + clamp(legacy, 0, 15000) / 10000) / 1.5) ** 3 * (legacy >= 7000 ? 1.25 : 1) * TM[tiers.get(p)] * clamp(Math.sqrt(nOn / 4 / Math.max(1, counts[tiers.get(p)] || 0)), 0.8, 1.5)));
    p.F = Math.max(0.05 * cfg.coinScale, v / cfg.valueDivisor); if (p.rookie && p.P === 1 && p.F0 === 1) { p.F0 = p.F; opening.push([p, o]); } // his first price is set below, once every OVR is in
    const e = (W.era[p.id] ||= { on: true }); e.ovr = o; e.legacy = legacy; e.skill = s.skill; e.totals = s.tot; e.value = v; e.active = s.active; e.age = lgAge(p); e.injured = !!(s.out && W.L.week >= s.out[0] && W.L.week <= s.out[1]);
  }
  for (const [p, o] of opening) { p.P = p.P0 = openPriceOf(W, p, o); p.Ph = [p.P]; p.openT = W.t; resetMarkets(W, p); } // a rookie's cards open at comparable sales (openPrice), not at his hidden value
  packCache = null; packCacheT = null;
}

// A full league (leagueFill 'full'): the save's real players are the reference; every club × position short of rosterSize
// gets a generated veteran before the market opens, and his cards are dealt out with everyone else's
const fullLeague = (cfg) => cfg.leagueFill === 'full' && cfg.valueModel === 'league' && cfg.history !== false && cfg.startSeason !== 'first';
function fillLeague(W) {
  const T = W.timeline; if (!T || !W.library.leagueRates || W.seasonIx < T.seasons.length - 1) return;
  const keep = W.players.map((p) => [p.F, p.F0, p.P, p.P0, p.Ph, W.era[p.id] && { ...W.era[p.id] }]);
  for (const p of W.players) p.ref = true; // the save's own players: the fixed reference for OVR and value
  W.fullL = true; leagueStart(W); W.L.t0 = 0; // the league opens now, as the first week would open it (t0 = W.t − 1)
  W.L.clubs = [...new Set(W.library.players.map((x) => x.team))].filter((t) => teamShort(t) !== 'FA').sort().map((t) => [teamShort(t), t]);
  fillRosters(W, null, W.players.filter((p) => p.lg?.active).map((p) => p.lg.seasons)); // seasons played, as the save's active players have
  leagueInjuries(W); leagueValues(W);
  for (const p of W.players) { if (p.ref) continue; const e = W.era[p.id], lib = W.library.players[p.id];
    p.F0 = p.F; p.P = p.P0 = openPriceOf(W, p, e.ovr, true); p.Ph = [p.P]; p.openT = W.t; p.lg.v0 = p.F; Object.assign(lib, { ovr: e.ovr, careerLegacy: e.legacy, stats: libStats(p.pos, p.lg.tot), hidden: { value: e.value } }); }
  keep.forEach(([F, F0, P, P0, Ph, e], i) => { Object.assign(W.players[i], { F, F0, P, P0, Ph }); if (e) W.era[i] = e; }); // the save's players open at the site's prices, as in a save-only league
  const copies = (xs) => xs.reduce((a, p) => a + (p.on !== false ? p.S0 : 0), 0); W.fillK = copies(W.players) / Math.max(1, copies(W.players.filter((p) => p.ref))); // money follows the cards
  W.newPlayers = W.players.filter((p) => !p.ref).map((p) => W.library.players[p.id]); packCache = null; packCacheT = null;
}
// Every club × position up to rosterSize: a retiree at that slot is replaced first (his name in the news), then any gap.
// seasons (the open only): generated veterans with that many seasons drawn from it; otherwise rookies
function fillRosters(W, retired, seasons = null) {
  const shape = W.cfg.rosterSize || {}, n = new Map(), left = (retired || []).slice();
  for (const p of W.players) if (p.lg?.active) { const k = p.team + '|' + p.pos; n.set(k, (n.get(k) || 0) + 1); }
  for (const [team, teamFull] of W.L.clubs) for (const [pos, size] of Object.entries(shape)) for (let k = n.get(team + '|' + pos) || 0; k < size; k++) {
    const i = left.findIndex((r) => r.team === team && r.pos === pos), was = i >= 0 ? left.splice(i, 1)[0] : null, like = W.players.filter((p) => p.pos === pos && p.ref);
    const model = was || (like.length ? W.rngLeague.pick(like) : W.rngLeague.pick(W.players)), old = { ...model, id: model.id, pos, team, teamFull, fam: model.fam, name: was ? was.name : null };
    if (seasons) veteran(W, old, seasons.length ? W.rngLeague.pick(seasons) : 0); else addRookie(W, old);
  }
}
// A generated veteran: a rookie (leaguePlayer) who then plays s seasons under the league's own rules: an injury spell at the
// measured rate (by age, as leagueInjuries), weekly games at his rates, Career Legacy growth, a form swing after each season.
// No awards, no rings, no retirement
function veteran(W, old, s) {
  const { p, lib } = leaguePlayer(W, old), L = p.lg, R = W.library.leagueRates, full = W.L.full, noise = W.cfg.gameNoise ?? 0.4; // gameNoise: the same assumption as live games
  p.gen = true; p.rookie = false; L.rookieNew = false; lib.rookie = false; lib.generated = true;
  const pool = R.activeMissedAll || [], hurt = pool.filter((x) => x[2] > 0), base = hurt.length / Math.max(1, pool.length), own = hurt.filter((x) => x[0] === p.pos), xs = own.length < 3 ? hurt : own;
  const A = W.library.nflAge?.relativeRiskByAge, ages = Object.keys(A || {}).map(Number).sort((a, b) => a - b), rrAt = (age) => (!ages.length ? 1 : A[Math.min(ages[ages.length - 1], Math.max(ages[0], Math.round(age)))] ?? 1);
  const act = W.players.filter((x) => x.lg?.active && x.ref), mean = act.reduce((a, x) => a + rrAt(lgAge(x)), 0) / Math.max(1, act.length) || 1;
  for (let y = 0; L.seasons < s && y < s + 5; y++) { // a season lost to injury does not count as one played (as in the league)
    const ch = W.cfg.injuries === false || !xs.length ? 0 : base * (W.cfg.injuryByAge !== false ? rrAt(lgAge(p)) / mean : 1), miss = W.rngLeague.rand() < ch ? Math.min(full, W.rngLeague.pick(xs)[2]) : 0, from = 1 + Math.floor(W.rngLeague.rand() * (full - miss + 1));
    L.season = { g: 0 };
    for (let wk = 1; wk <= full; wk++) {
      if (miss && wk >= from && wk < from + miss) { if (W.cfg.injuryCountsInForm !== false) { L.win.push(0); L.win.shift(); } continue; }
      const game = lgGame(W, p.pos, L.rates, noise); for (const [k, v] of Object.entries(game)) { L.season[k] = (L.season[k] || 0) + v; L.tot[k] = (L.tot[k] || 0) + v; }
      const G = R.legacyGrowth[p.pos], pr = lgProduction(p.pos, game); if (G) L.legacy += G.perScore * pr + G.perGame; L.win.push(pr); L.win.shift();
    }
    if ((L.season.g || 0) > 0) { L.last = { ...L.season }; L.seasons++; }
    const cell = R.formSwings.cells[`${p.pos}|${lgStage(L.seasons)}`], sw = W.rngLeague.pick(cell?.draws?.length ? cell.draws : [0]); for (const st of Object.keys(L.rates)) L.rates[st] *= Math.exp(sw);
  }
  L.season = { g: 0 }; lib.seasons = L.seasons; return p;
}

// dormantAfter: a retired player is set aside once nobody has held, bid on, listed or traded any of his cards for that many
// weeks. Only the weekly per-card upkeep skips him (clear, comparable sales, implied prices, circulation counts), which for
// such a player only appends unchanged history; his value, his pool and packs are untouched. Off with the Vault store (it
// lists pool copies of every card). Measurement of activity only: it never changes what anyone can do
function dormancy(W) {
  const after = W.cfg.dormantAfter || 0, on = after > 0 && !W.cfg.store;
  if (!on) { if (W.dormN) for (const p of W.players) if (p.dorm) wakePlayer(W, p); return; }
  const held = new Set(); for (const it of W.items.values()) if (it.owner) held.add(it.pid);
  for (const m of [W.outside, W.liq, W.lendable]) for (const id of m?.keys() || []) held.add(W.cards[id].pid);
  for (const L of W.cardLoans || []) held.add(W.cards[L.id].pid); for (const a of W.auctions || []) if (a.cardId != null) held.add(W.cards[a.cardId].pid);
  let n = 0;
  for (const p of W.players) {
    if (p.dorm) { n++; continue; } if (!p.lg || p.lg.active) continue;
    let c0 = 0; for (let k = 0; k < 16; k++) c0 += W.cards[p.id * 16 + k].circ;
    if (c0 > 0 || held.has(p.id)) { p.actT = W.t; continue; }
    if (p.actT == null) p.actT = W.t; // counting starts when he is first seen idle and retired
    if (W.t - p.actT >= after) { for (let k = 0; k < 16; k++) { const c = W.cards[p.id * 16 + k]; volSync(W, c, W._clrT ?? 0); } p.dorm = true; p.dormT = W.t; n++; }
  }
  W.dormN = n;
}
// Back in play: the weeks skipped get the unchanged history the weekly upkeep would have written (nothing traded, so no
// price moved), so a woken player's charts and windows read exactly as if he had never been set aside
// (his cards' volume histories get the same zeros from volSync when next read)
function wakePlayer(W, p) {
  const miss = W.t - p.dormT + (W._cleared === W.t ? 1 : 0); p.dorm = false; p.actT = W.t; W.dormN = Math.max(0, (W.dormN || 1) - 1);
  for (let i = 0; i < Math.min(miss, 120); i++) {
    p.Ph.push(p.P); if (p.Ph.length > 80) p.Ph.shift(); p.volH.push(0); if (p.volH.length > 60) p.volH.shift();
    (p.ohlc ||= []).push([r2(p.P), r2(p.P), r2(p.P), r2(p.P), 0]); if (p.ohlc.length > 120) p.ohlc.shift();
  }
}

/* ---------- The forces that keep a real market from settling ---------- */
// 1. News: the save's REAL history. The world starts at the first real season; every seasonWeeks the next real season
//    arrives with the real hidden values, OVR, grades, Career Legacy and career totals, and real rookies enter the
//    pool. Library pages and game questions only ever show the current era. After the last real season, each player's
//    value moves by a ratio drawn from the real season-to-season changes of players at his position.
function eraFrom(row) {
  const [value, ovr, skill, grade, legacy, totals] = row, g = totals.g || 0;
  const perGame = {}; if (g) for (const [k, v] of Object.entries(totals)) if (k !== 'g' && typeof v === 'number' && !/rings|mvp|opoy|dpoy|roty|sbmvp/i.test(k)) perGame[`${k} per game`] = Math.round((v / g) * 1000) / 1000;
  return { on: true, value, ovr, skill, grade, legacy, totals, perGame };
}
function realRatios(T, raw = false) {
  const out = {};
  for (let i = 1; i < T.seasons.length; i++) for (const [k, row] of Object.entries(T.seasons[i].players)) { const prev = T.seasons[i - 1].players[k]; if (prev && prev[0] > 0 && row[0] > 0) (out[k.slice(0, 2)] ||= []).push(Math.log(row[0] / prev[0])); }
  // Centred on zero: keep the real spread of winners and losers (log changes), drop the upward drift of careers still
  // being built. sd is each position's spread, for the drawn seasons' pull back (nextSeason).
  if (!raw) for (const pos of Object.keys(out)) { const m = out[pos].reduce((a, b) => a + b, 0) / out[pos].length; out[pos] = out[pos].map((x) => x - m); }
  out.sd = Object.fromEntries(Object.entries(out).map(([pos, xs]) => [pos, Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)]));
  return out;
}
export function startTimeline(W) {
  const T = W.library.timeline; if (!T || !W.cfg.history) return false;
  W.timeline = T; W.ratios = realRatios(T); W.rawRatios = realRatios(T, true); W.era = {};
  W.seasonIx = W.cfg.startSeason === 'first' ? 0 : T.seasons.length - 1; W.seasonLabel = T.seasons[W.seasonIx].season;
  const rows = T.seasons[W.seasonIx].players;
  for (const c of W.players) {
    const row = rows[c.key];
    if (!row) { c.on = false; c.pool = 0; c.S0 = 0; W.era[c.id] = { on: false }; continue; }
    W.era[c.id] = eraFrom(row); c.F = c.F0 = Math.max(0.05 * W.cfg.coinScale, row[0] / W.cfg.valueDivisor); c.P = c.P0 = c.F; c.Ph = [c.F]; c.openT = W.t;
    c.S0 = printRun(W.cfg, row[0]); c.pool = c.S0 * W.cfg.poolMultiplier; c.on = true;
  }
  return true;
}
function nextSeason(W) {
  const T = W.timeline; W.seasonIx++;
  const real = W.seasonIx < T.seasons.length, label = real ? T.seasons[W.seasonIx].season : `Y${88 + W.seasonIx - T.seasons.length + 1}`;
  const moves = [], rookies = [];
  for (const c of W.players) {
    const walk = W.cfg.valueModel === 'ovrWalk', fac = W.cfg.valueModel === 'factors', before = walk ? (W.era[c.id]?.ovr || 60) : fac ? (c.B ?? c.F) : c.F;
    if (real) {
      const row = T.seasons[W.seasonIx].players[c.key]; if (!row) continue;
      W.era[c.id] = eraFrom(row);
      if (walk) { if (c.on === false) c.F = c.F0 = Math.max(0.05 * W.cfg.coinScale, row[0] / W.cfg.valueDivisor); } // the walk keeps going; only OVR (the odds) changes
      else if (fac) { c.B = Math.max(0.05 * W.cfg.coinScale, row[0] / W.cfg.valueDivisor); if (c.on === false) c.F = c.F0 = c.B; } // the player factor: his real data this season
      else c.F = Math.max(0.05 * W.cfg.coinScale, row[0] / W.cfg.valueDivisor); // the one value floor every other path uses
      if (c.on === false) { c.C0 = null; c.R = null; c.R0 = null; c.on = true; c.P = W.cfg.priceOnly ? openingPrice(W, c) : openPriceOf(W, c, W.era[c.id]?.ovr ?? W.cfg.rookieOvr); c.Ph = [c.P]; c.pool = printRun(W.cfg, row[0]) * W.cfg.poolMultiplier; resetMarkets(W, c); rookies.push(c); continue; }
    } else {
      if (c.on === false) continue;
      if (W.cfg.priceOnly || walk) continue; // nothing to draw: price-only has no value, the OVR walk moves weekly
      if (W.cfg.valueModel === 'league') continue; // the league simulation moves values (leagueSeasonEnd)
      if (fac && W.cfg.pastSave !== 'draw') continue; // no real data past the save, so no change: the player factor holds and only supply moves the value
      if (fac) { c.B = Math.max(0.05 * W.cfg.coinScale, (c.B ?? c.F) * Math.exp(W.rngLeague.pick(W.rawRatios?.[c.pos] || [0]))); moves.push([c, c.B / before]); continue; } // 'draw': one real season's change from his position's history
      // Mean-reverting in log terms around the last real value, aimed sd²/2 low so the average value stays put
      const PULL = W.cfg.formulaPull ?? 0.25, anchor = ((W.anchorF ||= {})[c.id] ??= c.F), sd = W.ratios.sd[c.pos] || 0, v = PULL > 0 ? (sd * sd) / (2 * PULL - PULL * PULL) : 0; // (no pull: no aim either)
      const target = Math.log(anchor) - v / 2, lf = Math.log(c.F);
      c.F = Math.max(1, Math.exp(lf + PULL * (target - lf) + W.rngLeague.pick(W.ratios[c.pos] || [0])));
    }
    moves.push([c, walk ? (W.era[c.id]?.ovr || 60) / before : fac ? (c.B ?? c.F) / before : c.F / before]);
  }
  moves.sort((a, b) => b[1] - a[1]); packCache = null;
  const fmtM = ([c, k]) => `${c.pos} ${c.name} ${k >= 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%`;
  if (!real && W.cfg.valueModel === 'league') log(W, 'season', `${label} kicks off: the simulated league plays on from the last real season.`); else if (!real && W.cfg.valueModel === 'factors' && W.cfg.pastSave !== 'draw') log(W, 'season', `${label} arrives: no real data past the save, so player values hold; only the supply of copies moves them.`); else
  log(W, 'season', `${label} ${real ? 'arrives (real results)' : 'arrives (drawn from real season-to-season changes)'}: ${moves.length ? `${W.cfg.valueModel === 'ovrWalk' ? 'biggest OVR risers' : 'biggest risers'} ${moves.slice(0, 3).map(fmtM).join(', ')}; fallers ${moves.slice(-2).map(fmtM).join(', ')}.` : ''}${rookies.length ? ` ${rookies.length} rookies enter the packs: ${rookies.slice(0, 5).map((c) => `${c.pos} ${c.name}`).join(', ')}${rookies.length > 5 ? '…' : ''}.` : ''} Every note on these players is now out of date.`);
  W.seasonLabel = label;
}

// 2. People change: newcomers arrive faster after rallies (and are mostly speculators, as in real hype cycles), each
//    bringing outside money; bots that lose most of their peak worth give up, and a few retire, selling everything.
function poisson(S, lam) { let k = 0, p = Math.exp(-lam), s = p, u = S.rand(); while (u > s && k < 20) { k++; p *= lam / k; s += p; } return k; } // S: a stream (the people's)
// Word of mouth: the median bot's own return over the last 11 weeks (worth change less money it didn't earn), bots with 12 weeks of history
function botReturn11(W) { const r = []; for (const b of W.bots) { if (b.kind !== 'rule' || !b.nwh || b.nwh.length < 12 || !b.exoh || b.exoh.length < 12) continue; const w0 = b.nwh[0], w1 = b.nwh[b.nwh.length - 1], e = b.exoh[b.exoh.length - 1] - b.exoh[0]; if (w0 > 0) r.push((w1 - e) / w0 - 1); } if (!r.length) return 0; r.sort((a, b) => a - b); return r[r.length >> 1]; }
// League news flow: league news items this last 4 weeks over their 52-week weekly average, minus 1, floored at 0
const LEAGUE_NEWS = new Set(['champion', 'award', 'hof', 'retire', 'rookie', 'injury', 'return', 'season']);
function newsFlow(W) { const a = W.newsWk || [], t = W.t, w4 = Math.min(4, t), w52 = Math.min(52, t); if (w4 < 1) return 0; let s4 = 0, s52 = 0; for (let k = 0; k < w52; k++) { const x = a[t - k] || 0; s52 += x; if (k < w4) s4 += x; } return s52 > 0 ? Math.max(0, (s4 / w4) / (s52 / w52) - 1) : 0; }
// The entry multiplier, its components and each one's share of it (log shares: hype, returns, news), and the raw signals
// (20-week index rise, median 11-week bot return, news flow), for the frame only
function entryDiag(m, cs, lam, raw) { const r3 = (x) => Math.round(x * 1000) / 1000, L = Math.log(m); return { m: r3(m), hype: r3(cs[0]), ret: r3(cs[1]), news: r3(cs[2]), lam: r3(lam), share: cs.map((c) => (L > 0 ? r3(Math.log(c) / L) : 0)), raw: raw.map(r3) }; }
const popOf = (W) => ((W.botK ?? 1) === 1 ? W.cfg.population : Math.round(W.cfg.population * W.botK)); // the starting population (botScale)
function peopleChange(W) {
  const cfg = W.cfg; if (!cfg.turnover) return;
  // Neutral turnover: newcomers with random genomes arrive at a steady rate; bots that lose 70% of their peak quit
  const hp = W.hist.p, r20 = hp.length > 20 ? hp[hp.length - 1] / hp[hp.length - 21] - 1 : 0, wom = cfg.entryReturns > 0 ? botReturn11(W) : 0, nf = cfg.entryNews > 0 ? newsFlow(W) : 0;
  const mH = 1 + (cfg.entryHype || 0) * Math.max(0, r20), mR = 1 + (cfg.entryReturns || 0) * Math.max(0, wom), mN = 1 + (cfg.entryNews || 0) * nf, m = mH * mR * mN; // entryHype: more arrive after rallies (only how many, never what they do)
  const lam = cfg.entryRate * (W.botK ?? 1) * mH * mR * mN, n = poisson(W.rngPeople, lam); W.entryWom = wom; let joined = 0, left = 0; // the same product order as before, so old runs repeat exactly
  W.entryDiag = cfg.entryHype > 0 || cfg.entryReturns > 0 || cfg.entryNews > 0 ? entryDiag(m, [mH, mR, mN], lam, [r20, cfg.entryReturns > 0 ? wom : botReturn11(W), cfg.entryNews > 0 ? nf : newsFlow(W)]) : null; // measurement only (the raw signals too, read even when their factor is 0)
  for (let k = 0; k < n; k++) { newcomer(W); joined++; }
  for (const b of W.bots.slice()) {
    if (b.kind !== 'rule') continue;
    const w = worth(W, b); b.peak = Math.max(b.peak || 0, w);
    const gaveUp = cfg.quitRule === 'network' ? b.g?.nn && W.t - (b.joined ?? 0) > (cfg.quitMinWeeks ?? 20) && W.rngPeople.rand() < (cfg.quitChance ?? 0.25) * Math.max(0, (b._nnQuit ?? 0) - 0.5) * 2 // its network decides: above 0.5 it may leave, at most quitChance a week
      : w < (1 - (cfg.quitDrawdown ?? 0.7)) * b.peak && W.t - (b.joined ?? 0) > (cfg.quitMinWeeks ?? 20) && W.rngPeople.rand() < (cfg.quitChance ?? 0.25);
    if (!gaveUp && !(W.rngPeople.rand() < (cfg.retireRate ?? 0))) continue; // giving up after heavy losses is the market's doing; retiring at random is a rate we set (0 by default)
    removeBot(W, b, gaveUp ? (cfg.quitRule === 'network' ? 'chose to leave' : 'gave up after heavy losses') : 'retired'); left++;
  }
  if (cfg.populationFloor > 0) { const floor = Math.round(cfg.populationFloor * popOf(W)); let k = 0; while (W.bots.filter((b) => b.kind === 'rule').length < floor && k++ < floor) { newcomer(W); joined++; W.floorAdds = (W.floorAdds || 0) + 1; } } // only the head count is kept up
  W.turnover = { joined, left };
}

// 4. Fashion: each family's popularity with outside collectors drifts, sometimes jumps on hype or slumps, and feeds
//    on its own recent price gains. Collectors bid more often, and higher, for what is in fashion.
function fashionStep(W) {
  const cfg = W.cfg; if (!cfg.fashion) return;
  const F = (W.fashion ||= W.families.map(() => 0));
  const fb = famBubble(W), prev = W.famPrev || fb; W.famPrev = fb;
  for (let i = 0; i < F.length; i++) {
    const mom = prev[i] && fb[i] ? clamp(fb[i] / prev[i] - 1, -0.2, 0.2) : 0;
    F[i] = 0.96 * F[i] + W.gauss() * 0.05 + 1.5 * mom;
    if (W.rand() < 0.003) { F[i] += 0.6; log(W, 'fashion', `Fashion: collectors suddenly want ${W.families[i].pos} ${W.families[i].name} cards.`); }
    else if (W.rand() < 0.002) { F[i] -= 0.5; log(W, 'fashion', `Fashion: collectors lose interest in ${W.families[i].pos} ${W.families[i].name} cards.`); }
    F[i] = clamp(F[i], -1.2, 1.5);
  }
}

// Lineages: families of bots descended from one founder. How many survive, how deep they go, how much the largest holds
function lineageStats(W) {
  const by = new Map(); for (const b of W.bots) { if (b.kind !== 'rule') continue; const k = b.lineage ?? b.id; const x = by.get(k) || { n: 0, w: 0, depth: 0 }; x.n++; x.w += worth(W, b); x.depth = Math.max(x.depth, b.gen); by.set(k, x); }
  const xs = [...by.values()], tot = xs.reduce((s, x) => s + x.w, 0) || 1, top = xs.sort((a, b) => b.w - a.w)[0];
  return { count: xs.length, depth: Math.max(0, ...xs.map((x) => x.depth)), topShare: top ? Math.round((top.w / tot) * 1000) / 1000 : 0, topSize: top?.n || 0 };
}

// The Vault store's ask: public values only (the guide, else last week's value as the dealers know it), never this week's F
export function storeAsk(W, c) { const pl = W.players[c.pid], pub = guideOn(W.cfg) && pl.guide > 0 ? pl.guide : pl.Fpub ?? pl.P0; return pub * c.mult * (1 + W.cfg.storePremium); }
// Where a card with no price yet opens (openPrice). 'comps': comparable sales, the median price of the 5 players at his
// position with cards out (at the open, before any are dealt: the save's own players) whose public OVR is nearest his;
// 'position': the median price at his position; 'value': his hidden value (the old rule, a leak). No comparable: the median
// of every such player, else one coin unit. Prices and OVRs are public, so the opening says nothing about F.
function openPriceOf(W, p, ovr, atOpen = false) {
  const rule = W.cfg.openPrice ?? 'comps'; if (rule === 'value') return p.F;
  const out = (x) => { if (atOpen) return !!x.ref; for (let k = 0; k < 16; k++) if (W.cards[x.id * 16 + k]?.circ > 0) return true; return false; };
  const all = W.players.filter((x) => x !== p && x.on !== false && !x.dorm && x.P > 0 && out(x)), pos = all.filter((x) => x.pos === p.pos), med = (xs) => { const s = xs.map((x) => x.P).sort((a, b) => a - b); return s[(s.length - 1) >> 1]; };
  if (!pos.length) return all.length ? med(all) : W.cfg.coinScale;
  if (rule === 'position') return med(pos);
  const o = (x) => W.era?.[x.id]?.ovr ?? 62; return med(pos.slice().sort((a, b) => Math.abs(o(a) - ovr) - Math.abs(o(b) - ovr) || a.id - b.id).slice(0, 5));
}
// A rookie's first quote in a price-only world: the median price of cards at his position (no value to start from)
function openingPrice(W, c) { const xs = W.players.filter((x) => x.on !== false && x.pos === c.pos && x.circ > 0).map((x) => x.P).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : 5; }

// Deal the starting cards: every printed copy goes to a random bot (used at creation, or by the runner once the AI
// bots of an all-AI world are seated)
export function endow(W, bots = W.bots) {
  for (const p of W.players) { if (p.on === false) continue; for (let u = 0; u < p.S0; u++) { const x = rollCopy(W, p, 'standard'); mintCopy(W, W.pick(bots), x, p.P * copyMult(x), 0, false); } } // cost basis at the opening (public) price
  for (const b of bots) { b.nwh = [worth(W, b)]; b.genStart = b.nwh[0]; }
  packCache = null; packCacheT = null;
}
// An AI bot's life ends: one heir takes the whole estate (cash, cards, loans, notes, reputation) and the memo, and
// carries on under the same seat (same model), as the next generation of its line
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function aiSuccession(W, b) { onStream(W, W.rngPeople, () => aiSuccessionOn(W, b)); } // a death: the people stream
function aiSuccessionOn(W, b) {
  const line = (b.line || 1) + 1, base = b.name.replace(/ [IVX]+$/, '');
  const heir = newBot(W, AI, null, { name: `${base} ${ROMAN[line] || line}`, model: b.model, seat: b.seat, social: b.social });
  heir.line = line; heir.born = W.t; const lw = W.cfg.aiLifespanWeeks; heir.lifespanW = lw[0] + Math.floor(W.rand() * (lw[1] - lw[0] + 1));
  heir.memo = `Inherited from ${b.name} (your predecessor, ${W.t - b.born} weeks): ${b.memo || '(no memo)'}`.slice(0, 600);
  heir.lineage = b.lineage ?? b.id;
  settleEstate(W, b, [heir]);
  log(W, 'evolve', `${b.name} reaches the end of its life after ${W.t - b.born} weeks; ${heir.name} inherits ${Math.round(worth(W, heir)).toLocaleString()} coins of estate and its memo.`);
}

// The OVR walk: one tick a week per card in circulation or the pool. Higher OVR, better odds of going up; never certain.
// A card's risk rating (starts at OVR, then moves with its value) and the size of its weekly move
export function riskRating(W, c) {
  const ovr = ovrNow(W, c.id); if (c.R0 == null) { c.R0 = ovr; c.ovr0 = ovr; }
  return clamp(c.R0 + (ovr - c.ovr0) + W.cfg.riskPerDoubling * Math.log2(Math.max(1e-9, c.F) / Math.max(1e-9, c.F0)), 40, 99);
}
export const walkVol = (W, r) => lerp(W.cfg.walkVolLow, W.cfg.walkVolHigh, clamp((r - W.cfg.riskLo) / (W.cfg.riskHi - W.cfg.riskLo), 0, 1));
// Value = player factor × supply factor. Copies out = held by bots or the liquidator (outside collectors' copies are out
// of the market); the print run (the pool the player entered with) keeps a card with few copies from swinging wildly.
function factorValues(W) {
  const items = new Map(); for (const it of W.items.values()) if (it.owner) items.set(it.pid, (items.get(it.pid) || 0) + 1);
  const k = W.cfg.scarcity ?? 0.5;
  for (const p of W.players) {
    if (p.on === false) continue;
    let n = items.get(p.id) || 0; for (let j = 0; j < 16; j++) n += W.cards[p.id * 16 + j].circ;
    if (p.B == null) p.B = p.F; if (p.C0 == null) p.C0 = n; if (p.R == null) p.R = Math.max(1, p.pool);
    p.F = Math.max(0.05 * W.cfg.coinScale, p.B * ((n + p.R) / (p.C0 + p.R)) ** -k);
  }
  packCache = null; packCacheT = null;
}
function ovrWalk(W) {
  for (const c of W.players) {
    if (c.on === false) continue;
    const v = walkVol(W, riskRating(W, c));
    c.F = Math.max(0.01 * c.F0, c.F * (W.rngLeague.rand() < W.cfg.walkUp ? 1 + v : 1 - v));
  }
  packCache = null; packCacheT = null;
}

/* ---------- Card markets ---------- */
// A card market inherits its player's facts (name, position, club, family, the pool) and keeps its own price,
// holders and order book; its intrinsic value is the player's base value × the card's rarity premium.
function makeMarket(W, p, d, f) {
  const mult = FINISH_MULT[f] * DESIGN_MULT[d], m = Object.create(p);
  Object.defineProperties(m, {
    F: { get() { return p.F * mult; }, set(v) { p.F = v / mult; }, enumerable: true },
    pool: { get() { return p.pool; }, set(v) { p.pool = v; }, enumerable: true },
    volH: { get() { return volSync(W, m, W._clrT ?? 0); }, enumerable: true }, // the weekly volume history, padded on read (volSync)
    _vh: { value: [], writable: true }, _vT: { value: W._clrT ?? 0, writable: true },
  });
  Object.assign(m, { id: mktId(p.id, d, f), pid: p.id, d, f, mult, isPlayer: false, isMkt: true, key: `${p.key}|${DESIGNS[d]}|${FINISHES[f]}`, label: `${p.pos} ${p.name} · ${FINISHES[f]} ${DESIGNS[d]}`, P: p.P * mult, P0: p.P * mult, Ph: [p.P * mult], openT: W.t, circ: 0, S0: 0, ohlc: [] }); // the player's price, which is his value only where that value is the public opening (the save's cards)
  return m;
}
// A card market's weekly volume history. clear() writes a week's entry only for a card with orders or copies out; a card with
// neither (no holders, no orders) would only have had a 0 appended, so those zeros are appended here when the history is
// next read or written: up to week upTo (the last week cleared), never for the weeks its player sat dormant (wakePlayer's
// rule: dormancy() brings the history up to date before it sets a player aside). Every reader sees the same array as before.
function volSync(W, c, upTo) {
  const h = c._vh, n = upTo - c._vT; if (!(n > 0) || c.dorm) return h;
  if (n >= 60) { h.length = 0; for (let i = 0; i < 60; i++) h.push(0); } else { for (let i = 0; i < n; i++) h.push(0); if (h.length > 60) h.splice(0, h.length - 60); }
  c._vT = upTo; return h;
}
function resetMarkets(W, p) { for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) { const m = W.cards[mktId(p.id, d, f)]; if (!m) continue; m.P = m.P0 = p.P * m.mult; m.Ph = [m.P]; m.openT = W.t; } } // each card at the player's opening price × its premium
// The site's real price history, imported as each card's past: every market snapshot, its value × the rarity
function seedHistory(W) {
  const H = W.library.history; if (!H || W.cfg.startSeason === 'first') return;
  for (const p of W.players) {
    const vals = (H.values[p.key] || []).filter((v) => v != null).map((v) => Math.max(0.05 * W.cfg.coinScale, v / W.cfg.valueDivisor));
    if (!vals.length) continue;
    vals[vals.length - 1] = p.P;
    p.Ph = vals.slice(); p.ohlc = vals.map((v, i) => [vals[Math.max(0, i - 1)], Math.max(v, vals[Math.max(0, i - 1)]), Math.min(v, vals[Math.max(0, i - 1)]), v, 0]);
    for (let d = 0; d < 4; d++) for (let f = 0; f < 4; f++) { const m = W.cards[mktId(p.id, d, f)]; m.Ph = vals.map((v) => v * m.mult); m.ohlc = p.ohlc.map((x) => [x[0] * m.mult, x[1] * m.mult, x[2] * m.mult, x[3] * m.mult, 0]); }
  }
}
// A player's price: what his cards trade for, brought back to a Prizm Base equivalent (weighted by copies and volume)
function impliedPrices(W) {
  for (const p of W.players) { if (p.dorm) continue;
    let num = 0, den = 0, vol = 0;
    for (let k = 0; k < 16; k++) { const m = W.cards[p.id * 16 + k], v = m.volH[m.volH.length - 1] || 0, w = m.circ + W.cfg.impliedVolumeWeight * v; vol += v; if (w) { num += (m.P / m.mult) * w; den += w; } }
    const prev = p.P; if (den) p.P = num / den;
    p.Ph.push(p.P); if (p.Ph.length > 80) p.Ph.shift();
    p.volH.push(vol); if (p.volH.length > 60) p.volH.shift();
    (p.ohlc ||= []).push([r2(prev), r2(Math.max(prev, p.P)), r2(Math.min(prev, p.P)), r2(p.P), vol]); if (p.ohlc.length > 120) p.ohlc.shift();
  }
}
export function circOf(W, p, own = null) { if (p.dorm) return 0; let n = 0; for (let k = 0; k < 16; k++) n += W.cards[p.id * 16 + k].circ; if (own) return n + (own[p.id] || 0); for (const it of W.items.values()) if (it.pid === p.id && it.owner) n++; return n; }
// One-of-a-kind cards with an owner, counted by player (for circOf over many players: one pass over the items)
function ownedItemCounts(W) { const a = new Int32Array(W.players.length); for (const it of W.items.values()) if (it.owner && it.pid < a.length) a[it.pid]++; return a; }
export function resolvePlayer(W, key) { const m = W.mktByKey.get(key), it = W.items.get(key); return W.byKey.get(key) || (m && W.players[m.pid]) || (it && W.players[it.pid]) || null; }
export function resolveMarket(W, key) { const p = W.byKey.get(key); return W.mktByKey.get(key) || (p && W.cards[mktId(p.id, 0, 0)]) || null; }
export function itemsOf(W, b) { return heldItems(W, b).slice(); }
// A bot's one-of-a-kind cards as a set of uids that counts its own changes, so the item objects (in the set's order) and
// their plain cards' ids are looked up once per change instead of once per worth() call. Same items, same order.
class ItemSet extends Set {
  #v = 0; #a = null; #ids = null; #av = -1;
  add(x) { this.#v++; return super.add(x); }
  delete(x) { this.#v++; return super.delete(x); }
  clear() { this.#v++; return super.clear(); }
  objs(W) { if (this.#av !== this.#v) { const a = []; for (const uid of this) { const it = W.items.get(uid); if (it) a.push(it); } this.#a = a; this.#ids = null; this.#av = this.#v; } return this.#a; }
  cardIds(W) { const a = this.objs(W); if (!this.#ids) { this.#ids = new Set(); for (const it of a) this.#ids.add(mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)); } return this.#ids; }
}
const NO_ITEMS = Object.freeze([]);
// The item objects a bot holds, in its set's order (cached on an ItemSet; read-only: copy before changing)
function heldCardIds(W, b) { const s = b.items; if (s instanceof ItemSet) return s.cardIds(W); const ids = new Set(); for (const it of heldItems(W, b)) ids.add(mktId(it.pid, it.d === 4 ? 0 : it.d, it.f)); return ids; }
function heldItems(W, b) { const s = b.items; if (!s || !s.size) return NO_ITEMS; if (s instanceof ItemSet) return s.objs(W); const a = []; for (const uid of s) { const it = W.items.get(uid); if (it) a.push(it); } return a; }

/* ---------- Wealth groups and OVR bands (what the page compares instead of strategies and families) ---------- */
function assignGroups(W) {
  const ws = W.bots.map((b) => [b, worth(W, b)]).sort((x, y) => y[1] - x[1]), n = ws.length, a = Math.max(1, Math.round(n * 0.1)), m = Math.max(a, Math.round(n * 0.5));
  ws.forEach(([b], i) => (b._grp = i < a ? 0 : i < m ? 1 : 2));
}
const ovrNow = (W, pid) => W.era?.[pid]?.ovr ?? W.library.players[pid].ovr ?? 60;
function avgOvrOf(W, b) {
  let v = 0, s = 0; for (const [id, q] of b.h) { const c = W.cards[id], x = q * c.P; v += x; s += x * ovrNow(W, c.pid); }
  for (const it of itemsOf(W, b)) { const x = markItem(W, it); v += x; s += x * ovrNow(W, it.pid); }
  return v > 0 ? Math.round((s / v) * 10) / 10 : null;
}
// Price ÷ hidden value of the cards in circulation, per OVR band
function bandBubble(W) {
  const a = OVR_BANDS.map(() => 0), b = OVR_BANDS.map(() => 0);
  for (const c of W.cards) { if (!c.circ) continue; const k = bandOf(ovrNow(W, c.pid)); a[k] += c.P * c.circ; b[k] += c.F * c.circ; }
  return a.map((x, i) => (b[i] ? Math.round((x / b[i]) * 1000) / 1000 : null));
}
// The market value each wealth group holds in each OVR band
function bandHoldings(W) {
  const m = GROUPS.map(() => OVR_BANDS.map(() => 0));
  for (const b of W.bots) { const g = m[b._grp ?? 2]; for (const [id, q] of b.h) { const c = W.cards[id]; g[bandOf(ovrNow(W, c.pid))] += q * c.P; } for (const it of itemsOf(W, b)) g[bandOf(ovrNow(W, it.pid))] += markItem(W, it); }
  return m.map((row) => row.map((v) => Math.round(v)));
}
export function riskOf(W, pid) { const c = W.players[pid], r = riskRating(W, c); return { rating: r, vol: walkVol(W, r) }; }

/* ---------- Details for one player or one bot (the page asks for these; the world runs in a background worker) ---------- */
export function playerDetail(W, id) {
  const c = W.players[id]; if (!c) return null;
  const p = c, r1 = (x) => Math.round(x * 100) / 100;
  const grid = []; for (let k = 0; k < 16; k++) { const m = W.cards[id * 16 + k]; grid.push([r1(m.P), r1(m.F), m.circ]); }
  const items = [...W.items.values()].filter((it) => it.pid === id && it.owner).map((it) => [it.label, it.owner.name, it.owner.id, r1(markItem(W, it))]).sort((a, b) => b[3] - a[3]).slice(0, 12);
  const keys = [...(W.cardLog?.keys() || [])].filter((k) => k.startsWith(p.key + '|') || k.startsWith(`${p.pos} ${p.name} · `));
  const tape = keys.flatMap((k) => W.cardLog.get(k)).filter((j) => j.type === 'trade' || (j.type === 'auctionResult' && j.winner)).sort((a, b) => b.t - a.t).slice(0, 12).map((j) => ({ t: j.t, card: j.card, buyer: j.buyer || j.winner, seller: j.seller, price: j.price }));
  const holders = W.bots.map((b) => { let q = 0, v = 0; for (let k = 0; k < 16; k++) { const n = b.h.get(id * 16 + k) || 0; q += n; v += n * W.cards[id * 16 + k].P; } for (const it of itemsOf(W, b)) if (it.pid === id) { q++; v += markItem(W, it); } return [b.id, b.name, b._grp ?? 2, q, Math.round(v)]; }).filter((x) => x[3]).sort((a, b) => b[4] - a[4]).slice(0, 5);
  return { id, t: W.t, P: c.P, F: c.F, circ: circOf(W, c), pool: c.pool, ohlc: (c.ohlc || []).slice(-120), grid, items, nItems: [...W.items.values()].filter((it) => it.pid === id && it.owner).length, tape, holders };
}
export function botDetail(W, id) {
  const b = W.bots.find((x) => x.id === id); if (!b) return null;
  const r1 = (x) => (x == null ? null : Math.round(x * 100) / 100);
  const positions = [...b.h].map(([cid, q]) => { const c = W.cards[cid]; return [c.pid, c.label, q, r1(avgCost(b, cid)), r1(c.P)]; });
  for (const it of itemsOf(W, b)) positions.push([it.pid, it.label, 1, r1(it.cost), r1(markItem(W, it))]);
  const g = b.g ? { keep: b.g.keep, lev: b.g.lev, lendShare: b.g.lendShare, passBid: b.g.passBid, ticketBid: b.g.ticketBid } : null;
  const shorts = (W.cardLoans || []).filter((L) => L.borrower === b).map((L) => [W.cards[L.id].pid, W.cards[L.id].label, r1(L.entry), r1(W.cards[L.id].P), L.due - W.t, !!L.force]);
  const lentOut = (W.cardLoans || []).filter((L) => L.lender === b).length;
  return { id, t: W.t, shorts, lentOut, lendCards: b.g?.lendCards ?? b.pending?.lendCards ?? 0, realized: b.stats.realized || 0, debt: b.debt || 0, lent: b.lent || 0, stats: { ...b.stats }, passes: b.passes.length, tickets: b.tickets.length, games: (b._nnGames || []).length, memo: b.memo || '', g, positions, log: (W.botLog.get(b.name) || []).filter((j) => j.type !== 'research').slice(-300).reverse(), research: (W.botLog.get(b.name) || []).filter((j) => j.type === 'research' && j.t > W.t - 8).length, packs: (W.botPacks?.get(b.name) || []).slice().reverse() };
}

// A thief's flags lift once it has gone W.cfg.flagWeeks without being caught again; trading with it resumes
function liftFlags(W) {
  const n = W.cfg.flagWeeks; if (!(n > 0)) return;
  for (const t of W.bots) {
    if (!t.flaggedBy || W.t - (t.lastCaught ?? 0) < n) continue;
    let k = 0; for (const x of W.bots) if (x.flags.delete(t.id)) k++;
    t.flaggedBy = 0; t.announced = false;
    if (k >= 5) log(W, 'flag', `${t.name}'s flags lift after ${n} weeks without being caught: ${k} bots will trade with it again.`);
    jot(W, { type: 'flagLift', bot: t.name, by: k });
  }
}

// The most valuable cards in circulation right now: every card market with copies out, and every one-of-a-kind card,
// by what it would trade at (its market price; a one-of-a-kind card at its plain card's price × its premium)
function topCards(W, k = 3) {
  // the k highest by price, ties in list order: what a stable sort of the whole list (cards, then items) puts first
  const top = []; let odd = false; const keep = (P, mk) => { if (!Number.isFinite(P)) { odd = true; return; } if (top.length >= k && !(P > top[top.length - 1][0])) return;
    let i = top.length; while (i > 0 && top[i - 1][0] < P) i--; top.splice(i, 0, [P, mk]); if (top.length > k) top.pop(); };
  for (const m of W.cards) if (m.circ > 0) keep(m.P, m);
  for (const it of W.items.values()) if (it.owner) keep(markItem(W, it), it);
  const row = (P, x) => (x.uid ? [P, x.label, x.pid, Math.round(intrinsicItem(W, x)), x.owner.name, 1, null] : [P, x.label, x.pid, Math.round(x.F), null, x.circ, x.id]);
  let out;
  if (!odd) out = top.map(([P, x]) => row(P, x));
  else { out = []; for (const m of W.cards) if (m.circ > 0) out.push(row(m.P, m)); for (const it of W.items.values()) if (it.owner) out.push(row(markItem(W, it), it)); out.sort((a, b) => b[0] - a[0]); } // a price that isn't a finite number: the full sort, as before
  const g = guideOn(W.cfg); // the guide brought to this card: the player's guide value × the card's premium
  return out.slice(0, k).map(([P, label, pid, F, owner, n, id]) => ({ label, pid, P: Math.round(P), F, owner: owner ?? holderOf(W, id), n, ...(g && W.players[pid].guide > 0 ? { G: Math.round(W.players[pid].guide * (F / Math.max(1e-9, W.players[pid].F))) } : {}) }));
}
function holderOf(W, id) { let best = null, q = 0; for (const b of W.bots) { const x = b.h.get(id) || 0; if (x > q) { q = x; best = b.name; } } if (best) return best; if ((W.liq?.get(id) || 0) > 0) return 'the liquidator'; const au = W.auctions.find((a) => a.cardId === id && !a.uid); return au ? `up for auction by ${au.seller === 'liq' ? 'the liquidator' : au.seller.name}` : null; }

/* ---------- Card lending and short selling ---------- */
// A holder may lend some of its cards. A short seller borrows a copy, posts collateral, sells it, pays the lender a
// weekly fee (and any royalty the card earns), and must buy a copy back and return it within cardLoanWeeks. It is
// forced to buy back when its worth falls below shortMaintenance × what it owes, or at the deadline; a borrower that
// can't find a copy for 3 weeks settles in cash. A copy it holds of a card it is short goes back to the lender.
function bump(b, k, id, q) { const m = (b[k] ||= new Map()), v = (m.get(id) || 0) + q; v > 0 ? m.set(id, v) : m.delete(id); }
export function owedValue(W, b) { let v = 0; if (b.owed) for (const [id, q] of b.owed) v += q * W.cards[id].P; return v; }
export function lentValue(W, b) { let v = 0; if (b.lentOut) for (const [id, q] of b.lentOut) v += q * W.cards[id].P; return v; }
const lendShareOf = (b) => (b.kind === 'ai' ? b.pending?.lendCards || 0 : b.g?.nn ? b.g.lendCards || 0 : 0);
function lendPool(W) {
  W.lendPool = new Map(); W.lendable = new Map();
  for (const b of W.bots) { const sh = lendShareOf(b); if (!(sh > 0)) continue; for (const [id, q] of b.h) { const k = Math.floor(q * sh + 0.5); if (k < 1) continue; let l = W.lendPool.get(id); if (!l) W.lendPool.set(id, (l = [])); l.push({ b, k }); W.lendable.set(id, (W.lendable.get(id) || 0) + k); } }
}
function borrowCard(W, b, c) {
  const pool = W.lendPool?.get(c.id); if (!pool) return false;
  const m = W.cfg.shortMargin * c.P; if (b.cash < m) return false;
  const ok = pool.filter((x) => x.k > 0 && x.b !== b && !blocked(x.b, b) && (x.b.h.get(c.id) || 0) > 0); if (!ok.length) return false;
  const e = ok[wpick(W, ok.map((x) => Math.min(x.k, x.b.h.get(c.id) || 0)))]; // a lender drawn in proportion to the copies it offers, never by seat order
  e.k--; W.lendable.set(c.id, (W.lendable.get(c.id) || 1) - 1);
  give(e.b, c, -1); give(b, c, 1); bump(e.b, 'lentOut', c.id, 1); bump(b, 'owed', c.id, 1);
  b.cash -= m; b.shortColl = (b.shortColl || 0) + m; addLot(b, c, c.P, W.t); tkAdd(W, b, 'shorts'); tkAdd(W, e.b, 'cardsLent');
  (W.cardLoans ||= []).push({ id: c.id, lender: e.b, borrower: b, entry: c.P, coll: m, week: W.t, due: W.t + W.cfg.cardLoanWeeks });
  return true;
}
function closeLoan(W, L, why, settle, lenderGone) {
  const c = W.cards[L.id], b = L.borrower, ln = L.lender;
  b.shortColl -= L.coll; b.cash += L.coll; bump(b, 'owed', L.id, -1); bump(ln, 'lentOut', L.id, -1);
  if (settle != null) { // cash instead of the card
    const pay = Math.max(0, Math.min(settle, b.cash)); b.cash -= pay; // never more than the borrower has: the rest is the lender's loss
    if (lenderGone) led(W, 'loanLeavers', pay); // the lender left with no heirs: like its own cash, the settlement leaves the economy (never to the treasury)
    else { ln.cash += pay; if (pay < settle) ln.stats.lostOnLoans = (ln.stats.lostOnLoans || 0) + settle - pay; sellLot(W, ln, c, pay); } // the lender is paid for the copy it will not get back
    const pnl = L.entry - settle; b.stats.realized = (b.stats.realized || 0) + pnl;
    jot(W, { type: 'forcedCover', bot: b.name, lender: ln.name, card: c.key, price: r2(settle), entry: r2(L.entry), why });
    if (W.ord) W.ord.forced = (W.ord.forced || 0) + 1;
  }
  { const i = W.cardLoans.indexOf(L); if (i >= 0) { W.cardLoans = W.cardLoans.slice(); W.cardLoans.splice(i, 1); } } // a new array, as before (callers loop over a copy)
}
// A short seller pays its lender (the lending fee, or a royalty the card earned) from its cash only; what it can't pay is the
// lender's loss and calls the short (shortUpkeep). Returns the unpaid part.
function shortPay(W, L, amt) {
  if (!(amt > 0)) return 0; const b = L.borrower, pay = Math.min(amt, Math.max(0, b.cash)); b.cash -= pay; L.lender.cash += pay; flowOut(W, b, pay); flowIn(W, L.lender, pay);
  if (amt > pay) { L.lender.stats.lostOnLoans = (L.lender.stats.lostOnLoans || 0) + amt - pay; L.unpaid = (L.unpaid || 0) + amt - pay; }
  return amt - pay;
}
function shortUpkeep(W) {
  lendPool(W); const cfg = W.cfg;
  for (const L of (W.cardLoans || []).slice()) {
    const c = W.cards[L.id], b = L.borrower; shortPay(W, L, cfg.cardLendFee * c.P);
    const under = worth(W, b) < cfg.shortMaintenance * owedValue(W, b), why = L.due <= W.t ? 'due' : under ? 'margin' : L.unpaid > 0 ? 'fee' : null; // a fee or royalty it couldn't pay calls it too
    if (!L.force && why) { L.force = W.t; jot(W, { type: 'shortCall', bot: b.name, card: c.key, price: r2(c.P), entry: r2(L.entry), why }); }
    if (L.force && (W.t - L.force >= (cfg.coverGraceWeeks ?? 3) || b.cash + L.coll < c.P)) { closeLoan(W, L, L.due <= W.t ? 'not returned in time' : 'margin', c.P * (cfg.coverSettle ?? 1.1), false); continue; }
    if (L.force && (W.t - L.force >= (cfg.coverGraceWeeks ?? 3) || b.cash + L.coll < c.P)) { closeLoan(W, L, L.due <= W.t ? 'not returned in time' : 'margin', c.P * (cfg.coverSettle ?? 1.1), false); continue; }
    if (L.force) { if (L.coll) { b.cash += L.coll; b.shortColl -= L.coll; L.coll = 0; } // forced to buy it back, collateral released to pay for it
      let p = c.P * (cfg.coverBid ?? 1.15); if (b.g?.nn) { const nw = Math.max(NW_FLOOR * cfg.coinScale, worth(W, b)); p = nnPrice(W, b, c, cardNet(W, b, c, nw, marketCtx(W))); } // a neural borrower names its own price, as for any bid
      bid(b, c, Math.min(b.cash, p)); }
  }
  for (const b of W.bots) if (b.kind === 'ai') for (const x of b.pending?.short || []) { const c = resolveMarket(W, x.player); if (c && (b.h.get(c.id) || 0) === 0 && borrowCard(W, b, c)) ask(b, c, Number(x.price) > 0 ? Number(x.price) : c.P, new Map()); }
}
// After clearing: a short seller holding a copy of a card it owes returns it (a short whose sale didn't fill is undone)
function settleShorts(W) {
  for (const L of (W.cardLoans || []).slice()) {
    const b = L.borrower, c = W.cards[L.id]; if ((b.h.get(L.id) || 0) < 1) continue;
    give(b, c, -1); give(L.lender, c, 1);
    const lot = b.lots?.get(L.id)?.shift(), cost = lot ? lot[0] : L.entry;
    if (L.week < W.t) { const pnl = L.entry - cost; b.stats.realized = (b.stats.realized || 0) + pnl; if (W.flow) W.flow.realized[b._grp ?? 2] += pnl; jot(W, { type: 'cover', bot: b.name, lender: L.lender.name, card: c.key, entry: r2(L.entry), price: r2(cost), weeks: W.t - L.week }); if (W.ord) W.ord.covers = (W.ord.covers || 0) + 1; }
    // (a short whose sale didn't fill this week is simply undone)
    closeLoan(W, L, null, null, false);
  }
  for (const L of W.cardLoans || []) if (L.week === W.t && !L.logged) { L.logged = true; if (W.ord) W.ord.shorts = (W.ord.shorts || 0) + 1; jot(W, { type: 'short', bot: L.borrower.name, lender: L.lender.name, card: W.cards[L.id].key, price: r2(W.cards[L.id].P) }); }
}

/* ---------- The liquidator ---------- */
// Cards of bots that defaulted or left. Each card's price is fixed when it arrives and only falls in weeks when no copy
// of it sells: the discount never resets against a price the liquidator itself is pushing down.
// Each copy the liquidator holds carries the claim it was seized under (null: none), first in, first out
function liqTake(W, id) { const a = W.liqTag?.get(id); const cl = a && a.length ? a.shift() : null; if (a && !a.length) W.liqTag.delete(id); return cl; }
function liqPut(W, id, cl) { const T = (W.liqTag ||= new Map()); let a = T.get(id); if (!a) T.set(id, (a = [])); a.push(cl ?? null); }
function toLiq(W, id, q, cl = null) { if (!(q > 0)) return; W.liq.set(id, (W.liq.get(id) || 0) + q); for (let k = 0; k < q; k++) liqPut(W, id, cl); const L = (W.liqPrice ||= new Map()); if (!L.has(id)) L.set(id, W.cfg.liqStart * W.cards[id].P); }
function liqAsk(W, id) { const L = (W.liqPrice ||= new Map()); if (!L.has(id)) L.set(id, W.cfg.liqStart * W.cards[id].P); return L.get(id); }
function liqCut(W) {
  const sold = W.liqSold || new Set(); W.liqSold = new Set();
  if (W.cfg.liquidation === 'chase' || !W.liqPrice) return;
  for (const [id] of W.liq) if (!sold.has(id) && W.liqPrice.has(id)) W.liqPrice.set(id, Math.max(0.05 * W.cfg.coinScale, W.liqPrice.get(id) * (1 - W.cfg.liqStep)));
}
/* ---------- The government (regulated runs: docs/regulator-spec.md) ---------- */
// Off unless cfg.government is set (an object; {} takes every default), so ordinary runs never reach this code. A
// government sets the world's rules (the dials below) and spends its treasury; it never trades. Every coin of revenue is
// a tax or fee on the bots' own holdings or activity; everything it gives out comes from the treasury; consumption moves
// coins to its own account, which has no use in the world. The driver (regulate.mjs) applies its controls between weeks
// (applyControls), posts its board text (noteBoard) and decides when it wakes (govIndicators, checkTriggers).
// GOV_DIALS: every setting a government may change, with its unit and legal range (spec 9.3). A value outside its range
// is rejected, never clipped. cfg: the dial is the engine setting of the same name; otherwise the government holds it.
// s: the scale of the dial's policy input (the bots read tanh(asinh(v / s) − asinh(v0 / s)), v0 its opening value).
export const GOV_DIALS = {
  fee: { cfg: true, lo: -1, hi: 1, s: 0.01, unit: 'share of the sale price, per trade (negative: a subsidy per trade)' },
  holdCost: { cfg: true, lo: -1, hi: 1, s: 0.0005, unit: 'share of the mark per copy held, per week (negative: a holding subsidy)' },
  wealthTax: { cfg: true, lo: -0.25, hi: 0.25, s: 0.001, unit: 'share of worth above the threshold, per week, collected every 4 weeks at 4 × the rate (negative: a subsidy)' },
  wealthTaxThreshold: { cfg: true, lo: 0, hi: Infinity, s: 2, unit: 'multiple of the median bot worth' },
  packSalesTax: { lo: -1, hi: Infinity, s: 0.1, unit: 'share of the pack clearing price, added to it and paid by the buyer (negative: a pack subsidy)' },
  outsideSalesTax: { lo: -1, hi: 1, s: 0.05, unit: 'share of the price of a trade with a dealer or the store, paid by the bot side (negative: a subsidy)' },
  exitTax: { lo: -1, hi: 1, s: 0.1, unit: 'share of a leaving bot\'s cash (negative: a payment to leavers)' },
  allowance: { lo: -Infinity, hi: Infinity, s: 'allowance', unit: 'coins per bot per week (negative: a poll tax; a bot that cannot pay is forced to sell)' },
  royaltyRate: { cfg: true, lo: 0, hi: 1, s: 0.05, unit: 'share of a card\'s value paid to its holders per 20 weeks of games, paid weekly from that week\'s game' },
  royaltyCap: { lo: 0, hi: 1, s: 0.5, unit: 'most of the treasury royalties may take in a week (share)' },
  consumption: { lo: 0, hi: Infinity, s: 'spend', unit: 'coins per week moved from the treasury to the government\'s own account' },
  maxLTV: { cfg: true, lo: 0, hi: Infinity, s: 0.6, unit: 'most a bot may borrow, as a share of its cards\' value' },
  marginCall: { cfg: true, lo: 0, hi: Infinity, s: 0.75, unit: 'debt share of its cards\' value past which a borrower must sell' },
  loanWeeks: { cfg: true, lo: 1, hi: Infinity, int: true, s: 8, unit: 'weeks until a loan falls due' },
  shorting: { cfg: true, bool: true, unit: 'true or false: bots may borrow and short-sell cards' },
  priceLimit: { cfg: true, lo: 0, hi: Infinity, s: 0.2, unit: 'most a card\'s price may move in a week, as a share (0 = off)' },
  positionLimit: { cfg: true, lo: 0, hi: Infinity, s: 0.2, unit: 'most of a card\'s circulation one bot may hold, as a share (at least 3 copies; 0 = off)' },
  guideEvery: { cfg: true, lo: 1, hi: Infinity, int: true, s: 4, unit: 'weeks between price guide issues' },
  guideLag: { cfg: true, lo: 1, hi: Infinity, int: true, s: 1, unit: 'weeks the price guide\'s values lag' },
  // 2.2.0 (owner: "give the ai model the ability to reduce the number of new cards being printed, never removing"): unset
  // reads as 1 (frames and hashes of runs that never set it are unchanged); it scales packsPerWeek only, so copies already
  // out are never removed. Not a bot input (GOV_STANCE): bots feel it through pack prices.
  printRate: { cfg: true, lo: 0, hi: 1, def: 1, s: 0.2, unit: 'share of the normal packs released a week (1 = all of them, 0 = none; cards already out are never removed)' },
};
// The structured controls: transfers, payOrder, publish, rules (validated in govCheck)
export const GOV_LINES = ['allowance', 'transfers', 'royalties', 'consumption', 'wealthSubsidy', 'holdSubsidy']; // the weekly spending lines (payOrder names them)
export const GOV_TARGETS = ['all', 'worthDecile', 'cashDecile', 'newcomers', 'noCash', 'holders'];
export const GOV_PUBLISH = ['vaultIndex', 'treasury', 'dials']; // statistics a government may withhold from the bots (a withheld one reads as a constant input)
const GOV_REV = ['fees', 'holding', 'wealthTax', 'packTax', 'outsideTax', 'exitTax', 'pollTax', 'levy'];
const GOV_SPEND = ['allowance', 'transfers', 'royalties', 'consumption', 'feeSubsidy', 'packSubsidy', 'outsideSubsidy', 'exitSubsidy', 'wealthSubsidy', 'holdSubsidy'];
const GOV_IN = { transfer: 'transfers', subsidy: 'subsidies' }, GOV_OUT = { packTax: 'pack sales tax', outsideTax: 'outside sales tax', exitTax: 'exit tax', pollTax: 'poll tax', levy: 'targeted levies' };
// Settings a regulated run pins (spec 9.5, 17.1): the engine refuses a government world without them
export const GOV_PINS = { closedEconomy: true, centralBank: false, prizeShare: 0, populationFloor: 0, brain: 'nn', outsideMode: 'value', liquidation: 'auction', leagueUpdates: false, wealthTaxTo: 'house', royaltyEvery: 'week' };
const GOV_STANCE = ['holdCost', 'wealthTax', 'wealthTaxThreshold', 'outsideSalesTax', 'exitTax', 'royaltyCap', 'consumption', 'maxLTV', 'marginCall', 'loanWeeks', 'shorting', 'priceLimit', 'positionLimit', 'guideEvery', 'guideLag'];
export const BOARD_CARD_IN = ['board: mentions of this player', 'board: their direction'];
function govBotIn(board) { return [...GOV_STANCE.map((k) => `policy: ${k}`), 'policy: transfers paid per bot', 'treasury 20w change', 'placebo', ...(board ? ['board tone', 'board activity', 'board promised dial moves'] : [])]; }
const GOV_FADE = Math.pow(0.5, 1 / 4); // board signals and the placebo halve in 4 weeks
const RNG_PLACEBO = 401; // the placebo's own stream: it never draws from the world's
function govSetup(W) {
  const cfg = W.cfg, g = cfg.government === true ? {} : cfg.government;
  for (const [k, v] of Object.entries(GOV_PINS)) if (cfg[k] !== v && !(k === 'outsideMode' && !cfg.outsideCollectors)) throw new Error(`a government run needs ${k} = ${JSON.stringify(v)} (spec 9.5), not ${JSON.stringify(cfg[k])}`);
  if (cfg.forcedSale === 'discount') throw new Error("a government run needs forcedSale other than 'discount'");
  W.gov = { boardIn: g.board !== false, placeboOn: g.placebo !== false, d: {}, d0: {}, pub: { vaultIndex: true, treasury: true, dials: true }, transfers: [], payOrder: null, rules: {},
    account: 0, bm: new Float64Array(0), bd: new Float64Array(0), bIn: new Float64Array(0), tone: 0, act: 0, promised: 0, placebo: 0, pending: [], prng: seeded(cfg.seed * 7919 + RNG_PLACEBO),
    Th: [], revH: [], spendH: [], realAllow: 0, realTransfer: 0, frac: null, owed: null, ruleErr: [], posts: [], exits: null, term: null, check: { worst: 0, weeks: 0 } };
}
function govOpen(W) {
  const G = W.gov, cfg = W.cfg, g = cfg.government === true ? {} : cfg.government, n = W.players.length;
  G.bm = new Float64Array(n); G.bd = new Float64Array(n); G.bIn = new Float64Array(2 * n);
  const d = G.d; d.packSalesTax = 0; d.outsideSalesTax = 0; d.exitTax = 0; d.allowance = cfg.allowance * (W.fillK ?? 1) / (W.botK ?? 1); d.royaltyCap = 0.5; d.consumption = 0; // the allowance dial is coins per bot (fillK applied once, here)
  for (const [k, v] of Object.entries(g.dials || {})) { const e = GOV_DIALS[k] ? govCheck(W, k, v) : 'not a dial'; if (e) throw new Error(`government.dials.${k}: ${e}`); govSet(W, k, v); } // the pre-registered opening dial vector
  for (const k of Object.keys(GOV_DIALS)) G.d0[k] = govGet(W, k);
  const roy = cfg.royalties && !cfg.priceOnly ? govRoyaltyWeek(W) : 0, need = Math.max(0, G.d0.allowance) * W.bots.length + roy; // a typical week's spending at the opening dials
  G.scale = { allowance: Math.max(1, Math.abs(G.d0.allowance)), spend: Math.max(1, need) };
  const grant = (g.treasuryStart ?? 4) * need; G.grant = grant; G.need0 = need; if (grant > 0) tre(W, 'openingGrant', grant); // the opening grant: its own ledger line
  G.Th.push(W.treasury);
}
// A typical week's royalties at the open (every active player plays: his game factor taken as 1)
function govRoyaltyWeek(W) {
  const cfg = W.cfg, share = 1 / cfg.weeksPerGeneration, L = cfg.valueModel === 'league' && W.L, k = (pid) => (L && W.players[pid].lg ? (W.players[pid].lg.active ? 1 : 0) : 1); let owed = 0;
  for (const b of W.bots) { for (const [id, q] of b.h) { const c = W.cards[id]; owed += cfg.royaltyRate * share * c.F * k(c.pid) * q; } for (const it of heldItems(W, b)) owed += cfg.royaltyRate * share * intrinsicItem(W, it) * k(it.pid); }
  return owed;
}
const govGet = (W, k) => (GOV_DIALS[k].cfg ? W.cfg[k] : W.gov.d[k]);
function govSet(W, k, v) { if (GOV_DIALS[k].cfg) W.cfg[k] = v; else W.gov.d[k] = v; }
// Is this a legal value for this control? null if it is, else the reason (type, finiteness and range only)
function govCheck(W, k, v) {
  const D = GOV_DIALS[k];
  if (D) { if (D.bool) return typeof v === 'boolean' ? null : 'must be true or false';
    if (typeof v !== 'number' || Number.isNaN(v)) return 'must be a number'; if (!Number.isFinite(v)) return 'must be finite';
    if (D.int && !Number.isInteger(v)) return 'must be a whole number'; if (v < D.lo || v > D.hi) return `must be between ${D.lo} and ${D.hi === Infinity ? 'no upper limit' : D.hi}`; return null; }
  if (k === 'transfers') { if (!Array.isArray(v)) return 'must be a list'; if (v.length > 20) return 'at most 20 transfers';
    for (const [i, x] of v.entries()) { const e = govCheckTransfer(W, x); if (e) return `transfer ${i + 1}: ${e}`; } return null; }
  if (k === 'payOrder') { if (v === null) return null; if (!Array.isArray(v) || v.some((x) => !GOV_LINES.includes(x)) || new Set(v).size !== v.length) return `must be null (pro rata) or a list of distinct lines from ${GOV_LINES.join(', ')}`; return null; }
  if (k === 'publish') { if (!v || typeof v !== 'object' || Array.isArray(v)) return 'must be an object'; for (const [s, b] of Object.entries(v)) { if (!GOV_PUBLISH.includes(s)) return `${s} is not a published statistic (${GOV_PUBLISH.join(', ')})`; if (typeof b !== 'boolean') return `${s} must be true or false`; } return null; }
  if (k === 'rules') { if (!v || typeof v !== 'object' || Array.isArray(v)) return 'must be an object of dial: rule'; for (const [dk, r] of Object.entries(v)) { const e = govCheckRule(dk, r); if (e) return `${dk}: ${e}`; } return null; }
  return 'not a dial';
}
function govCheckTransfer(W, x) {
  if (!x || typeof x !== 'object') return 'must be an object'; if (!GOV_TARGETS.includes(x.to)) return `to must be one of ${GOV_TARGETS.join(', ')}`;
  if (typeof x.amount !== 'number' || !Number.isFinite(x.amount)) return 'amount must be a finite number (coins per bot per week)';
  if (x.to === 'worthDecile' || x.to === 'cashDecile') { const lo = x.lo ?? 1, hi = x.hi ?? lo; if (![lo, hi].every((d) => Number.isInteger(d) && d >= 1 && d <= 10) || lo > hi) return 'lo and hi must be deciles 1 to 10, lo ≤ hi'; }
  if (x.to === 'newcomers' && !(Number.isInteger(x.weeks) && x.weeks >= 1)) return 'weeks must be a whole number of at least 1';
  if (x.to === 'holders' && !govPlayer(W, x.player)) return `no player named ${JSON.stringify(x.player)}`;
  for (const k of Object.keys(x)) if (!['to', 'amount', 'lo', 'hi', 'weeks', 'player'].includes(k)) return `unknown field ${k}`;
  return null;
}
function govCheckRule(dk, r) {
  if (r === null) return null; const D = GOV_DIALS[dk]; if (!D || D.bool) return 'rules apply to numeric dials only';
  if (!r || typeof r !== 'object' || typeof r.base !== 'number' || !Number.isFinite(r.base)) return 'needs a finite number base';
  if (r.terms != null && (!Array.isArray(r.terms) || r.terms.length > 10 || r.terms.some((t) => !Array.isArray(t) || t.length !== 2 || !GOV_INDICATORS.includes(t[0]) || typeof t[1] !== 'number' || !Number.isFinite(t[1])))) return `terms must be up to 10 [indicator, coefficient] pairs; indicators: ${GOV_INDICATORS.join(', ')}`;
  for (const b of ['min', 'max']) if (r[b] != null && (typeof r[b] !== 'number' || Number.isNaN(r[b]))) return `${b} must be a number`;
  for (const k of Object.keys(r)) if (!['base', 'terms', 'min', 'max'].includes(k)) return `unknown field ${k}`;
  return null;
}
function govPlayer(W, name) { if (typeof name !== 'string') return null; const s = name.trim().toLowerCase(); return W.players.find((p) => p.name.toLowerCase() === s || p.key.toLowerCase() === s) || null; }
const govClone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
const govRead = (W, k) => (GOV_DIALS[k] ? govGet(W, k) : k === 'transfers' ? W.gov.transfers : k === 'payOrder' ? W.gov.payOrder : k === 'publish' ? W.gov.pub : W.gov.rules);
// Apply a government's controls between weeks: each key is checked against the allow-list, its type and its range; an
// illegal value is rejected (the old one stays) and returned as an error. Returns { changes: [{dial, old, new}], errors }.
export function applyControls(W, controls) {
  const changes = [], errors = [];
  if (!W.gov) return { changes, errors: [{ dial: null, error: 'no government in this world' }] };
  if (!controls || typeof controls !== 'object' || Array.isArray(controls)) return { changes, errors: [{ dial: null, error: 'controls must be an object' }] };
  for (const [k, v] of Object.entries(controls)) {
    const e = govCheck(W, k, v); if (e) { errors.push({ dial: k, value: govClone(v), error: e }); continue; }
    const old = govClone(govRead(W, k));
    if (GOV_DIALS[k]) { govSet(W, k, v); if (W.gov.rules[k]) { delete W.gov.rules[k]; changes.push({ dial: `rules.${k}`, old: 'removed by a direct setting', new: null }); } }
    else if (k === 'transfers') W.gov.transfers = govClone(v);
    else if (k === 'payOrder') W.gov.payOrder = v === null ? null : v.slice();
    else if (k === 'publish') W.gov.pub = { ...W.gov.pub, ...v };
    else if (k === 'rules') { for (const [dk, r] of Object.entries(v)) { if (r === null) delete W.gov.rules[dk]; else W.gov.rules[dk] = govClone(r); } }
    changes.push({ dial: k, old, new: govClone(govRead(W, k)) });
  }
  return { changes, errors };
}
// The public indicators: built only from prices, trades, the population, the treasury's own books and the league's public
// record (never hidden value or the bots' networks). Rules, wake triggers and the state files read these.
export const GOV_INDICATORS = ['week', 'bots', 'joined', 'left', 'vaultIndex', 'vaultIndex1w', 'vaultIndex4w', 'vaultIndex20w', 'marksIndex', 'trades', 'auctionSales', 'treasury', 'treasury20w', 'revenue', 'revenue4w', 'spending', 'spending4w', 'consumption', 'ownAccount', 'medianWorth', 'meanCash', 'gini', 'packPrice', 'creditRate', 'approval',
  // the statistics office (spec 8.4, added 2026-11-10): measured every week by the engine, never wired into the view before
  'livingPaid', 'broke', 'forcedSales', 'forcedLiving', 'forcedHolding', 'forcedWealthTax', 'forcedLoanDefault', 'forcedMarginCall', 'forcedEstate', 'forcedCashShock', 'forcedPollTax', 'forcedLevy', 'forcedSalesTax', 'forcedOther', 'liquidatorSales',
  'arrears', 'arrearsBots', 'debt', 'defaults', 'marginCalls', 'creditOffered', 'creditAsked', 'creditLent', 'creditRepaid', 'creditRepaidForced', 'creditWrittenOff',
  'cashTop10', 'cashMid40', 'cashBottom50', 'worthTop10', 'worthMid40', 'worthBottom50', 'moneyCreated', 'moneyRemoved', 'moneyNet'];
// The causes a forced sale is counted under (W.forcedWeek: copies sold into bids or put up at auction with no minimum, each
// counted under its seller's largest cause this week), and the indicator each one feeds
export const GOV_FORCED = { 'living costs': 'forcedLiving', 'holding costs': 'forcedHolding', 'wealth tax': 'forcedWealthTax', 'loan default': 'forcedLoanDefault', 'margin call': 'forcedMarginCall', estate: 'forcedEstate', 'cash shock': 'forcedCashShock', 'poll tax': 'forcedPollTax', 'targeted levy': 'forcedLevy', 'sales tax': 'forcedSalesTax', other: 'forcedOther' };
export const GOV_BILLS = Object.keys(BILLS); // the bills a bot can owe (arrears.byBill in the statistics office's tables)
// Shares of the total held by the top 10%, the next 40% and the bottom 50% (ranked richest first; as marketStats' cashShare)
function govShares(xs) { const s = xs.slice().sort((a, b) => b - a), n = s.length, tot = s.reduce((a, b) => a + b, 0) || 1, k = Math.max(1, Math.round(n * 0.1)), h = Math.max(1, Math.round(n * 0.5)), sum = (a) => a.reduce((x, y) => x + y, 0) / tot;
  return n ? [sum(s.slice(0, k)), sum(s.slice(k, h)), sum(s.slice(h))] : [0, 0, 0]; }
// Copies the liquidator sold this week (trades and auctions it was the seller of), from the journal
function govLiqSales(W) { let n = 0; const J = W.journal; for (let i = J.length - 1; i >= 0; i--) { const j = J[i]; if (j.t !== W.t) break; if (j.seller === 'liquidator' && (j.type === 'trade' || (j.type === 'auctionResult' && j.winner))) n++; } return n; }
export function govIndicators(W) {
  const G = W.gov, h = W.hist, p = h.p, L = (a, k = 1) => (a.length >= k ? a[a.length - k] : null), ch = (k) => (p.length > k && p[p.length - 1 - k] > 0 ? p[p.length - 1] / p[p.length - 1 - k] - 1 : 0);
  const sum = (a, k) => a.slice(-k).reduce((s, x) => s + x, 0), ws = W.bots.map((b) => worth(W, b)).sort((a, b) => a - b), T20 = G.Th.length > 20 ? G.Th[G.Th.length - 21] : G.Th[0];
  return { week: W.t, bots: W.bots.length, joined: W.turnover?.joined ?? 0, left: W.turnover?.left ?? 0, vaultIndex: L(p) ?? 100, vaultIndex1w: ch(1), vaultIndex4w: ch(4), vaultIndex20w: ch(20), marksIndex: h.pMark?.length ? L(h.pMark) : null,
    trades: L(h.trades) ?? 0, auctionSales: W.aucWeek || 0, treasury: W.treasury, treasury20w: W.treasury - (T20 ?? 0), revenue: L(G.revH) ?? 0, revenue4w: sum(G.revH, 4), spending: L(G.spendH) ?? 0, spending4w: sum(G.spendH, 4),
    consumption: G.lastCons || 0, ownAccount: G.account, medianWorth: ws.length ? ws[ws.length >> 1] : 0, meanCash: W.bots.length ? W.bots.reduce((s, b) => s + b.cash, 0) / W.bots.length : 0, gini: L(h.gini) ?? 0,
    packPrice: W.packPx?.standard ?? packInfo(W, 'standard').price ?? 0, creditRate: W.credit?.rate ?? 0, approval: G.term ? govApproval(W).share : null, ...govOffice(W, ws) };
}
// The statistics office's indicators (read only: nothing here changes the world). ws: every bot's worth
function govOffice(W, ws) {
  const C = W.credit || {}, M = W.moneyWeek, fw = W.forcedWeek || {}, o = { livingPaid: W.living?.spent || 0, broke: W.living?.broke || 0, forcedSales: 0 };
  for (const k of Object.values(GOV_FORCED)) o[k] = 0; for (const [k, v] of Object.entries(fw)) { o.forcedSales += v; o[GOV_FORCED[k] || 'forcedOther'] += v; }
  o.liquidatorSales = govLiqSales(W); let an = 0, av = 0; for (const b of W.bots) { const a = arrearsOf(b); if (a > 0) { an++; av += a; } } o.arrears = av; o.arrearsBots = an;
  Object.assign(o, { debt: totalDebt(W), defaults: C.defaults || 0, marginCalls: C.calls || 0, creditOffered: C.offered || 0, creditAsked: C.asked || 0, creditLent: C.lent || 0, creditRepaid: C.repaid || 0, creditRepaidForced: C.repaidForced || 0, creditWrittenOff: C.writtenOff || 0 });
  const c = govShares(W.bots.map((b) => b.cash)), w = govShares(ws); [o.cashTop10, o.cashMid40, o.cashBottom50] = c; [o.worthTop10, o.worthMid40, o.worthBottom50] = w;
  o.moneyCreated = M?.totalIn || 0; o.moneyRemoved = M?.totalOut || 0; o.moneyNet = M?.net || 0; return o;
}
// The statistics office's tables for state/now.json (read only): the living cost's settings, forced sales by cause, bills
// owed by bill, the credit market, cash and worth by decile (ranked as transfers rank them: 1 = poorest tenth, ties by id)
// and the coins created and removed across the whole economy by line
export function govStats(W) {
  const C = W.credit || {}, M = W.moneyWeek, cfg = W.cfg, bs = W.bots, n = bs.length, byBill = {}; let an = 0, av = 0;
  for (const b of bs) { if (!b.arrears) continue; let s = 0; for (const k in b.arrears) { s += b.arrears[k]; byBill[k] = (byBill[k] || 0) + b.arrears[k]; } if (s > 0) { an++; av += s; } }
  const deciles = (key) => { const r = bs.map((b) => [b.id, key(b)]).sort((a, c) => a[1] - c[1] || a[0] - c[0]), tot = r.reduce((s, e) => s + e[1], 0), d = Array.from({ length: 10 }, (_, i) => ({ decile: i + 1, bots: 0, coins: 0 }));
    r.forEach((e, i) => { const x = d[Math.floor((i * 10) / n)]; x.bots++; x.coins += e[1]; }); return { total: tot, deciles: d.map((x) => ({ ...x, mean: x.bots ? x.coins / x.bots : null, share: tot ? x.coins / tot : null })) }; };
  return { bots: n, livingCost: { fixedPerBot: cfg.livingCost, shareOfEquity: cfg.lifestyle, paid: W.living?.spent || 0, botsShort: W.living?.broke || 0 },
    forcedSales: { ...(W.forcedWeek || {}) }, liquidatorSales: govLiqSales(W), arrears: { bots: an, coins: av, byBill, paidToDate: W.arrearsPaid || 0 },
    credit: { rate: C.rate ?? null, offered: C.offered || 0, asked: C.asked || 0, lent: C.lent || 0, repaidAtMaturity: C.repaid || 0, repaidFromForcedSales: C.repaidForced || 0, writtenOff: C.writtenOff || 0, debt: totalDebt(W), defaults: C.defaults || 0, marginCalls: C.calls || 0 },
    cash: deciles((b) => b.cash), worth: deciles((b) => worth(W, b)), money: M ? { created: { ...M.created }, removed: { ...M.removed }, totalCreated: M.totalIn, totalRemoved: M.totalOut, net: M.net } : null };
}
// Wake triggers: [{ field, op, value }] on the public indicators; returns the ones that fire now
export function checkTriggers(W, triggers, ind = govIndicators(W)) {
  const OPS = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };
  return (triggers || []).filter((t) => t && GOV_INDICATORS.includes(t.field) && OPS[t.op] && typeof t.value === 'number' && ind[t.field] != null && OPS[t.op](ind[t.field], t.value));
}
export const GOV_TRIGGER_OPS = ['<', '<=', '>', '>='];
// The start of each week: rule-based dials (published functions of last week's public indicators; an illegal result keeps
// the old value and is reported), then the board's fade, new posts and the placebo
function govWeekStart(W) {
  const G = W.gov; G.ruleErr = []; G.posts = [];
  const rk = Object.keys(G.rules); if (rk.length) { const ind = govIndicators(W);
    for (const k of rk) { const r = G.rules[k]; let v = r.base; for (const [f, c] of r.terms || []) v += c * (ind[f] ?? 0); if (r.min != null) v = Math.max(r.min, v); if (r.max != null) v = Math.min(r.max, v);
      const e = govCheck(W, k, v); if (e) G.ruleErr.push({ dial: k, value: v, error: e }); else govSet(W, k, v); } }
  const n = W.players.length; if (G.bm.length < n) { const g = (a, m) => { const b = new Float64Array(m); b.set(a); return b; }; G.bm = g(G.bm, n); G.bd = g(G.bd, n); G.bIn = g(G.bIn, 2 * n); }
  for (let i = 0; i < n; i++) { G.bm[i] *= GOV_FADE; G.bd[i] *= GOV_FADE; } G.tone *= GOV_FADE; G.act *= GOV_FADE; G.promised *= GOV_FADE; G.placebo *= GOV_FADE;
  for (const P of G.pending) { for (const m of P.mentions) { G.bm[m.pid] += 1; G.bd[m.pid] += m.dir; } G.tone += P.tone; G.act += 1; G.promised += Object.values(P.dials).reduce((s, x) => s + x, 0); G.posts.push(P); } G.pending = [];
  if (G.placeboOn && G.prng() < 0.5) G.placebo += 2 * G.prng() - 1; // a random post-like pulse, unrelated to anything the government does
  for (let i = 0; i < n; i++) { G.bIn[2 * i] = Math.tanh(G.bm[i]); G.bIn[2 * i + 1] = Math.tanh(G.bd[i]); }
}
// Rates below zero are subsidies paid from the treasury: one event's subsidy is paid only while the treasury holds it
function govRate(W, rate, base) { if (!(rate < 0) || !(base > 0)) return rate; const sub = Math.min(-rate * base, Math.max(0, W.treasury)); return -sub / base; }
function govSubsidy(W, line, x, b = null) { if (!(x > 0)) return; if (b) { b.cash += x; flowIn(W, b, x); } tre(W, line, -x); led(W, 'subsidy', x); }
const govOutsideTax = (W, price) => Math.max(0, W.gov.d.outsideSalesTax * price);
function govOutside(W, b, price, side) { const r = W.gov.d.outsideSalesTax; if (!r) return;
  if (r > 0) { const x = r * price; if (side === 'buy') { b.cash -= x; flowOut(W, b, x); tre(W, 'outsideTax', x); led(W, 'outsideTax', x); } else bill(W, b, 'outsideTax', x, false); return; }
  govSubsidy(W, 'outsideSubsidy', Math.min(-r * price, Math.max(0, W.treasury)), b); }
const govPackTax = (W, cost) => govRate(W, W.gov.d.packSalesTax, cost) * cost;
function govPackTaxPay(W, b, x, orig) { // x: what the bot pays (negative: it receives); orig: the sign of the pack's tax, so a refund goes back through the same line
  b.cash -= x; if (x > 0) flowOut(W, b, x); else flowIn(W, b, -x);
  if (orig > 0) { tre(W, 'packTax', x); led(W, 'packTax', x); } else { tre(W, 'packSubsidy', x); led(W, 'subsidy', -x); } }
function govExit(W, b, reason) { const G = W.gov, r = G.d.exitTax, c = Math.max(0, b.cash);
  if (r > 0 && c > 0) { const x = r * c; b.cash -= x; tre(W, 'exitTax', x); led(W, 'exitTax', x); }
  else if (r < 0 && c > 0) govSubsidy(W, 'exitSubsidy', Math.min(-r * c, Math.max(0, W.treasury)), b);
  if (G.term) G.term.left.add(b.id); }
// Who a transfer reaches: a public attribute of each bot this week
function govTargets(W, x) {
  const bs = W.bots; if (x.to === 'all') return bs; if (x.to === 'noCash') return bs.filter((b) => b.cash <= 0);
  if (x.to === 'newcomers') return bs.filter((b) => W.t - (b.joined ?? 0) <= x.weeks);
  if (x.to === 'holders') { const p = govPlayer(W, x.player); if (!p) return []; return bs.filter((b) => { for (let k = 0; k < 16; k++) if (b.h.get(p.id * 16 + k) > 0) return true; for (const it of heldItems(W, b)) if (it.pid === p.id) return true; return false; }); }
  const key = x.to === 'worthDecile' ? (b) => worth(W, b) : (b) => b.cash, lo = x.lo ?? 1, hi = x.hi ?? lo, n = bs.length;
  const r = bs.map((b) => [b, key(b)]).sort((a, c) => a[1] - c[1] || a[0].id - c[0].id); return r.filter((_, i) => { const dd = Math.floor((i * 10) / n) + 1; return dd >= lo && dd <= hi; }).map((e) => e[0]);
}
// The fraction of each line paid: pro rata (every line the same share, balance ÷ total owed) unless a payOrder ranks
// some lines first; lines it doesn't name share what is left pro rata
function govFractions(owed, T, order) {
  const f = {}; let left = Math.max(0, T);
  for (const k of order || []) { if (!(k in owed)) continue; const o = owed[k], x = Math.min(o, left); f[k] = o > 0 ? x / o : 1; left -= x; }
  const rest = Object.keys(owed).filter((k) => !(k in f)), tot = rest.reduce((s, k) => s + owed[k], 0), r = tot > 0 ? Math.min(1, left / tot) : 1;
  for (const k of rest) f[k] = r; return f;
}
// The week's payments: levies first (a negative allowance or transfer is billed), then every spending line is added up
// and paid together (spec 4.3)
function govPay(W) {
  const G = W.gov, d = G.d, cfg = W.cfg, bots = W.bots, n = bots.length, every = Math.max(1, Math.round(cfg.wealthTaxEvery ?? 4));
  if (d.allowance < 0) for (const b of bots) bill(W, b, 'pollTax', -d.allowance);
  const tg = G.transfers.map((x) => [x, govTargets(W, x)]); for (const [x, bs] of tg) if (x.amount < 0) for (const b of bs) bill(W, b, 'levy', -x.amount);
  const owed = { allowance: Math.max(0, d.allowance) * n, transfers: tg.reduce((s, [x, bs]) => s + Math.max(0, x.amount) * bs.length, 0), royalties: 0, consumption: d.consumption, wealthSubsidy: 0, holdSubsidy: 0 };
  let ws = null; if (cfg.wealthTax < 0 && W.t % every === 0) { ws = bots.map((b) => [b, worth(W, b)]); const med = ws.map((x) => x[1]).sort((a, b) => a - b)[Math.floor(ws.length / 2)] || 0, thr = cfg.wealthTaxThreshold ?? 2;
    ws = ws.map(([b, w]) => [b, w > med * thr ? (w - med * thr) * -cfg.wealthTax * every : 0]); owed.wealthSubsidy = ws.reduce((s, e) => s + e[1], 0); }
  let hs = null; if (cfg.holdCost < 0) { hs = bots.map((b) => { let v = 0; for (const [id, q] of b.h) v += q * W.cards[id].P * -cfg.holdCost; return [b, v]; }); owed.holdSubsidy = hs.reduce((s, e) => s + e[1], 0); }
  const T0 = Math.max(0, W.treasury); let f = null;
  const decide = (owedR) => { owed.royalties = Math.min(owedR, d.royaltyCap * T0); f = govFractions(owed, T0, G.payOrder); return owedR > 0 ? (owed.royalties / owedR) * f.royalties : 0; };
  if (cfg.royalties && !cfg.priceOnly) payRoyalties(W, 1 / cfg.weeksPerGeneration, decide); else decide(0);
  const each = Math.max(0, d.allowance) * f.allowance; let paidA = 0; if (each > 0) for (const b of bots) { transfer(W, b, each, 'allowance'); tre(W, 'allowance', -each); paidA += each; }
  let paidT = 0; for (const [x, bs] of tg) { if (!(x.amount > 0)) continue; const y = x.amount * f.transfers; if (y > 0) for (const b of bs) { transfer(W, b, y, 'transfer'); tre(W, 'transfers', -y); paidT += y; } }
  const cons = d.consumption * f.consumption; if (cons > 0) { tre(W, 'consumption', -cons); G.account += cons; } G.lastCons = cons;
  if (ws) for (const [b, x] of ws) govSubsidy(W, 'wealthSubsidy', x * f.wealthSubsidy, b);
  if (hs) for (const [b, x] of hs) govSubsidy(W, 'holdSubsidy', x * f.holdSubsidy, b);
  G.owed = owed; G.frac = f; G.realAllow = d.allowance < 0 ? d.allowance : each; G.realTransfer = n ? paidT / n : 0; W.flow.paidOut = paidA;
}
// The end of each week: the treasury's history and the ledger's own check (the treasury moves only by its lines)
function govWeekEnd(W) {
  const G = W.gov, M = W.moneyWeek, lines = M?.treasury?.lines || {}; let rev = 0, sp = 0;
  for (const [k, v] of Object.entries(lines)) { if (GOV_REV.includes(k)) rev += v; else if (GOV_SPEND.includes(k)) sp -= v; }
  G.revH.push(rev); G.spendH.push(sp); G.Th.push(W.treasury); for (const a of [G.revH, G.spendH, G.Th]) if (a.length > 60) a.shift();
  const off = Math.abs(M?.treasury?.other || 0); G.check.weeks++; if (off > G.check.worst) G.check.worst = off;
}
// The bots' policy inputs (spec 9.4): every dial through one bounded transform against its opening value, the realised
// allowance and transfers, the treasury's 20-week change, the placebo and the board (a withheld statistic reads 0)
const govStance = (v, v0, s) => Math.tanh(Math.asinh(v / s) - Math.asinh(v0 / s));
function govBotInputs(W, b, x, nw) {
  const G = W.gov, d0 = G.d0, on = G.pub.dials, sc = (k) => { const s = GOV_DIALS[k].s; return s === 'allowance' ? G.scale.allowance : s === 'spend' ? G.scale.spend : s; };
  const st = (k) => { if (!on) return 0; const v = govGet(W, k), v0 = d0[k]; return GOV_DIALS[k].bool ? (v ? 1 : 0) - (v0 ? 1 : 0) : govStance(v, v0, sc(k)); };
  x[22] = st('royaltyRate'); x[25] = on ? clamp((G.realAllow / nw) * 10, -3, 3) : 0; x[26] = st('fee'); x[27] = st('packSalesTax');
  let i = BOT_IN_BASE.length; for (const k of GOV_STANCE) x[i++] = st(k);
  x[i++] = on ? govStance(G.realTransfer, 0, G.scale.allowance) : 0;
  { const T = G.Th, a = T.length > 20 ? T[T.length - 21] : T[0]; x[i++] = G.pub.treasury ? govStance(W.treasury, a ?? 0, G.scale.spend * 4) : 0; }
  x[i++] = Math.tanh(G.placebo);
  if (G.boardIn) { x[i++] = Math.tanh(G.tone); x[i++] = Math.tanh(G.act); x[i++] = Math.tanh(G.promised); }
}
// The board (spec 11.3): a post becomes numbers by a published, mechanical rule, so runs stay deterministic. Sentences
// split at . ! ? ; and new lines. A direction word counts +1 (up) or −1 (down), flipped when a negation is among the three
// words before it; a sentence's direction is the sign of its sum. A player is mentioned by his full name (any case), or
// by his surname alone when it is capitalised, no other player has it and it is not one of the board's own words. Every
// player mentioned in a sentence takes its direction. A dial is promised up or down by a raise or cut word in a sentence
// naming it (with the same negation rule).
export const BOARD_WORDS = {
  up: ['up', 'rise', 'rises', 'rising', 'buy', 'buying', 'strong', 'gain', 'gains', 'rally'],
  down: ['down', 'fall', 'falls', 'falling', 'sell', 'selling', 'weak', 'crash', 'drop', 'drops'],
  negation: ['not', 'no', 'never', "don't", 'dont', "won't", 'wont', "isn't", 'isnt', "can't", 'cant', 'cannot', 'without'],
  raise: ['raise', 'raising', 'increase', 'increasing', 'hike', 'higher', 'up'],
  cut: ['cut', 'cutting', 'lower', 'lowering', 'reduce', 'reducing', 'decrease', 'down'],
  dials: { fee: ['fee', 'fees'], holdCost: ['holding cost', 'holding costs'], wealthTax: ['wealth tax'], wealthTaxThreshold: ['threshold'], packSalesTax: ['pack tax', 'pack sales tax'], outsideSalesTax: ['sales tax'], exitTax: ['exit tax'],
    allowance: ['allowance'], royaltyRate: ['royalty', 'royalties'], royaltyCap: ['royalty cap'], consumption: ['consumption'], transfers: ['transfer', 'transfers', 'grant', 'grants'], maxLTV: ['borrowing limit', 'ltv'], marginCall: ['margin call'], loanWeeks: ['loan term'],
    shorting: ['shorting', 'short selling'], priceLimit: ['price limit'], positionLimit: ['position limit'], guideEvery: ['price guide', 'guide'] },
};
const BOARD_SET = new Set([...BOARD_WORDS.up, ...BOARD_WORDS.down, ...BOARD_WORDS.negation, ...BOARD_WORDS.raise, ...BOARD_WORDS.cut, ...Object.values(BOARD_WORDS.dials).flat().flatMap((p) => p.split(' '))]);
let BOARD_IX = null; // name index, rebuilt when the player list grows
function boardIndex(players) {
  if (BOARD_IX && BOARD_IX.players === players && BOARD_IX.n === players.length) return BOARD_IX;
  const full = new Map(), sur = new Map();
  for (const p of players) { const nm = String(p.name || '').trim(); if (!nm) continue; const f = nm.toLowerCase(); (full.get(f) || full.set(f, []).get(f)).push(p.id); const parts = nm.split(/\s+/), s = parts[parts.length - 1]; if (parts.length > 1) (sur.get(s.toLowerCase()) || sur.set(s.toLowerCase(), []).get(s.toLowerCase())).push(p.id); }
  return (BOARD_IX = { players, n: players.length, full, sur, fullList: [...full.keys()].sort((a, b) => b.length - a.length) });
}
export function parseBoard(text, players) {
  const IX = boardIndex(players), sentences = String(text || '').split(/[.!?;\n]+/).map((s) => s.trim()).filter(Boolean), mentions = [], dials = {}; let toneSum = 0;
  const W_ = BOARD_WORDS, has = (arr, w) => arr.includes(w);
  for (const sRaw of sentences) {
    const low = sRaw.toLowerCase(), words = low.match(/[a-z0-9']+/g) || [], orig = sRaw.match(/[A-Za-z0-9']+/g) || [];
    const neg = (i) => { for (let j = Math.max(0, i - 3); j < i; j++) if (has(W_.negation, words[j])) return true; return false; };
    let dir = 0; words.forEach((w, i) => { const v = has(W_.up, w) ? 1 : has(W_.down, w) ? -1 : 0; if (v) dir += neg(i) ? -v : v; }); dir = Math.sign(dir); toneSum += dir;
    const seen = new Set(); let rest = ` ${words.join(' ')} `;
    for (const f of IX.fullList) { const fw = ` ${(f.match(/[a-z0-9']+/g) || []).join(' ')} `; if (fw.trim() && rest.includes(fw)) { for (const pid of IX.full.get(f)) if (!seen.has(pid)) { seen.add(pid); mentions.push({ pid, name: players[pid]?.name, dir, by: 'full name' }); } rest = rest.split(fw).join(' '); } }
    const left = rest.trim().split(' ').filter(Boolean), cap = new Set(orig.filter((w) => /^[A-Z]/.test(w)).map((w) => w.toLowerCase()));
    for (const w of left) { const ids = IX.sur.get(w); if (!ids || ids.length !== 1 || !cap.has(w) || BOARD_SET.has(w)) continue; const pid = ids[0]; if (!seen.has(pid)) { seen.add(pid); mentions.push({ pid, name: players[pid]?.name, dir, by: 'surname' }); } }
    const sp = ` ${words.join(' ')} `;
    for (const [k, al] of Object.entries(W_.dials)) { if (!al.some((a) => sp.includes(` ${a} `))) continue;
      let v = 0; words.forEach((w, i) => { const u = has(W_.raise, w) ? 1 : has(W_.cut, w) ? -1 : 0; if (u) v += neg(i) ? -u : u; }); if (v) dials[k] = (dials[k] || 0) + Math.sign(v); }
  }
  for (const k of Object.keys(dials)) { dials[k] = Math.sign(dials[k]); if (!dials[k]) delete dials[k]; }
  return { sentences: sentences.length, tone: sentences.length ? toneSum / sentences.length : 0, mentions, dials };
}
// A board post: parsed now, read by the bots from the start of the next week. Returns the parsed signals (logged by the driver)
export function noteBoard(W, text) { if (!W.gov) throw new Error('no government in this world'); const P = parseBoard(text, W.players); if (W.gov.boardIn) W.gov.pending.push(P); return P; }
// Elections (run 2): a term starts with each present bot's worth; approval is the share of bots present the whole term
// whose worth grew, with bots that left counted against; bots that died (their heirs took over) and newcomers don't count
export function govTermStart(W) { W.gov.term = { start: W.t, w0: new Map(W.bots.map((b) => [b.id, worth(W, b)])), left: new Set() }; return W.gov.term; }
export function govApproval(W) {
  const T = W.gov.term; if (!T) return null; const now = new Map(W.bots.map((b) => [b.id, b])); let yes = 0, stayed = 0, left = 0;
  for (const [id, w0] of T.w0) { const b = now.get(id); if (b) { stayed++; if (worth(W, b) > w0) yes++; } else if (T.left.has(id)) left++; }
  const n = stayed + left; return { start: T.start, eligible: n, approve: yes, stayed, left, share: n ? yes / n : null };
}
// A new government takes office: the outgoing one keeps its own account (returned); the treasury and every setting pass on
export function govHandover(W) { const G = W.gov, acct = G.account; G.account = 0; return acct; }
// What a government frame carries (frames of government runs only)
function govFrame(W) {
  const G = W.gov, R = (x) => Math.round(x * 100) / 100, M = W.moneyWeek?.treasury;
  const dials = {}; for (const k of Object.keys(GOV_DIALS)) { const v = govGet(W, k); dials[k] = typeof v === 'number' ? R(v * 1e6) / 1e6 : v; }
  return { T: R(W.treasury), acct: R(G.account), lines: M ? Object.fromEntries(Object.entries(M.lines).filter(([, v]) => v).map(([k, v]) => [k, R(v)])) : {}, check: M ? R(M.other) : 0,
    rev: R(G.revH[G.revH.length - 1] ?? 0), spend: R(G.spendH[G.spendH.length - 1] ?? 0), frac: G.frac ? Object.fromEntries(Object.entries(G.frac).map(([k, v]) => [k, R(v * 1e4) / 1e4])) : null,
    dials, transfers: G.transfers.length ? govClone(G.transfers) : undefined, rules: Object.keys(G.rules).length ? govClone(G.rules) : undefined, payOrder: G.payOrder || undefined, pub: G.pub,
    board: { tone: R(Math.tanh(G.tone) * 1e3) / 1e3, act: R(Math.tanh(G.act) * 1e3) / 1e3, promised: R(Math.tanh(G.promised) * 1e3) / 1e3, placebo: R(Math.tanh(G.placebo) * 1e3) / 1e3, posts: G.posts.length },
    ruleErr: G.ruleErr.length ? G.ruleErr : undefined, approval: G.term ? govApproval(W) : undefined };
}
// The page's view of the government layer (display only: the step never calls it and it changes nothing). The public
// indicators in GOV_INDICATORS order, the bot-independent policy inputs exactly as govBotInputs writes them (the
// allowance input for a bot at the median worth), what each weekly spending line was owed, the players the board
// mentions most with their two card inputs, and the lump sums booked out of fitness this week.
export const GOV_VIEW_IN = ['policy: royaltyRate', 'policy: allowance paid (÷ worth)', 'policy: fee', 'policy: packSalesTax'];
// Bot welfare at bid value (spec 2.3): what each bot could actually sell for this week (realValue). Measurement only: it
// reads the world and draws nothing, and regulate.mjs adds it to a frame after the frame's hash, so results don't change.
export function welfareStats(W) {
  const v = W.bots.map((b) => realValue(W, b)).sort((x, y) => x - y), n = v.length; if (!n) return null;
  const q = (p) => v[Math.min(n - 1, Math.floor(p * n))], sum = (a) => a.reduce((x, y) => x + y, 0), h = Math.round(n * 0.5);
  return { median: Math.round(q(0.5)), mean: Math.round(sum(v) / n), p10: Math.round(q(0.1)), p90: Math.round(q(0.9)), bottom50Mean: Math.round(sum(v.slice(0, h)) / Math.max(1, h)), negative: Math.round((v.filter((x) => x < 0).length / n) * 1000) / 1000 };
}
export function govView(W) {
  const G = W.gov; if (!G) return null; const R = (x, k = 4) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** k) / 10 ** k : x ?? null);
  const ind = govIndicators(W), nw = Math.max(NW_FLOOR * W.cfg.coinScale, ind.medianWorth || 0), x = new Float64Array(BOT_IN_BASE.length + govBotIn(G.boardIn).length);
  govBotInputs(W, null, x, nw);
  const inputs = [x[22], x[25], x[26], x[27], ...Array.from(x.subarray(BOT_IN_BASE.length))].map((v) => R(v));
  const top = []; for (let i = 0; i < G.bm.length; i++) if (G.bm[i] > 1e-3) top.push(i); top.sort((a, b) => G.bm[b] - G.bm[a] || a - b);
  return { ind: GOV_INDICATORS.map((k) => R(ind[k])), x: inputs, owed: G.owed ? Object.fromEntries(Object.entries(G.owed).map(([k, v]) => [k, R(v, 2)])) : null,
    board: top.slice(0, 6).map((i) => [W.players[i]?.name, R(G.bIn[2 * i], 3), R(G.bIn[2 * i + 1], 3)]), exo: R(W.exoWk || 0, 2), pending: G.pending.length };
}
export const govInputNames = (W) => [...GOV_VIEW_IN, ...govBotIn(!!W.gov?.boardIn)];
export const govScale = (W) => (W.gov ? { ...W.gov.scale, need0: W.gov.need0, grant: W.gov.grant, d0: govClone(W.gov.d0), lumpSums: [...(EXO[W.cfg.fitnessExo] || EXO.lumpSums)], fitnessExo: W.cfg.fitnessExo } : null);
// For the mechanism tests (tests/mech.test.mjs): internals, not an API
export const internals = { clear, borrowCard, lendPool, shortUpkeep, shortPay, creditMarket, livingAndCredit, settleForced, collectArrears, arrearsOf, bill, liqPay, xfer, mintCopy, ripPack, drawTier, packInfo, payout, settleEstate, estateSale, valueCollectors, compsMark, qtyOf, retireTail, writeNote, toLiq, setOrders: (W) => { W_ = W; bids = W.cards.map(() => []); asks = W.cards.map(() => []); }, bid: (b, c, p) => bid(b, c, p), ask: (b, c, p) => ask(b, c, p, new Map()), books: () => ({ bids, asks }) };
// Internals for the targeted tests in tests/ (not part of the engine's interface)
export const TEST = { cardIn: (W, b, c) => Array.from(cardInputs(W, b, c, Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), marketCtx(W))), botIn: (W, b) => { const ws = W.bots.map((x) => worth(W, x)).sort((x, y) => x - y); nnThink(W, b, ws[ws.length >> 1]); return Array.from(XB); }, shapes: () => ({ card: CARD_SHAPE.slice(), bot: BOT_SHAPE.slice(), B0, cardIn: CARD_IN.slice(), botIn: BOT_IN.slice() }), socialPhase, tokenMarket, forcedSales, settleForced, nnAnswers, nnThink, nnAct, shortUpkeep, packAuction, aiOrders, aiSocial, nnPrice, cardNet: (W, b, c) => cardNet(W, b, c, Math.max(NW_FLOOR * W.cfg.coinScale, worth(W, b)), marketCtx(W)), hot: () => hot, books: () => ({ bids, asks }), setBooks: (W) => { W_ = W; bids = W.cards.map(() => []); asks = W.cards.map(() => []); }, BOT_SHAPE, netSize };
