# Run `make help` for the list. Engine commands run inside engine/ through uv.
.DEFAULT_GOAL := help
ENGINE := cd engine &&

.PHONY: help sync api api-open api-snowflake test test-live check fmt openapi web web-install db-up db-down db-reset ollama-pull worker

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-14s %s\n", $$1, $$2}'

sync: ## Install the engine with every adapter's dependencies
	$(ENGINE) uv sync --all-extras

api: ## Run the API offline: fakes and fixtures, no accounts, no GPU
	$(ENGINE) uv run fitcheck serve --reload

api-open: ## Run the API on the open path (see env/open.env)
	$(ENGINE) uv run --env-file ../env/open.env fitcheck serve --reload

api-snowflake: ## Run the API on the Snowflake path (see env/snowflake.env)
	$(ENGINE) uv run --env-file ../env/snowflake.env fitcheck serve --reload

test: ## Run the engine tests that need no external service
	$(ENGINE) uv run pytest -q

test-live: ## Also run tests against real Ollama, Postgres, Snowflake, Open-Meteo
	$(ENGINE) FITCHECK_LIVE=1 uv run pytest -q

check: ## Lint, type-check and test the engine
	$(ENGINE) uv run ruff check src tests && uv run ruff format --check src tests && uv run mypy src && uv run pytest -q

fmt: ## Format and auto-fix the engine
	$(ENGINE) uv run ruff format src tests && uv run ruff check --fix src tests

openapi: ## Regenerate web/openapi.json from the engine routes
	$(ENGINE) uv run fitcheck openapi ../web/openapi.json

web-install: ## Install web app dependencies
	cd web && npm install

web: ## Run the web app; open the printed https URL on your phone
	cd web && npm run dev

db-up: ## Start Postgres for the open path
	docker compose up -d postgres

db-down: ## Stop Postgres
	docker compose down

db-reset: ## Wipe Postgres data and start fresh; needed after a schema change
	docker compose down -v && docker compose up -d postgres

ollama-pull: ## Download the open-weight vision and chat model
	ollama pull qwen3-vl:8b

worker: ## Run the try-on GPU worker locally (needs a CUDA or Apple GPU)
	cd worker && uv run fitcheck-worker
