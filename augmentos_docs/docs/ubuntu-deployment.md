---
sidebar_position: 3
---

# Deploy to an Ubuntu Server

This guide will walk you through deploying your AugmentOS app to an Ubuntu server. This approach gives you full control over your hosting environment and is ideal for production deployments that require custom configurations or integration with existing infrastructure.

## Why Use an Ubuntu Server?

**Benefits of Ubuntu server hosting:**
- **Full Control**: Complete control over server configuration, security, and performance
- **Cost Effective**: Often more economical for long-running production applications
- **Custom Infrastructure**: Integrate with existing databases, monitoring, and security systems
- **No Platform Lock-in**: Your deployment isn't tied to a specific hosting platform
- **Advanced Configuration**: Custom SSL certificates, load balancing, and networking

## Prerequisites

Make sure you have:

- **Ubuntu Server**: 22.04 LTS or later (physical server, VPS, or cloud instance)
- **Domain Name**: A domain pointing to your server's IP address
- **SSH Access**: Root or sudo access to your Ubuntu server
- **AugmentOS Account**: For the developer console at [console.AugmentOS.org](https://console.AugmentOS.org)
- **Basic Linux Knowledge**: For server administration and troubleshooting

## Part 1: Prepare Your Server

### 1. Update the Operating System and Install Essentials

Connect to your Ubuntu server via SSH and update the system:

```bash
# Update package lists and upgrade existing packages
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl unzip git build-essential ufw
```

**What this does:**
- Updates all system packages to the latest versions
- Installs development tools needed for building applications
- Installs UFW (Uncomplicated Firewall) for security
- Installs Git for code management

### 2. Install Bun Runtime

Install Bun, the fast JavaScript runtime that AugmentOS apps use:

```bash
# Download and install Bun
curl -fsSL https://bun.sh/install | bash

# Reload your shell to update PATH
exec $SHELL

# Verify installation
bun --version
```

You should see a version number like `1.0.0` or similar.

### 3. Configure the Firewall

Set up basic firewall rules to secure your server:

```bash
# Allow SSH connections
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS traffic for web accss
sudo ufw allow 'Nginx Full'

# Enable the firewall
sudo ufw enable

# Check firewall status
sudo ufw status verbose
```

**Note:** Always ensure SSH access is allowed before enabling UFW to avoid being locked out of your server.

## Part 2: Deploy Your Application Code

### 4. Transfer Your Code to the Server

(replace `myapp` with the name of your app)

**Option A: Using Git (Recommended)**

If your code is in a Git repository:

```bash
# Navigate to the application directory
cd /opt

# Clone your repository
sudo git clone https://github.com/YOUR_USERNAME/your-augmentos-app.git myapp

# Set proper ownership (replace 'ubuntu' with your username)
sudo chown -R ubuntu:ubuntu /opt/myapp
```

**Option B: Using SCP**

If you're uploading from your local machine:

```bash
# From your local machine, upload your app directory
scp -r ./my-augmentos-app ubuntu@YOUR_SERVER_IP:/tmp/

# On the server, move it to the proper location
sudo mv /tmp/my-augmentos-app /opt/myapp
sudo chown -R ubuntu:ubuntu /opt/myapp
```

**Example Directory Structure:**
```
/opt/myapp/
├── src/
│   └── index.ts
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

### 5. Install Dependencies and Test

Navigate to your app directory and set it up:

```bash
# Change to your app directory
cd /opt/myapp

# Install all dependencies
bun install

# Create your environment file from the example
cp .env.example .env

# Edit the environment file with your production values
nano .env
```

**Configure your `.env` file:**
```env
PORT=3000
PACKAGE_NAME=com.yourname.yourapp
AUGMENTOS_API_KEY=your_api_key_from_console
NODE_ENV=production
```

**Test your application:**
```bash
# Start your app in development mode
bun run src/index.ts
```

**In a separate terminal, test the health endpoint:**
```bash
curl http://localhost:3000/health
```

You should see a response indicating your app is running. Press `Ctrl+C` to stop the test server.

## Part 3: Create a System Service

### 6. Set Up Systemd Service

Create a systemd service to run your app automatically and restart it if it crashes:
**Note:** Adjust the `User` and `ExecStart` paths based on your setup. The Bun path shown is the default installation location.

```bash
# Create the service file
sudo nano /etc/systemd/system/myapp.service
```

**Add the following configuration:**
```ini
[Unit]
Description=AugmentOS App Server
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/myapp
ExecStart=/home/ubuntu/.bun/bin/bun run src/index.ts
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 7. Enable and Start the Service

```bash
# Reload systemd to recognize the new service
sudo systemctl daemon-reload

# Enable the service to start on boot and start it now
sudo systemctl enable --now myapp

# Check service status
sudo systemctl status myapp
```

### 8. Test the Service

Monitor your service logs in real-time:

```bash
# View live logs
sudo journalctl -u myapp -f
```

**In a separate terminal, test your app:**
```bash
curl http://localhost:3000/health
```

Your app should respond successfully. The service will automatically restart if it crashes.

## Part 4: Configure Web Server and Domain

### 9. Install and Configure Nginx

Install Nginx as a reverse proxy to handle web traffic:

```bash
# Install Nginx
sudo apt install -y nginx

# Enable Nginx to start on boot and start it now
sudo systemctl enable --now nginx

# Verify Nginx is running
sudo systemctl status nginx
```

### 10. Point Your Domain to the Server

Configure your domain's DNS settings:

1. **Access your domain registrar's DNS management panel**
2. **Create an A record** pointing your domain to your server's IP address:
   - **Name**: `@` (for root domain) or `myapp` (for subdomain)
   - **Type**: `A`
   - **Value**: Your server's IP address
   - **TTL**: 300 (5 minutes)

**Example DNS configuration:**
```
myapp.example.org → 203.555.113.42 (your server IP)
```

### 11. Create Nginx Virtual Host

Create an Nginx configuration for your domain:

```bash
# Create the site configuration
sudo nano /etc/nginx/sites-available/myapp
```

**Add the following configuration (replace `myapp.example.org` with your actual domain):**
```nginx
server {
    listen 80;
    server_name myapp.example.org;

    # Proxy to your app
    location / {
        proxy_pass         http://localhost:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   X-Forwarded-Host $server_name;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

**For multiple domains (with www prefix):**
```nginx
server_name www.example.org example.org;
```

### 12. Activate the Site

Enable your site configuration:

```bash
# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# If the test passes, reload Nginx
sudo systemctl reload nginx
```

### 13. Test HTTP Access

Test your deployment:

```bash
# Test locally
curl http://localhost/health

# Test via domain (replace with your domain)
curl http://myapp.example.org/health

# Monitor app logs for requests
sudo journalctl -u myapp -f
```

You should see successful responses and request logs.

## Part 5: Add HTTPS with Let's Encrypt

### 14. Install Certbot

Install Certbot for free SSL certificates:

```bash
# Install snapd if not already installed
sudo snap install core && sudo snap refresh core

# Install certbot
sudo snap install --classic certbot

# Create symbolic link for easy access
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### 15. Obtain SSL Certificates

Get SSL certificates for your domain:

```bash
# For a single domain
sudo certbot --nginx -d myapp.example.org

# For multiple domains (including www)
sudo certbot --nginx -d example.com -d www.example.com
```

Certbot will:
- Automatically modify your Nginx configuration
- Set up automatic certificate renewal
- Redirect HTTP traffic to HTTPS

### 16. Test HTTPS

Verify your secure deployment:

```bash
# Test HTTPS locally
curl https://localhost/health

# Test via secure domain
curl https://myapp.example.org/health

# Check certificate details
curl -I https://myapp.example.org
```

Your app should now be accessible via HTTPS with a valid SSL certificate.

## Part 6: Register with AugmentOS

### 17. Update AugmentOS Console

1. Navigate to [console.AugmentOS.org](https://console.AugmentOS.org)
2. Sign in and select your app
3. Update the **Server URL** to your domain: `https://myapp.example.org`
4. If using a webview, update the **Webview URL** to: `https://myapp.example.org/webview`
5. Save your changes

### 18. Test Your Live App

1. **Open the AugmentOS app** on your phone
2. **Find your app** in the app list and tap to start it
3. **Expected behavior:**
   - Your app should connect successfully
   - Any functionality should work as expected

## Part 7: Monitoring and Maintenance

### 19. Set Up Log Monitoring

Monitor your application logs:

```bash
# View recent logs
sudo journalctl -u myapp --since "1 hour ago"

# Follow live logs with timestamps
sudo journalctl -u myapp -f --output=short-iso

# View Nginx access logs
sudo tail -f /var/log/nginx/access.log

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log
```


## Troubleshooting

### App Not Starting

**Check service status:**
```bash
sudo systemctl status myapp
sudo journalctl -u myapp --since "10 minutes ago"
```

**Common issues:**
- **Permission errors**: Check file ownership with `ls -la /opt/myapp`
- **Port conflicts**: Ensure port 3000 isn't used by another service
- **Environment variables**: Verify your `.env` file contains correct values

### Domain Not Accessible

**Check DNS propagation:**
```bash
# Check if DNS is resolving
nslookup myapp.example.org

# Test from different locations
dig myapp.example.org @8.8.8.8
```

**Check Nginx configuration:**
```bash
sudo nginx -t
sudo systemctl status nginx
```

### SSL Certificate Issues

**Check certificate status:**
```bash
sudo certbot certificates
```

**Renew certificates manually:**
```bash
sudo certbot renew --force-renewal
```

## Next Steps

Congratulations! Your AugmentOS app is now running on your Ubuntu server with HTTPS. Here's what you can do next:

### Explore AugmentOS Features

- **[Events](events)**: Handle user interactions and sensor data
- **[Settings](settings)**: Add configurable options for users
- **[AI Tools](tools)**: Integrate with Mira AI for natural language interactions
- **[Webview Authentication](webview-auth-overview)**: Build rich web interfaces

### Get Help

- **[Discord Community](https://discord.gg/5ukNvkEAqT)**: Get help from other developers
- **[Ubuntu Server Documentation](https://ubuntu.com/server/docs)**: Learn more about server administration
- **[Nginx Documentation](https://nginx.org/en/docs/)**: Advanced web server configuration
- **[AugmentOS Documentation](/)**: Explore the full SDK documentation

Your AugmentOS app is now production-ready and running on your own infrastructure!