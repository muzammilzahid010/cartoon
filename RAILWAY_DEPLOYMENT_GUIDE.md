# Railway Deployment Guide - AI Video Generator

## 🚀 Complete Guide to Deploy Your AI Video Generator on Railway

This guide will walk you through deploying your AI-powered video generation platform to Railway, a modern platform-as-a-service (PaaS) that makes deployment simple and scalable.

---

## 📋 Prerequisites

Before you begin, make sure you have:

- ✅ GitHub account (to connect your code repository)
- ✅ Railway account (free to start)
- ✅ VEO 3.1 API tokens (for video generation)
- ✅ OpenAI API key (for GPT-5 script generation)
- ✅ Cloudinary account (for video storage)
- ✅ Domain name (optional, Railway provides a free subdomain)

---

## 💰 Pricing Overview

**Railway Pricing (as of 2025):**
- **Starter Plan**: $5/month for $5 credit (pay-as-you-go)
- **Developer Plan**: $20/month for $20 credit + $0.20/GB network
- **Team Plan**: Custom pricing

**Resource Usage Estimates for 50 Users:**
- Compute: ~$10-15/month
- PostgreSQL Database: ~$5-8/month
- Bandwidth: ~$2-5/month
- **Total: ~$17-28/month**

---

## 🔧 Step 1: Prepare Your Repository

### 1.1 Push Code to GitHub

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit your code
git commit -m "Initial commit - AI Video Generator"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/yourusername/ai-video-generator.git
git branch -M main
git push -u origin main
```

### 1.2 Create Railway Configuration File

Create a file called `railway.json` in your project root:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run dev",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 1.3 Update Environment Variable Names

Railway will automatically provide a `DATABASE_URL` for PostgreSQL. Make sure your app uses it.

Check `server/db.ts` - it should already use `process.env.DATABASE_URL`.

---

## 🚂 Step 2: Deploy to Railway

### 2.1 Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Click **"Start a New Project"**
3. Sign up with GitHub (recommended for easy integration)

### 2.2 Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Authorize Railway to access your GitHub account
4. Select your `ai-video-generator` repository
5. Railway will automatically detect it's a Node.js project

### 2.3 Add PostgreSQL Database

1. In your Railway project dashboard, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically:
   - Create a PostgreSQL instance
   - Generate a `DATABASE_URL` environment variable
   - Link it to your application

---

## 🔐 Step 3: Configure Environment Variables

### 3.1 Add All Required Secrets

In Railway dashboard:

1. Click on your **service** (not the database)
2. Go to **"Variables"** tab
3. Click **"+ New Variable"** and add each of these:

#### Required Environment Variables:

```env
# Node Environment
NODE_ENV=production

# Database (automatically provided by Railway PostgreSQL)
# DATABASE_URL=postgresql://... (auto-generated, don't add manually)

# Session Secret (generate a random string)
SESSION_SECRET=your-super-secret-random-string-here

# VEO 3.1 API Configuration
VEO_PROJECT_ID=5fdc3f34-d4c6-4afb-853a-aba4390bafdc

# Note: VEO API tokens are stored in database, not as env vars
# You'll add them through the admin panel after deployment

# OpenAI API Key
OPENAI_API_KEY=sk-your-openai-api-key-here

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Optional: fal.ai for video merging (if using)
FAL_KEY=your-fal-ai-key-here

# Port (Railway automatically sets this)
PORT=5000
```

### 3.2 Generate Session Secret

Generate a secure random string for `SESSION_SECRET`:

```bash
# On Mac/Linux:
openssl rand -base64 32

# On Windows (PowerShell):
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# Or use an online generator:
# https://generate-secret.vercel.app/32
```

### 3.3 Railway Variable Editor

Railway provides two ways to add variables:

**Option 1: UI Editor** (easier)
- Click "+ New Variable"
- Enter key and value
- Click "Add"

**Option 2: Raw Editor** (faster for multiple vars)
- Click "Raw Editor"
- Paste all variables in `KEY=value` format
- Click "Update Variables"

---

## 🗄️ Step 4: Initialize Database Schema

### 4.1 Access Railway Database Terminal

1. In Railway dashboard, click your **PostgreSQL** service
2. Go to **"Data"** tab
3. Click **"Connect"** to see connection details

### 4.2 Run Database Migration

**Option A: From Railway Deployment Logs**

Railway will automatically run your build. After deployment:

1. Click on your **app service**
2. Go to **"Deployments"** tab
3. Click the latest deployment
4. In the deployment view, click **"View Logs"**
5. Verify there are no database errors

**Option B: Manual Migration via Railway CLI**

Install Railway CLI:

```bash
# Mac/Linux
brew install railway

# Windows
scoop install railway

