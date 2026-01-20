# Quick Start Guide - GitHub Upload & Home Computer Setup

## Step 1: Add API Key to Your Corporate Mac (Now)

1. Open file: `.env.local` in your project folder
2. Replace content with:
   ```
   VITE_GEMINI_API_KEY=your_actual_key_here
   ```
3. Save the file

## Step 2: Upload to GitHub (From Corporate Mac)

1. **Go to GitHub.com** → Create new repository
   - Name: `gemini-super-app`
   - **Important: Make it PRIVATE!**

2. **Before uploading - DELETE `.env.local`** ⚠️
   - This file has your API key - never upload it!
   - The `.env.example` file is safe to upload

3. **Upload files via web:**
   - Click "uploading an existing file"
   - Drag all files (except `.env.local`)
   - Commit changes

## Step 3: Use on Home Computer

```bash
# Clone from GitHub
git clone https://github.com/YOUR_USERNAME/gemini-super-app.git
cd gemini-super-app

# Set up API key
cp .env.example .env.local
# Edit .env.local and paste your Gemini API key

# Install and run
npm install
npm run dev
```

Open http://localhost:5173 in your browser!

## Summary

✅ Corporate Mac: Just for editing code and uploading to GitHub  
✅ Home Computer: Where you actually run and use the app  
✅ GitHub: Syncs your work between computers  
✅ API Key: Store locally (never commit to GitHub)

---

**Your app is ready!** Just upload to GitHub and you can use it from your home computer with full Node.js support.
