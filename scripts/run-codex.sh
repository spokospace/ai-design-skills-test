#!/usr/bin/env bash
# One Codex run of the experiment: the same brief, at most one skill.
# Usage: scripts/run-codex.sh <skill|none>
#
# Isolation: CODEX_HOME points at a config dir that holds only auth.json and a
# config.toml switching off the skills installed for the user, so no personal
# skills, plugins, memories, hooks, AGENTS.md or MCP servers are loaded. The run
# folder is outside any repository, so no project AGENTS.md is picked up either.
set -euo pipefail

skill="$1"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="${RUNS_WORK:-$root/../skill-runs}"
cfg="${CODEX_CFG:?set CODEX_CFG to a CODEX_HOME holding only auth.json and config.toml}"
skills_src="${SKILLS_SRC:?set SKILLS_SRC to the folder holding the installed skills}"

id="codex-${skill}"
dir="$work/$id"
rm -rf "$dir"; mkdir -p "$dir"

prompt="$(cat "$root/brief.md")"
if [ "$skill" != none ]; then
  # Codex reads skills from .agents/skills in the folder it is started in.
  mkdir -p "$dir/.agents/skills"
  cp -r "$skills_src/$skill" "$dir/.agents/skills/"
  prompt="Użyj skilla \`$skill\`.

$prompt"
fi

cd "$dir"
start=$(date +%s)
printf '%s' "$prompt" | CODEX_HOME="$cfg" timeout 50m codex exec \
  --json --skip-git-repo-check --ephemeral \
  --sandbox workspace-write \
  ${CODEX_MODEL:+--model "$CODEX_MODEL"} \
  - > "$work/$id.jsonl" 2> "$work/$id.err" || echo "exit $?" >> "$work/$id.err"
echo "$id done in $(( $(date +%s) - start ))s"
