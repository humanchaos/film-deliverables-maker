# 🎬 Gemini Super App - Film Deliverables Generator

Professional video analysis and deliverables generation tool using Google Gemini AI.

## Features

- 📝 Synopsis Generation
- 🎬 Shot List with Timecodes (Drop-Frame & Non-Drop-Frame)
- 📋 Dialogue List / Transcription
- 🎨 Graphics & Lower Thirds Detection
- 🦁 Fauna Identification (for nature documentaries)
- 👤 Talent Bio Generation
- 📊 Technical Specifications Report
- 💾 Export to CSV (Word/PDF coming soon)

## Setup

### Prerequisites
- Node.js 18+ ([Download](https://nodejs.org/))
- Google Gemini API Key ([Get one](https://aistudio.google.com/app/apikey))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/gemini-super-app.git
   cd gemini-super-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API Key**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and add your Gemini API key:
   ```
   VITE_GEMINI_API_KEY=your_actual_api_key_here
   ```

4. **Run the app**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:5173
   ```

## Usage

1. Upload a video file (up to 5GB, MP4/MOV/AVI/WebM/MKV)
2. Select analysis mode
3. Wait for AI processing
4. Review and export results

## Supported Video Formats

- H.264 / H.265 codecs
- MOV, MP4, AVI, WebM, MKV containers
- Up to 5GB file size
- Up to 2 hours duration
- Frame rates: 23.976, 24, 25, 29.97, 30, 50, 59.94, 60 fps

## Timecode Support

- ✅ Non-Drop-Frame (NDF): `HH:MM:SS:FF`
- ✅ Drop-Frame (DF): `HH:MM:SS;FF` (29.97fps, 59.94fps)
- ✅ Auto-detection based on frame rate

## Export Formats

- CSV (available now)
- Word .docx (coming soon - requires npm dependencies)
- PDF (planned)

## Industry Standards

Designed to meet PBS and BBC delivery specifications for professional film and documentary deliverables.

## Security

⚠️ **Never commit `.env.local` to version control** - it contains your API key!

The `.env.local` file is already in `.gitignore` to prevent accidental commits.

## License

MIT

## Support

For issues or questions, open an issue on GitHub.
