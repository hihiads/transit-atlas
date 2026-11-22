// Vinted Listing Checker - All processing happens locally in the browser

const MAX_LISTING_LENGTH = 10000;
const MAX_MESSAGE_LENGTH = 10000;
const MAX_REVIEW_LENGTH = 5000;

// Warning patterns for listing and message text
const WARNING_PATTERNS = {
  offPlatformPayment: {
    patterns: [
      /\bpaypal\b/i,
      /\bvenmo\b/i,
      /\bcash\s*app\b/i,
      /\bzelle\b/i,
      /\bbank\s*transfer\b/i,
      /\bwire\s*transfer\b/i,
      /\bwestern\s*union\b/i,
      /\bmoneygram\b/i,
      /\bbitcoin\b/i,
      /\bcrypto\b/i,
      /\bpay\s*outside\b/i,
      /\boff\s*vinted\b/i,
      /\bdirect\s*payment\b/i
    ],
    severity: 'high',
    message: 'Mentions payment method outside Vinted',
    explanation: 'Legitimate sellers use Vinted\'s built-in payment system. Off-platform payments lack buyer protection.'
  },
  externalContact: {
    patterns: [
      /\bwhatsapp\b/i,
      /\btelegram\b/i,
      /\bemail\s*me\b/i,
      /\btext\s*me\b/i,
      /\bcall\s*me\b/i,
      /\bcontact\s*me\b.*(?:outside|off)\b/i,
      /\bmessage\s*me\b.*(?:outside|off)\b/i,
      /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
      /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i
    ],
    severity: 'high',
    message: 'Requests communication outside Vinted',
    explanation: 'Keep all communication on Vinted\'s messaging system to maintain a record and protection.'
  },
  urgency: {
    patterns: [
      /\burgent\b/i,
      /\bhurry\b/i,
      /\bquick(?:ly)?\b/i,
      /\bfast\b/i,
      /\basap\b/i,
      /\bright\s*now\b/i,
      /\btoday\s*only\b/i,
      /\blimited\s*time\b/i,
      /\bexpires?\b/i,
      /\bact\s*fast\b/i,
      /\bdon'?t\s*wait\b/i,
      /\bmust\s*(?:sell|go)\b/i
    ],
    severity: 'medium',
    message: 'Creates sense of urgency',
    explanation: 'Pressure tactics are common in scams. Take your time to review carefully.'
  },
  tooGoodToBeTrue: {
    patterns: [
      /\bgenuine\s*(?:guaranteed|promise)\b/i,
      /\b100%\s*(?:authentic|real|genuine)\b/i,
      /\bnew\s*with\s*tags\b.*\b(?:huge|big|massive)\s*discount\b/i,
      /\bretail\s*(?:price|value).*\b\d+%\s*off\b/i,
      /\bgiveaway\s*price\b/i,
      /\bsteal\b/i,
      /\bincredible\s*(?:deal|price)\b/i
    ],
    severity: 'medium',
    message: 'Contains "too good to be true" language',
    explanation: 'Be cautious of prices that seem unrealistically low or claims that seem exaggerated.'
  },
  verificationPressure: {
    patterns: [
      /\bverification\s*code\b/i,
      /\bsecurity\s*code\b/i,
      /\bconfirm.*(?:identity|account)\b/i,
      /\bvinted\s*(?:support|security|verification)\b/i,
      /\baccount\s*suspended\b/i,
      /\bverify\s*your\b/i,
      /\bsend.*code\b/i
    ],
    severity: 'high',
    message: 'Mentions verification or security codes',
    explanation: 'Never share verification codes. Vinted will never ask you to share codes through seller messages.'
  },
  externalLinks: {
    patterns: [
      /\bhttps?:\/\/(?!(?:www\.)?vinted\.[a-z]{2,})/i,
      /\bbit\.ly\b/i,
      /\btinyurl\b/i,
      /\bclick\s*(?:here|this|link)\b/i,
      /\bcheck\s*(?:my|the)\s*(?:website|site|link)\b/i
    ],
    severity: 'high',
    message: 'Contains external links',
    explanation: 'External links may lead to phishing sites. Stay on Vinted\'s platform.'
  },
  shipping: {
    patterns: [
      /\bno\s*(?:returns?|refunds?)\b/i,
      /\bfinal\s*sale\b/i,
      /\bas\s*is\b/i,
      /\bshipping\s*(?:from|via).*(?:abroad|overseas|internationally)\b/i,
      /\bcustoms?\s*(?:fees?|charges?)\b/i,
      /\bextra\s*(?:shipping|fee)\b/i
    ],
    severity: 'low',
    message: 'Contains unusual shipping or return terms',
    explanation: 'Check if these terms align with Vinted\'s policies and your expectations.'
  }
};

