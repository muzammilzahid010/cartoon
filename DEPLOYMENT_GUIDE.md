# Complete Beginner's Guide: Deploy AI Video Generator on Hostinger VPS KVM2

This guide will walk you through deploying your AI Video Generator application on a Hostinger VPS from scratch. No prior VPS experience required!

---

## 📋 What You'll Need

### 1. **Hostinger VPS KVM2**
   - Recommended: KVM2 plan ($6.99/month)
   - 2 CPU cores, 8GB RAM, 100GB SSD
   - Perfect for 100+ users
   - Purchase at: https://www.hostinger.com/vps-hosting

### 2. **Domain Name** (Optional)
   - You can use Hostinger's domain services
   - Or use your VPS IP address initially

### 3. **API Keys** (Get these ready)
   - OpenAI API Key (for GPT-5 script generation)
   - Google AI API Tokens (for VEO 3.1 video generation)
   - Cloudinary Account (for video storage)

### 4. **GitHub Repository**
   - Your code should be on GitHub
   - Make sure `.env` is in `.gitignore` (already configured)

---

## 🚀 Part 1: Initial VPS Setup

### Step 1: Purchase and Setup VPS

1. **Log into Hostinger** → Go to **VPS** section
2. **Select Operating System**: 
   - Choose **Ubuntu 22.04 64-bit** (recommended)
   - Or **Ubuntu 22.04 with Node.js + OpenLiteSpeed** template
3. **Select Server Location**: Choose closest to your target audience
4. **Complete Purchase** and wait for setup email (2-5 minutes)

### Step 2: Get Your VPS Credentials

You'll receive an email with:
- **VPS IP Address**: `123.45.67.89` (example)
- **Root Password**: Save this securely!
- **SSH Access Details**

### Step 3: Connect to Your VPS

**On Windows:**
```bash
# Download and install PuTTY: https://www.putty.org/
# Open PuTTY and enter your VPS IP address
# Click "Open" and login as "root" with your password
```

**On Mac/Linux:**
```bash
# Open Terminal and run:
ssh root@YOUR_VPS_IP

# Example:
ssh root@123.45.67.89

# Enter your password when prompted
```

### Step 4: Update Your System

```bash
# Update package lists
sudo apt update

# Upgrade all packages
sudo apt upgrade -y

# This may take 5-10 minutes
```

---

## 📦 Part 2: Install Required Software

### Step 1: Install Node.js 20.x (LTS)

```bash
# Download Node.js 20.x setup script
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js and npm
sudo apt install -y nodejs

# Verify installation (should show v20.x.x)
node -v
npm -v
```

### Step 2: Install PostgreSQL Database

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify it's running
sudo systemctl status postgresql
# (Press 'q' to exit)
```

### Step 3: Configure PostgreSQL

```bash
# Switch to postgres user
sudo -i -u postgres

# Open PostgreSQL prompt
psql
```

Now create your database and user:

```sql
-- Create database for your app
CREATE DATABASE ai_video_generator;

-- Create user with password (CHANGE 'your_secure_password' to a strong password!)
CREATE USER videoapp WITH ENCRYPTED PASSWORD 'your_secure_password';

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE ai_video_generator TO videoapp;

-- Grant schema permissions (PostgreSQL 15+)
\c ai_video_generator
GRANT ALL ON SCHEMA public TO videoapp;

-- Exit PostgreSQL
\q
```

```bash
# Exit postgres user (back to root)
exit
```

### Step 4: Install PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Verify installation
pm2 -v
```

### Step 5: Remove Apache2 (if installed)

Hostinger VPS often comes with Apache2 pre-installed. We need Nginx instead:

```bash
# Stop Apache2
sudo systemctl stop apache2

# Disable Apache2 from starting on boot
sudo systemctl disable apache2

# Remove Apache2
sudo apt remove --purge apache2 apache2-utils -y

# Clean up
sudo apt autoremove -y
```

### Step 6: Install Nginx

```bash
# Install Nginx
sudo apt install nginx -y

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Check status
sudo systemctl status nginx
# (Press 'q' to exit)
```

### Step 7: Configure Firewall

