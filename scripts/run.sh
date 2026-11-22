#!/usr/bin/env bash
# One run of the experiment: the same brief, one model, at most one skill.
# Usage: scripts/run.sh <model> <skill|none>
#
# Isolation: CLAUDE_CONFIG_DIR points at an empty config (only credentials),
# so no user skills, CLAUDE.md, hooks, plugins or MCP servers are loaded.
# Runs happen outside the user's home so no ancestor CLAUDE.md is picked up.
set -euo pipefail

model="$1"; skill="$2"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="${RUNS_WORK:-/d/AI/skill-runs}"
cfg="${RUNS_CFG:?set RUNS_CFG to a config dir holding only .credentials.json}"
skills_src="${SKILLS_SRC:?set SKILLS_SRC to the folder holding the installed skills}"

id="${model#claude-}-${skill}"
dir="$work/$id"
rm -rf "$dir"; mkdir -p "$dir"

prompt="$(cat "$root/brief.md")"
# The account syncs its own plugins (design:*, artifact-*) into every session,
# so a baseline run gets no Skill tool and a skill run may load only its own.
skill_rule=(--disallowedTools "Skill")
if [ "$skill" != none ]; then
  skill_rule=(--allowedTools "Skill($skill)")
  mkdir -p "$dir/.claude/skills"
  cp -r "$skills_src/$skill" "$dir/.claude/skills/"
  prompt="Użyj skilla \`$skill\`.

$prompt"
fi

cd "$dir"
start=$(date +%s)
# No MCP servers: the account's connectors (mail, drive, calendar) stay out.
CLAUDE_CONFIG_DIR="$cfg" timeout 50m claude -p "$prompt" \
  --model "$model" \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --permission-mode auto \
  "${skill_rule[@]}" \
  --output-format stream-json --verbose \
  --no-session-persistence \
  > "$work/$id.jsonl" 2> "$work/$id.err" || echo "exit $?" >> "$work/$id.err"
echo "$id done in $(( $(date +%s) - start ))s"
