#!/usr/bin/env bash
# One Antigravity CLI run of the experiment: the same brief, at most one skill.
# Usage: scripts/run-agy.sh <skill|none>
#
# Antigravity CLI (agy) is what Google moved personal accounts to when Gemini
# CLI stopped serving them. It has no switch for a clean profile, so the run
# uses the signed-in one as it is: the skills installed for the user stay
# visible (none of them is a design skill; the log shows which files were
# read). The run folder is outside any repository, so no project rules load.
#
# Headless mode keeps its defaults: the agent writes files with its own tool,
# and shell commands run in the terminal sandbox, which can read but not write.
set -euo pipefail
source "$(dirname "$0")/lib/run-common.sh"

# agy reads project skills from .agents/skills in the folder it is started in.
prepare_run agy "$1" .agents/skills

timeout 52m "${AGY_BIN:-agy}" -p "$prompt" \
  --output-format stream-json --sandbox --print-timeout 50m \
  ${AGY_MODEL:+--model "$AGY_MODEL"} \
  > "$work/$id.jsonl" 2> "$work/$id.err" || echo "exit $?" >> "$work/$id.err"
finish_run
