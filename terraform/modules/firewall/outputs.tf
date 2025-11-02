output "firewall_id" {
  description = "ID of the firewall"
  value       = digitalocean_firewall.app_firewall.id
}

output "firewall_name" {
  description = "Name of the firewall"
  value       = digitalocean_firewall.app_firewall.name
}

