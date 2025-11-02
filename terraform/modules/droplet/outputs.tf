output "droplet_id" {
  description = "ID of the created droplet"
  value       = digitalocean_droplet.app.id
}

output "droplet_ipv4" {
  description = "IPv4 address of the droplet"
  value       = digitalocean_droplet.app.ipv4_address
}

output "droplet_ipv6" {
  description = "IPv6 address of the droplet"
  value       = digitalocean_droplet.app.ipv6_address
}

output "droplet_urn" {
  description = "Uniform Resource Name of the droplet"
  value       = digitalocean_droplet.app.urn
}

output "droplet_name" {
  description = "Name of the droplet"
  value       = digitalocean_droplet.app.name
}

output "ssh_key_id" {
  description = "ID of the created SSH key (if created)"
  value       = length(digitalocean_ssh_key.default) > 0 ? digitalocean_ssh_key.default[0].id : null
}

