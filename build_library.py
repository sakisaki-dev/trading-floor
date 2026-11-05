"""Builds sandbox/data/library.json: every league player's full research page (what a research pass reveals) plus the
hidden fundamental (the site's card value), which only the engine sees. Reads the site's generated public/data files;
writes nothing outside sandbox/data. Deterministic.

Status (active/retired) is left out on purpose: the site keeps it internal, and the sandbox has no seasons."""
import csv, json, math, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'public/data/initial-data.csv')
MARKET = os.path.join(ROOT, 'public/data/market.json')
EXTRAS = os.path.join(ROOT, 'public/data/player-extras.json')
OUT = os.path.join(ROOT, 'sandbox/data/library.json')

# Career-rate definitions per position: (label, numerator, denominator, scale, digits)
RATES = {
    'QB': [('Completion %', 'Cmp', 'Pass Att', 100, 1), ('Yards per attempt', 'Pass Yds', 'Pass Att', 1, 2), ('TD %', 'Pass TD', 'Pass Att', 100, 2),
           ('INT %', 'INT', 'Pass Att', 100, 2), ('Pass yards per game', 'Pass Yds', 'Games', 1, 1), ('Rush yards per carry', 'Rush Yds', 'Rush Att', 1, 2)],
    'RB': [('Yards per carry', 'Rush Yds', 'Rush Att', 1, 2), ('Rush yards per game', 'Rush Yds', 'Games', 1, 1), ('Rush TD per game', 'Rush TD', 'Games', 1, 2),
           ('Yards per catch', 'Rec Yds', 'Rec', 1, 2), ('Fumbles per 100 carries', 'Fum', 'Rush Att', 100, 2)],
    'WR': [('Catches per game', 'Rec', 'Games', 1, 2), ('Yards per catch', 'Rec Yds', 'Rec', 1, 2), ('Yards per game', 'Rec Yds', 'Games', 1, 1),
           ('TD per catch %', 'TDs', 'Rec', 100, 1), ('Fumbles per 100 catches', 'Fumbles', 'Rec', 100, 2)],
    'OL': [('Blocks per game', 'Blocks', 'Games', 1, 2)],
    'DEF': [('Tackles per game', 'Tackles', 'Games', 1, 2), ('Sacks per game', 'Sacks', 'Games', 1, 3), ('INT per game', 'INT', 'Games', 1, 3),
            ('Forced fumbles per game', 'FF', 'Games', 1, 3)],
}
RATES['TE'] = RATES['WR']
for p in ('LB', 'DB', 'DL'):
    RATES[p] = RATES['DEF']

def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

def read_csv():
    rows, pos, hdr = [], None, None
    with open(CSV, encoding='utf-8') as f:
        for line in f:
            t = line.strip()
            if re.fullmatch(r'[A-Z]{2}', t):
                pos, hdr = t, None
                continue
            if not pos or not t:
                continue
            cells = next(csv.reader([line]))
            if cells[0] == 'Name':
                # QB has two "Att" columns (passing, then rushing)
                seen, hdr = {}, []
                for h in cells:
                    if h == 'Att':
                        h = 'Pass Att' if 'Att' not in seen else 'Rush Att'
                        seen['Att'] = 1
                    hdr.append(h)
                continue
            rows.append((pos, dict(zip(hdr, cells))))
    return rows

def main():
    market = json.load(open(MARKET))
    snap = market['snapshots'][-1]['players']
    extras = json.load(open(EXTRAS))
    sig = extras.get('signatureTeams', {})
    players = []
    for pos, r in read_csv():
        key = f"{pos}:{r['Name']}"
        m = snap.get(key)
        if not m:
            continue
        stats = {}
        for k, v in r.items():
            if k in ('Name', 'Status', 'Team', 'Nicknames', 'Inducted', 'TPG'):
                continue
            x = num(v)
            if x is not None:
                stats[k] = int(x) if x == int(x) else round(x, 2)
        rates = {}
        for label, a, b, scale, dg in RATES.get(pos, []):
            na, nb = stats.get(a), stats.get(b)
            if na is not None and nb:
                rates[label] = round(na / nb * scale, dg)
        players.append({
            'key': key, 'name': r['Name'], 'pos': pos,
            'team': sig.get(r['Name']) or r.get('Team') or 'Free agent',
            'nickname': r.get('Nicknames') or None,
            'hallOfFame': r.get('Inducted') == 'Y',
            'ovr': m.get('ovr'), 'skill': m.get('skill'), 'grade': m.get('grade'), 'careerLegacy': m.get('legacy'),
            'stats': stats, 'rates': rates,
            'hidden': {'value': m.get('value')},  # engine only: never shown to a bot
        })
    # "Plays like": the three nearest players at the same position by z-scored career rates
    by_pos = {}
    for p in players:
        by_pos.setdefault(p['pos'], []).append(p)
    for pos, group in by_pos.items():
        labels = [l for l, *_ in RATES.get(pos, [])]
        cols = {}
        for l in labels:
            xs = [p['rates'].get(l) for p in group if p['rates'].get(l) is not None]
            if len(xs) > 1:
                mu = sum(xs) / len(xs)
                sd = math.sqrt(sum((x - mu) ** 2 for x in xs) / len(xs)) or 1
                cols[l] = (mu, sd)
        def vec(p):
            return [((p['rates'].get(l, cols[l][0]) - cols[l][0]) / cols[l][1]) for l in cols]
        for p in group:
            v = vec(p)
            near = sorted((math.dist(v, vec(q)), q['name']) for q in group if q is not p)
            p['playsLike'] = [n for _, n in near[:3]]
    players.sort(key=lambda p: (-p['hidden']['value'], p['key']))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    meta = {'source': 'public/data (league CSV, market.json latest snapshot, player-extras.json)', 'season': market['snapshots'][-1].get('season'),
            'players': len(players), 'note': 'hidden.value is the site card value; the engine uses value/20 as each card\'s hidden fundamental in coins.'}
    with open(OUT, 'w') as f:
        json.dump({'meta': meta, 'players': players}, f, separators=(',', ':'), sort_keys=False)
    print(f"library: {len(players)} players -> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT):,} bytes)")

if __name__ == '__main__':
    main()
