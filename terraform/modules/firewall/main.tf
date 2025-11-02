# Firewall rules
resource "digitalocean_firewall" "app_firewall" {
  name = "${var.project_name}-${var.environment}-firewall"

  # Allow SSH
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.ssh_allowed_ips
  }

  # Allow HTTP
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Allow HTTPS
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Allow n8n port (if you want to expose it directly)
  dynamic "inbound_rule" {
    for_each = var.expose_n8n_directly ? [1] : []
    content {
      protocol         = "tcp"
      port_range       = "5678"
      source_addresses = ["0.0.0.0/0", "::/0"]
    }
  }

  # Allow API server port (if you want to expose it directly)
  dynamic "inbound_rule" {
    for_each = var.expose_api_directly ? [1] : []
    content {
      protocol         = "tcp"
      port_range       = "3001"
      source_addresses = ["0.0.0.0/0", "::/0"]
    }
  }

  # Allow all outbound traffic
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Apply to droplet
  droplet_ids = [var.droplet_id]
}

