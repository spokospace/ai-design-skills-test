#!/usr/bin/env bash
# One run with Claude Code as the agent and a local model behind it: Ollama
# answers on the Anthropic API, so Claude Code needs no account for the run.
# Unlike run-ollama.mjs, the model can open the skill's files and run its scripts.
# Usage: scripts/run-claude-local.sh <ollama model> <skill|none>
#
# The model needs a context far above Ollama's default for Claude Code's own
# prompt; make a variant first, e.g. a Modelfile with
#   FROM qwen3:14b
#   PARAMETER num_ctx 40960
# and `ollama create qwen3-14b-40k -f Modelfile`.
set -euo pipefail
source "$(dirname "$0")/lib/run-common.sh"

model="$1"; skill="$2"
# The same slug run-ollama.mjs makes from a model name: qwen3:14b becomes qwen3-14b.
prepare_run "claude-local-${model//[^[:alnum:]_.]/-}" "$skill" .claude/skills

# An empty config folder: no account, no user skills, hooks or plugins.
cfg="$work/.claude-local-cfg"; mkdir -p "$cfg"
if [ "$skill" = none ]; then
  skill_rule=(--disallowedTools "Skill")
else
  skill_rule=(--allowedTools "Skill($skill)")
fi

# Without an account there is no auto mode, so file edits are accepted and the
# only shell command allowed is node, which the skills' own scripts need.
ANTHROPIC_BASE_URL="${OLLAMA_URL:-http://127.0.0.1:11434}" ANTHROPIC_AUTH_TOKEN=ollama \
ANTHROPIC_DEFAULT_HAIKU_MODEL="$model" CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
CLAUDE_CONFIG_DIR="$cfg" timeout 50m claude -p "$prompt" \
  --model "$model" \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --permission-mode acceptEdits --allowedTools "Bash(node:*)" \
  "${skill_rule[@]}" \
  --output-format stream-json --verbose \
  --no-session-persistence \
  > "$work/$id.jsonl" 2> "$work/$id.err" || echo "exit $?" >> "$work/$id.err"
finish_run
