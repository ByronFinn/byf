.DEFAULT_GOAL := help
.PHONY: help prepare build packages typecheck lint fix sherif pubcheck test watch cover clean changeset version publish release dev docs vis

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} \
	/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

## Setup

prepare: ## Install dependencies (runs the pnpm prepare lifecycle too)
	pnpm install

## Build

build: ## Build all packages and apps
	pnpm run build

packages: ## Build packages only (no apps)
	pnpm run build:packages

## Quality

typecheck: ## Type-check the whole workspace
	pnpm run typecheck

lint: ## Lint with oxlint (type-aware)
	pnpm run lint

fix: ## Lint and auto-fix
	pnpm run lint:fix

sherif: ## Check monorepo dependency consistency
	pnpm run sherif

pubcheck: ## Validate published package layout (publint + attw)
	pnpm run lint:pkg

## Test

test: ## Run the test suite once
	pnpm run test

watch: ## Run tests in watch mode
	pnpm run test:watch

cover: ## Run tests with coverage
	pnpm run test:coverage

## Clean

clean: ## Remove build artifacts across the workspace
	pnpm run clean

## Release

changeset: ## Add a changeset interactively
	pnpm run changeset

version: ## Apply changesets and bump versions
	pnpm run version

publish: ## Verify and publish (typecheck, lint, sherif, test, build, lint:pkg, then changeset publish)
	pnpm run publish

release: version publish ## Version then publish

## Development

dev: ## Run the CLI in dev mode
	pnpm run dev:cli

docs: ## Run the docs site in dev mode
	pnpm run dev:docs

vis: ## Run the visualizer in dev mode
	pnpm run vis
