# SecondLook - Complete Setup Guide

## What is SecondLook?

SecondLook is a privacy-focused web app that helps Vinted shoppers review listings, analyze photos, and assess seller profiles before making a purchase.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Google Gemini API

Get a free API key at: https://aistudio.google.com/app/apikey

Create a `.env` file in the project root:
```bash
cp .env.secondlook.example .env
```

Edit `.env` and add your key:
```
GEMINI_API_KEY=your_actual_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```

### 3. Start the App

**Terminal 1 - Backend Server:**
```bash
npm run server
# Runs on http://localhost:3001
```

**Terminal 2 - Frontend:**
```bash
npm run dev
# Runs on http://localhost:3000
```

**Access SecondLook:**
Open http://localhost:3000/secondlook.html in your browser

## Features

✅ **Photo Analysis** - AI-powered image review via Google Gemini  
✅ **Text Safety Checks** - Detect suspicious patterns (local, privacy-safe)  
✅ **Seller Assessment** - Evaluate profile credibility  
✅ **Privacy-First** - No data stored, minimal external API usage  

## Testing Without API Key

The app still works without a Gemini API key:
- ✅ Text checks work (browser-based)
- ✅ Seller assessment works
- ❌ Photo analysis disabled (requires API key)

## File Structure

```
SecondLook Files:
├── src/SecondLook.tsx           # Main React component
├── src/secondlook-main.tsx      # Entry point
├── backend/routes/secondlook.js # Photo analysis API
├── secondlook.html              # HTML entry
├── SECONDLOOK_README.md         # Full documentation
├── QUICKSTART.md                # Quick reference
└── .env.secondlook.example      # Config template
```

## Need Help?

- Full docs: [SECONDLOOK_README.md](./SECONDLOOK_README.md)
- API issues: Check server logs in terminal 1
- Frontend issues: Check browser console (F12)

## Security Note

⚠️ Never commit your `.env` file with the actual API key!  
✅ The `.env` file is already in `.gitignore`
