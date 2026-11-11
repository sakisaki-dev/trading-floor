// The government's view (spec 8): the driver writes state/ through this whitelist, field by field, never by copying
// engine frames. Everything here is built from prices, trades, posted orders, the population, the league's public record
// and the treasury's own books. Nothing reads hidden value (a card's F, the F index, price ÷ value, the bands, top[].F,
// dealers' valuations, risk ratings), the bots' networks (sens, generation diagnostics, limits, trade reasons) or the
// seed and the planned length. tests/gov.test.mjs scans the folder for every excluded field and value.
import fs from 'node:fs'; import path from 'node:path'; import * as E from '../engine.mjs';
// Field names that must never appear in state/ (spec 8.3); the leak test checks for each as a JSON key
export const EXCLUDED_KEYS = ['F', 'F0', 'Fpub', 'Fq', 'values', 'bub', 'bands', 'bandHold', 'vcap', 'risk', 'riskRating', 'endPF', 'sens', 'netDist', 'respDist', 'respNear', 'cluster', 'quitAll', 'quitNew', 'adapt', 'limits', 'why', 'buyerWhy', 'sellerWhy', 'aiDetail', 'aiLog', 'rates', 'hidden', 'seed', 'weeksPlanned', 'fit', 'persist', 'tactics'];
// The whitelist itself: every key now.json may carry, and inside `statistics` every key of every table (spec 8.2, 8.4).
// Keys that are names from the world (ledger and money lines, forced-sale causes, bills) are checked against the engine's
// own lists by tests/gov.test.mjs; anything else is a leak
export const NOW_KEYS = ['week', 'season', 'indicators', 'dials', 'transfers', 'payOrder', 'publish', 'rules', 'treasury', 'statistics', 'ruleErrors', 'lastErrors', 'wake'];
export const STAT_KEYS = { bots: 1, livingCost: ['fixedPerBot', 'shareOfEquity', 'paid', 'botsShort'], forcedSales: 'causes', liquidatorSales: 1, arrears: ['bots', 'coins', 'byBill', 'paidToDate'],
  credit: ['rate', 'offered', 'asked', 'lent', 'repaidAtMaturity', 'repaidFromForcedSales', 'writtenOff', 'debt', 'defaults', 'marginCalls'], cash: ['total', 'deciles'], worth: ['total', 'deciles'], decile: ['decile', 'bots', 'coins', 'mean', 'share'],
  money: ['created', 'removed', 'totalCreated', 'totalRemoved', 'net'] };
