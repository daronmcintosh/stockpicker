# Terraform Infrastructure for StockPicker

This directory contains Terraform configuration to provision infrastructure on DigitalOcean for running the StockPicker application using Docker Compose.

## Structure

The Terraform configuration is organized using modules and environments:

```
terraform/
├── modules/           # Reusable modules
│   ├── droplet/       # Droplet module (creates DigitalOcean droplet)
│   └── firewall/      # Firewall module (creates firewall rules)
├── envs/              # Environment-specific configurations
│   ├── prod/          # Production environment
│   └── dev/           # Development environment
└── README.md          # This file
```

### Modules

- **`modules/droplet`**: Creates a DigitalOcean droplet with Docker and Docker Compose pre-installed
- **`modules/firewall`**: Creates firewall rules for the droplet

### Environments

Each environment folder (`envs/prod`, `envs/dev`) contains:
- `main.tf`: Uses modules to create resources
- `variables.tf`: Environment-specific variables
- `outputs.tf`: Outputs for the environment
- `terraform.tfvars.example`: Example configuration file

## Prerequisites

1. **DigitalOcean Account**: Sign up at https://www.digitalocean.com
2. **DigitalOcean API Token**: 
   - Go to https://cloud.digitalocean.com/account/api/tokens
   - Click "Generate New Token"
   - Give it a name (e.g., "Terraform") and copy the token
3. **Terraform**: Install from https://www.terraform.io/downloads
4. **SSH Key**: You'll need an SSH key pair for accessing the droplet

## Quick Start

### For Production

1. **Navigate to the production environment:**
   ```bash
   cd terraform/envs/prod
   ```

2. **Copy the example variables file:**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

3. **Edit `terraform.tfvars` with your values:**
   - Add your DigitalOcean API token
   - Optionally customize droplet size, region, etc.
   - Add your SSH public key or SSH key ID

4. **Initialize Terraform:**
   ```bash
   terraform init
   ```

5. **Review the plan:**
   ```bash
   terraform plan
   ```

6. **Apply the configuration:**
   ```bash
   terraform apply
   ```

7. **Get the droplet IP address:**
   ```bash
   terraform output droplet_ipv4
   ```

### For Development

Same steps as production, but navigate to `terraform/envs/dev` instead:

```bash
cd terraform/envs/dev
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars
terraform init
terraform plan
terraform apply
```

## Environment Differences

### Production (`envs/prod`)
- Default droplet size: `s-2vcpu-4gb` (2 vCPU, 4GB RAM)
- More restrictive security settings recommended
- Tags include "production"
- SSH access should be restricted to specific IPs

### Development (`envs/dev`)
- Default droplet size: `s-1vcpu-2gb` (1 vCPU, 2GB RAM)
- More relaxed security (can expose ports directly for testing)
- Tags include "development"
- SSH access can be open (for convenience)

## Deploying the Application

After provisioning the infrastructure:

1. **SSH into the droplet:**
   ```bash
   ssh root@$(terraform output -raw droplet_ipv4)
   ```
   Or use the output command:
   ```bash
   terraform output ssh_command
   ```

2. **Install Docker and Docker Compose** (already done via user_data, but you can verify):
   ```bash
   docker --version
   docker-compose --version
   ```

3. **Clone your repository:**
   ```bash
   git clone <your-repo-url> /opt/stockpicker
   cd /opt/stockpicker
   ```

4. **Set up environment variables:**
   ```bash
   cp .env.example .env
   nano .env  # Edit with your API keys
   ```

5. **Update docker-compose.yml for production:**
   - Update `REACT_APP_API_URL` to use your domain/IP
   - Ensure environment variables are set correctly

6. **Start the services:**
   ```bash
   docker-compose up -d
   ```

7. **Check logs:**
   ```bash
   docker-compose logs -f
   ```

## Exposing the Application via URL

You have several options for exposing your application via a custom domain:

### Option 1: Nginx Reverse Proxy (Recommended)

This is the most common approach for production deployments.

1. **Install Nginx on the droplet:**
   ```bash
   apt-get update
   apt-get install -y nginx certbot python3-certbot-nginx
   ```

