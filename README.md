# One brief, three Claude models, four design skills

A small, repeatable test: the same brief for a housing cooperative's home page,
run in Claude Code on three models, once without a skill and once with each of
four popular design skills. Fifteen pages in total, kept here as they came out,
with screenshots and a few measurements.

The results are written up in [Do design skills fix AI-built pages? I tested four](https://spoko.space/blog/design-skills-for-ai-agents-tested/)
on spoko.space ([Polish version](https://spoko.space/pl/blog/skille-projektowe-dla-agentow-ai-test/)).
What a page from one prompt still lacks before it is a website is in
[How I design websites and apps with AI](https://spoko.space/blog/designing-websites-and-apps-with-ai/).

The cooperative does not exist. Its name, address, phone numbers and documents
are made up, and every page says so in its footer.

## What was compared

| | |
| --- | --- |
| Models | Claude Sonnet 5.5, Claude Opus 5.5, Claude Fable 5.2 |
| Skills | none · [Taste Skill](https://github.com/Leonxlnx/taste-skill) (`design-taste-frontend`, tasteskill 2.5.1, commit `f6b7657`) · [Impeccable](https://github.com/pbakaus/impeccable) (4.10.0, commit `b49177d`) · [Emil Kowalski's `emil-design-eng`](https://github.com/emilkowalski/skills) (commit `64eb3de`, described at [aiforui.dev/skills](https://aiforui.dev/skills)) · Anthropic's [`frontend-design`](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (commit `41bbe19`) |
| Brief | [`brief.md`](brief.md), in Polish, identical in every run |
| Tool | Claude Code 2.1.326, headless (`claude -p`) |

Three more runs, with [Ponytail](https://github.com/dietrichgebert/ponytail) (commit `dec89d9`), are kept in `runs/` and shown as an extra row in the gallery. Ponytail is a skill about writing less code, not about design, so it is not part of the comparison.

The fifteen Claude Code runs were repeated once from scratch, to see how much comes back the same: the same brief, the same pinned skill folders, a separate work folder. That second trial is kept apart in `runs-2/`, `shots-2/` and `results-2.json`, with its own gallery page, `trial-2.html` (`TRIAL=2 RUNS_WORK=<second work folder> node scripts/measure.mjs`, then `TRIAL=2 node scripts/gallery.mjs`). In it, Opus and Fable with Taste Skill both stopped at the 50-minute limit.

The same brief and the same four skills also went through OpenAI's Codex CLI (0.157.0) on a free ChatGPT plan: `scripts/run-codex.sh <skill|none>`. The model was the plan's default, GPT-6 Luna, with the reasoning effort left at its default (the run header reports `none`). Isolation works the same way as for Claude Code: `CODEX_HOME` points at a folder holding only `auth.json` and a `config.toml` that switches off the skills installed for the user and turns the Windows sandbox on, and the skill under test is copied into `.agents/skills` of the empty run folder. Commands ran in the `workspace-write` sandbox, so without network access. Each log shows the skill's `SKILL.md` being read. A first attempt without the sandbox setting ended in 15 seconds with no file, because every command was rejected; it is not counted. Those pages are in `runs/codex-*` and in the gallery's Codex row. Codex reports cached input inside its input tokens; `measure.mjs` splits them the way the Claude numbers are split.

The same brief was also pasted into five chat apps. Four ran in a browser: ChatGPT on the Free plan, Grok on the free plan, DeepSeek (free) and Gemini on the Plus plan, the last one twice, with the thinking level at Low and at High (the stronger Gemini model needs a higher plan). The fifth, Copilot, ran in its Windows app on a free personal account with the model picker left on Auto. ChatGPT, Grok and Gemini ran in temporary chats without personalisation; DeepSeek has no such mode, and Copilot ran in an ordinary chat. DeepSeek stopped a few dozen characters before the end of the code and was continued with one click. Copilot's copy button asks for clipboard access, so its code was copied out of the code view as selected text, in overlapping fragments joined on their common lines; the result has the 509 lines the code view numbers. Those pages are in `runs/chatgpt-free`, `runs/grok-free`, `runs/deepseek-free`, `runs/copilot-free`, `runs/gemini-plus` and `runs/gemini-plus-high` and in the gallery's last row. A chat reports no token counts, so they have none.

A run with a skill gets one extra first line in the prompt, "Użyj skilla `<name>`." ("Use the `<name>` skill."), and the skill in the project's `.claude/skills/`. Nothing else differs.

## How the runs were isolated

- Each run starts in an empty folder outside the user's home, so no `CLAUDE.md` from a parent folder is read.
- `CLAUDE_CONFIG_DIR` points at a config folder that holds only credentials: no user skills, memory, hooks or settings.
- `--strict-mcp-config` with an empty server list: no MCP servers or account connectors.
- The account still syncs its own plugins into every session, so a run without a skill has the `Skill` tool turned off, and a run with a skill may call only that one skill. Which skills each run actually called is recorded in its `meta.json`.
- Permissions: Claude Code's `auto` mode, where a classifier approves or blocks each action. The skills run their own scripts (asset copies, photo search, browser checks), and a fixed allow-list could not cover them without blocking the very steps the skills depend on.

## What was measured

`scripts/measure.mjs` serves each finished folder over HTTP, loads it in Chromium on a desktop, a tablet and a phone, and copies only the files the page actually requested or links to (Taste Skill copies about 37 MB of assets into the project and a page uses a handful). On that copy it records:

- page weight: what one desktop visit downloads, split into HTML, CSS, JavaScript and images;
- axe-core violations for WCAG 2.0, 2.1 and 2.2, levels A and AA, at 1440 and 390 px;
- findings of Impeccable's own deterministic detector (`npx impeccable detect`), the "slop" rules;
- console errors and requests to other origins;
- from the Claude Code log: duration, turns, cost as reported by the CLI and output tokens;
- screenshots: first screen and full page, at 1440×900 and 390×844.

One run per combination is a sample of one. The pages show what each setup tends to do with this brief, not a ranking of models or skills.

## Repeat it

```bash
pnpm install
export RUNS_CFG=/path/to/empty-config   # holds only .credentials.json
export SKILLS_SRC=/path/to/skills       # design-taste-frontend/, impeccable/, emil-design-eng/, frontend-design/
for m in claude-fable-5-2 claude-opus-5-5 claude-sonnet-5-5; do
  for s in none emil-design-eng frontend-design impeccable design-taste-frontend; do echo "$m $s"; done
done | xargs -P 4 -L 1 scripts/run.sh
RUNS_WORK=../skill-runs pnpm measure   # copies each page into runs/, writes results.json and shots/
node scripts/gallery.mjs               # rebuilds index.html
node scripts/figures.mjs               # optional: the comparison figures used in the posts
```

Keep the work folder (`RUNS_WORK`, by default `../skill-runs`) outside your home folder: Claude Code reads `CLAUDE.md` files from every parent folder of a run.

## Licence

The scripts and this README: MIT. The pages under `runs/` were generated by the models; photographs a skill placed in a page keep their own licences, listed in that page's footer where the skill credited them.
