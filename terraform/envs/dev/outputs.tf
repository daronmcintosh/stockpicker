output "droplet_id" {
  description = "ID of the created droplet"
  value       = module.droplet.droplet_id
}

output "droplet_ipv4" {
  description = "IPv4 address of the droplet"
  value       = module.droplet.droplet_ipv4
}

output "droplet_ipv6" {
  description = "IPv6 address of the droplet"
  value       = module.droplet.droplet_ipv6
}

output "droplet_urn" {
  description = "Uniform Resource Name of the droplet"
  value       = module.droplet.droplet_urn
}

output "droplet_name" {
  description = "Name of the droplet"
  value       = module.droplet.droplet_name
}

output "ssh_command" {
  description = "Command to SSH into the droplet"
  value       = "ssh root@${module.droplet.droplet_ipv4}"
}

output "firewall_id" {
  description = "ID of the firewall"
  value       = module.firewall.firewall_id
}

output "deployment_instructions" {
  description = "Instructions for deploying the application"
  value = <<-EOT
    Your development droplet is ready! Here's how to deploy:

    1. SSH into the droplet:
       ssh root@${module.droplet.droplet_ipv4}

    2. Clone your repository:
       git clone <your-repo-url> /opt/${var.project_name}
       cd /opt/${var.project_name}

    3. Set up environment variables:
       cp .env.example .env
       # Edit .env with your API keys

    4. Start the services:
       docker-compose up -d

    Your app will be accessible at:
    - Webapp: http://${module.droplet.droplet_ipv4}:3000
    - API: http://${module.droplet.droplet_ipv4}:3001
    - n8n: http://${module.droplet.droplet_ipv4}:5678 (if exposed)
  EOT
}

