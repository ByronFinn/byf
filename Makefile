.DEFAULT_GOAL := help
.PHONY: help prepare build packages typecheck lint fix fmt fmt-check sherif pubcheck test watch cover clean changeset version publish release dev docs vis

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} \
	/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

## Setup

prepare: ## Install dependencies (runs the prepare lifecycle, sets git hooks)
	bun install

## Build

build: ## Build all packages and apps
	bun run build

packages: ## Build packages only (no apps)
	bun run build:packages

## Quality

typecheck: ## Type-check the whole workspace
	bun run typecheck

lint: ## Lint with oxlint (type-aware)
	bun run lint

fix: ## Lint and auto-fix
	bun run lint:fix

fmt: ## Format all files with oxfmt
	bun run fmt

fmt-check: ## Check formatting without writing
	bun run fmt:check

sherif: ## Check monorepo dependency consistency
	bun run sherif

pubcheck: ## Validate published package layout (publint + attw + manifest protocol check)
	bun run lint:pkg && bun run pubcheck:manifest

## Test

test: ## Run the test suite once
	bun run test

watch: ## Run tests in watch mode
	bun run test:watch

cover: ## Run tests with coverage
	bun run test:coverage

## Clean

clean: ## Remove build artifacts across the workspace
	bun run clean

## Release

changeset: ## Add a changeset interactively
	bun run changeset

version: ## Apply changesets and bump versions
	bun run version

publish: ## Verify and publish (typecheck, lint, fmt:check, sherif, test, build, lint:pkg, then changeset publish)
	bun run publish

release: version publish ## Version then publish

## Development

dev: ## Run the CLI in dev mode
	bun run dev:cli

docs: ## Run the docs site in dev mode
	bun run dev:docs

vis: ## Run the visualizer in dev mode
	bun run vis
