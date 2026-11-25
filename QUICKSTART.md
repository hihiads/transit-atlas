# SecondLook Quick Start

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure API key:
```bash
# Copy example env file
cp .env.example .env

# Edit .env and add your Gemini API key
# Get one at: https://aistudio.google.com/app/apikey
```

3. Add to your `.env` file:
```
GEMINI_API_KEY=your_actual_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```

## Running

**Terminal 1 - Frontend:**
```bash
npm run dev
# Opens on http://localhost:3000
# Use secondlook.html in the browser
```

**Terminal 2 - Backend:**
```bash
npm run server
# API runs on http://localhost:3001
```

Then navigate to `http://localhost:3000/secondlook.html`

## Testing Without API Key

The app works without a Gemini API key, but photo analysis will be disabled:
- ✅ Text safety checks work (run locally)
- ✅ Seller profile assessment works
- ❌ Photo analysis disabled (needs API key)

## Sample Data

Click "Load sample" in the app to see example listing data.

For full documentation, see [SECONDLOOK_README.md](./SECONDLOOK_README.md)
