variable "project_name" {
  description = "Name prefix for all resources"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g., prod, dev, staging)"
  type        = string
}

variable "droplet_size" {
  description = "Droplet size slug (e.g., s-1vcpu-2gb, s-2vcpu-4gb)"
  type        = string
  default     = "s-2vcpu-4gb"
}

variable "droplet_region" {
  description = "DigitalOcean region slug (e.g., nyc1, sfo3, ams3)"
  type        = string
  default     = "nyc1"
}

variable "droplet_image" {
  description = "Droplet image slug (e.g., ubuntu-22-04-x64)"
  type        = string
  default     = "ubuntu-22-04-x64"
}

variable "droplet_tags" {
  description = "Tags to apply to the droplet"
  type        = list(string)
  default     = []
}

variable "ssh_key_id" {
  description = "Existing SSH key ID from DigitalOcean (if you have one already)"
  type        = string
  default     = null
}

variable "ssh_public_key" {
  description = "Public SSH key content (will create new SSH key if ssh_key_id is null)"
  type        = string
  default     = null
  sensitive   = true
}