```bash
# Install UFW firewall
sudo apt install ufw -y

# IMPORTANT: Allow SSH first (or you'll lock yourself out!)
sudo ufw allow OpenSSH
sudo ufw allow ssh
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 'Nginx Full'
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
# Type 'y' and press Enter

# Check firewall status
sudo ufw status
```

### Step 8: Install FFmpeg (Required for Video Merging)

```bash
# Install FFmpeg
sudo apt install ffmpeg -y

# Verify installation
ffmpeg -version
```

---

## 🔧 Part 3: Deploy Your Application

### Step 1: Clone Your Repository

```bash
# Create directory for your app
mkdir -p /var/www
cd /var/www

# Clone your repository (replace with your GitHub URL)
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git ai-video-generator

# Navigate to project
cd ai-video-generator

# Install dependencies
npm install

# This may take 5-10 minutes depending on internet speed
```

### Step 2: Setup Environment Variables

```bash
# Create .env file
nano .env
```

Copy and paste this, then **replace all values** with your actual credentials:

```env
# Database Configuration
DATABASE_URL=postgresql://videoapp:your_secure_password@localhost:5432/ai_video_generator

# Server Configuration
PORT=5000
NODE_ENV=production

# Session Secret (generate a random string)
SESSION_SECRET=your-random-session-secret-here-make-it-long-and-secure

# OpenAI API (for Script Generator)
OPENAI_API_KEY=sk-proj-your-openai-api-key-here

# Google VEO 3.1 API
VEO3_PROJECT_ID=5fdc3f34-d4c6-4afb-853a-aba4390bafdc

# Cloudinary Configuration (for video storage)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Google AI (for Text-to-Image)
# Note: API tokens are managed in admin panel, but you can set a default:
# GOOGLE_AI_API_KEY=your-google-ai-key (optional)
```

**How to save in nano:**
1. Press `Ctrl + X`
2. Press `Y` to confirm
3. Press `Enter` to save

### Step 3: Setup Database Tables

```bash
# Push database schema (creates all tables)
npm run db:push

# If that fails, try force push:
npm run db:push --force
```

### Step 4: Build the Application

```bash
# Build the frontend
npm run build
```

### Step 5: Test Your App Locally

```bash
# Start the app temporarily to test
npm start

# Open another terminal and test:
curl http://localhost:5000
# You should see HTML response

# Press Ctrl+C to stop the test
```

### Step 6: Start App with PM2

```bash
# Start your application with PM2
pm2 start npm --name "ai-video-generator" -- start

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot
pm2 startup

# Copy and run the command it provides (it will look like):
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root

# Check if app is running
pm2 status
pm2 logs ai-video-generator --lines 50
```

---

## 🌐 Part 4: Configure Nginx (Web Server)

### Step 1: Create Nginx Configuration

```bash
# Create new Nginx config file
sudo nano /etc/nginx/sites-available/ai-video-generator
```

Paste this configuration:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;
    # If you don't have a domain yet, use: server_name YOUR_VPS_IP;

    # Increase upload size for video files
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        
        # WebSocket support (for SSE - Server-Sent Events)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Disable caching for dynamic content
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for long-running video generation
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

**Save:** Press `Ctrl+X`, then `Y`, then `Enter`

### Step 2: Enable the Site

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/ai-video-generator /etc/nginx/sites-enabled/

# Remove default Nginx site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# If successful, reload Nginx
sudo systemctl reload nginx
```

### Step 3: Test Your Website

```bash
# Visit in your browser:
http://YOUR_VPS_IP

# Or if you configured a domain:
http://YOUR_DOMAIN.com
```

You should see your AI Video Generator homepage! 🎉

---

## 🔒 Part 5: Setup SSL Certificate (HTTPS)

### Step 1: Point Your Domain to VPS

**In Hostinger Domain DNS Settings:**

1. Log into Hostinger account
2. Go to **Domains** → Select your domain
3. Click **DNS / Nameservers**
4. Add an **A Record**:
   - **Type**: A
   - **Name**: `@` (for root domain) or `www` (for subdomain)
   - **Points to**: Your VPS IP address
   - **TTL**: 3600 (or leave default)
5. Click **Add Record**

**Wait 5-30 minutes** for DNS propagation.

### Step 2: Install Certbot (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y
```

### Step 3: Generate SSL Certificate

