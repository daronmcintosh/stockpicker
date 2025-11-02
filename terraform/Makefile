.PHONY: help init-plan init-apply init-destroy output-ip ssh fmt validate

ENV ?= prod

help:
	@echo "Terraform Makefile for StockPicker"
	@echo ""
	@echo "Usage: make [target] [ENV=<env>]"
	@echo ""
	@echo "Targets:"
	@echo "  init-<env>     - Initialize Terraform for environment (prod/dev)"
	@echo "  plan-<env>     - Show execution plan for environment"
	@echo "  apply-<env>    - Apply changes for environment"
	@echo "  destroy-<env>  - Destroy infrastructure for environment"
	@echo "  output-<env>   - Show all outputs for environment"
	@echo "  ip-<env>       - Get droplet IP for environment"
	@echo "  ssh-<env>      - SSH into droplet for environment"
	@echo ""
	@echo "Common targets:"
	@echo "  fmt            - Format all Terraform files"
	@echo "  validate       - Validate all Terraform configurations"
	@echo ""
	@echo "Examples:"
	@echo "  make init-prod"
	@echo "  make plan-prod"
	@echo "  make apply-prod"
	@echo "  make ssh-prod"

# Initialize Terraform for an environment
init-%:
	@cd envs/$* && terraform init

# Show execution plan for an environment
plan-%:
	@cd envs/$* && terraform plan

# Apply changes for an environment
apply-%:
	@cd envs/$* && terraform apply

# Destroy infrastructure for an environment
destroy-%:
	@cd envs/$* && terraform destroy

# Output droplet IP for an environment
ip-%:
	@cd envs/$* && terraform output -raw droplet_ipv4

# SSH into the droplet for an environment
ssh-%:
	@cd envs/$* && ssh root@$$(terraform output -raw droplet_ipv4)

# Show all outputs for an environment
output-%:
	@cd envs/$* && terraform output

# Format Terraform files
fmt:
	terraform fmt -recursive

# Validate Terraform configuration
validate:
	@echo "Validating environments..."
	@cd envs/prod && terraform init > /dev/null 2>&1 && terraform validate
	@cd envs/dev && terraform init > /dev/null 2>&1 && terraform validate
	@echo "Validation complete!"

