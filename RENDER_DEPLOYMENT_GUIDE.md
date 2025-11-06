# Render Deployment Guide - AI Video Generator

## 🚀 Complete Beginner's Guide to Deploy Your AI Video Generator on Render

This guide will walk you through every step of deploying your AI-powered video generation platform to Render, a modern cloud platform that makes deployment simple, even if you've never deployed a web application before.

---

## 📚 What is Render?

Render is a cloud platform that automatically builds and runs your web applications. Think of it as a service that takes your code and makes it accessible on the internet 24/7, handling all the technical server management for you.

**Why Render?**
- ✅ Beginner-friendly with simple setup
- ✅ Automatic deployments from GitHub
- ✅ Free SSL certificates (HTTPS)
- ✅ Managed PostgreSQL database
- ✅ Great documentation and support
- ✅ Predictable pricing

---

## 💰 Pricing Overview

**Render Pricing (as of 2025):**

| Service | Free Tier | Paid Plans |
|---------|-----------|------------|
| **Web Service** | ❌ No free tier | From $7/month |
| **PostgreSQL** | ✅ Free (limited) | From $7/month |
| **Bandwidth** | 100 GB/month free | $0.10/GB after |

**Recommended Setup for 50 Users:**
- Web Service (Starter): **$7/month**
- PostgreSQL (Starter): **$7/month**
- Estimated bandwidth: **~$2-3/month**
- **Total: ~$16-17/month**

**Free Tier Option for Testing:**
- Web Service: Free (spins down after inactivity)
- PostgreSQL: Free (90-day limit, 1GB storage)
- Good for testing before going to production!

---

## 📋 What You'll Need (Prerequisites)

Before starting, gather these items:

