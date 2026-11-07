import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-sunburst';
const OPENAI_FALLBACK_MODELS = ['gpt-image-2.5-sunburst'];

type OpenAIResult =
  | { ok: true; base64: string; mimeType: string; model: string }
  | { ok: false; status: number; error: string; fatal: boolean };

// Turns an OpenAI error payload into a user-facing message and says whether retrying can ever help
function describeOpenAIError(status: number, body: any): { error: string; fatal: boolean; modelMissing: boolean } {
  const code = String(body?.error?.code || body?.error?.type || '');
  const message = String(body?.error?.message || `OpenAI request failed (HTTP ${status}).`);
  if (status === 401 || code === 'invalid_api_key') {
    return { error: `OpenAI rejected the API key (${message})`, fatal: true, modelMissing: false };
  }
  if (/must be verified|organization.*verif/i.test(message)) {
    return {
      error: `This OpenAI model requires a verified organization: ${message}`,
      fatal: true,
      modelMissing: false,
    };
  }
  if (code === 'insufficient_quota' || /billing|exceeded your current quota/i.test(message)) {
    return { error: `OpenAI quota / billing problem: ${message}`, fatal: true, modelMissing: false };
  }
  if (status === 404 || code === 'model_not_found' || /does not exist|do not have access to (the )?model/i.test(message)) {
    return { error: `OpenAI model not available: ${message}`, fatal: true, modelMissing: true };
  }
  if (code === 'moderation_blocked') {
    return {
      error: `OpenAI's safety system blocked this image request (${message})`,
      fatal: false,
      modelMissing: false,
    };
  }
  return { error: message, fatal: false, modelMissing: false };
}

