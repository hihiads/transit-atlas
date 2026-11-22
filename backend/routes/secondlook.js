import express from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileTypeFromBuffer } from 'file-type';

const router = express.Router();

// Configure multer for image uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 8
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  }
});

// Initialize Gemini AI
let genAI;
try {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not configured. Photo analysis will not work.');
  } else {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch (error) {
  console.error('Failed to initialize Gemini AI:', error);
}

router.post('/analyze-photos', upload.array('images', 8), async (req, res) => {
  try {
    // Check if Gemini is configured
    if (!genAI) {
      return res.status(503).json({
        error: 'Photo analysis is not configured. Please add GEMINI_API_KEY to server environment.'
      });
    }

    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const { title = '', description = '', condition = '' } = req.body;

    // Validate file types
    const validatedImages = [];
    for (const file of files) {
      const fileType = await fileTypeFromBuffer(file.buffer);
      if (!fileType || !fileType.mime.startsWith('image/')) {
        return res.status(400).json({ error: 'Invalid file type detected' });
      }

      // Convert to base64 for Gemini
      validatedImages.push({
        inlineData: {
          data: file.buffer.toString('base64'),
          mimeType: fileType.mime
        }
      });
    }

    // Get the model
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    });

    const findings = [];

    // Analyze each image
    for (let i = 0; i < validatedImages.length; i++) {
      const prompt = `You are analyzing a product photo from an online marketplace listing.

Listing details:
- Title: ${title || 'Not provided'}
- Description: ${description || 'Not provided'}
- Stated condition: ${condition || 'Not provided'}

Please provide:
1. What you observe in the image (item type, color, visible features)
2. Any visible wear, damage, stains, or unclear areas
3. Whether the photo matches the listing details
4. Whether important details are missing or unclear

Be factual and specific. Use cautious language like "appears to be" or "possibly". If you cannot determine something, say so explicitly. Do not make definitive authenticity claims.

Format your response as:
OBSERVATIONS: [list what you see]
CONCERNS: [list any concerns, or "None identified"]`;

      try {
        const result = await model.generateContent([prompt, validatedImages[i]]);
        const response = await result.response;
        const text = response.text();

        // Parse the response
        const observations = [];
        const concerns = [];

        const obsMatch = text.match(/OBSERVATIONS:([\s\S]*?)(?=CONCERNS:|$)/i);
        const concernMatch = text.match(/CONCERNS:([\s\S]*?)$/i);

        if (obsMatch) {
          const obsText = obsMatch[1].trim();
          observations.push(...obsText.split('\n').filter(line => line.trim() && !line.match(/^[-•*]\s*$/)));
        }

        if (concernMatch) {
          const concernText = concernMatch[1].trim();
          if (!concernText.toLowerCase().includes('none identified') && concernText) {
            concerns.push(...concernText.split('\n').filter(line => line.trim() && !line.match(/^[-•*]\s*$/)));
          }
        }

        findings.push({
          imageIndex: i,
          observations: observations.length > 0 ? observations : ['Analysis completed but no specific observations generated'],
          concerns: concerns
        });
      } catch (error) {
        console.error(`Error analyzing image ${i}:`, error);
        findings.push({
          imageIndex: i,
          observations: ['Could not analyze this image'],
          concerns: [`Analysis failed: ${error.message}`]
        });
      }
    }

    res.json({ findings });
  } catch (error) {
    console.error('Photo analysis error:', error);

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum 10MB per image.' });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum 8 images.' });
    }

    res.status(500).json({
      error: 'Photo analysis failed. Please try again or continue without photos.'
    });
  }
});

export default router;