// Review warning patterns
const REVIEW_PATTERNS = {
  nonDelivery: [
    /\bnever\s*(?:received|arrived|came)\b/i,
    /\bdidn'?t\s*(?:arrive|receive|get)\b/i,
    /\bno\s*(?:delivery|package|item)\b/i,
    /\bnot\s*(?:delivered|received|sent)\b/i,
    /\bstill\s*waiting\b/i
  ],
  mismatch: [
    /\bnot\s*as\s*described\b/i,
    /\bdifferent\s*(?:from|than).*(?:photo|picture|listing)\b/i,
    /\bfake\b/i,
    /\bcounterfeit\b/i,
    /\bnot\s*authentic\b/i,
    /\bwrong\s*(?:item|size|color)\b/i,
    /\bdamaged\b/i,
    /\bused\b.*\bsold\s*as\s*new\b/i
  ],
  pressure: [
    /\bpressured?\b.*\b(?:pay|buy)\b/i,
    /\bpushed?\b.*\b(?:outside|off)\s*vinted\b/i,
    /\bagressive\b/i,
    /\bdemanded?\b/i,
    /\bthreatened?\b/i
  ],
  communication: [
    /\bno\s*(?:response|reply|communication)\b/i,
    /\bignored?\b.*\bmessages?\b/i,
    /\bdidn'?t\s*(?:respond|reply)\b/i,
    /\bunresponsive\b/i
  ]
};

// DOM elements
let elements = {};

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  elements = {
    listingText: document.getElementById('listingText'),
    messageText: document.getElementById('messageText'),
    priceInput: document.getElementById('priceInput'),
    reviewCount: document.getElementById('reviewCount'),
    rating: document.getElementById('rating'),
    accountAge: document.getElementById('accountAge'),
    completedSales: document.getElementById('completedSales'),
    reviewText: document.getElementById('reviewText'),
    profileNotes: document.getElementById('profileNotes'),
    checkBtn: document.getElementById('checkBtn'),
    clearBtn: document.getElementById('clearBtn'),
    results: document.getElementById('results'),
    overallSummary: document.getElementById('overallSummary'),
    listingWarnings: document.getElementById('listingWarnings'),
    sellerWarnings: document.getElementById('sellerWarnings'),
    listingCount: document.getElementById('listingCount'),
    messageCount: document.getElementById('messageCount'),
    reviewTextCount: document.getElementById('reviewTextCount')
  };

  // Character counters
  elements.listingText.addEventListener('input', () => {
    elements.listingCount.textContent = elements.listingText.value.length;
  });

  elements.messageText.addEventListener('input', () => {
    elements.messageCount.textContent = elements.messageText.value.length;
  });

  elements.reviewText.addEventListener('input', () => {
    elements.reviewTextCount.textContent = elements.reviewText.value.length;
  });

  // Button handlers
  elements.checkBtn.addEventListener('click', performCheck);
  elements.clearBtn.addEventListener('click', clearAllData);

  // Enter key on inputs triggers check
  document.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        performCheck();
      }
    });
  });
});

// Sanitize text for safe display - prevent any HTML execution
function sanitizeText(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Truncate long text for display
function truncateText(text, maxLength = 100) {
  if (text.length <= maxLength) return sanitizeText(text);
  return sanitizeText(text.substring(0, maxLength)) + '...';
}

// Check listing and message text for warning patterns
function checkTextForWarnings(text) {
  const warnings = [];

  if (!text || text.trim().length === 0) {
    return warnings;
  }

  for (const [key, pattern] of Object.entries(WARNING_PATTERNS)) {
    for (const regex of pattern.patterns) {
      if (regex.test(text)) {
        warnings.push({
          type: key,
          severity: pattern.severity,
          message: pattern.message,
          explanation: pattern.explanation
        });
        break; // Only report each pattern type once
      }
    }
  }

  return warnings;
}

// Analyze review text for concerning patterns
function analyzeReviews(reviewText) {
  if (!reviewText || reviewText.trim().length === 0) {
    return { concerns: [], summary: null };
  }

  const concerns = [];
  const foundPatterns = {
    nonDelivery: false,
    mismatch: false,
    pressure: false,
    communication: false
  };

  for (const [category, patterns] of Object.entries(REVIEW_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(reviewText)) {
        foundPatterns[category] = true;
        break;
      }
    }
  }

  if (foundPatterns.nonDelivery) {
    concerns.push({
      type: 'nonDelivery',
      severity: 'high',
      message: 'Reviews mention non-delivery',
      explanation: 'Multiple reviews mention items not being received. This is a serious red flag.'
    });
  }

  if (foundPatterns.mismatch) {
    concerns.push({
      type: 'mismatch',
      severity: 'high',
      message: 'Reviews mention items not matching description',
      explanation: 'Reviews indicate items were fake, damaged, or different from listing photos.'
    });
  }

  if (foundPatterns.pressure) {
    concerns.push({
      type: 'pressure',
      severity: 'medium',
      message: 'Reviews mention pressure or aggressive behavior',
      explanation: 'Some buyers reported being pressured or receiving aggressive messages.'
    });
  }

  if (foundPatterns.communication) {
    concerns.push({
      type: 'communication',
      severity: 'medium',
      message: 'Reviews mention poor communication',
      explanation: 'Buyers reported difficulty getting responses from this seller.'
    });
  }

  return { concerns };
}

