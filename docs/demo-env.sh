# Shell setup for docs/demo.tape (sourced while the recording is hidden).
# Makes `npx agent-wrapped` run this repository's build against the FAKE
# year in .demo-data/, so a recording can never show real logs.
export REPO="$PWD"
export TZ=UTC
export COLORTERM=truecolor
cd "$(mktemp -d)" || return
npx() {
  shift
  node "$REPO/dist/cli.js" --dir "$REPO/.demo-data" --year 2026 "$@"
}
PS1=$'\\[\e[38;2;244;114;182m\\]❯\\[\e[0m\\] '
