#!/bin/zsh
# The AI government launcher (docs/GOVERNMENT.md). Every step that starts a Claude session uses the owner's subscription.
#
#   tools/gov.sh token        once: make a subscription token (claude setup-token) and keep it in the macOS Keychain
#   tools/gov.sh check        what's ready: CLI, token, folder, clean tree, port; starts nothing
#   tools/gov.sh plumbing     the one-turn plumbing test (uses the subscription)
#   tools/gov.sh plumbing200  200 weeks at 2 s a week with a real session, watched live (uses the subscription)
#   tools/gov.sh replay200    replays plumbing-200 from its decision log and checks every week's hash (no session)
#   tools/gov.sh long         the long steward experiment (subscription): a no-government baseline in the background,
#                             then the steward, both open-ended (--weeks 0) until Ctrl-C; resume with: tools/gov.sh resume runs/s-long
#   tools/gov.sh run1         run 1, watched live (uses the subscription); 7,000 weeks at 4 s, WEEKS= PACE= to override
#   tools/gov.sh resume [run] picks a run back up after a crash (default runs/g1)
#   tools/gov.sh view         opens the live view on this Mac and prints the phone address
set -euo pipefail
cd "${0:A:h}/.."
ROOT=/Users/Shared/tf-gov PORT=${PORT:-4322} SVC=trading-floor-gov
CLI=${CLAUDE_CLI:-$(ls -d ~/.vscode/extensions/anthropic.claude-code-*-darwin-arm64/resources/native-binary/claude 2>/dev/null | sort -V | tail -1)}
lan() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<this Mac'"'"'s address>'; }
token() { security find-generic-password -a "$USER" -s "$SVC" -w 2>/dev/null; }
need() {
  [[ -x "$CLI" ]] || { echo "No Claude CLI found. Set CLAUDE_CLI to its path."; exit 1; }
  local t; t=$(token) || { echo "No token yet. Run: tools/gov.sh token"; exit 1; }
  export CLAUDE_CODE_OAUTH_TOKEN="$t" CLAUDE_CLI="$CLI"
  mkdir -p "$ROOT"
}
watching() { echo "Watch live: http://localhost:$PORT on this Mac, http://$(lan):$PORT on a phone on the same Wi-Fi."; }
case "${1:-help}" in
  token)
    echo "Opening the subscription sign-in. When it prints a token (sk-ant-oat...), copy it."
    "$CLI" setup-token
    echo; read -rs "t?Paste the token here, once (it is not shown): "; echo
    t=$(print -r -- "$t" | tr -d ' \n\r\t' | perl -pe 's/(?=sk-ant-oat)/\n/g' | grep -E '^sk-ant-oat' | awk 'length($0)>=90' | head -1 || true) # the first whole token, if the paste repeated or wrapped it
    [[ ${#t} -ge 90 ]] || { echo "That doesn't look like a whole token (sk-ant-oat01-..., about 108 characters); nothing saved."; exit 1; }
    security add-generic-password -U -a "$USER" -s "$SVC" -w "$t" && echo "Saved in the Keychain as '$SVC'. Remove it with: security delete-generic-password -s $SVC" ;;
  check)
    echo "CLI:     ${CLI:-none} $([[ -x "$CLI" ]] && "$CLI" --version 2>/dev/null | head -1)"
    echo "Token:   $(token >/dev/null && echo 'in the Keychain' || echo 'missing (tools/gov.sh token)')"
    echo "Folder:  $ROOT $([[ -d $ROOT ]] && echo ok || echo missing)"
    echo "Tree:    $([[ -z "$(git status --porcelain)" ]] && echo clean || echo 'dirty (commit first; claude runs refuse a dirty tree)')"
    echo "Port:    $PORT $(lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 && echo 'in use (a run is serving)' || echo free)"
    echo "Power:   $(pmset -g batt | grep -q 'AC Power' && echo 'plugged in' || echo 'on battery (plug in for long runs)')"
    watching ;;
  plumbing) need; node gov/plumbing.mjs --session-root "$ROOT/plumbing"; echo "Read $ROOT/plumbing/context-dump.json: any FAIL line must be fixed first." ;;
  plumbing200) need; watching; caffeinate -dimsu node regulate.mjs --government claude --session-root "$ROOT/plumbing-200" --seed 1 --weeks 200 --pace 2 --out runs/plumbing-200 --serve "$PORT" ;;
  replay200) node regulate.mjs --replay runs/plumbing-200 --out runs/plumbing-200-replay ;;
  run1) need; watching; caffeinate -dimsu node regulate.mjs --government claude --brief v1 --model claude-haiku-5-5 \
          --session-root "$ROOT/g1" --seed 1 --weeks "${WEEKS:-7000}" --pace "${PACE:-4}" --out runs/g1 --serve "$PORT" ;;
  long) need; mkdir -p runs; [[ -e runs/s-long ]] && { echo "runs/s-long exists: carry on with tools/gov.sh resume runs/s-long"; exit 1; }
        [[ -e runs/a0-long ]] || { nohup nice -n 10 node regulate.mjs --government A0 --seed 1 --weeks 0 --pace 0 --out runs/a0-long > runs/a0-long.log 2>&1 &
          echo "No-government baseline started in the background (runs/a0-long.log); stop it with: pkill -f 'out runs/a0-long'"; }
        watching; caffeinate -dimsu node regulate.mjs --government claude --brief steward --own-account off --model claude-haiku-5-5 \
          --session-root "$ROOT/s-long" --seed 1 --weeks 0 --pace "${PACE:-4}" --out runs/s-long --serve "$PORT" --baseline runs/a0-long/run.json ;;
  resume) need; watching; caffeinate -dimsu node regulate.mjs --resume "${2:-runs/g1}" --serve "$PORT" ;;
  view) open "http://localhost:$PORT"; watching ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
