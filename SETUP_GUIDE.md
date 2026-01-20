# TMS Clip Analyzer - Quick Setup Guide

## What's New

This consolidated application combines FOUR video analysis tools into one unified interface:

### All-in-One Analysis Tool:
1. **Synopsis Generation** - Professional film synopsis with customizable parameters
2. **Talent Bio Generation** - Auto-detect or manually enter talent for biography creation
3. **Graphics & Lower Thirds Detection** - Timecode log of all on-screen graphics
4. **Fauna Identification** - AI-powered animal species identification with scientific names

## Installation Steps

1. **Extract the zip file**
   ```bash
   unzip clip-analyzer.zip
   cd clip-analyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variable**
   Create a `.env` file in the root directory:
   ```
   API_KEY=your_gemini_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   ```

## How It Works

### Workflow

1. **Upload Video** 
   - Single upload interface
   - Drag & drop or click to browse
   - Supports MP4, MOV, WebM, AVI, MKV (up to 5GB)

2. **Choose Analysis Type**
   - **Generate Synopsis**: Create professional film synopsis with customizable parameters
   - **Generate Talent Bios**: Auto-detect or manually enter talent for biography generation
   - **Find Graphics & Lower Thirds**: Detect and log all on-screen graphics with timecodes
   - **Identify Animal Species**: AI-powered fauna identification with scientific classifications

3. **Configure & Generate**
   - Each analysis type has its own configuration screen
   - Real-time progress tracking
   - Cancel anytime with ESC key

4. **View & Export Results**
   - Synopsis: Copy all text with one click
   - Bios: Download all as formatted text file
   - Graphics: Download timecode log
   - Fauna: Download as TXT or CSV

## Key Features

✅ **Unified Upload**: Upload your video once, run multiple analysis types
✅ **Four Analysis Modes**: Synopsis, bios, graphics detection, and species identification
✅ **Smart Processing**: Efficient frame extraction and AI analysis
✅ **Flexible Options**: Auto-detect or manual entry where applicable
✅ **Progress Tracking**: See exactly what's happening at each step
✅ **Multi-language**: Generate content in 8+ different languages
✅ **Error Handling**: Clear error messages with retry options
✅ **Responsive UI**: Beautiful, modern interface that works on all devices
✅ **Export Options**: Download results in multiple formats (TXT, CSV)

## Comparison with Original Apps

| Feature | Old Apps | New Consolidated App |
|---------|----------|---------------------|
| File Upload | 2x (once per app) | 1x (choose analysis after) |
| Video Processing | Duplicate processing | Shared processing engine |
| User Experience | Switch between apps | Seamless single interface |
| Code Maintenance | 2 codebases | 1 unified codebase |
| Features | Separate | Combined + enhanced |

## File Structure

```
clip-analyzer/
├── components/              # UI Components
│   ├── FileUploadView.tsx   # Initial upload screen
│   ├── ModeSelectView.tsx   # Choose analysis type
│   ├── SynopsisInputView.tsx # Synopsis configuration
│   ├── BioInputView.tsx     # Bio configuration  
│   ├── ProcessingView.tsx   # Progress indicator
│   ├── SynopsisResultView.tsx # Synopsis display
│   ├── BioResultView.tsx    # Bios display
│   └── ErrorView.tsx        # Error handling
├── services/
│   └── geminiService.ts     # Combined API services
├── utils/
│   └── videoProcessor.ts    # Video frame/audio extraction
├── App.tsx                  # Main app logic & state
├── types.ts                 # TypeScript definitions
└── [config files]
```

## Technical Improvements

### Shared Resources
- Single video processor for both analysis types
- Unified Gemini API service
- Common error handling and progress tracking
- Shared type definitions

### Better State Management
- Centralized app state in main component
- Clear state transitions (UPLOAD → MODE_SELECT → PROCESSING → RESULTS)
- Consistent error handling across all modes

### Enhanced UX
- Single upload prevents duplicate work
- Clear visual hierarchy and mode selection
- Consistent styling across all screens
- Smooth transitions and animations

## Environment Variables

Required:
- `API_KEY` - Your Google Gemini API key

## Browser Requirements

- Modern browser with:
  - Canvas API support
  - Web Audio API support
  - ES2020+ JavaScript support
  
Recommended: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## Troubleshooting

### "API_KEY not found"
- Ensure `.env` file exists in root directory
- Check that `API_KEY=your_key` is properly formatted
- Restart dev server after adding `.env`

### Video processing fails
- Check file size (max 5GB)
- Verify format is supported (MP4, MOV, WebM, AVI, MKV)
- Ensure video is not corrupted

### Frames extraction timeout
- Video may be too long (max 60 minutes for synopsis)
- Try shorter video clip
- Check browser console for specific errors

## Support

For issues or questions:
1. Check browser console for errors
2. Verify API key is valid
3. Ensure video file meets requirements
4. Review README.md for detailed documentation

## Next Steps

After setup:
1. Test with a sample video
2. Try both analysis modes
3. Customize synopsis parameters
4. Test auto-detection vs manual bio entry
5. Export and review results

Enjoy your new unified clip analysis tool! 🎬✨
