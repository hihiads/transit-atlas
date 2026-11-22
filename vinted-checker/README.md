# Vinted Listing & Seller Checker

A privacy-focused browser tool that helps users check Vinted listings and seller profiles for potential warning signs.

## Features

### Listing Analysis
- Detects off-platform payment requests (PayPal, bank transfer, crypto, etc.)
- Identifies requests for external communication (WhatsApp, email, phone numbers)
- Flags urgency pressure tactics
- Highlights "too good to be true" language
- Warns about verification code requests (phishing attempts)
- Detects suspicious external links
- Notes unusual shipping/return terms

### Seller Profile Assessment
- Evaluates review count and rating
- Assesses account age
- Considers transaction history
- Analyzes review text for recurring concerns:
  - Non-delivery patterns
  - Item mismatch complaints
  - Pressure or aggressive behavior
  - Poor communication

### Risk Level Summary
- **High Risk**: Multiple serious warning signs detected
- **Medium Risk**: Several concerning patterns found
- **Low Risk**: Minor concerns or good profile with small issues
- **Clear**: No significant warning signs

## Privacy & Security

**All processing happens locally in your browser. Nothing is uploaded or transmitted.**

- No external APIs or server connections
- No tracking or analytics
- No data storage or logging
- All input treated as untrusted data
- Safe text sanitization prevents code execution
- No automatic link opening

## Usage

1. **Paste listing description**: Copy the item description from Vinted
2. **Add seller messages** (optional): Paste any messages the seller sent you
3. **Enter seller profile details** (optional):
   - Number of reviews
   - Average rating
   - Account age
   - Completed transactions
   - Review text samples
4. **Click "Check for Warning Signs"**
5. Review the results in two sections:
   - Listing & Message Analysis
   - Seller Profile Assessment

## Important Disclaimers

- This tool provides guidance, not guarantees
- Seller details are manually entered and not verified
- A positive result cannot guarantee a safe transaction
- Always use Vinted's built-in safety features
- Keep all payments and communication on Vinted's platform
- Trust your instincts—if something feels wrong, it probably is

## Safety Reminders

✅ **DO:**
- Keep payment and communication on Vinted
- Read seller reviews carefully
- Check profile details
- Take your time reviewing listings
- Use Vinted's official reporting if suspicious

❌ **DON'T:**
- Share passwords or verification codes
- Pay outside Vinted's system
- Click suspicious external links
- Share full payment card details in messages
- Feel pressured to act quickly

## Technical Details

- Pure HTML, CSS, and JavaScript
- No build process required
- No dependencies
- Works offline after first load
- Accessible (keyboard navigation, screen reader support)
- Responsive design (mobile-friendly)

## Browser Support

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers

## Development

Simply open `index.html` in a browser. No build step needed.

For development with live reload, you can use any static file server:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve

# PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`

## License

This tool is provided as-is for personal use. Not affiliated with Vinted.