2. **Create Nginx configuration** (`/etc/nginx/sites-available/stockpicker`):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com www.yourdomain.com;

       # Webapp
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # API Server
       location /api {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # n8n (optional - only if you want to expose it)
       location /n8n {
           proxy_pass http://localhost:5678;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. **Enable the site:**
   ```bash
   ln -s /etc/nginx/sites-available/stockpicker /etc/nginx/sites-enabled/
   nginx -t  # Test configuration
   systemctl reload nginx
   ```

4. **Set up SSL with Let's Encrypt:**
   ```bash
   certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

5. **Update DNS:**
   - Point your domain's A record to the droplet's IP address
   - Example: `yourdomain.com` → `YOUR_DROPLET_IP`

### Option 2: Caddy (Easier SSL Management)

Caddy automatically handles SSL certificates.

1. **Install Caddy:**
   ```bash
   apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
   apt-get update
   apt-get install -y caddy
   ```

2. **Create Caddyfile** (`/etc/caddy/Caddyfile`):
   ```
   yourdomain.com {
       reverse_proxy localhost:3000 {
           header_up Host {host}
           header_up X-Real-IP {remote}
           header_up X-Forwarded-For {remote}
           header_up X-Forwarded-Proto {scheme}
       }
   }

   api.yourdomain.com {
       reverse_proxy localhost:3001 {
           header_up Host {host}
           header_up X-Real-IP {remote}
           header_up X-Forwarded-For {remote}
           header_up X-Forwarded-Proto {scheme}
       }
   }
   ```

3. **Reload Caddy:**
   ```bash
   systemctl reload caddy
   ```

### Option 3: Cloudflare Tunnel (No Port Exposure)

If you don't want to expose any ports, you can use Cloudflare Tunnel (cloudflared).

1. **Install cloudflared:**
   ```bash
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   dpkg -i cloudflared-linux-amd64.deb
   ```

2. **Authenticate:**
   ```bash
   cloudflared tunnel login
   ```

3. **Create and configure tunnel:**
   ```bash
   cloudflared tunnel create stockpicker
   cloudflared tunnel route dns stockpicker yourdomain.com
   ```

4. **Create config** (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: stockpicker
   credentials-file: /root/.cloudflared/<tunnel-id>.json

   ingress:
     - hostname: yourdomain.com
       service: http://localhost:3000
     - hostname: api.yourdomain.com
       service: http://localhost:3001
     - service: http_status:404
   ```

5. **Run tunnel:**
   ```bash
   cloudflared tunnel run stockpicker
   ```

## Working with Multiple Environments

### Switching Between Environments

Each environment has its own Terraform state, so you can manage them independently:

```bash
# Work with production
cd terraform/envs/prod
terraform init
terraform apply

# Work with development
cd terraform/envs/dev
terraform init
terraform apply
```

### Using Workspaces (Alternative Approach)

You can also use Terraform workspaces if you prefer a single configuration:

```bash
terraform workspace new prod
terraform workspace new dev
terraform workspace select prod
terraform apply
```

However, the current structure with separate folders is recommended for clarity and separation of concerns.

## Security Considerations

1. **Firewall**: The firewall modules create rules that only allow:
   - SSH (22)
   - HTTP (80)
   - HTTPS (443)
   - Optionally n8n/API ports (if enabled)

2. **Don't expose service ports directly**: Use a reverse proxy (nginx/Caddy) instead of exposing ports 3000, 3001, 5678 directly.

3. **SSL/TLS**: Always use HTTPS in production. Let's Encrypt provides free certificates.

4. **Environment Variables**: Keep sensitive data in `.env` files and never commit them.

5. **SSH Access**: Restrict SSH access to specific IPs in production:
   ```hcl
   ssh_allowed_ips = ["YOUR_IP_ADDRESS/32"]
   ```

6. **Regular Updates**: Keep the droplet updated:
   ```bash
   apt-get update && apt-get upgrade -y
   ```

## Troubleshooting

### Check if services are running:
```bash
docker-compose ps
docker-compose logs
```

### Check firewall status:
```bash
ufw status
```

### Check Nginx/Caddy status:
```bash
systemctl status nginx
# or
systemctl status caddy
```

### View Nginx logs:
```bash
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

### Terraform state issues:
```bash
# If state is locked
terraform force-unlock <LOCK_ID>

# Refresh state
terraform refresh
```

## Cost Estimation

### Production
- **Droplet (s-2vcpu-4gb)**: ~$24/month
- **Firewall**: Free
- **Domain**: Varies ($10-15/year typically)
- **Total**: ~$24-25/month + domain

### Development
- **Droplet (s-1vcpu-2gb)**: ~$12/month
- **Firewall**: Free
- **Total**: ~$12/month

You can reduce costs by:
- Using a smaller droplet for testing
- Using free domain services for development
- Destroying dev environment when not in use

## Destroying Infrastructure

To tear down an environment:

```bash
cd terraform/envs/prod  # or dev
terraform destroy
```

**Warning**: This will permanently delete the droplet and all data on it!

## Module Development

To modify or extend modules:

1. Edit files in `terraform/modules/<module-name>/`
2. Test changes in dev environment first
3. Update all environments that use the module

Modules can be versioned using Git tags if you want to pin specific versions:

```hcl
module "droplet" {
  source = "git::https://github.com/yourorg/terraform-modules.git//droplet?ref=v1.0.0"
  # ...
}
```

## Additional Resources

- [DigitalOcean Droplet Documentation](https://docs.digitalocean.com/products/droplets/)
- [Terraform DigitalOcean Provider](https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs)
- [Terraform Modules Best Practices](https://www.terraform.io/docs/language/modules/index.html)
- [Nginx Reverse Proxy Guide](https://www.nginx.com/resources/admin-guide/reverse-proxy/)
- [Caddy Documentation](https://caddyserver.com/docs/)