async function generateWithOpenAI(params: {
  apiKey: string;
  model: string;
  prompt: string;
  refs: string[];
  size: string;
}): Promise<OpenAIResult> {
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const quality = process.env.OPENAI_IMAGE_QUALITY || 'high';
  const requested = params.model || DEFAULT_OPENAI_MODEL;
  // Only the default model has a fallback; an explicitly chosen model must fail loudly if it is unavailable
  const models = requested === DEFAULT_OPENAI_MODEL ? [requested, ...OPENAI_FALLBACK_MODELS] : [requested];
  let last: OpenAIResult = { ok: false, status: 502, error: 'OpenAI returned no image.', fatal: false };

  for (const model of models) {
    try {
      let response: Response;
      if (params.refs.length) {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', params.prompt);
        form.append('size', params.size);
        form.append('quality', quality);
        form.append('n', '1');
        params.refs.forEach((ref, i) => {
          const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/s.exec(ref);
          const mime = m?.[1] === 'image/jpg' ? 'image/jpeg' : m?.[1] || 'image/png';
          const ext = mime.split('/')[1].replace('jpeg', 'jpg');
          const bytes = Buffer.from(m ? m[2] : ref, 'base64');
          form.append('image[]', new Blob([bytes], { type: mime }), `reference-${i + 1}.${ext}`);
        });
        response = await fetch(`${base}/images/edits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${params.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(290_000),
        });
      } else {
        response = await fetch(`${base}/images/generations`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${params.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: params.prompt, size: params.size, quality, n: 1 }),
          signal: AbortSignal.timeout(290_000),
        });
      }

      const body: any = await response.json().catch(() => null);
      if (!response.ok) {
        const info = describeOpenAIError(response.status, body);
        last = { ok: false, status: response.status === 401 ? 401 : response.status >= 500 ? 502 : response.status, error: info.error, fatal: info.fatal };
        if (info.modelMissing) continue;
        return last;
      }

      const item = body?.data?.[0];
      if (item?.b64_json) {
        return { ok: true, base64: item.b64_json, mimeType: 'image/png', model };
      }
      if (item?.url) {
        const img = await fetch(item.url);
        const buf = Buffer.from(await img.arrayBuffer());
        return { ok: true, base64: buf.toString('base64'), mimeType: img.headers.get('content-type') || 'image/png', model };
      }
      last = { ok: false, status: 502, error: `${model} returned no image.`, fatal: false };
      return last;
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return {
        ok: false,
        status: 504,
        error: timedOut ? 'OpenAI took too long to answer (over 290 seconds).' : `Could not reach OpenAI: ${err?.message || err}`,
        fatal: false,
      };
    }
  }
  return last;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Body parser with 50MB limit for high-res base64 image uploads and generation
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // AI Character & sprite sheet generation endpoint. `provider` selects the image backend: 'gemini' (default) or 'openai'.
  app.post('/api/generate-expression', async (req, res) => {
    try {
      const {
        apiKey,
        imageBase64,
        referenceImages,
        cells,
        mimeType = 'image/png',
        prompt,
        style = 'pixar',
        expression = 'rest',
        skinColorDescription,
        model: requestedModel,
      } = req.body;
      const provider: 'gemini' | 'openai' = req.body.provider === 'openai' ? 'openai' : 'gemini';

      const effectiveApiKey =
        (apiKey && apiKey.trim()) || (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY);

      if (!effectiveApiKey) {
        return res.status(400).json({
          success: false,
          fatal: true,
          error:
            provider === 'openai'
              ? 'OpenAI API key is required. Please enter your OpenAI API key in the Settings panel.'
              : 'Gemini API key is required. Please enter your Gemini API key in the Settings panel.',
        });
      }

      const parts: any[] = [];

      // Multimodal reference images, in order (image 1 = master character, image 2 = original photo)
      const refs: string[] = Array.isArray(referenceImages) ? referenceImages.filter(Boolean) : [];
      if (!refs.length && imageBase64) refs.push(imageBase64);
      for (const ref of refs) {
        const mimeMatch = /^data:(image\/[a-zA-Z0-9+.-]+);base64,/.exec(ref);
        parts.push({
          inlineData: {
            data: ref.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, ''),
            mimeType: mimeMatch?.[1] || mimeType || 'image/png',
          },
        });
      }

      let promptText = prompt;
      if (!promptText) {
        const skinNote = skinColorDescription
          ? `SKIN TONE: Match the person's true natural complexion (${skinColorDescription}) with clean, bright, warm studio key lighting.`
          : 'SKIN TONE: Match the person’s natural skin tone from the photo with clean, warm studio lighting.';

        if (expression === 'rest') {
          const styleDesc =
            style === 'pixar'
              ? 'a high-end stylized 3D character head portrait (like a charming Pixar / Disney / Apple Memoji 3D studio character with smooth subsurface-scattered skin, expressive 3D eyes, and sculpted 3D hair strands)'
              : 'a lifelike photorealistic 3D digital human head portrait with studio-lit skin and finely rendered 3D hair';

          promptText = `Transform the person in this reference photo into ${styleDesc}.
CRITICAL RULES:
1. RECOGNIZABLE FACIAL IDENTITY & HAIR - THIS MUST LOOK LIKE THIS SPECIFIC PERSON, NOT A GENERIC PRETTY AVATAR: Preserve the person's exact facial structure and proportions (face width and shape, cheek fullness, jawline, chin, forehead, hairline), hairstyle and hair color/texture/length/volume (keep short hair short; keep long, curly or wavy hair long, curly or wavy), eyebrow shape and thickness, eye shape, eye color and eyeliner/makeup, nose shape and size, lip shape and color, skin features, and every signature accessory (glasses, hoop or stud earrings, nose stud/ring, piercings, beard/stubble). Do NOT beautify, slim, idealize or westernize the face, and do NOT reuse any pre-existing mascot or character look.
2. FLOATING HEAD AVATAR ONLY (ZERO NECK, ZERO SHOULDERS): Render ONLY the floating 3D head and hair ending cleanly right at the bottom curve of the chin and jawline—like a floating 3D Memoji icon. Do NOT render any neck, throat, collar, turtleneck, sweater, scarf knot, shirt, tie, or shoulders below the chin, even if the person in the photo is wearing one—cut the avatar off at the chin (a hood, hijab or scarf framing the face is fine, but nothing below the jaw).
3. ${skinNote}
4. EXPRESSION: Ignore whatever expression or pose the person has in the photo (pout, duck face, tilted head...). Render a friendly, natural, front-facing resting expression looking straight ahead at the camera with a gentle warm smile and the head perfectly upright.
5. BACKGROUND & FRAMING: Place the floating 3D head centered on a flat, uniform solid chroma-key green (#00FF00) background. The COMPLETE head including ALL hair, scarf/hijab/hat and accessories must be fully visible inside the frame - nothing may be cut off by any edge - and fill about 82% of the frame height with an even green margin of about 9% on every side. Large and sharp, never tiny.`;
        } else if (expression === 'grid' && Array.isArray(cells) && cells.length > 0) {
          const total = cells.length;
          const side = Math.ceil(Math.sqrt(total));
          const rows = Math.ceil(total / side);
          const cellList = cells
            .map((c: string, i: number) => `- Cell ${i + 1} (row ${Math.floor(i / side) + 1}, column ${(i % side) + 1}): ${c}`)
            .join('\n');
          const hasPhoto = refs.length > 1;
          const styleNote =
            style === 'pixar'
              ? 'the same high-end stylized 3D (Pixar / Memoji-like) rendering, materials, lighting and level of detail'
              : 'the same lifelike photorealistic 3D digital human rendering, materials, lighting and level of detail';

          promptText = `Reference image 1 is the MASTER 3D character: a floating head on a flat chroma-key green background.${
            hasPhoto ? ' Reference image 2 is the real photo of the person the character is based on - use it only to keep the facial structure exactly right.' : ''
          }
This is an IMAGE EDIT of the master, repeated ${total} times in one sheet. Generate ONE square image containing a clean, borderless ${side}x${rows} sprite sheet (${rows} rows by ${side} columns of equal square cells, NO divider lines, NO borders, NO labels, NO text) on a flat uniform solid chroma-key green (#00FF00) background. Every cell is the master character, copied exactly, with only the listed facial change applied.
IDENTITY + RENDER LOCK (most important): copy the master pixel-for-pixel wherever the cell does not mention a change - same face shape, jawline, hairstyle with the same hair strands and parting, ears, earrings and accessories, skin tone, skin texture, makeup, lighting, color grading, rendering style and level of detail (${styleNote}).
POSE + FRAMING LOCK: the head must NOT rotate, tilt, nod, shift or change size - exactly the same pose, position, scale and silhouette as the master in every cell (the head fills about 82% of the height of its cell, fully inside it), centered, upright, facing the camera; NO neck, NO shoulders, NO body. Hair must not move. Nothing (bubbles, hearts, tears, hands) may cross a cell border.
Only the eyes, eyelids, eyebrows, mouth, cheeks and the listed effects change. Gaze directions are named from the VIEWER's point of view (right = right side of the image) and move only the irises/pupils inside the eyes.
Cells in reading order:
${cellList}`;
        } else {
          promptText = `Using this 3D floating head character as the exact reference, keep the exact same 3D head, hairstyle, skin tone,floating-head framing (no neck or shoulders), and flat uniform solid chroma-key green (#00FF00) background, changing only the expression to: ${expression}.`;
        }
      }

      if (provider === 'openai') {
        const gridSize = Array.isArray(cells) && cells.length > 0;
        const result = await generateWithOpenAI({
          apiKey: effectiveApiKey,
          model: typeof requestedModel === 'string' ? requestedModel.trim() : '',
          prompt: promptText,
          refs,
          size: gridSize ? process.env.OPENAI_SHEET_SIZE || '2048x2048' : process.env.OPENAI_MASTER_SIZE || '1024x1024',
        });
        if (result.ok) {
          return res.json({
            success: true,
            provider,
            modelUsed: result.model,
            imageUrl: `data:${result.mimeType};base64,${result.base64}`,
            mimeType: result.mimeType,
          });
        }
        return res.status(result.status).json({
          success: false,
          provider,
          fatal: result.fatal,
          fallbackRecommended: true,
          error: result.error,
        });
      }

      const ai = new GoogleGenAI({
        apiKey: effectiveApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      parts.push({ text: promptText });

      const modelsToTry = [
        ...(process.env.GEMINI_IMAGE_MODEL ? [process.env.GEMINI_IMAGE_MODEL] : []),
        'gemini-3.1-flash-image',
        'gemini-3-pro-image',
        'gemini-3.1-flash-lite-image',
        'gemini-2.5-flash-image',
      ];
      let lastError: any = null;

      for (const modelName of modelsToTry) {
        for (const withSize of [true, false]) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts,
            },
            config: {
              imageConfig: {
                aspectRatio: '1:1',
                ...(withSize ? { imageSize: '2K' } : {}),
              },
            },
          });

          let generatedImageBase64: string | null = null;
          let generatedMimeType = 'image/png';
          let textMessage = '';

          for (const part of response.candidates?.[0]?.content?.parts ?? []) {
            if (part.inlineData?.data) {
              generatedImageBase64 = part.inlineData.data;
              generatedMimeType = part.inlineData.mimeType || 'image/png';
              break;
            } else if (part.text) {
              textMessage += part.text;
            }
          }

          if (generatedImageBase64) {
            return res.json({
              success: true,
              modelUsed: modelName,
              imageUrl: `data:${generatedMimeType};base64,${generatedImageBase64}`,
              mimeType: generatedMimeType,
              text: textMessage,
            });
          }
          lastError = new Error(textMessage || `${modelName} returned no image.`);
          break;
        } catch (err: any) {
          lastError = err;
          // Only retry the same model without imageSize when that option itself was rejected
          if (!(withSize && /image.?size|imageConfig|INVALID_ARGUMENT/i.test(String(err?.message)))) break;
        }
        }
      }

      return res.status(429).json({
        success: false,
        fallbackRecommended: true,
        error: lastError?.message || 'Image generation model quota reached on this API key.',
      });
    } catch (err: any) {
      console.error('Error generating expression:', err);
      return res.status(500).json({
        success: false,
        fallbackRecommended: true,
        error: err.message || 'Failed to generate 3D expression with Gemini.',
      });
    }
  });

  // Health and config status endpoint
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'ok',
      hasServerKey: Boolean(process.env.GEMINI_API_KEY),
      hasOpenAIServerKey: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
      openaiModel: DEFAULT_OPENAI_MODEL,
    });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