// Assess seller profile
function assessSellerProfile() {
  const reviewCount = parseInt(elements.reviewCount.value) || null;
  const rating = parseFloat(elements.rating.value) || null;
  const accountAge = elements.accountAge.value.trim();
  const completedSales = parseInt(elements.completedSales.value) || null;
  const reviewText = elements.reviewText.value.trim();

  const warnings = [];
  const positives = [];
  const unknowns = [];

  // Check review count
  if (reviewCount !== null) {
    if (reviewCount === 0) {
      warnings.push({
        severity: 'medium',
        message: 'No reviews yet',
        explanation: 'This seller has no reviews. Extra caution recommended for first-time sellers.'
      });
    } else if (reviewCount < 5) {
      warnings.push({
        severity: 'low',
        message: 'Very few reviews',
        explanation: `Only ${reviewCount} review${reviewCount === 1 ? '' : 's'}. Limited transaction history.`
      });
    } else if (reviewCount >= 20) {
      positives.push({
        message: 'Established review history',
        explanation: `${reviewCount} reviews suggest regular Vinted activity.`
      });
    }
  } else {
    unknowns.push('Number of reviews not provided');
  }

  // Check rating
  if (rating !== null) {
    if (rating < 3.0) {
      warnings.push({
        severity: 'high',
        message: 'Low rating',
        explanation: `Rating of ${rating}/5 is concerning. Read reviews carefully.`
      });
    } else if (rating < 4.0) {
      warnings.push({
        severity: 'medium',
        message: 'Below-average rating',
        explanation: `Rating of ${rating}/5 is below typical. Check what buyers said.`
      });
    } else if (rating >= 4.5) {
      positives.push({
        message: 'Good rating',
        explanation: `${rating}/5 rating is positive.`
      });
    }
  } else {
    unknowns.push('Average rating not provided');
  }

  // Check account age
  if (accountAge) {
    const yearMatch = accountAge.match(/20(\d{2})/);
    if (yearMatch) {
      const year = parseInt('20' + yearMatch[1]);
      const currentYear = new Date().getFullYear();
      const age = currentYear - year;

      if (age < 1) {
        warnings.push({
          severity: 'medium',
          message: 'New account',
          explanation: 'Account created recently. Review profile and listing carefully.'
        });
      } else if (age >= 2) {
        positives.push({
          message: 'Established account',
          explanation: `Account active since ${year}.`
        });
      }
    }
  } else {
    unknowns.push('Account age not provided');
  }

  // Check completed sales
  if (completedSales !== null) {
    if (completedSales === 0 && reviewCount > 0) {
      unknowns.push('No completed sales shown, but reviews exist (may be as a buyer)');
    } else if (completedSales >= 10) {
      positives.push({
        message: 'Multiple completed transactions',
        explanation: `${completedSales} completed sales.`
      });
    }
  } else {
    unknowns.push('Completed transactions not provided');
  }

  // Analyze review text
  if (reviewText) {
    const reviewAnalysis = analyzeReviews(reviewText);
    warnings.push(...reviewAnalysis.concerns);
  }

  return { warnings, positives, unknowns };
}

