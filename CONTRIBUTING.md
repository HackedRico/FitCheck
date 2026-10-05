# Contributing to FitCheck

Thanks for helping. Bug reports, fixes, docs and new adapters are all welcome, during Hacktoberfest and after.

## Get set up

```bash
make sync          # engine (Python, via uv)
make web-install   # web app (Node)
make dev           # run both: engine on :8000, web app on https://localhost:5173
```

Everything runs offline with a demo closet, so you need no accounts to start. [`AGENTS.md`](AGENTS.md) explains how the code fits together, and [`CONTEXT.md`](CONTEXT.md) has the words we use for things.

## Make a change

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Branch from `main`, one change per branch.
3. Keep `make check` green: it runs lint, types and every engine test. For web changes, also run `cd web && npm run build`.
4. Write commits as [Conventional Commits](https://www.conventionalcommits.org) with the area as scope, for example `fix(web): keep the camera on after rotate`.
5. Open a pull request and fill in the template.

## Good places to start

- A new adapter: another weather source, calendar, closet store or try-on model. [`docs/adapters.md`](docs/adapters.md) walks through it.
- Sharper verdict rules, documented in [`docs/verdict-rules.md`](docs/verdict-rules.md).
- Issues labelled `good first issue`.

## Two rules we keep

- **Person photos never get stored.** Nothing may write one to disk, a database or a log ([ADR 0003](docs/adr/0003-person-photos-never-persisted.md)).
- **Rules decide, models explain.** The verdict comes from plain code; a model may explain it but never change it ([ADR 0002](docs/adr/0002-rules-decide-models-explain.md)).

By contributing you agree your work is licensed under [Apache 2.0](LICENSE), and to follow the [code of conduct](CODE_OF_CONDUCT.md). Found a security problem? See [`SECURITY.md`](SECURITY.md) instead of opening an issue.
