variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Name prefix for all resources"
  type        = string
  default     = "stockpicker"
}

variable "droplet_size" {
  description = "Droplet size slug (e.g., s-1vcpu-2gb, s-2vcpu-4gb)"
  type        = string
  default     = "s-1vcpu-2gb"  # Smaller for dev
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
  description = "Additional tags to apply to the droplet (beyond project_name and environment)"
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

variable "ssh_allowed_ips" {
  description = "List of IP addresses/CIDR blocks allowed for SSH access"
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "expose_n8n_directly" {
  description = "Whether to expose n8n port (5678) directly via firewall (useful for dev)"
  type        = bool
  default     = false
}

variable "expose_api_directly" {
  description = "Whether to expose API server port (3001) directly via firewall (useful for dev)"
  type        = bool
  default     = false
}