# Or use npm
npm install -g @railway/cli
```

Login and run migration:

```bash
# Login to Railway
railway login

# Link to your project
railway link

# Run database push
railway run npm run db:push
```

**Option C: Add Build Command**

In Railway dashboard → Your service → Settings → Build:

Add to **"Build Command"**:
```bash
npm install && npm run db:push
```

---

## 👤 Step 5: Create Admin User

After your app deploys successfully, you need to create an admin user.

### 5.1 Access Deployed Application

1. In Railway dashboard, click your **app service**
2. Go to **"Settings"** tab
3. Find **"Domains"** section
4. Click **"Generate Domain"**
5. Railway will provide a URL like: `your-app.up.railway.app`
6. Click the URL to open your deployed app

### 5.2 Register First User

1. Go to `/login` on your deployed app
2. Click "Register" or "Sign Up"
3. Create your admin account (first user is automatically admin)

### 5.3 Add VEO API Tokens

1. Login to your admin account
2. Navigate to **Admin Panel** (should appear in navigation)
3. Go to **"API Token Management"** section
4. Add your VEO 3.1 API tokens one by one, or use bulk import
5. Enable automatic token rotation if desired

---

## 🌐 Step 6: Custom Domain (Optional)

### 6.1 Add Custom Domain

1. In Railway dashboard → Your service → **"Settings"**
2. Scroll to **"Domains"** section
3. Click **"+ Custom Domain"**
4. Enter your domain (e.g., `videogen.yourdomain.com`)

### 6.2 Configure DNS

Railway will show you DNS records to add. In your domain registrar:

**For subdomain (recommended):**
```
Type: CNAME
Name: videogen (or your chosen subdomain)
Value: your-app.up.railway.app
TTL: 3600
```

**For root domain:**
```
Type: A
Name: @
Value: [IP provided by Railway]
TTL: 3600
```

### 6.3 SSL Certificate

Railway automatically provisions SSL certificates via Let's Encrypt. No action needed!

Wait 5-10 minutes for DNS propagation and SSL setup.

---

## 🔍 Step 7: Monitoring & Logs

### 7.1 View Application Logs

1. Railway dashboard → Your service
2. Click **"Deployments"** tab
3. Click on the active deployment
4. View real-time logs

### 7.2 Monitor Resource Usage

1. Click **"Metrics"** tab
2. View:
   - CPU usage
   - Memory usage
   - Network bandwidth
   - Database connections

### 7.3 Set Up Alerts (Optional)

1. Go to project **"Settings"**
2. Enable **"Usage Alerts"**
3. Set spending limits

---

## ⚙️ Step 8: Production Optimizations

### 8.1 Update Start Command for Production

In Railway dashboard → Your service → Settings:

Change **"Start Command"** from `npm run dev` to:

```bash
npm start
```

Then update your `package.json`:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "start": "NODE_ENV=production tsx server/index.ts",
    "build": "echo 'No build step needed for pure Node.js app'",
    "db:push": "drizzle-kit push"
  }
}
```

### 8.2 Enable Health Checks

Add a health check endpoint in `server/routes.ts`:

```typescript
// Health check for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});
```

Then configure in Railway:
1. Settings → **"Health Check"**
2. Path: `/health`
3. Timeout: 30 seconds

### 8.3 Configure Restart Policy

In Railway dashboard → Settings:

- **Restart Policy**: "On Failure"
- **Max Retries**: 10

---

## 📊 Step 9: Database Backups

### 9.1 Railway Automatic Backups

Railway PostgreSQL includes:
- **Point-in-time recovery** (7-day retention)
- **Automatic daily backups**

### 9.2 Manual Backup (Recommended)

Set up weekly manual backups:

```bash
# Install Railway CLI
railway login
railway link

# Backup command
railway run pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore if needed
railway run psql $DATABASE_URL < backup-20251106.sql
```

### 9.3 Schedule Automated Backups

Use GitHub Actions to schedule backups (create `.github/workflows/backup.yml`):

```yaml
name: Database Backup
on:
  schedule:
    - cron: '0 2 * * 0' # Every Sunday at 2 AM
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Railway CLI
        run: npm install -g @railway/cli
      - name: Backup Database
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          railway link --project ${{ secrets.RAILWAY_PROJECT_ID }}
          railway run pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
      - name: Upload to Storage
        # Add your preferred cloud storage upload here
```

---

## 🚨 Troubleshooting

### Issue: App Won't Start

**Solution:**
1. Check deployment logs for errors
2. Verify all environment variables are set
3. Ensure `DATABASE_URL` is connected
4. Check that `package.json` scripts are correct

### Issue: Database Connection Error

