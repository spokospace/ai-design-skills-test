# Shared by the run-<agent>.sh scripts: sets up one run folder and its prompt.
#
#   prepare_run <agent> <skill|none> <skills subfolder>
#
# sets $root, $work, $id, $dir and $prompt, empties the run folder, and copies
# the skill (if any) into <run folder>/<skills subfolder>. A run with a skill
# gets one extra first line in the prompt, naming it.
#
#   finish_run   prints "<id> done in <n>s", which measure.mjs reads as wall time.

prepare_run() {
  local agent="$1" skill="$2" skills_dir="$3"
  local skills_src="${SKILLS_SRC:?set SKILLS_SRC to the folder holding the installed skills}"

  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  work="${RUNS_WORK:-$root/../skill-runs}"
  id="${agent}-${skill}"
  dir="$work/$id"
  rm -rf "$dir"; mkdir -p "$dir"

  prompt="$(cat "$root/brief.md")"
  if [ "$skill" != none ]; then
    mkdir -p "$dir/$skills_dir"
    cp -r "$skills_src/$skill" "$dir/$skills_dir/"
    prompt="Użyj skilla \`$skill\`.

$prompt"
  fi

  cd "$dir"
  run_started=$(date +%s)
}

finish_run() {
  echo "$id done in $(( $(date +%s) - run_started ))s"
}