```bash
# Generate certificate (replace with YOUR domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow the prompts:
# - Enter your email address
# - Agree to terms of service (Y)
# - Choose option 2: Redirect HTTP to HTTPS (recommended)
```

### Step 4: Test Auto-Renewal

```bash
# Test certificate renewal
sudo certbot renew --dry-run

# Certificates auto-renew every 90 days
```

Your site is now secure! Visit `https://yourdomain.com` 🔒

---

## 👤 Part 6: Create Admin User

### Option 1: Direct Database Access

```bash
# Connect to PostgreSQL
sudo -i -u postgres
psql -d ai_video_generator

# Create admin user (change username and password!)
INSERT INTO users (id, username, password, is_admin, plan_type, plan_status, daily_video_count)
VALUES (
  gen_random_uuid(),
  'admin',
  '$2b$10$YourHashedPasswordHere',  -- See note below
  true,
  'empire',
  'active',
  0
);

# Exit
\q
exit
```

**Note:** You need to hash the password. Use this command on your VPS:

```bash
# Install bcrypt tool
npm install -g bcrypt-cli

# Generate password hash (replace 'YourPassword123' with your desired password)
bcrypt-cli hash 'YourPassword123' 10
# Copy the output and use it in the INSERT query above
```

### Option 2: Use Registration + Manual Admin Promotion

1. Visit your site: `https://yourdomain.com`
2. Click **Register** and create an account
3. Then promote to admin via database:

```bash
sudo -i -u postgres
psql -d ai_video_generator

-- Find your user ID
SELECT id, username, is_admin FROM users;

-- Promote to admin (replace 'your-user-id' with actual ID)
UPDATE users SET is_admin = true, plan_type = 'empire', plan_status = 'active' WHERE id = 'your-user-id';

\q
exit
```

---

## 🎬 Part 7: Configure API Tokens (Admin Panel)

### Step 1: Login as Admin

1. Visit `https://yourdomain.com`
2. Login with your admin account
3. You should see **Admin Panel** in the navigation

### Step 2: Add Google VEO API Tokens

1. Click **Admin Panel**
2. Go to **Token Management** tab
3. Click **Add Token**
4. Enter:
   - **Label**: "Token 1" (or any descriptive name)
   - **API Token**: Your Google VEO 3.1 API key
5. Click **Add Token**
6. **Repeat** to add 5-8 tokens for rotation

### Step 3: Configure Token Settings

1. In **Token Settings** tab:
   - **Rotation Interval**: 3600 seconds (1 hour)
   - **Error Threshold**: 3
   - **Recovery Time**: 600 seconds (10 minutes)
2. Click **Save Settings**

---

## 🎯 Part 8: Useful PM2 Commands

### Monitor Your Application

```bash
# View all running apps
pm2 list

# View real-time logs
pm2 logs ai-video-generator

# View last 100 lines of logs
pm2 logs ai-video-generator --lines 100

# Monitor CPU and memory usage
pm2 monit

# Restart application
pm2 restart ai-video-generator

# Stop application
pm2 stop ai-video-generator

# Delete from PM2
pm2 delete ai-video-generator
```

---

## 🔄 Part 9: Deploy Updates (Future)

When you update your code:

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Navigate to project
cd /var/www/ai-video-generator

# Pull latest code from GitHub
git pull origin main

# Install new dependencies (if any)
npm install

# Rebuild frontend
npm run build

# Update database schema (if changed)
npm run db:push

# Restart application with zero downtime
pm2 reload ai-video-generator

# Check logs
pm2 logs ai-video-generator --lines 50
```

---

## 🔍 Part 10: Troubleshooting

### App Not Starting

```bash
# Check PM2 logs
pm2 logs ai-video-generator --lines 100

# Common issues:
# 1. Database connection error - check DATABASE_URL in .env
# 2. Port already in use - check if another app is using port 5000
# 3. Missing environment variables - check .env file
```

### 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# If not running, check logs
pm2 logs ai-video-generator

# Restart app
pm2 restart ai-video-generator

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Test database connection
psql -U videoapp -d ai_video_generator -h localhost
# Enter your database password

# If successful, you'll see:
# ai_video_generator=>

# Exit with: \q
```

### Can't Access Website