const deep = (v, k = 4) => (Array.isArray(v) ? v.map((x) => deep(x, k)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, x]) => [a, deep(x, k)])) : typeof v === 'number' ? R(v, k) : v);
const R = (x, k = 2) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 10 ** k) / 10 ** k);
const TRADE_WINDOW = 52; // weeks of trades kept in state/trades.jsonl (older weeks are in history.csv as totals)
const LEAGUE_KINDS = new Set(['champion', 'award', 'hof', 'retire', 'rookie', 'injury', 'return', 'season']);
function atomic(file, text) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); } // the session never reads a half-written file
export class StateWriter {
  constructor(dir, { elections = null, defaultWake = 10 } = {}) {
    this.dir = dir; fs.mkdirSync(path.join(dir, 'notebooks'), { recursive: true }); this.trades = []; this.hist = []; this.ledgerRows = []; this.board = []; this.decisions = []; this.record = [];
    this.opts = { elections, defaultWake };
    atomic(path.join(dir, 'decisions.jsonl'), ''); atomic(path.join(dir, 'board.md'), '# The public board\n\n');
    atomic(path.join(dir, 'ledger.csv'), 'week,line,coins\n'); atomic(path.join(dir, 'history.csv'), `${['week', ...E.GOV_INDICATORS.filter((k) => k !== 'week')].join(',')}\n`);
  }
  rules(md) { atomic(path.join(this.dir, 'rules.md'), md); }
  // One finished week: now.json, the ledger and history rows, the trade window, the order book, marks, guide and league
  week(W, extra = {}) {
    const ind = E.govIndicators(W), G = W.gov, t = W.t, f = W.moneyWeek?.treasury;
    const dials = {}; for (const k of Object.keys(E.GOV_DIALS)) { const D = E.GOV_DIALS[k]; dials[k] = D.cfg ? W.cfg[k] : G.d[k]; }
    const lines = f ? Object.fromEntries(Object.entries(f.lines).filter(([, v]) => v).map(([k, v]) => [k, R(v)])) : {};
    const now = { week: t, season: W.seasonLabel || null, indicators: Object.fromEntries(Object.entries(ind).map(([k, v]) => [k, typeof v === 'number' ? R(v, 4) : v])),
      dials, transfers: G.transfers, payOrder: G.payOrder, publish: G.pub, rules: G.rules,
      treasury: { balance: R(W.treasury), ownAccount: R(G.account), openingGrant: R(G.grant), lastWeek: lines, owedLastWeek: G.owed ? Object.fromEntries(Object.entries(G.owed).map(([k, v]) => [k, R(v)])) : null, fractionsPaid: G.frac ? Object.fromEntries(Object.entries(G.frac).map(([k, v]) => [k, R(v, 4)])) : null },
      statistics: deep(E.govStats(W)), ruleErrors: G.ruleErr, ...extra };
    atomic(path.join(this.dir, 'now.json'), JSON.stringify(now, null, 1));
    fs.appendFileSync(path.join(this.dir, 'ledger.csv'), Object.entries(lines).map(([k, v]) => `${t},${k},${v}\n`).join(''));
    fs.appendFileSync(path.join(this.dir, 'history.csv'), `${[t, ...E.GOV_INDICATORS.filter((k) => k !== 'week').map((k) => (ind[k] == null ? '' : R(ind[k], 4)))].join(',')}\n`);
    // trades as they happen: card, price, quantity, week (no names); auction results and pack clearing prices
    const wk = []; for (const j of W.journal) { if (j.t !== t) continue;
      if (j.type === 'trade') wk.push({ week: t, kind: 'trade', card: j.card, price: j.price, qty: 1, outside: j.buyer === 'outside collector' || j.seller === 'outside collector' || j.seller === 'Vault store' || j.seller === 'liquidator', ...(j.seller === 'liquidator' ? { liquidator: true } : {}) });
      else if (j.type === 'auctionResult' && j.price != null) wk.push({ week: t, kind: 'auction', card: j.card, price: j.price, qty: 1, bids: j.bids, ...(j.seller === 'liquidator' ? { liquidator: true } : {}) });
      else if (j.type === 'exited') wk.push({ week: t, kind: 'exit', reason: j.reason });
      else if (j.type === 'entered') wk.push({ week: t, kind: 'entry' }); }
    for (const [type, p] of Object.entries(W.packWeek || {})) wk.push({ week: t, kind: 'packs', type, released: p.released, bids: p.bids, sold: p.sold, clearingPrice: R(p.price) });
    this.trades.push(wk); if (this.trades.length > TRADE_WINDOW) this.trades.shift();
    atomic(path.join(this.dir, 'trades.jsonl'), this.trades.flat().map((x) => JSON.stringify(x)).join('\n') + '\n');
    // the order book as posted (best bid and ask left at the close) and marks, for every market with copies out or orders
    const book = []; for (const c of W.cards) { if (c.on === false || !(c.circ > 0 || c.bb > 0 || c.ba > 0)) continue; book.push([c.key, R(c.P), c.bb > 0 ? R(c.bb) : null, c.ba > 0 ? R(c.ba) : null, c.circ]); }
    atomic(path.join(this.dir, 'market.json'), JSON.stringify({ week: t, columns: ['card', 'mark', 'bestBid', 'bestAsk', 'copiesOut'], rows: book }));
    if (W.cfg.guideOn && W.guideT === t) atomic(path.join(this.dir, 'guide.json'), JSON.stringify({ issued: t, lagWeeks: W.cfg.guideLag, guide: Object.fromEntries(W.players.filter((p) => p.guide > 0).map((p) => [p.name, R(p.guide)])) }));
    // the league's public record: season totals, injuries, retirements, awards and the latest news
    const L = W.L; const news = W.events.filter((e) => LEAGUE_KINDS.has(e.kind)).slice(0, 40).map((e) => ({ week: e.t, kind: e.kind, text: e.text }));
    const players = L ? W.players.filter((p) => p.lg && (p.lg.active || p.lg.season?.g > 0)).map((p) => ({ name: p.name, pos: p.pos, team: p.team, active: !!p.lg.active, injured: !!W.era?.[p.id]?.injured, rookie: !!p.rookie, season: p.lg.season, career: p.lg.tot })) : [];
    atomic(path.join(this.dir, 'league.json'), JSON.stringify({ week: L?.week ?? null, season: L?.season ?? W.seasonLabel ?? null, champions: L?.champions?.slice(-20) ?? [], news, players }));
  }
  // Its own decision log, as it should see it (the driver's full log keeps more)
  decision(d) { this.decisions.push(d); fs.appendFileSync(path.join(this.dir, 'decisions.jsonl'), JSON.stringify(d) + '\n'); }
  post(week, text, parsed) { const ment = parsed.mentions.map((m) => `${m.name} (${m.dir > 0 ? 'up' : m.dir < 0 ? 'down' : 'no direction'}, by ${m.by})`).join(', ') || 'none';
    const dl = Object.entries(parsed.dials).map(([k, v]) => `${k} ${v > 0 ? 'up' : 'down'}`).join(', ') || 'none';
    fs.appendFileSync(path.join(this.dir, 'board.md'), `## Week ${week}\n\n${text.trim()}\n\n*Read as: tone ${R(parsed.tone, 3)} over ${parsed.sentences} sentence${parsed.sentences === 1 ? '' : 's'}; players: ${ment}; dials: ${dl}.*\n\n`); }
  recordTable(rows) { const head = '| Government | In office (weeks) | Terms won | Own account | Population at start → end | Revenue | Transfers to bots | Consumption | Treasury left |\n|---|---|---|---|---|---|---|---|---|\n';
    atomic(path.join(this.dir, 'record.md'), `# The record of governments\n\n${head}${rows.map((r) => `| ${r.id} | ${r.from}–${r.to ?? 'now'} | ${r.terms} | ${R(r.account)} | ${r.pop0} → ${r.pop1} | ${R(r.revenue)} | ${R(r.transfers)} | ${R(r.consumption)} | ${r.left == null ? '' : R(r.left)} |`).join('\n')}\n`);
    atomic(path.join(this.dir, 'record.json'), JSON.stringify(rows)); }
  notebook(id, text) { atomic(path.join(this.dir, 'notebooks', `${id}.md`), text); }
}
