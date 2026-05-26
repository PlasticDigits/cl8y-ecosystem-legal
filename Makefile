.PHONY: api web test test-api test-web gitleaks

api:
	@./scripts/dev-api.sh

web:
	@./scripts/dev-web.sh

test-api:
	@bash -c 'source "$$HOME/.cargo/env" 2>/dev/null; cd api && cargo test'

test-web:
	@cd web && npm install && npm test

test: test-api test-web

gitleaks:
	@gitleaks detect --source . --config .gitleaks.toml --verbose
