# Running Gemini Super App WITHOUT npm/Node.js

## Quick Start (No Installation Required!)

Your app is a **client-side web application** that can run directly in a browser without Node.js. Here's how:

### Option A: Use a Simple HTTP Server (Python - usually pre-installed on Mac)

1. **Open Terminal** in your project folder:
   ```bash
   cd "/Users/mmooslechner/Downloads/gemini-super-app-updated (1)"
   ```

2. **Start a simple HTTP server** (Python is pre-installed on Mac):
   ```bash
   python3 -m http.server 3000
   ```

3. **Open your browser** and go to:
   ```
   http://localhost:3000
   ```

4. **That's it!** Your app should load and work.

### Option B: Use VS Code Live Server Extension

If you have VS Code:
1. Install "Live Server" extension (no admin needed)
2. Right-click `index.html`
3. Select "Open with Live Server"
4. Browser opens automatically

### Option C: Open HTML File Directly (Simplest!)

**Just double-click `index.html`** in Finder - it opens in your default browser!

⚠️ **Note**: Some features might not work due to browser security restrictions when opening files directly. Use Option A or B for full functionality.

## What You Can Do Right Now

✅ **Upload videos** (up to 5GB)  
✅ **Generate synopses**  
✅ **Create shot lists** with timecodes  
✅ **Extract graphics & lower thirds**  
✅ **Transcribe dialogue**  
✅ **Identify fauna** (animals in nature docs)  
✅ **Generate talent bios**  
✅ **Download as CSV** (not Word yet - that needs npm)

## Current Limitation

❌ **No Word/PDF export** (requires npm to install `docx` library)
✅ **CSV export works** for shot lists, transcripts, etc.

## When You Get Node.js Access

Once IT installs Node.js for you (just ask for "Node.js LTS"), run:

```bash
cd "/Users/mmooslechner/Downloads/gemini-super-app-updated (1)"
npm install
npm run dev
```

Then you'll get the development server with hot-reload and can add Word export.

## Try It Now!

Run this in Terminal:
```bash
cd "/Users/mmooslechner/Downloads/gemini-super-app-updated (1)"
python3 -m http.server 3000
```

Then open http://localhost:3000 in your browser!