**Solution:**
```bash
# Verify DATABASE_URL format
railway run echo $DATABASE_URL

# Should look like:
# postgresql://postgres:password@host:5432/railway

# Test connection
railway run npm run db:push
```

### Issue: Out of Memory

**Solution:**
1. Check Metrics tab for memory usage
2. Upgrade to higher tier plan if needed
3. Optimize video processing (limit concurrent operations)

### Issue: 502 Bad Gateway

**Solution:**
1. Check that app is binding to `0.0.0.0:$PORT`
2. Verify health check endpoint responds
3. Check deployment logs for startup errors

### Issue: Environment Variables Not Loading

**Solution:**
1. Redeploy after adding variables
2. Check "Raw Editor" to verify format
3. Remove any quotes around values (Railway handles this)

---

## 🔄 Step 10: Continuous Deployment

Railway automatically redeploys when you push to GitHub!

### 10.1 Enable Auto-Deploy

1. Railway dashboard → Your service → **"Settings"**
2. Find **"Deploys"** section
3. Ensure **"Auto-deploys"** is enabled
4. Select branch: `main`

### 10.2 Deploy New Changes

```bash
# Make your changes
git add .
git commit -m "Add new feature"
git push origin main

# Railway automatically:
# 1. Detects the push
# 2. Builds your app
# 3. Runs migrations (if configured)
# 4. Deploys new version
# 5. Zero-downtime deployment
```

### 10.3 Rollback If Needed

If a deployment fails:

1. Railway dashboard → **"Deployments"**
2. Find the last working deployment
3. Click **"Redeploy"**

---

## 📈 Scaling for Growth

### From 50 to 100+ Users

**Monitor these metrics:**
- CPU usage consistently > 80%
- Memory usage > 90%
- Database connections maxing out
- Slow response times

**Upgrade options:**

1. **Vertical Scaling** (Railway auto-scales)
   - Railway automatically allocates more resources
   - You pay for what you use

2. **Database Scaling**
   - Upgrade PostgreSQL to higher tier
   - Enable connection pooling

3. **Add Redis for Sessions** (Optional)
   - Reduce database load
   - Railway marketplace → Add Redis
   - Update session store to use Redis

---

## ✅ Deployment Checklist

Before going live:

- [ ] All environment variables configured
- [ ] Database schema deployed (`npm run db:push`)
- [ ] Admin user created
- [ ] VEO API tokens added to admin panel
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active (automatic)
- [ ] Health check endpoint working
- [ ] Test video generation workflow
- [ ] Test script creator
- [ ] Test bulk generation
- [ ] Test video history and merging
- [ ] Set up monitoring alerts
- [ ] Configure backup strategy
- [ ] Test user registration/login
- [ ] Verify admin panel access controls

---

## 🎯 Post-Deployment Tasks

### Week 1:
- [ ] Monitor logs daily for errors
- [ ] Track resource usage (CPU, RAM, bandwidth)
- [ ] Test all features with real users
- [ ] Collect user feedback

### Week 2-4:
- [ ] Optimize based on usage patterns
- [ ] Set spending alerts if needed
- [ ] Consider adding analytics (optional)
- [ ] Plan scaling if user growth exceeds expectations

---

## 💡 Pro Tips

1. **Use Railway CLI for Quick Tasks**
   ```bash
   railway run npm run db:push  # Push schema changes
   railway logs                  # View live logs
   railway shell                 # SSH into container
   ```

2. **Environment-Specific Variables**
   - Railway automatically sets `NODE_ENV=production`
   - Use this to enable production optimizations

3. **Database Connection Pooling**
   - Your app already uses Neon serverless driver
   - It handles connection pooling automatically

4. **Cost Optimization**
   - Use Railway's sleep feature for staging environments
   - Monitor bandwidth usage (largest cost factor)
   - Cache static assets

5. **Security Best Practices**
   - Never commit `.env` files
   - Rotate API keys regularly
   - Use Railway secrets for sensitive data
   - Enable 2FA on Railway account

---

## 📞 Support Resources

- **Railway Documentation**: [docs.railway.app](https://docs.railway.app)
- **Railway Discord**: [discord.gg/railway](https://discord.gg/railway)
- **Railway Status**: [status.railway.app](https://status.railway.app)
- **Railway Changelog**: [railway.app/changelog](https://railway.app/changelog)

---

## 🎉 You're Done!

Your AI Video Generator is now live on Railway! 

**Your deployment URL**: `https://your-app.up.railway.app`

Share it with your users and start generating amazing AI videos! 🚀

---

## Need Help?

If you encounter any issues during deployment, check:
1. Deployment logs in Railway dashboard
2. This troubleshooting guide
3. Railway documentation
4. Railway community Discord

Happy deploying! 🎊
