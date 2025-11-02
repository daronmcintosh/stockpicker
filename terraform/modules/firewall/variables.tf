variable "project_name" {
  description = "Name prefix for all resources"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g., prod, dev, staging)"
  type        = string
}

variable "droplet_id" {
  description = "ID of the droplet to apply firewall to"
  type        = string
}

variable "ssh_allowed_ips" {
  description = "List of IP addresses/CIDR blocks allowed for SSH access"
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}

variable "expose_n8n_directly" {
  description = "Whether to expose n8n port (5678) directly via firewall (not recommended for production)"
  type        = bool
  default     = false
}

variable "expose_api_directly" {
  description = "Whether to expose API server port (3001) directly via firewall (not recommended for production)"
  type        = bool
  default     = false
}

