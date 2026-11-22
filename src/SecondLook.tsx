import { useState } from 'react';
import { Upload, X, AlertCircle, CheckCircle, Info, Search } from 'lucide-react';
import CookieNotice from './components/CookieNotice';

interface ListingFormData {
  title: string;
  description: string;
  price: string;
  currency: string;
  brand: string;
  category: string;
  condition: string;
  images: File[];
}

interface SellerData {
  reviewCount: string;
  rating: string;
  accountAge: string;
  completedTransactions: string;
  reviewExcerpts: string;
}

interface PhotoFinding {
  imageIndex: number;
  observations: string[];
  concerns: string[];
}

interface TextWarning {
  severity: 'high' | 'medium' | 'low';
  message: string;
  explanation: string;
  trigger?: string;
}

interface SellerAssessment {
  warnings: TextWarning[];
  positives: { message: string; explanation: string }[];
  unknowns: string[];
}

interface AnalysisResults {
  photoFindings: PhotoFinding[];
  textWarnings: TextWarning[];
  sellerAssessment: SellerAssessment;
  overallStatus: 'clear' | 'check-items' | 'multiple-concerns';
  summary: string;
}

export default function SecondLook() {
  const [formData, setFormData] = useState<ListingFormData>({
    title: '',
    description: '',
    price: '',
    currency: 'EUR',
    brand: '',
    category: '',
    condition: '',
    images: []
  });

  const [sellerData, setSellerData] = useState<SellerData>({
    reviewCount: '',
    rating: '',
    accountAge: '',
    completedTransactions: '',
    reviewExcerpts: ''
  });

  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSellerSection, setShowSellerSection] = useState(false);
  const [analysisConsent, setAnalysisConsent] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addImages(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    addImages(files);
  };

  const addImages = (files: File[]) => {
    const newImages = [...formData.images, ...files].slice(0, 8);
    setAnalysisConsent(false);
    setFormData({ ...formData, images: newImages });

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string].slice(0, 8));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setAnalysisConsent(false);
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index)
    });
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFormData({
      title: '',
      description: '',
      price: '',
      currency: 'EUR',
      brand: '',
      category: '',
      condition: '',
      images: []
    });
    setSellerData({
      reviewCount: '',
      rating: '',
      accountAge: '',
      completedTransactions: '',
      reviewExcerpts: ''
    });
    setImagePreviews([]);
    setResults(null);
    setError(null);
    setAnalysisConsent(false);
  };

  const loadSampleData = () => {
    setFormData({
      title: 'Nike Air Max 90 Sneakers - Size 42',
      description: 'Brand new Nike Air Max 90 in great condition. Worn only twice. Original box included. Must sell quickly!',
      price: '45',
      currency: 'EUR',
      brand: 'Nike',
      category: 'Sneakers',
      condition: 'Like New',
      images: []
    });
    setSellerData({
      reviewCount: '3',
      rating: '4.7',
      accountAge: 'Member since Nov 2024',
      completedTransactions: '2',
      reviewExcerpts: ''
    });
  };

  const analyzeText = (text: string): TextWarning[] => {
    const warnings: TextWarning[] = [];
    const patterns = [
      {
        regex: /\b(paypal|venmo|cash\s*app|zelle|bank\s*transfer|wire|bitcoin|crypto|pay\s*outside)\b/i,
        severity: 'high' as const,
        message: 'Off-platform payment mentioned',
        explanation: 'Keep all payments on Vinted for buyer protection.'
      },
      {
        regex: /\b(whatsapp|telegram|email\s*me|text\s*me|call\s*me)\b/i,
        severity: 'high' as const,
        message: 'External communication requested',
        explanation: 'Keep communication on Vinted to maintain a record.'
      },
      {
        regex: /\b(urgent|hurry|quick|fast|asap|today\s*only|must\s*sell)\b/i,
        severity: 'medium' as const,
        message: 'Urgency language detected',
        explanation: 'Take your time to review carefully.'
      },
      {
        regex: /\b(verification\s*code|security\s*code|confirm.*account)\b/i,
        severity: 'high' as const,
        message: 'Verification code mentioned',
        explanation: 'Never share verification codes. Vinted will never ask for them.'
      }
    ];

    patterns.forEach(({ regex, severity, message, explanation }) => {
      const match = text.match(regex);
      if (match) {
        warnings.push({
          severity,
          message,
          explanation,
          trigger: match[0]
        });
      }
    });

    return warnings;
  };

  const assessSeller = (): SellerAssessment => {
    const warnings: TextWarning[] = [];
    const positives: { message: string; explanation: string }[] = [];
    const unknowns: string[] = [];

    const reviewCount = parseInt(sellerData.reviewCount);
    const rating = parseFloat(sellerData.rating);

    if (sellerData.reviewCount) {
      if (reviewCount === 0) {
        warnings.push({
          severity: 'medium',
          message: 'No reviews yet',
          explanation: 'New seller with no transaction history. Proceed with caution.'
        });
      } else if (reviewCount < 5) {
        warnings.push({
          severity: 'low',
          message: 'Few reviews',
          explanation: `Only ${reviewCount} reviews. Limited history available.`
        });
      } else if (reviewCount >= 20) {
        positives.push({
          message: 'Established seller',
          explanation: `${reviewCount} reviews indicate regular activity.`
        });
      }
    } else {
      unknowns.push('Review count not provided');
    }

    if (sellerData.rating) {
      if (rating < 3.0) {
        warnings.push({
          severity: 'high',
          message: 'Low rating',
          explanation: `${rating}/5 rating is concerning. Read reviews carefully.`
        });
      } else if (rating < 4.0) {
        warnings.push({
          severity: 'medium',
          message: 'Below-average rating',
          explanation: `${rating}/5 is lower than typical.`
        });
      } else if (rating >= 4.5) {
        positives.push({
          message: 'Good rating',
          explanation: `${rating}/5 is a positive indicator.`
        });
      }
    } else {
      unknowns.push('Rating not provided');
    }

    if (sellerData.accountAge) {
      const yearMatch = sellerData.accountAge.match(/202([0-6])/);
      if (yearMatch) {
        const year = parseInt(`202${yearMatch[1]}`);
        if (year >= 2024) {
          warnings.push({
            severity: 'medium',
            message: 'Recent account',
            explanation: 'Account created recently. Review carefully.'
          });
        } else {
          positives.push({
            message: 'Established account',
            explanation: `Active since ${year}.`
          });
        }
      }
    } else {
      unknowns.push('Account age not provided');
    }

    return { warnings, positives, unknowns };
  };

  const analyzeSubmit = async () => {
    if (formData.images.length > 0 && !analysisConsent) {
      setError('Prije analize fotografija potvrdite slanje fotografija i opisa Google Gemini API-ju.');
      return;
    }
    setAnalyzing(true);
    setError(null);

    try {
      // Text analysis
      const textWarnings = analyzeText(formData.description);
      const sellerAssessment = assessSeller();

      // Photo analysis via Gemini API
      let photoFindings: PhotoFinding[] = [];

      if (formData.images.length > 0) {
        const formDataToSend = new FormData();
        formData.images.forEach(img => {
          formDataToSend.append('images', img);
        });
        formDataToSend.append('title', formData.title);
        formDataToSend.append('description', formData.description);
        formDataToSend.append('condition', formData.condition);

        const response = await fetch('/api/analyze-photos', {
          method: 'POST',
          body: formDataToSend
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Photo analysis failed');
        }

        const data = await response.json();
        photoFindings = data.findings || [];
      }

      // Determine overall status
      const highSeverity = textWarnings.filter(w => w.severity === 'high').length +
                          sellerAssessment.warnings.filter(w => w.severity === 'high').length;
      const totalWarnings = textWarnings.length + sellerAssessment.warnings.length;

      let overallStatus: 'clear' | 'check-items' | 'multiple-concerns';
      let summary: string;

      if (highSeverity >= 2 || totalWarnings >= 4) {
        overallStatus = 'multiple-concerns';
        summary = 'Multiple concerns detected. Review the details carefully before proceeding.';
      } else if (totalWarnings > 0 || photoFindings.some(f => f.concerns.length > 0)) {
        overallStatus = 'check-items';
        summary = 'A few things to check. Review the findings below.';
      } else {
        overallStatus = 'clear';
        summary = 'No obvious concerns found. Continue to use your judgment.';
      }

      setResults({
        photoFindings,
        textWarnings,
        sellerAssessment,
        overallStatus,
        summary
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <CookieNotice />
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Search className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">SecondLook</h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Independent listing review tool •
            <a href="/privacy" className="ml-1 underline hover:text-gray-900">Privacy</a>
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        {/* Hero */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Take a closer look before you buy.
          </h2>
          <p className="text-lg text-gray-600">
            Review listing details, photos, and seller information to make informed decisions.
            Enter information manually—we don't connect to Vinted.
          </p>
        </div>

        {/* Privacy notice */}
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            <strong>Privacy:</strong> Text checks run in your browser. If you choose photo analysis,
            selected photos and listing details are sent to Google's Gemini API. Transitly does not save the uploaded images; Google processes the request under its own terms.
          </p>
        </div>

        {!results ? (
          <div className="space-y-8">
            {/* Listing Form */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-gray-900">Listing Details</h3>
                <button
                  onClick={loadSampleData}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Load sample
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Listing title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Nike Air Max 90 - Size 42"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description or seller message
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Paste the listing description or any messages from the seller..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price
                    </label>
                    <input
                      type="text"
                      value={formData.price}
                      onChange={e => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="45"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Currency
                    </label>
                    <select
                      value={formData.currency}
                      onChange={e => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Brand <span className="text-gray-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.brand}
                      onChange={e => setFormData({ ...formData, brand: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Nike"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category <span className="text-gray-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Sneakers"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Condition <span className="text-gray-600">(optional)</span>
                    </label>
                    <select
                      value={formData.condition}
                      onChange={e => setFormData({ ...formData, condition: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select...</option>
                      <option value="New with tags">New with tags</option>
                      <option value="Like New">Like New</option>
                      <option value="Good">Good</option>
                      <option value="Satisfactory">Satisfactory</option>
                    </select>
                  </div>
                </div>

                {/* Photo upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Photos <span className="text-gray-600">(up to 8)</span>
                  </label>

                  {imagePreviews.length === 0 ? (
                    <div
                      onDrop={handleDrop}
                      onDragOver={e => e.preventDefault()}
                      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                      onClick={() => document.getElementById('image-upload')?.click()}
                    >
                      <Upload className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                      <p className="text-sm text-gray-600 mb-1">
                        Drag and drop images, or click to select
                      </p>
                      <p className="text-xs text-gray-500">
                        PNG, JPG up to 10MB each
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-3">
                      {imagePreviews.map((preview, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={preview}
                            alt={`Pregled fotografije oglasa ${i + 1}`}
                            className="w-full h-24 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            type="button"
                            aria-label={`Ukloni fotografiju ${i + 1}`}
                            onClick={() => removeImage(i)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {imagePreviews.length < 8 && (
                        <button
                          onClick={() => document.getElementById('image-upload')?.click()}
                          className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-gray-400 transition-colors"
                        >
                          <Upload className="w-6 h-6 text-gray-600" />
                        </button>
                      )}
                    </div>
                  )}

                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </section>

            {/* Seller Section */}
            <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <button
                onClick={() => setShowSellerSection(!showSellerSection)}
                className="w-full flex justify-between items-center text-left"
              >
                <h3 className="text-xl font-semibold text-gray-900">
                  Seller Profile <span className="text-sm font-normal text-gray-500">(optional)</span>
                </h3>
                <span className="text-gray-600">{showSellerSection ? '−' : '+'}</span>
              </button>

              {showSellerSection && (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-gray-600">
                    Enter details visible on the seller's Vinted profile. Leave blank if unknown.
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Number of reviews
                      </label>
                      <input
                        type="number"
                        value={sellerData.reviewCount}
                        onChange={e => setSellerData({ ...sellerData, reviewCount: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="23"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Average rating
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={sellerData.rating}
                        onChange={e => setSellerData({ ...sellerData, rating: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="4.8"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account age
                      </label>
                      <input
                        type="text"
                        value={sellerData.accountAge}
                        onChange={e => setSellerData({ ...sellerData, accountAge: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Member since 2022"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Completed transactions
                      </label>
                      <input
                        type="number"
                        value={sellerData.completedTransactions}
                        onChange={e => setSellerData({ ...sellerData, completedTransactions: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="45"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Review excerpts <span className="text-gray-600">(optional)</span>
                    </label>
                    <textarea
                      value={sellerData.reviewExcerpts}
                      onChange={e => setSellerData({ ...sellerData, reviewExcerpts: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Paste a few recent reviews to check for patterns..."
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Action buttons */}
            {formData.images.length > 0 && <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-800">
              <input type="checkbox" checked={analysisConsent} onChange={event => setAnalysisConsent(event.target.checked)} disabled={analyzing} className="mt-1" />
              <span>I agree to send these photos and the listing title, description, and condition to Google Gemini for analysis. <a href="/privacy" className="font-medium text-blue-800 underline">Privacy details</a>.</span>
            </label>}
            <div className="flex gap-3">
              <button
                onClick={analyzeSubmit}
                disabled={analyzing || (!formData.title && !formData.description) || (formData.images.length > 0 && !analysisConsent)}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                {analyzing ? 'Analyzing...' : 'Review Listing'}
              </button>
              <button
                onClick={clearAll}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Clear All
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Analysis Error</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Results results={results} onBack={() => setResults(null)} />
        )}
      </main>

      {/* Footer disclaimer */}
      <footer className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            <strong>Disclaimer:</strong> SecondLook is an independent tool and is not affiliated with Vinted.
            It does not access or verify Vinted accounts, listings, or reviews. Photo and text analysis can be wrong.
            A positive result does not guarantee a safe purchase.
          </p>
        </div>
        <nav aria-label="Pravne informacije" className="mt-4 flex flex-wrap gap-4 text-sm text-gray-700">
          <a href="/privacy" className="underline">Privatnost</a>
          <a href="/terms" className="underline">Uvjeti korištenja</a>
          <a href="/cookies" className="underline">Kolačići</a>
          <a href="mailto:info@transitly.eu" className="underline">info@transitly.eu</a>
        </nav>
      </footer>
    </div>
  );
}

function Results({ results, onBack }: { results: AnalysisResults; onBack: () => void }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'clear': return 'bg-green-50 border-green-200 text-green-900';
      case 'check-items': return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      case 'multiple-concerns': return 'bg-red-50 border-red-200 text-red-900';
      default: return 'bg-gray-50 border-gray-200 text-gray-900';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-blue-600 hover:text-blue-700 font-medium"
      >
        ← Back to form
      </button>

      {/* Overall summary */}
      <div className={`rounded-lg border-2 p-6 ${getStatusColor(results.overallStatus)}`}>
        <h3 className="text-xl font-semibold mb-2">
          {results.overallStatus === 'clear' && 'No obvious concerns found'}
          {results.overallStatus === 'check-items' && 'A few things to check'}
          {results.overallStatus === 'multiple-concerns' && 'Multiple concerns detected'}
        </h3>
        <p>{results.summary}</p>
      </div>

      {/* Photo findings */}
      {results.photoFindings.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Photo Review</h3>
          <div className="space-y-4">
            {results.photoFindings.map((finding, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4">
                <p className="font-medium text-gray-900 mb-2">Photo {finding.imageIndex + 1}</p>
                {finding.observations.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-medium text-gray-700">Observations:</p>
                    <ul className="text-sm text-gray-600 list-disc list-inside">
                      {finding.observations.map((obs, j) => (
                        <li key={j}>{obs}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {finding.concerns.length > 0 && (
                  <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-2">
                    <p className="text-sm font-medium text-yellow-900">Check this:</p>
                    <ul className="text-sm text-yellow-800 list-disc list-inside">
                      {finding.concerns.map((concern, j) => (
                        <li key={j}>{concern}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Text warnings */}
      {results.textWarnings.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Listing & Message Checks</h3>
          <div className="space-y-3">
            {results.textWarnings.map((warning, i) => (
              <div key={i} className="border-l-4 border-red-500 bg-red-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-gray-900">{warning.message}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityBadge(warning.severity)}`}>
                        {warning.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{warning.explanation}</p>
                    {warning.trigger && (
                      <p className="text-xs text-gray-600 mt-1">
                        Triggered by: "{warning.trigger}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Seller assessment */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Seller Profile</h3>

        {results.sellerAssessment.warnings.length > 0 && (
          <div className="mb-4 space-y-2">
            {results.sellerAssessment.warnings.map((warning, i) => (
              <div key={i} className="border-l-4 border-yellow-500 bg-yellow-50 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-gray-900">{warning.message}</p>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityBadge(warning.severity)}`}>
                    {warning.severity}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{warning.explanation}</p>
              </div>
            ))}
          </div>
        )}

        {results.sellerAssessment.positives.length > 0 && (
          <div className="mb-4 space-y-2">
            {results.sellerAssessment.positives.map((positive, i) => (
              <div key={i} className="border-l-4 border-green-500 bg-green-50 p-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">{positive.message}</p>
                    <p className="text-sm text-gray-700">{positive.explanation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {results.sellerAssessment.unknowns.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded p-3">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-700 mb-1">Not enough information:</p>
                <ul className="text-sm text-gray-600 list-disc list-inside">
                  {results.sellerAssessment.unknowns.map((unknown, i) => (
                    <li key={i}>{unknown}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* What to do next */}
      <section className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">What to do next</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <span>Keep all payment and communication on Vinted's platform</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <span>Read seller reviews carefully and look for patterns</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <span>Ask the seller for additional photos if needed</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <span>If something feels wrong, use Vinted's reporting system</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