### 1. Accounts (Free to Create)
- [ ] **GitHub account** - [Sign up at github.com](https://github.com/signup)
- [ ] **Render account** - [Sign up at render.com](https://render.com/register)

### 2. API Keys & Credentials
- [ ] **VEO 3.1 API tokens** - Your Google Cloud VEO API keys
- [ ] **OpenAI API key** - For GPT-5 script generation
- [ ] **Cloudinary account** - For video storage ([cloudinary.com](https://cloudinary.com))

### 3. Your Application Code
- [ ] This AI Video Generator project

Don't worry if this seems like a lot - we'll walk through each step!

---

## 🗂️ Step 1: Prepare Your Code for Deployment

### 1.1 Install Git (If Not Already Installed)

**Windows:**
1. Download from [git-scm.com](https://git-scm.com/download/win)
2. Run the installer with default settings
3. Open "Git Bash" from Start menu

**Mac:**
1. Open Terminal (Applications → Utilities → Terminal)
2. Type: `git --version`
3. If not installed, it will prompt you to install

**Linux:**
```bash
sudo apt install git  # Ubuntu/Debian
sudo yum install git  # CentOS/RHEL
```

### 1.2 Push Your Code to GitHub

Open terminal/command prompt in your project folder:

```bash
# 1. Initialize git repository (if not already done)
git init

# 2. Add all your files
git add .

# 3. Create your first commit
git commit -m "Initial commit - AI Video Generator"
```

Now create a GitHub repository:

1. Go to [github.com](https://github.com) and login
2. Click the **"+"** icon (top right) → **"New repository"**
3. Repository name: `ai-video-generator` (or your preferred name)
4. Keep it **Private** (recommended) or Public
5. **Don't** check any of the initialize options (no README, no .gitignore)
6. Click **"Create repository"**

Copy the commands shown on GitHub and run them:

```bash
# Connect your local code to GitHub
git remote add origin https://github.com/YOUR-USERNAME/ai-video-generator.git

# Push your code
git branch -M main
git push -u origin main
```

✅ **Success!** Your code is now on GitHub.

### 1.3 Create Build Configuration

Create a new file called `render.yaml` in your project root:

```yaml
services:
  # Web Service (Your Node.js App)
  - type: web
    name: ai-video-generator
    env: node
    region: oregon
    plan: starter
    buildCommand: npm install && npm run db:push
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: ai-video-generator-db
          property: connectionString
      - key: SESSION_SECRET
        generateValue: true
      - key: PORT
        value: 5000

databases:
  # PostgreSQL Database
  - name: ai-video-generator-db
    plan: starter
    region: oregon
```

Save this file and commit it:

```bash
git add render.yaml
git commit -m "Add Render configuration"
git push origin main
```

### 1.4 Update package.json Scripts

Make sure your `package.json` has these scripts:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "start": "NODE_ENV=production tsx server/index.ts",
    "db:push": "drizzle-kit push"
  }
}
```

If you need to update it, commit and push the changes:

```bash
git add package.json
git commit -m "Update npm scripts for production"
git push origin main
```

---

## 🎯 Step 2: Create Render Account & Connect GitHub

### 2.1 Sign Up for Render

1. Go to [render.com](https://render.com)
2. Click **"Get Started"** or **"Sign Up"**
3. Choose **"Sign up with GitHub"** (easiest option)
4. Authorize Render to access your GitHub account

### 2.2 Authorize Repository Access

1. Render will ask for repository access
2. Choose **"Only select repositories"**
3. Select your `ai-video-generator` repository
4. Click **"Install & Authorize"**

✅ **Connected!** Render can now access your code.

---

## 🗄️ Step 3: Create PostgreSQL Database

### 3.1 Create Database Service

1. From Render Dashboard, click **"New +"** (top right)
2. Select **"PostgreSQL"**

### 3.2 Configure Database

Fill in these details:

- **Name**: `ai-video-generator-db`
- **Database**: `video_generator` (auto-filled)
- **User**: `video_generator_user` (auto-filled)
- **Region**: Choose closest to you
  - `Oregon (US West)` - West Coast USA
  - `Ohio (US East)` - East Coast USA
  - `Frankfurt` - Europe
  - `Singapore` - Asia
- **PostgreSQL Version**: `16` (latest)
- **Plan**: 
  - **Free** - For testing (90 days, 1GB storage)
  - **Starter ($7/mo)** - For production (10GB storage, daily backups)

### 3.3 Create Database

1. Click **"Create Database"**
2. Wait 2-3 minutes for provisioning
3. Database will show as "Available" when ready

### 3.4 Save Database Connection Info

Once created, you'll see:

- **Internal Database URL** - Copy this, you'll need it soon
- **External Database URL** - For connecting from your computer

✅ **Database ready!** Don't worry, Render will automatically connect it to your app.

---

## 🌐 Step 4: Create Web Service (Your App)

### 4.1 Create New Web Service

1. From Render Dashboard, click **"New +"** → **"Web Service"**
2. Find your `ai-video-generator` repository
3. Click **"Connect"**

### 4.2 Configure Web Service

**Basic Settings:**
- **Name**: `ai-video-generator` (or your preferred name)
- **Region**: **Same as your database** (important!)
- **Branch**: `main`
- **Root Directory**: Leave empty
- **Runtime**: `Node`

**Build & Deploy Settings:**
- **Build Command**: 
  ```bash
  npm install && npm run db:push
  ```
- **Start Command**: 
  ```bash
  npm start
  ```

**Plan Selection:**
- **Free** - For testing only (spins down after 15 min inactivity)
- **Starter ($7/mo)** - Recommended for production
- **Standard ($25/mo)** - For high traffic

Choose **Starter** for 50 users.

### 4.3 Don't Click Create Yet!

We need to add environment variables first. Scroll down...

---

## 🔐 Step 5: Add Environment Variables

Still on the web service creation page, scroll to **"Environment Variables"** section.

### 5.1 Add Required Variables

Click **"Add Environment Variable"** for each of these:

#### 1. Database Connection
```
Key: DATABASE_URL
Value: Click "Add from database" → Select "ai-video-generator-db" → "Internal Connection String"
```

#### 2. Session Secret (Security)
```
Key: SESSION_SECRET
Value: Click "Generate" button
```

#### 3. Node Environment
```
Key: NODE_ENV
Value: production
```

#### 4. VEO Configuration
```
Key: VEO_PROJECT_ID
Value: 5fdc3f34-d4c6-4afb-853a-aba4390bafdc
```

#### 5. OpenAI API Key
```
Key: OPENAI_API_KEY
Value: sk-your-openai-api-key-here
```
(Get from [platform.openai.com/api-keys](https://platform.openai.com/api-keys))

#### 6. Cloudinary Configuration
```
Key: CLOUDINARY_CLOUD_NAME
Value: your-cloud-name

Key: CLOUDINARY_API_KEY
Value: your-api-key

Key: CLOUDINARY_API_SECRET
Value: your-api-secret
```
(Get from [cloudinary.com/console](https://cloudinary.com/console))

#### 7. Port (Optional)
```
Key: PORT
Value: 5000
```

### 5.2 Optional: fal.ai for Video Merging
```
Key: FAL_KEY
Value: your-fal-ai-key-here
```

### 5.3 Review All Variables

Before proceeding, verify you have:
- ✅ DATABASE_URL (from database)
- ✅ SESSION_SECRET (generated)
- ✅ NODE_ENV (production)
- ✅ VEO_PROJECT_ID
- ✅ OPENAI_API_KEY
- ✅ CLOUDINARY_CLOUD_NAME
- ✅ CLOUDINARY_API_KEY
- ✅ CLOUDINARY_API_SECRET
- ✅ PORT (5000)

---

## 🚀 Step 6: Deploy Your Application

### 6.1 Create Service

1. Scroll to bottom of page
2. Click **"Create Web Service"**

### 6.2 Watch the Build Process

Render will now:
1. ✅ Clone your code from GitHub
2. ✅ Install dependencies (`npm install`)
3. ✅ Run database migration (`npm run db:push`)
4. ✅ Start your application (`npm start`)

**This takes 3-5 minutes.** You can watch live logs in the "Logs" tab.

### 6.3 Check Build Logs

Look for these success messages:
```
==> Installing dependencies
==> Running build command: npm install && npm run db:push
==> Starting service with: npm start
==> Your service is live 🎉
```

### 6.4 Get Your App URL

Once deployed, you'll see:
```
Your service is live at https://ai-video-generator.onrender.com
```

✅ **Deployed!** Click the URL to open your app.

---

## 👤 Step 7: Create Your Admin Account

### 7.1 Open Your Deployed App

Click your Render URL: `https://your-app-name.onrender.com`

### 7.2 Register First User

1. You'll see the login page
2. Click **"Register"** or **"Sign Up"**
3. Choose a username and password
4. Click **"Create Account"**

**Important:** The first user automatically becomes the admin!

### 7.3 Access Admin Panel

1. After login, you should see **"Admin Panel"** in navigation
2. Click it to access admin features

### 7.4 Add VEO API Tokens

1. In Admin Panel, find **"API Token Management"**
2. Click **"Add Token"** or use **"Bulk Import"**
3. Add your VEO 3.1 API tokens
4. Label each token (e.g., "Token 1", "Token 2")
5. Save

✅ **Ready to generate videos!**

---

## 🌐 Step 8: Custom Domain (Optional)

### 8.1 Purchase Domain (If Needed)

Buy from:
- Namecheap ([namecheap.com](https://namecheap.com))
- Google Domains ([domains.google](https://domains.google))
- Cloudflare ([cloudflare.com](https://cloudflare.com))

### 8.2 Add Domain in Render

1. Go to your web service in Render
2. Click **"Settings"** tab
3. Scroll to **"Custom Domain"**
4. Click **"Add Custom Domain"**
5. Enter your domain (e.g., `videogen.yourdomain.com`)

### 8.3 Configure DNS Records

Render will show you DNS records. In your domain registrar:

**For Subdomain (Recommended):**
```
Type: CNAME
Name: videogen
Value: your-app-name.onrender.com
TTL: 3600
```

**For Root Domain:**
```
Type: A
Name: @
Value: [IP shown by Render]
TTL: 3600

Type: AAAA (IPv6)
Name: @
Value: [IPv6 shown by Render]
TTL: 3600
```

### 8.4 Wait for SSL Certificate

- Render automatically provisions SSL (HTTPS)
- Wait 5-15 minutes for DNS propagation
- Certificate status will show as "Verified"

✅ **Custom domain ready!**

---

## 📊 Step 9: Monitor Your Application

### 9.1 View Logs

1. Render Dashboard → Your web service
2. Click **"Logs"** tab
3. View real-time application logs
4. Filter by:
   - Deploy logs
   - Runtime logs
   - All logs

### 9.2 Check Metrics

Click **"Metrics"** tab to see:
- **CPU Usage** - Should stay under 80%
- **Memory Usage** - Should stay under 90%
- **Response Times** - Target under 500ms
- **Request Count** - Traffic patterns

### 9.3 Set Up Notifications

1. Go to **"Settings"** → **"Notifications"**
2. Add your email
3. Enable alerts for:
   - ✅ Deploy failures
   - ✅ Service crashes
   - ✅ High CPU/memory usage

---

## 🔄 Step 10: Automatic Deployments

### 10.1 How Auto-Deploy Works

Render automatically redeploys when you push to GitHub!

```bash
# Make changes to your code
git add .
git commit -m "Add new feature"
git push origin main

# Render automatically:
# 1. Detects the push
# 2. Builds your app
# 3. Runs tests (if configured)
# 4. Deploys new version
# 5. Zero-downtime deployment
```

### 10.2 Configure Auto-Deploy

1. Web service → **"Settings"**
2. Find **"Build & Deploy"** section
3. Ensure **"Auto-Deploy"** is **ON**
4. Choose branch: `main`

### 10.3 Manual Deploy (If Needed)

Sometimes you want to deploy without code changes:

1. Go to your web service
2. Click **"Manual Deploy"** (top right)
3. Choose **"Clear build cache & deploy"** or **"Deploy latest commit"**

---

## 🛡️ Step 11: Database Backups

### 11.1 Automatic Backups (Paid Plans)

Render Starter PostgreSQL plan includes:
- **Daily automatic backups**
- **7-day retention**
- Point-in-time recovery

### 11.2 Manual Backup

Create manual backups for extra safety:

1. Go to your PostgreSQL service
2. Click **"Backups"** tab
3. Click **"Create Backup"**
4. Name it (e.g., "Before major update")

### 11.3 Download Backup

To download a backup to your computer:

1. Click the backup in the list
2. Click **"Download"**
3. Save the `.sql` file somewhere safe

### 11.4 Restore from Backup

If something goes wrong:

1. Go to **"Backups"** tab
2. Find the backup to restore
3. Click **"Restore"**
4. Confirm restoration

⚠️ **Warning:** Restore will overwrite current data!

---

## 🔧 Step 12: Advanced Configuration

### 12.1 Health Checks

Render automatically monitors your app, but you can configure custom checks:

1. **Settings** → **"Health & Alerts"**
2. **Health Check Path**: `/health`
3. Add endpoint to your code (`server/routes.ts`):

```typescript
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
});
```

### 12.2 Environment Groups

For managing variables across multiple services:

1. Dashboard → **"Environment Groups"**
2. Click **"New Environment Group"**
3. Name it (e.g., "API Keys")
4. Add variables that apply to all services
5. Link to your services

### 12.3 Scaling Your Service

As you grow beyond 50 users:

**Vertical Scaling** (More Resources):
1. Go to **"Settings"** → **"Plan"**
2. Upgrade to higher tier:
   - **Standard**: $25/mo - 2GB RAM
   - **Pro**: $85/mo - 4GB RAM
   - **Pro Plus**: $200/mo - 8GB RAM

**Horizontal Scaling** (More Instances):
- Available on Pro plans and above
- Automatically balance traffic across instances

---

## 🚨 Troubleshooting Common Issues

### ❌ Issue: Build Failed

**Error:** `npm install failed`

**Solution:**
1. Check **"Logs"** tab for specific error
2. Verify `package.json` is valid
3. Try "Clear build cache & deploy"

---

### ❌ Issue: Database Connection Error

**Error:** `Connection refused` or `ECONNREFUSED`

**Solution:**
1. Verify `DATABASE_URL` environment variable is set
2. Check database is in same region as web service
3. Use **Internal Connection String** (not External)

To check:
```bash
# In Render Shell (Settings → Shell)
echo $DATABASE_URL
```

---

### ❌ Issue: App Crashes on Startup

**Error:** `Service exited with code 1`

**Solution:**
1. Check logs for error message
2. Common causes:
   - Missing environment variables
   - Database schema not pushed
   - Port binding issues

Verify all environment variables:
- DATABASE_URL
- SESSION_SECRET
- OPENAI_API_KEY
- CLOUDINARY credentials

---

### ❌ Issue: Environment Variables Not Loading

**Error:** `undefined` when accessing `process.env.VARIABLE`

**Solution:**
1. Go to **"Environment"** tab
2. Click **"Edit"** on the variable
3. Save again (triggers redeploy)
4. Check variable has no extra spaces

---

### ❌ Issue: Database Migration Fails

**Error:** `drizzle-kit push failed`

**Solution:**
```bash
# Option 1: Force push
npm run db:push --force

# Option 2: Manual migration
# In Render Shell:
npm install
npm run db:push
```

---

### ❌ Issue: App Works but Videos Don't Generate

**Checklist:**
- [ ] VEO API tokens added in admin panel?
- [ ] OpenAI API key valid and has credits?
- [ ] Cloudinary credentials correct?
- [ ] Check logs for API errors

---

### ❌ Issue: Slow Response Times

**Solutions:**
1. Check **"Metrics"** for CPU/memory usage
2. If consistently high, upgrade plan
3. Optimize database queries
4. Consider adding Redis for caching

---

### ❌ Issue: Service Spins Down (Free Tier)

**Problem:** Free tier services spin down after 15 min of inactivity

**Solutions:**
- Upgrade to **Starter plan** ($7/mo) - stays always on
- Use external monitoring (UptimeRobot, etc.) to keep alive

---

## 📈 Step 13: Performance Optimization

### 13.1 Enable Compression

Add to your Express app (in `server/index.ts`):

```typescript
import compression from 'compression';
app.use(compression());
```

Install package:
```bash
npm install compression
npm install --save-dev @types/compression
```

### 13.2 Database Connection Pooling

Your app uses Neon PostgreSQL serverless driver which handles pooling automatically. No action needed!

### 13.3 Static Asset Caching

Already configured in your Vite setup. Videos are served from Cloudinary CDN.

### 13.4 Monitor Performance

Use Render Metrics to track:
- Average response time (target: <500ms)
- 95th percentile response time
- Error rate (target: <1%)

---

## 💵 Step 14: Cost Management

### 14.1 Monitor Spending

1. Dashboard → **"Billing"**
2. View current month charges
3. See breakdown by service

### 14.2 Set Spending Limits

1. **"Billing"** → **"Spending Limits"**
2. Set monthly budget alert
3. Get email when approaching limit

### 14.3 Optimize Costs

**Reduce bandwidth costs:**
- Videos stored on Cloudinary (not Render)
- Use Cloudinary's CDN for delivery
- Enable Cloudinary optimizations

**Database costs:**
- Start with Starter plan ($7/mo)
- Monitor storage usage
- Clean up old videos periodically

**Compute costs:**
- Use appropriate plan size
- Don't over-provision

---

## ✅ Pre-Launch Checklist

Before sharing with users:

### Technical Setup
- [ ] Application deployed successfully
- [ ] Database connected and migrated
- [ ] All environment variables configured
- [ ] SSL certificate active (HTTPS)
- [ ] Custom domain configured (optional)
- [ ] Health check endpoint working
- [ ] Auto-deploy enabled

### Application Setup
- [ ] Admin account created
- [ ] VEO API tokens added
- [ ] Test video generation (landscape)
- [ ] Test video generation (portrait)
- [ ] Test bulk generation
- [ ] Test script creator
- [ ] Test video history
- [ ] Test video merging
- [ ] Test regenerate feature

### Monitoring & Backup
- [ ] Email notifications enabled
- [ ] First manual backup created
- [ ] Metrics dashboard reviewed
- [ ] Logs accessible

### Security
- [ ] Strong admin password
- [ ] API keys stored securely
- [ ] No secrets in GitHub code
- [ ] Session secret generated

---

## 📱 Step 15: Ongoing Maintenance

### Daily Tasks (Automatic)
- ✅ Render monitors uptime
- ✅ Auto-deploys on code push
- ✅ Daily database backups (Starter plan)

### Weekly Tasks (Manual)
- [ ] Review error logs
- [ ] Check CPU/memory metrics
- [ ] Monitor API usage costs
- [ ] Review user feedback

### Monthly Tasks
- [ ] Review billing/costs
- [ ] Create manual backup
- [ ] Update dependencies
- [ ] Test all features

---

## 🎓 Learning Resources

### Official Documentation
- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Node.js on Render**: [render.com/docs/deploy-node-express-app](https://render.com/docs/deploy-node-express-app)
- **PostgreSQL on Render**: [render.com/docs/databases](https://render.com/docs/databases)

### Community Support
- **Render Community**: [community.render.com](https://community.render.com)
- **Render Status**: [status.render.com](https://status.render.com)
- **Support Email**: support@render.com

### Video Tutorials
- Search YouTube for "Render deployment tutorial"
- Official Render channel has great guides

---

## 🎯 Quick Reference Commands

### Git Commands
```bash
# Push code changes
git add .
git commit -m "Description of changes"
git push origin main

# Check status
git status

# View history
git log --oneline
```

### Database Commands (In Render Shell)
```bash
# Check connection
echo $DATABASE_URL

# Run migration
npm run db:push

# Force migration
npm run db:push --force
```

### Debugging Commands
```bash
# View environment variables
env

# Check Node version
node --version

# Check npm version
npm --version
```

---

## 🎉 Success! You're Live!

Congratulations! Your AI Video Generator is now deployed and accessible to users worldwide!

### Your URLs:
- **Render URL**: `https://your-app-name.onrender.com`
- **Custom Domain**: `https://your-domain.com` (if configured)

### What You've Accomplished:
✅ Deployed a full-stack Node.js application  
✅ Set up a production PostgreSQL database  
✅ Configured automatic deployments from GitHub  
✅ Secured your app with HTTPS  
✅ Set up monitoring and backups  
✅ Launched a complete AI video generation platform  

### Next Steps:
1. 🎨 Share with your first users
2. 📊 Monitor usage and performance
3. 💡 Gather feedback and iterate
4. 🚀 Scale as you grow

---

## 📞 Need Help?

If you run into any issues:

1. **Check this guide's troubleshooting section**
2. **Review Render logs** for error messages
3. **Search Render Community** for similar issues
4. **Contact Render Support** - They're very responsive!

---

## 💡 Pro Tips for Beginners

1. **Start with Free Tier**
   - Test everything before paying
   - Upgrade when ready for production

2. **Use Render's Built-in Shell**
   - Settings → Shell tab
   - Run commands directly on your server

3. **Enable GitHub Auto-Deploy**
   - Push to GitHub = automatic deployment
   - No manual steps needed

4. **Watch Your Logs**
   - Errors show up here first
   - Filter by time period

5. **Create Backups Before Big Changes**
   - Manual backup = safety net
   - Restore if something breaks

6. **Ask for Help**
   - Render community is friendly
   - No question is too basic

---

## 🎊 You Did It!

You've successfully deployed a complex AI application to the cloud. This is a significant achievement - many beginners find deployment challenging, but you've conquered it!

Now go create amazing AI-generated videos! 🎬🚀

---

**Last Updated:** November 2025  
**Guide Version:** 1.0  
**Maintained by:** Your development team

Happy deploying! 🎉
