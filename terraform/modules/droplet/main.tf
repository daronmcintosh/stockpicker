# SSH Key - use existing or create new
resource "digitalocean_ssh_key" "default" {
  count      = var.ssh_key_id == null && var.ssh_public_key != null ? 1 : 0
  name       = "${var.project_name}-ssh-key"
  public_key = var.ssh_public_key
}

# DigitalOcean Droplet
resource "digitalocean_droplet" "app" {
  image    = var.droplet_image
  name     = "${var.project_name}-${var.environment}-droplet"
  region   = var.droplet_region
  size     = var.droplet_size
  ssh_keys = var.ssh_key_id != null ? [var.ssh_key_id] : (var.ssh_public_key != null ? [digitalocean_ssh_key.default[0].id] : [])

  # User data script to install Docker and Docker Compose
  user_data = <<-EOF
    #!/bin/bash
    # Update system packages
    apt-get update
    apt-get upgrade -y

    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh

    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose

    # Add user to docker group (if not root)
    usermod -aG docker $USER

    # Install basic utilities
    apt-get install -y git curl wget

    # Optional: Install nginx for reverse proxy (uncomment if needed)
    # apt-get install -y nginx
    # systemctl enable nginx

    # Optional: Install certbot for SSL certificates (uncomment if needed)
    # apt-get install -y certbot python3-certbot-nginx

    # Create app directory
    mkdir -p /opt/${var.project_name}
  EOF

  tags = var.droplet_tags
}

