# Google Drive OAuth Setup Guide

This guide will help you set up Google Drive OAuth so your app can upload merged videos to your Google Drive (no file size limits!).

## Prerequisites
- A Google account
- Admin access to this application (login as admin)

---

## Step 1: Create Google Cloud Project & OAuth Credentials

### 1.1 Go to Google Cloud Console
Visit: https://console.cloud.google.com/

### 1.2 Create a New Project (or select existing)
1. Click the project dropdown at the top
2. Click "New Project"
3. Name it something like "Cartoon Video Generator"
4. Click "Create"

### 1.3 Enable Google Drive API
1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click on it and press **Enable**

### 1.4 Create OAuth Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted to configure consent screen:
   - Click **Configure Consent Screen**
   - Select **External** (unless you have a Google Workspace)
   - Click **Create**
   - Fill in:
     - App name: "Cartoon Video Generator"
     - User support email: Your email
     - Developer contact: Your email
   - Click **Save and Continue** (skip optional info)
   - Click **Save and Continue** again (skip scopes)
   - Click **Save and Continue** again (skip test users)
   - Click **Back to Dashboard**

4. Now create the OAuth client:
   - Go back to **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**
   - Application type: **Web application**
   - Name: "Video Upload App"
   - Under **Authorized redirect URIs**, click **+ ADD URI**
   - Add: `http://localhost:8080`
   - Click **Create**

5. **IMPORTANT:** Copy both:
   - **Client ID** (looks like: `123456-abc.apps.googleusercontent.com`)
   - **Client Secret** (looks like: `GOCSPX-abc123...`)

---

## Step 2: Add Credentials to Replit Secrets

1. In your Replit project, click the **Lock icon** (🔒) in the left sidebar
2. Click **+ New Secret** and add these THREE secrets:

```
Secret Name: GOOGLE_DRIVE_CLIENT_ID
Value: [Paste your Client ID]
```

```
Secret Name: GOOGLE_DRIVE_CLIENT_SECRET
Value: [Paste your Client Secret]
```

**Don't add the refresh token yet - we'll generate it in the next step!**

---

## Step 3: Get Your Refresh Token

### 3.1 Login as Admin
1. Go to your app and login as admin
2. Username: `muzi`
3. Password: `muzi123`

### 3.2 Get Authorization URL
Open this URL in your browser (make sure you're logged in as admin):
```
https://[your-replit-url]/api/google-drive/auth-url
```

You should see a JSON response like:
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

### 3.3 Authorize Your App
1. Copy the entire `authUrl` value (the long URL)
2. Open it in your browser
3. Login with your Google account
4. Click **Allow** to grant Drive access
5. Google will redirect you to `http://localhost:8080/?code=...`
6. **Your browser will show an error** (that's normal - localhost isn't running)
7. Look at the URL bar and copy the **code** parameter
   - Example URL: `http://localhost:8080/?code=4/0AY0e-g7X...&scope=...`
   - Copy only the code part: `4/0AY0e-g7X...` (everything between `code=` and `&scope`)

### 3.4 Exchange Code for Refresh Token
Use a tool like Postman, or run this curl command (replace the code):

```bash
curl -X POST https://[your-replit-url]/api/google-drive/exchange-token \
  -H "Content-Type: application/json" \
  -d '{"code":"4/0AY0e-g7X..."}'
```

You'll get a response like:
```json
{
  "refreshToken": "1//0gH...",
  "message": "Add this token to your secrets as GOOGLE_DRIVE_REFRESH_TOKEN"
}
```

### 3.5 Add Refresh Token to Secrets
1. Copy the `refreshToken` value
2. Go back to Replit Secrets (🔒 icon)
3. Click **+ New Secret**:
```
Secret Name: GOOGLE_DRIVE_REFRESH_TOKEN
Value: [Paste your refresh token]
```

---

## Step 4: Verify Setup

### 4.1 Check All Secrets Are Set
Make sure you have all three:
- ✅ `GOOGLE_DRIVE_CLIENT_ID`
- ✅ `GOOGLE_DRIVE_CLIENT_SECRET`
- ✅ `GOOGLE_DRIVE_REFRESH_TOKEN`

### 4.2 Restart the Application
The app should automatically restart after adding secrets. If not, manually restart it.

### 4.3 Test Upload
1. Generate a cartoon story with videos
2. Click "Merge All Videos"
3. The merged video should upload to YOUR Google Drive!

---

## Troubleshooting

### "Missing Google Drive OAuth credentials" error
- Make sure all three secrets are added correctly
- Restart the application

### "No refresh token received" error
- Make sure you used the auth URL from `/api/google-drive/auth-url`
- The URL must include `prompt=consent`

### "Token has been expired or revoked" error
- Repeat Step 3 to get a new refresh token
- Make sure your OAuth consent screen is published (not in testing mode)

### Videos not appearing in Google Drive
- Check your Google Drive home folder - they're uploaded to the root
- Files are named like: `merged-video-1234567890.mp4`

---

## What Happens Behind the Scenes

1. Your app uses the **Client ID** and **Client Secret** to identify itself to Google
2. The **Refresh Token** allows your app to access YOUR Google Drive without asking for permission every time
3. When you merge videos, they upload to YOUR Google Drive (using your 15GB free storage)
4. Files are made publicly accessible so anyone can view/download them

---

## Security Notes

- Keep your Client Secret and Refresh Token private (never share them)
- These credentials only give access to files created by this app
- You can revoke access anytime from: https://myaccount.google.com/permissions

---

## Need Help?

If you run into issues:
1. Double-check all three secrets are set correctly
2. Make sure the Google Drive API is enabled in your Google Cloud project
3. Try generating a fresh refresh token (repeat Step 3)

That's it! Your videos will now upload to Google Drive with no size limits! 🎉
