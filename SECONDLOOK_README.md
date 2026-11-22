# SecondLook - Vinted Listing Review Tool

A privacy-focused web app that helps shoppers review Vinted listings, photos, and seller profiles before making a purchase.

## Features

- **Photo Analysis**: Upload listing photos for AI-powered analysis via Google Gemini API
- **Text Safety Checks**: Local, rule-based detection of suspicious patterns in listings and messages
- **Seller Profile Assessment**: Evaluate seller credibility based on reviews, ratings, and account age
- **Privacy-First**: Text checks run in the browser; images sent to Gemini API only when explicitly requested

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **AI**: Google Gemini API for photo analysis
- **Icons**: Lucide React

## Setup

### Prerequisites

- Node.js 18+ and npm
- Google Gemini API key (get one at [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey))

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file in the project root:
```bash
cp .env.example .env
```

3. Add your Gemini API key to `.env`:
```
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-1.5-flash
```

### Running the App

**Development mode:**

Start both frontend and backend:
```bash
# Terminal 1 - Frontend (Vite dev server)
npm run dev

# Terminal 2 - Backend (Express server)
npm run server
```

Then visit:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`

**Production build:**
```bash
npm run build
npm run server
```

## Usage

1. **Enter listing details**: Title, description, price, and optional brand/category/condition
2. **Upload photos** (optional): Drag and drop or click to select up to 8 images
3. **Add seller information** (optional): Review count, rating, account age, transactions
4. **Click "Review Listing"**: Get instant analysis with categorized findings
5. **Review results**: 
   - Photo observations and concerns
   - Text warnings (off-platform payments, external contact, urgency tactics)
   - Seller profile assessment
   - Actionable recommendations

## Privacy & Security

- **Text checks run locally** in the browser using rule-based pattern matching
- **Images are sent to Google Gemini API** for analysis when you click "Review Listing"
- **No data is stored** after analysis completes
- **No tracking or analytics** are included
- **API key is server-side only** - never exposed to the browser

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes* | Google Gemini API key for photo analysis |
| `GEMINI_MODEL` | No | Gemini model to use (default: `gemini-1.5-flash`) |
| `PORT` | No | Backend server port (default: `3001`) |

*The app will work without `GEMINI_API_KEY` but photo analysis will be disabled.

## API Endpoints

### `POST /api/analyze-photos`

Analyzes uploaded product photos using Google Gemini.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `images`: Array of image files (max 8, 10MB each)
  - `title`: Listing title (optional)
  - `description`: Listing description (optional)
  - `condition`: Item condition (optional)

**Response:**
```json
{
  "findings": [
    {
      "imageIndex": 0,
      "observations": ["Item appears to be white sneakers...", "..."],
      "concerns": ["Visible wear on sole not mentioned in description"]
    }
  ]
}
```

**Error responses:**
- `400`: Invalid file type, size, or count
- `503`: Gemini API not configured
- `500`: Analysis failed

## Project Structure

```
.
├── backend/
│   ├── routes/
│   │   └── secondlook.js      # Photo analysis API endpoint
│   └── server.js               # Express server with route integration
├── src/
│   ├── SecondLook.tsx          # Main React component
│   └── secondlook-main.tsx     # Entry point for SecondLook app
├── secondlook.html             # HTML entry point
├── .env.example                # Environment variables template
└── README.md                   # This file
```

## Security Considerations

- ✅ API key stored server-side only
- ✅ File type validation on server
- ✅ File size limits (10MB per image, 8 images max)
- ✅ Multipart form data sanitization
- ✅ No image storage after analysis
- ✅ Rate limiting via existing Express middleware
- ✅ CORS configured for allowed origins
- ✅ User input sanitized before display

## Limitations

- Photo analysis requires active internet connection and valid Gemini API key
- Analysis quality depends on photo clarity and Gemini model capabilities
- Cannot verify actual Vinted accounts, listings, or seller profiles
- Text pattern matching may produce false positives or miss sophisticated scams
- No price comparison data or market value assessment

## Disclaimer

SecondLook is an independent tool and is not affiliated with Vinted. It does not access or verify Vinted accounts, listings, or reviews. Photo and text analysis can be wrong. A positive result does not guarantee a safe purchase. Always use your judgment and Vinted's built-in safety features.

## License

This project is provided as-is for personal use.
