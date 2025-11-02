.PHONY: help install build dev up down logs clean lint format generate init-db reset-db

# Default target
help:
	@echo "StockPicker Development Commands"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make install      - Install all dependencies (apiserver + webapp)"
	@echo "  make generate     - Generate TypeScript from Protocol Buffers"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development servers (docker compose)"
	@echo "  make dev-local    - Start local dev servers (no Docker)"
	@echo "  make up           - Start all services in background"
	@echo "  make down         - Stop all services"
	@echo "  make logs         - Follow logs from all services"
	@echo "  make logs-api     - Follow API server logs"
	@echo "  make logs-web     - Follow webapp logs"
	@echo "  make logs-n8n     - Follow n8n logs"
	@echo ""
	@echo "Database:"
	@echo "  make init-db      - Initialize database schema"
	@echo "  make reset-db     - Reset database (WARNING: deletes all data)"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         - Check for linting errors (no changes)"
	@echo "  make lint-api     - Lint API server only"
	@echo "  make lint-web     - Lint webapp only"
	@echo "  make typecheck    - Run TypeScript compiler checks"
	@echo "  make format       - Format code only (no linting)"
	@echo "  make fix          - Auto-fix safe linting + formatting issues"
	@echo "  make fix-unsafe   - Auto-fix all issues (safe + unsafe)"
	@echo ""
	@echo "Building:"
	@echo "  make build        - Build all workspaces"
	@echo "  make build-docker - Build Docker images"
	@echo "  make build-api    - Build API server image"
	@echo "  make build-web    - Build webapp image"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean        - Remove node_modules and build artifacts"

# Setup & Installation
install:
	@echo "Installing dependencies for all workspaces..."
	pnpm install

generate:
	@echo "Generating TypeScript from Protocol Buffers..."
	pnpm run generate

# Development
dev:
	docker compose up

dev-local:
	@echo "Starting local development servers..."
	pnpm run dev

up:
	docker compose up -d
	@echo "Services started. Access:"
	@echo "  - Webapp: http://localhost:3000"
	@echo "  - API: http://localhost:3001"
	@echo "  - n8n: http://localhost:5678"

down:
	docker compose down

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f apiserver

logs-web:
	docker compose logs -f webapp

logs-n8n:
	docker compose logs -f n8n

# Database
init-db:
	@echo "Initializing database..."
	@echo "Creating database directory if it doesn't exist..."
	@mkdir -p db
	@if [ -f db/stockpicker.db ]; then \
		echo "Database already exists at db/stockpicker.db"; \
	else \
		sqlite3 db/stockpicker.db < db/schema.sql; \
		echo "Database initialized successfully"; \
	fi

reset-db:
	@echo "WARNING: This will delete all data!"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	rm -f db/stockpicker.db
	@echo "Database deleted. Run 'make init-db' to recreate."

# Code Quality
lint:
	@echo "Linting all code with Biome..."
	pnpm run lint

lint-api:
	@echo "Linting API server..."
	pnpm biome check apiserver/src

lint-web:
	@echo "Linting webapp..."
	pnpm biome check webapp/app

typecheck:
	@echo "Running TypeScript compiler checks..."
	pnpm run typecheck

format:
	@echo "Formatting all code with Biome..."
	pnpm run format

fix:
	@echo "Auto-fixing safe issues (linting + formatting)..."
	pnpm run fix

fix-unsafe:
	@echo "Auto-fixing all issues (safe + unsafe)..."
	pnpm run fix:unsafe

# Building
build:
	@echo "Building all workspaces..."
	pnpm run build

build-docker:
	@echo "Building Docker images..."
	docker compose build

build-api:
	docker compose build apiserver

build-web:
	docker compose build webapp

# Cleanup
clean:
	@echo "Cleaning build artifacts..."
	pnpm run clean
	@echo "Clean complete"
