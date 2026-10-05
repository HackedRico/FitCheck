# fit-check skill

An [Agent Skill](https://agentskills.io) that lets a coding agent answer "should I buy this?" by driving the FitCheck engine from a shell. `SKILL.md` is the skill; `scripts/fitcheck.sh` finds the engine and runs the `fitcheck` CLI.

## Install it

Copy this folder into wherever your agent looks for skills. For Claude Code, from the repo root:

```bash
mkdir -p .claude/skills && cp -R skills/fit-check .claude/skills/
```

Use `~/.claude/skills/` instead to have it in every project. If the skill lives outside this repo, set `FITCHECK_ENGINE_DIR` to this repo's `engine/` folder so the script can find the engine.

## Try it

```bash
skills/fit-check/scripts/fitcheck.sh judge --url https://en.wikipedia.org/wiki/Raincoat
```
