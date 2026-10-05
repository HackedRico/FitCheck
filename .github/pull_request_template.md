## What changed

## Why

## How you verified it

- [ ] `make check` is green
- [ ] `make worker-test` is green, if `worker/` changed
- [ ] `cd web && npm run build` passes, if `web/` changed
- [ ] `make openapi` rerun, if a route or schema changed
- [ ] Tried in the running app: say what you did and saw

## Notes for the reviewer

Changes to `domain.py` or `ports.py` go in a PR of their own, named as such in the title.