```bash
# Check firewall
sudo ufw status

# Make sure ports 80 and 443 are allowed
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check Nginx status
sudo systemctl status nginx

# Restart Nginx
sudo systemctl restart nginx
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Clean up old logs
pm2 flush

# Clean npm cache
npm cache clean --force

# Remove old packages
sudo apt autoremove -y
sudo apt autoclean
```

---

## 📊 Part 11: Performance Optimization

### Enable PM2 Cluster Mode

Use all CPU cores for better performance:

```bash
# Stop current app
pm2 delete ai-video-generator

# Start in cluster mode (uses all CPU cores)
pm2 start npm --name "ai-video-generator" -i max -- start

# Save configuration
pm2 save
```

### Enable Nginx Gzip Compression

```bash
# Edit Nginx config
sudo nano /etc/nginx/nginx.conf

# Find the "http {" block and add:
# gzip on;
# gzip_vary on;
# gzip_min_length 1024;
# gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

# Save and reload Nginx
sudo systemctl reload nginx
```

---

## 🎓 Part 12: Daily Maintenance

### Monitor Disk Space

```bash
# Check disk usage weekly
df -h

# Clean up old logs if needed
pm2 flush
```

### Check Application Health

```bash
# Daily health check
pm2 status
pm2 logs ai-video-generator --lines 20
```

### Update System Security

```bash
# Monthly security updates
sudo apt update
sudo apt upgrade -y
```

---

## 📞 Support Resources

### Hostinger Support
- Help Center: https://support.hostinger.com
- Live Chat: Available 24/7 in Hostinger dashboard

### Your Application
- View logs: `pm2 logs ai-video-generator`
- Check status: `pm2 status`
- Restart: `pm2 restart ai-video-generator`

### Common Hostinger VPS Issues
- Can't connect via SSH: Check firewall settings in Hostinger panel
- Performance issues: Upgrade to KVM4 plan for more resources
- Need more storage: Add extra storage in Hostinger VPS settings

---

## ✅ Checklist: Deployment Complete

- [ ] VPS purchased and configured
- [ ] Node.js 20.x installed
- [ ] PostgreSQL installed and database created
- [ ] PM2 installed
- [ ] Nginx installed and configured
- [ ] Firewall configured
- [ ] FFmpeg installed
- [ ] Application cloned from GitHub
- [ ] Environment variables configured
- [ ] Database tables created (`npm run db:push`)
- [ ] Application built (`npm run build`)
- [ ] PM2 running application
- [ ] Nginx reverse proxy configured
- [ ] Domain pointed to VPS
- [ ] SSL certificate installed (HTTPS)
- [ ] Admin user created
- [ ] Google VEO API tokens added
- [ ] Application tested and working

---

## 🎉 Congratulations!

Your AI Video Generator is now live and production-ready on Hostinger VPS!

**Access your application:**
- **Website**: https://yourdomain.com
- **Admin Panel**: https://yourdomain.com/admin

**Next Steps:**
1. Create user accounts or let users register
2. Test all features (VEO Generator, Bulk Generator, Script Creator, etc.)
3. Monitor performance with `pm2 monit`
4. Set up regular backups of your database

---

## 💾 Bonus: Database Backup

### Create Backup Script

```bash
# Create backup directory
mkdir -p /root/backups

# Create backup script
nano /root/backup-db.sh
```

Paste this script:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/root/backups"
DB_NAME="ai_video_generator"
DB_USER="videoapp"

# Create backup
PGPASSWORD="your_secure_password" pg_dump -U $DB_USER $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 backups
ls -t $BACKUP_DIR/backup_*.sql | tail -n +8 | xargs rm -f

echo "Backup completed: backup_$DATE.sql"
```

```bash
# Make script executable
chmod +x /root/backup-db.sh

# Test backup
/root/backup-db.sh

# Schedule daily backups (runs at 2 AM)
crontab -e
# Add this line:
# 0 2 * * * /root/backup-db.sh
```

### Restore from Backup

```bash
# List backups
ls -lh /root/backups/

# Restore (replace YYYYMMDD_HHMMSS with actual backup file)
PGPASSWORD="your_secure_password" psql -U videoapp -d ai_video_generator < /root/backups/backup_YYYYMMDD_HHMMSS.sql
```

---

**Happy deploying! 🚀**

For questions or issues, check the Troubleshooting section or contact Hostinger support.
