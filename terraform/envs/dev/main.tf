terraform {
  required_version = ">= 1.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }

  # Optional: Configure backend for remote state
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "stockpicker/dev/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

# Configure the DigitalOcean Provider
provider "digitalocean" {
  token = var.do_token
}

# Droplet Module
module "droplet" {
  source = "../../modules/droplet"

  project_name = var.project_name
  environment  = "dev"

  droplet_size   = var.droplet_size
  droplet_region = var.droplet_region
  droplet_image  = var.droplet_image
  droplet_tags    = concat([var.project_name, "development"], var.droplet_tags)

  ssh_key_id     = var.ssh_key_id
  ssh_public_key = var.ssh_public_key
}

# Firewall Module
module "firewall" {
  source = "../../modules/firewall"

  project_name = var.project_name
  environment  = "dev"

  droplet_id       = module.droplet.droplet_id
  ssh_allowed_ips  = var.ssh_allowed_ips
  expose_n8n_directly = var.expose_n8n_directly
  expose_api_directly = var.expose_api_directly
}