// Perform the check
function performCheck() {
  const listingText = elements.listingText.value.trim();
  const messageText = elements.messageText.value.trim();

  // Check if there's any input
  if (!listingText && !messageText && !elements.reviewCount.value && !elements.rating.value) {
    alert('Please enter at least a listing description, seller messages, or seller profile details.');
    return;
  }

  // Analyze listing and messages
  const listingWarnings = checkTextForWarnings(listingText);
  const messageWarnings = checkTextForWarnings(messageText);
  const allTextWarnings = [...listingWarnings, ...messageWarnings];

  // Analyze seller profile
  const sellerAssessment = assessSellerProfile();

  // Calculate overall risk level
  const highSeverityCount = allTextWarnings.filter(w => w.severity === 'high').length +
                           sellerAssessment.warnings.filter(w => w.severity === 'high').length;
  const mediumSeverityCount = allTextWarnings.filter(w => w.severity === 'medium').length +
                             sellerAssessment.warnings.filter(w => w.severity === 'medium').length;

  let riskLevel = 'low';
  let riskColor = 'green';
  let riskMessage = 'No major warning signs detected';

  if (highSeverityCount > 0) {
    riskLevel = 'high';
    riskColor = 'red';
    riskMessage = 'Multiple serious warning signs detected. Proceed with extreme caution or avoid this transaction.';
  } else if (mediumSeverityCount >= 2) {
    riskLevel = 'medium';
    riskColor = 'orange';
    riskMessage = 'Several warning signs detected. Review carefully before proceeding.';
  } else if (mediumSeverityCount === 1 || allTextWarnings.length + sellerAssessment.warnings.length > 0) {
    riskLevel = 'low';
    riskColor = 'orange';
    riskMessage = 'Some minor concerns detected. Review the details below.';
  }

  // Display results
  displayResults(allTextWarnings, sellerAssessment, riskLevel, riskColor, riskMessage);
}

// Display results
function displayResults(textWarnings, sellerAssessment, riskLevel, riskColor, riskMessage) {
  // Overall summary
  elements.overallSummary.innerHTML = `
    <div class="risk-${riskColor}">
      <strong>Risk Level: ${riskLevel.toUpperCase()}</strong>
      <p>${sanitizeText(riskMessage)}</p>
    </div>
  `;

  // Listing and message warnings
  if (textWarnings.length > 0) {
    const sortedWarnings = textWarnings.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    elements.listingWarnings.innerHTML = sortedWarnings.map(w => `
      <div class="warning warning-${w.severity}">
        <div class="warning-header">
          <span class="warning-icon">⚠️</span>
          <strong>${sanitizeText(w.message)}</strong>
          <span class="severity-badge severity-${w.severity}">${w.severity}</span>
        </div>
        <p>${sanitizeText(w.explanation)}</p>
      </div>
    `).join('');
  } else {
    elements.listingWarnings.innerHTML = `
      <div class="no-warnings">
        <span class="check-icon">✓</span>
        <p>No warning signs detected in listing or message text.</p>
      </div>
    `;
  }

  // Seller profile assessment
  const hasSellerData = sellerAssessment.warnings.length > 0 ||
                        sellerAssessment.positives.length > 0 ||
                        sellerAssessment.unknowns.length > 0;

  if (!hasSellerData) {
    elements.sellerWarnings.innerHTML = `
      <div class="no-data">
        <p>No seller profile information provided.</p>
      </div>
    `;
  } else {
    let sellerHTML = '';

    // Warnings
    if (sellerAssessment.warnings.length > 0) {
      sellerHTML += sellerAssessment.warnings.map(w => `
        <div class="warning warning-${w.severity}">
          <div class="warning-header">
            <span class="warning-icon">⚠️</span>
            <strong>${sanitizeText(w.message)}</strong>
            <span class="severity-badge severity-${w.severity}">${w.severity}</span>
          </div>
          <p>${sanitizeText(w.explanation)}</p>
        </div>
      `).join('');
    }

    // Positive signs
    if (sellerAssessment.positives.length > 0) {
      sellerHTML += '<div class="positive-signs">';
      sellerHTML += sellerAssessment.positives.map(p => `
        <div class="positive">
          <span class="check-icon">✓</span>
          <strong>${sanitizeText(p.message)}</strong>
          <p>${sanitizeText(p.explanation)}</p>
        </div>
      `).join('');
      sellerHTML += '</div>';
    }

    // Unknown information
    if (sellerAssessment.unknowns.length > 0) {
      sellerHTML += '<div class="unknown-info">';
      sellerHTML += '<p><strong>Not enough information:</strong></p>';
      sellerHTML += '<ul>';
      sellerHTML += sellerAssessment.unknowns.map(u =>
        `<li>${sanitizeText(u)}</li>`
      ).join('');
      sellerHTML += '</ul>';
      sellerHTML += '</div>';
    }

    elements.sellerWarnings.innerHTML = sellerHTML;
  }

  // Show results
  elements.results.classList.remove('hidden');
  elements.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Clear all data
function clearAllData() {
  // Clear all input fields
  elements.listingText.value = '';
  elements.messageText.value = '';
  elements.priceInput.value = '';
  elements.reviewCount.value = '';
  elements.rating.value = '';
  elements.accountAge.value = '';
  elements.completedSales.value = '';
  elements.reviewText.value = '';
  elements.profileNotes.value = '';

  // Reset character counters
  elements.listingCount.textContent = '0';
  elements.messageCount.textContent = '0';
  elements.reviewTextCount.textContent = '0';

  // Hide results
  elements.results.classList.add('hidden');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
