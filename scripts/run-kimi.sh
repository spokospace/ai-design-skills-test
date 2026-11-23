#!/usr/bin/env bash
# One Kimi Code CLI run of the experiment: the same brief, at most one skill.
# Usage: scripts/run-kimi.sh <skill|none>
#
# Isolation: --skills-dir replaces the skill folders Kimi would discover for
# the user and the project, so a run sees only the one skill copied into its
# folder (or an empty folder for the baseline). The run folder is outside any
# repository, so no project rules load. Print mode approves file edits and
# shell commands on its own.
#
# Not used for the published results: Kimi Code needs a paid plan, and the
# free account this test ran on gets a 403.
set -euo pipefail
source "$(dirname "$0")/lib/run-common.sh"

prepare_run kimi "$1" .agents/skills
mkdir -p "$dir/.agents/skills"

timeout 50m "${KIMI_BIN:-kimi}" -p "$prompt" \
  --output-format stream-json --skills-dir "$dir/.agents/skills" \
  ${KIMI_MODEL:+--model "$KIMI_MODEL"} \
  > "$work/$id.jsonl" 2> "$work/$id.err" || echo "exit $?" >> "$work/$id.err"
finish_run
