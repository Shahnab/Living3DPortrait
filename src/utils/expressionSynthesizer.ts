/**
 * Procedural fallback for the character sprite-sheet / eyeball rig (`buildCompleteCharacterPack`).
 * Used only for frames that the AI sheets in `aiCharacterPack.ts` could not deliver.
 *
 * Designed to match every detail of the Mina character (Screen Recording reference):
 * 1. True 3-Layer Eyeball Compositor (`render3DEyeballGaze`):
 *    - Layer 1: Overwrites 100% of the open eyeball (both old sclera and old resting iris)
 *      with a clean, 3D-shaded white sclera eyeball sphere—completely eliminating any leftover
 *      iris crescent or grey ring when looking left/right/up/down!
 *    - Layer 2: Translates the extracted circular 3D Iris + Pupil + Catchlight disc by a uniform
 *      rigid offset `(dx, dy)` clipped strictly inside the open eye aperture.
 *    - Layer 3: Preserves the upper eyelash arch and subtle upper-lid shadow on top of the eyeball.
 * 2. 32 Multi-Ring Gaze Transition States (16 Near-Gaze Ring + 16 Full-Gaze Ring) + 4-Step Blink
 *    (`blink25`, `half`, `blink75`, `closed`) for butter-smooth cursor tracking and blinking while
 *    keeping 100% of the head, hair, earrings, and face outline pixel-locked!
 * 3. Rich 3D Expressive Faces matching Mina's signature interactions:
 *    - `laugh` (happy crescent eyes + 3D open mouth with upper teeth & tongue)
 *    - `shock` / `scared` (wide sclera eyes + raised brows + 3D open 'O' gasp mouth)
 *    - `ouch` / `scrunch` (tightly wincing chevron eyes + wrinkled nose scrunch + teeth grimace)
 *    - `cross` (clean crossed irises looking at nose bridge + cute open 'o' mouth)
 *    - `angry` (deep V-furrowed brows + glaring lids + grumpy pout)
 *    - `smug` / `raised` (one cocked brow + cool half-lidded side-eye + asymmetric smirk)
 *    - `kiss` (closed sleeping lashes + 3D sculpted puckered kissing lips)
 *    - `hearts` (glowing 3D ruby-red heart eyes + joyful open laugh)
 *    - `stars` (glowing 3D golden star eyes + excited open smile)
 *    - `gum1..3` & `gumpop` (growing 3D pink bubblegum spheres -> splattered pink gum over nose & cheeks!)
 *    - `tongue` (playful wink + 3D pink tongue sticking out)
 */

import {
  loadImage,
  ensureTransparentCharacterPng,
  getOpaqueHeadBounds,
  type FaceLayout,
} from './faceIsolation';
import {
  SHEETS,
  PROVIDER_NAMES,
  generateAiExpressionSheets,
  requestImage,
  type ImageProviderConfig,
} from './aiCharacterPack';

export type ExpressionMap = Record<string, string>;

interface EyeLandmark {
  x: number; // normalized 0..1 center X of eye opening
  y: number; // normalized 0..1 center Y of eye opening
  rx: number; // normalized horizontal half-width of eye opening
  ry: number; // normalized vertical half-height of eye opening
  irisCx: number; // normalized 0..1 center X of resting iris
  irisCy: number; // normalized 0..1 center Y of resting iris
  irisR: number; // normalized radius of circular iris disc
  scleraRgb: [number, number, number];
  irisRgb: [number, number, number];
  lashRgb: [number, number, number];
}

interface FaceLandmarks {
  eyeL: EyeLandmark;
  eyeR: EyeLandmark;
  nose: { x: number; y: number };
  mouth: { x: number; y: number; rx: number; ry: number; lipRgb: [number, number, number] };
  skinRgb: [number, number, number];
}

interface WarpInstruction {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  dx: number;
  dy: number;
}

/**
 * Detects the Face Skin Bounding Box (ignoring hair volume) and locates the exact
 * eye socket openings, resting iris discs, nose, and mouth landmarks.
 */
function detectFaceLandmarks(ctx: CanvasRenderingContext2D, size: number): FaceLandmarks {
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;
  const headBounds = getOpaqueHeadBounds(ctx, size, size);

  const hMinX = headBounds.valid ? headBounds.minX : Math.floor(size * 0.15);
  const hMaxX = headBounds.valid ? headBounds.maxX : Math.floor(size * 0.85);
  const hMinY = headBounds.valid ? headBounds.minY : Math.floor(size * 0.10);
  const hMaxY = headBounds.valid ? headBounds.maxY : Math.floor(size * 0.90);

  // 1. Sample average skin RGB and find the Face Skin Bounding Box (excluding dark/curly hair)
  let sR = 0,
    sG = 0,
    sB = 0,
    sCount = 0;

  const centerX0 = Math.floor(hMinX + (hMaxX - hMinX) * 0.28);
  const centerX1 = Math.floor(hMinX + (hMaxX - hMinX) * 0.72);
  const centerY0 = Math.floor(hMinY + (hMaxY - hMinY) * 0.35);
  const centerY1 = Math.floor(hMinY + (hMaxY - hMinY) * 0.72);

  for (let y = centerY0; y <= centerY1; y += 2) {
    for (let x = centerX0; x <= centerX1; x += 2) {
      const idx = (y * size + x) * 4;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2],
        a = data[idx + 3];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (a > 200 && lum > 85 && lum < 235 && r > g && g >= b * 0.85 && r - b > 18) {
        sR += r;
        sG += g;
        sB += b;
        sCount++;
      }
    }
  }

  const skinRgb: [number, number, number] =
    sCount > 0
      ? [Math.round(sR / sCount), Math.round(sG / sCount), Math.round(sB / sCount)]
      : [224, 178, 148];
  const skinLum = 0.299 * skinRgb[0] + 0.587 * skinRgb[1] + 0.114 * skinRgb[2];

  // Scan for the Face Skin Bounding Box so wide/curly hair doesn't skew landmark ratios
  let skinMinX = size,
    skinMaxX = 0,
    skinMinY = size,
    skinMaxY = 0,
    skinPixCount = 0;

  for (let y = hMinY; y <= hMaxY; y += 2) {
    for (let x = hMinX; x <= hMaxX; x += 2) {
      const idx = (y * size + x) * 4;
      if (data[idx + 3] < 200) continue;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      const distToSkin = Math.abs(r - skinRgb[0]) + Math.abs(g - skinRgb[1]) + Math.abs(b - skinRgb[2]);
      if (distToSkin < 95 && r > b + 14) {
        if (x < skinMinX) skinMinX = x;
        if (x > skinMaxX) skinMaxX = x;
        if (y < skinMinY) skinMinY = y;
        if (y > skinMaxY) skinMaxY = y;
        skinPixCount++;
      }
    }
  }

  const fMinX = (skinPixCount > 200 ? skinMinX : hMinX + (hMaxX - hMinX) * 0.15) / size;
  const fMaxX = (skinPixCount > 200 ? skinMaxX : hMaxX - (hMaxX - hMinX) * 0.15) / size;
  const fMinY = (skinPixCount > 200 ? skinMinY : hMinY + (hMaxY - hMinY) * 0.15) / size;
  const fMaxY = (skinPixCount > 200 ? skinMaxY : hMaxY - (hMaxY - hMinY) * 0.08) / size;
  const fW = Math.max(0.28, fMaxX - fMinX);
  const fH = Math.max(0.28, fMaxY - fMinY);

  // 2. Detect each eye's exact sclera opening and iris disc inside the Face Skin Box
  const findEye = (
    relX0: number,
    relX1: number,
    relY0: number,
    relY1: number,
    defaultRelX: number,
    defaultRelY: number
  ): EyeLandmark => {
    const sx0 = Math.max(2, Math.floor((fMinX + fW * relX0) * size));
    const sx1 = Math.min(size - 3, Math.ceil((fMinX + fW * relX1) * size));
    const sy0 = Math.max(2, Math.floor((fMinY + fH * relY0) * size));
    const sy1 = Math.min(size - 3, Math.ceil((fMinY + fH * relY1) * size));

    const defaultX = fMinX + fW * defaultRelX;
    const defaultY = fMinY + fH * defaultRelY;

    const off1 = Math.max(4, Math.round(size * 0.015));
    const off2 = Math.max(9, Math.round(size * 0.030));
    const off3 = Math.max(14, Math.round(size * 0.045));

    const isScleraCandidate = (px: number, py: number): boolean => {
      if (px < 0 || px >= size || py < 0 || py >= size) return false;
      const i = (py * size + px) * 4;
      if (data[i + 3] < 200) return false;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const warmth = r - b;
      return lum > 118 && (sat < 58 || warmth < (skinRgb[0] - skinRgb[2]) * 0.55);
    };

    // Locate iris center (dark circular cluster flanked horizontally by sclera)
    let sumX = 0,
      sumY = 0,
      sumW = 0;

    for (let y = sy0; y <= sy1; y++) {
      for (let x = sx0; x <= sx1; x++) {
        const idx = (y * size + x) * 4;
        if (data[idx + 3] < 200) continue;
        const r = data[idx],
          g = data[idx + 1],
          b = data[idx + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (lum < 92) {
          const hasLeftSclera =
            isScleraCandidate(x - off1, y) ||
            isScleraCandidate(x - off2, y) ||
            isScleraCandidate(x - off3, y);
          const hasRightSclera =
            isScleraCandidate(x + off1, y) ||
            isScleraCandidate(x + off2, y) ||
            isScleraCandidate(x + off3, y);

          if (hasLeftSclera || hasRightSclera) {
            const bothBonus = hasLeftSclera && hasRightSclera ? 6.0 : 1.2;
            const w = Math.pow(98 - lum, 2) * bothBonus;
            sumX += (x / size) * w;
            sumY += (y / size) * w;
            sumW += w;
          }
        }
      }
    }

    let irisCx = defaultX;
    let irisCy = defaultY;
    if (sumW > 120) {
      const candX = sumX / sumW;
      const candY = sumY / sumW;
      if (Math.abs(candX - defaultX) < fW * 0.14 && Math.abs(candY - defaultY) < fH * 0.14) {
        irisCx = candX;
        irisCy = candY;
      }
    }

    // Measure exact iris radius & eye opening bounds around (irisCx, irisCy)
    const pcx = Math.round(irisCx * size);
    const pcy = Math.round(irisCy * size);
    const maxScanRx = Math.round(fW * 0.15 * size);
    const maxScanRy = Math.round(fH * 0.09 * size);

    // Raycast left and right from (pcx, pcy) to measure exact iris horizontal radius
    let irisLeft = pcx;
    while (irisLeft > pcx - maxScanRx) {
      const i = (pcy * size + irisLeft) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      // Stop when hitting bright sclera or warm skin (allow white catchlight inside iris)
      if (lum > 110 && !(lum > 205 && sat < 35 && Math.abs(irisLeft - pcx) < maxScanRx * 0.45)) {
        break;
      }
      irisLeft--;
    }

    let irisRight = pcx;
    while (irisRight < pcx + maxScanRx) {
      const i = (pcy * size + irisRight) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      if (lum > 110 && !(lum > 205 && sat < 35 && Math.abs(irisRight - pcx) < maxScanRx * 0.45)) {
        break;
      }
      irisRight++;
    }

    // Refine irisCx to the exact midpoint of [irisLeft, irisRight]
    if (irisRight - irisLeft >= 6) {
      irisCx = ((irisLeft + irisRight) * 0.5) / size;
    }
    const measuredIrisR = ((irisRight - irisLeft) * 0.52) / size;
    const irisR = Math.max(fW * 0.036, Math.min(fW * 0.068, measuredIrisR));

    // Continue scanning outward from irisLeft and irisRight through the white sclera to find eye corners
    let eyeLeft = irisLeft;
    while (eyeLeft > pcx - maxScanRx) {
      if (!isScleraCandidate(eyeLeft - 1, pcy) && !isScleraCandidate(eyeLeft - 1, pcy + 2)) {
        break;
      }
      eyeLeft--;
    }

    let eyeRight = irisRight;
    while (eyeRight < pcx + maxScanRx) {
      if (!isScleraCandidate(eyeRight + 1, pcy) && !isScleraCandidate(eyeRight + 1, pcy + 2)) {
        break;
      }
      eyeRight++;
    }

    // Sample sclera RGB, iris RGB, and lash RGB
    let sclR = 242,
      sclG = 238,
      sclB = 236,
      bestSclScore = -1;
    let irR = 62,
      irG = 42,
      irB = 32,
      irCnt = 0;
    let lshR = 24,
      lshG = 18,
      lshB = 16,
      minLshLum = 999;

    for (let y = Math.max(0, pcy - maxScanRy); y <= Math.min(size - 1, pcy + maxScanRy); y++) {
      for (let x = Math.max(0, pcx - maxScanRx); x <= Math.min(size - 1, pcx + maxScanRx); x++) {
        const i = (y * size + x) * 4;
        if (data[i + 3] < 200) continue;
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const sclScore = lum - sat * 1.4;
        if (sclScore > bestSclScore && lum > 145) {
          bestSclScore = sclScore;
          sclR = Math.max(232, r);
          sclG = Math.max(228, g);
          sclB = Math.max(226, b);
        }
        if (lum < minLshLum) {
          minLshLum = lum;
          lshR = r;
          lshG = g;
          lshB = b;
        }
        const distFromIris = Math.hypot(x - irisCx * size, y - irisCy * size);
        if (distFromIris < irisR * size * 0.85 && lum > 25 && lum < 105) {
          irR += r;
          irG += g;
          irB += b;
          irCnt++;
        }
      }
    }

    if (irCnt > 5) {
      irR = Math.round(irR / irCnt);
      irG = Math.round(irG / irCnt);
      irB = Math.round(irB / irCnt);
    }

    const eyeCx = ((eyeLeft + eyeRight) * 0.5) / size;
    const measuredEyeRx = ((eyeRight - eyeLeft) * 0.54) / size;
    // Guarantee eyeRx covers at least 1.52x irisR so 100% of the resting iris is ALWAYS inside the eye opening
    const rx = Math.max(irisR * 1.52, Math.min(fW * 0.125, measuredEyeRx));
    const ry = Math.max(irisR * 1.06, Math.min(fH * 0.075, rx * 0.68));

    return {
      x: eyeCx,
      y: irisCy,
      rx,
      ry,
      irisCx,
      irisCy,
      irisR,
      scleraRgb: [sclR, sclG, sclB],
      irisRgb: [irR, irG, irB],
      lashRgb: [lshR, lshG, lshB],
    };
  };

  const eyeLRaw = findEye(0.14, 0.48, 0.28, 0.58, 0.31, 0.44);
  const eyeRRaw = findEye(0.52, 0.86, 0.28, 0.58, 0.69, 0.44);

  const avgEyeY = (eyeLRaw.y + eyeRRaw.y) * 0.5;
  const avgIrisR = (eyeLRaw.irisR + eyeRRaw.irisR) * 0.5;
  const avgRx = Math.max(avgIrisR * 1.52, (eyeLRaw.rx + eyeRRaw.rx) * 0.5);
  const avgRy = Math.max(avgIrisR * 1.06, (eyeLRaw.ry + eyeRRaw.ry) * 0.5);

  const eyeL: EyeLandmark = {
    ...eyeLRaw,
    y: avgEyeY,
    irisCy: avgEyeY,
    irisR: avgIrisR,
    rx: avgRx,
    ry: avgRy,
  };
  const eyeR: EyeLandmark = {
    ...eyeRRaw,
    y: avgEyeY,
    irisCy: avgEyeY,
    irisR: avgIrisR,
    rx: avgRx,
    ry: avgRy,
  };

  const eyeDist = Math.max(0.16, eyeR.x - eyeL.x);
  const nose = {
    x: (eyeL.x + eyeR.x) * 0.5,
    y: avgEyeY + eyeDist * 0.44,
  };

  // 3. Detect mouth center & lip color below nose
  let mSumY = 0,
    mSumW = 0;
  let lipR = 188,
    lipG = 96,
    lipB = 92,
    lipCnt = 0;
  const my0 = Math.floor((nose.y + eyeDist * 0.18) * size);
  const my1 = Math.floor(Math.min(fMaxY - 0.03, nose.y + eyeDist * 0.75) * size);
  const mx0 = Math.floor((nose.x - eyeDist * 0.36) * size);
  const mx1 = Math.floor((nose.x + eyeDist * 0.36) * size);

  for (let y = my0; y <= my1; y += 2) {
    for (let x = mx0; x <= mx1; x += 2) {
      if (x < 0 || x >= size || y < 0 || y >= size) continue;
      const idx = (y * size + x) * 4;
      if (data[idx + 3] < 200) continue;
      const r = data[idx],
        g = data[idx + 1],
        b = data[idx + 2];
      const redness = Math.max(0, r - g - (skinRgb[0] - skinRgb[1]) + 10);
      const darkCrease = Math.max(0, skinLum * 0.82 - (0.299 * r + 0.587 * g + 0.114 * b));
      const score = redness * 1.5 + darkCrease;
      if (score > 16) {
        mSumY += (y / size) * score;
        mSumW += score;
        if (redness > 12) {
          lipR += r;
          lipG += g;
          lipB += b;
          lipCnt++;
        }
      }
    }
  }

  const mouthY =
    mSumW > 150
      ? Math.max(nose.y + eyeDist * 0.24, Math.min(fMaxY - 0.05, mSumY / mSumW))
      : avgEyeY + eyeDist * 0.88;

  const mouth = {
    x: nose.x,
    y: mouthY,
    rx: eyeDist * 0.42,
    ry: eyeDist * 0.20,
    lipRgb: (lipCnt > 5
      ? [Math.round(lipR / lipCnt), Math.round(lipG / lipCnt), Math.round(lipB / lipCnt)]
      : [
          Math.round(skinRgb[0] * 0.84),
          Math.round(skinRgb[1] * 0.52),
          Math.round(skinRgb[2] * 0.52),
        ]) as [number, number, number],
  };

  return { eyeL, eyeR, nose, mouth, skinRgb };
}

/**
 * Applies a C2-smooth local UV displacement warp (used ONLY for non-gaze facial expressions).
 */
function applyLocalWarps(
  basePixels: Uint8ClampedArray,
  size: number,
  warps: WarpInstruction[]
): ImageData {
  const dst = new Uint8ClampedArray(basePixels);
  const src = new Uint8ClampedArray(basePixels);

  for (let wIdx = 0; wIdx < warps.length; wIdx++) {
    if (wIdx > 0) {
      src.set(dst);
    }
    const w = warps[wIdx];
    const cx = w.cx * size;
    const cy = w.cy * size;
    const rx = Math.max(2, w.rx * size);
    const ry = Math.max(2, w.ry * size);
    const dx = w.dx * size;
    const dy = w.dy * size;

    const x0 = Math.max(1, Math.floor(cx - rx));
    const x1 = Math.min(size - 2, Math.ceil(cx + rx));
    const y0 = Math.max(1, Math.floor(cy - ry));
    const y1 = Math.min(size - 2, Math.ceil(cy + ry));

    const invRx = 1 / rx;
    const invRy = 1 / ry;

    for (let y = y0; y <= y1; y++) {
      const ny = (y - cy) * invRy;
      const ny2 = ny * ny;
      if (ny2 >= 1) continue;

      for (let x = x0; x <= x1; x++) {
        const nx = (x - cx) * invRx;
        const r2 = nx * nx + ny2;
        if (r2 >= 1) continue;

        const t = 1 - r2;
        const weight = t * t;

        const sx = Math.max(0, Math.min(size - 1.001, x - dx * weight));
        const sy = Math.max(0, Math.min(size - 1.001, y - dy * weight));

        const ix = sx | 0;
        const iy = sy | 0;
        const fx = sx - ix;
        const fy = sy - iy;
        const fx1 = 1 - fx;
        const fy1 = 1 - fy;

        const i00 = (iy * size + ix) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + size * 4;
        const i11 = i01 + 4;

        const w00 = fx1 * fy1;
        const w10 = fx * fy1;
        const w01 = fx1 * fy;
        const w11 = fx * fy;

        const outIdx = (y * size + x) * 4;
        dst[outIdx] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
        dst[outIdx + 1] =
          src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
        dst[outIdx + 2] =
          src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
        dst[outIdx + 3] =
          src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
      }
    }
  }

  return new ImageData(dst, size, size);
}

/**
 * True 3-Layer Eyeball Compositor (`render3DEyeballGaze`):
 * - Layer 1: Replaces 100% of the open eyeball (both old sclera and old resting iris) with a
 *   clean, 3D-shaded white sclera eyeball sphere. Zero leftover iris crescent can ever remain!
 * - Layer 2: Translates the circular 3D Iris + Pupil + Catchlight disc by a uniform rigid offset
 *   `(dx, dy)` clipped strictly inside the open eye aperture.
 * - Layer 3: Keeps the dark upper eyelash arch locked on top of the eyeball.
 */
function render3DEyeballGaze(
  dst: Uint8ClampedArray,
  src: Uint8ClampedArray,
  size: number,
  eye: EyeLandmark,
  skinRgb: [number, number, number],
  gxNorm: number, // -1 .. +1 horizontal gaze
  gyNorm: number, // -1 .. +1 vertical gaze
  irisScale: number = 1.0 // < 1.0 for wide-eyed shock
) {
  const eyeCx = eye.x * size;
  const eyeCy = eye.y * size;
  const eyeRx = eye.rx * size * 1.06;
  const eyeRy = eye.ry * size * 1.02;

  const irisCx = eye.irisCx * size;
  const irisCy = eye.irisCy * size;
  const irisR = eye.irisR * size * 1.04;

  // Uniform rigid shift of the iris disc inside the eye socket
  const maxShiftX = Math.max(irisR * 0.58, eyeRx - irisR * 0.62);
  const maxShiftY = Math.max(irisR * 0.42, eyeRy * 0.56);
  const dx = gxNorm * maxShiftX;
  const dy = gyNorm * maxShiftY;

  const newIrisCx = irisCx + dx;
  const newIrisCy = irisCy + dy;
  const scaledIrisR = irisR * irisScale;

  const x0 = Math.max(1, Math.floor(eyeCx - eyeRx * 1.1));
  const x1 = Math.min(size - 2, Math.ceil(eyeCx + eyeRx * 1.1));
  const y0 = Math.max(1, Math.floor(eyeCy - eyeRy * 1.1));
  const y1 = Math.min(size - 2, Math.ceil(eyeCy + eyeRy * 1.1));

  const [sclR, sclG, sclB] = eye.scleraRgb;
  const [irR, irG, irB] = eye.irisRgb;
  const [sR, sG, sB] = skinRgb;
  const skinWarmth = Math.max(18, sR - sB);
  const skinLum = 0.299 * sR + 0.587 * sG + 0.114 * sB;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x - eyeCx) / eyeRx;
      if (Math.abs(nx) >= 1) continue;

      const arch = Math.cos(nx * (Math.PI * 0.5));
      const localRy = Math.max(2, eyeRy * Math.pow(arch, 0.65));
      const ny = (y - eyeCy) / localRy;
      if (Math.abs(ny) >= 1) continue;

      const r2 = nx * nx + ny * ny;
      if (r2 >= 1) continue;

      const outIdx = (y * size + x) * 4;
      const origR = src[outIdx],
        origG = src[outIdx + 1],
        origB = src[outIdx + 2];
      const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;
      const origWarmth = origR - origB;
      const origSat = Math.max(origR, origG, origB) - Math.min(origR, origG, origB);

      // Determine whether this pixel in `rest` belongs to the open eyeball (sclera or iris/pupil/catchlight)
      // vs surrounding warm skin or upper outer eyelash
      const distFromOrigIris = Math.hypot(x - irisCx, y - irisCy) / irisR;
      const isOrigIris = distFromOrigIris <= 1.12 && (origLum < skinLum * 0.85 || origSat < 45);
      const isOrigSclera =
        origLum > 102 && (origSat < 62 || origWarmth < skinWarmth * 0.68);

      // Inside core of the eye opening or on any original iris/sclera pixel, include in eyeball mask
      if (!isOrigIris && !isOrigSclera && r2 > 0.52) {
        continue;
      }

      // Preserve the top dark upper eyelash border so the iris tucks naturally behind the eyelashes
      if (ny < -0.58 && origLum < 58) {
        continue;
      }

      // Smooth boundary feather only at the outermost 12% of the eyelid margin
      // (100% opaque across the entire resting iris so zero old iris crescent can ever remain!)
      let eyeballMask = 1.0;
      if (r2 > 0.78 && !isOrigIris) {
        eyeballMask = Math.max(0, Math.min(1, (1 - r2) / 0.22));
      }
      if (ny < -0.48 && origLum < 75) {
        eyeballMask *= Math.max(0, Math.min(1, (origLum - 40) / 35));
      }
      if (eyeballMask <= 0.01) continue;

      // LAYER 1: 100% Clean 3D Sclera Eyeball Sphere (completely erases the old resting iris!)
      const upperLidShadow = ny < -0.25 ? (-0.25 - ny) * 0.18 : 0;
      const sclShade = Math.max(
        0.74,
        0.99 - 0.15 * nx * nx - 0.14 * ny * ny - upperLidShadow
      );
      let finalR = sclR * sclShade;
      let finalG = sclG * sclShade;
      let finalB = sclB * sclShade;

      // LAYER 2: Rigidly Shifted 3D Iris + Pupil + Catchlight Disc centered at (newIrisCx, newIrisCy)
      const distToNewIris = Math.hypot(x - newIrisCx, y - newIrisCy) / scaledIrisR;
      if (distToNewIris < 1.06) {
        // Sample back to the corresponding point inside the original resting iris
        const sx = irisCx + (x - newIrisCx) / irisScale;
        const sy = irisCy + (y - newIrisCy) / irisScale;

        const ix = Math.max(0, Math.min(size - 2, sx | 0));
        const iy = Math.max(0, Math.min(size - 2, sy | 0));
        const fx = sx - ix;
        const fy = sy - iy;
        const i00 = (iy * size + ix) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + size * 4;
        const i11 = i01 + 4;

        let irSampR =
          src[i00] * (1 - fx) * (1 - fy) +
          src[i10] * fx * (1 - fy) +
          src[i01] * (1 - fx) * fy +
          src[i11] * fx * fy;
        let irSampG =
          src[i00 + 1] * (1 - fx) * (1 - fy) +
          src[i10 + 1] * fx * (1 - fy) +
          src[i01 + 1] * (1 - fx) * fy +
          src[i11 + 1] * fx * fy;
        let irSampB =
          src[i00 + 2] * (1 - fx) * (1 - fy) +
          src[i10 + 2] * fx * (1 - fy) +
          src[i01 + 2] * (1 - fx) * fy +
          src[i11 + 2] * fx * fy;

        const sampLum = 0.299 * irSampR + 0.587 * irSampG + 0.114 * irSampB;
        const sampSat =
          Math.max(irSampR, irSampG, irSampB) - Math.min(irSampR, irSampG, irSampB);

        // If the sampled point near the top/bottom of the resting iris was covered by warm eyelid skin
        // or sclera (and is not the central bright white specular catchlight), fill with dark iris limbal tone
        const isCatchlight = distToNewIris < 0.68 && sampLum > 185 && sampSat < 55;
        if (!isCatchlight && sampLum > 110) {
          const limbalShade = Math.max(0.45, 0.85 - distToNewIris * 0.35);
          irSampR = irR * limbalShade;
          irSampG = irG * limbalShade;
          irSampB = irB * limbalShade;
        }

        // Crisp dark limbal ring around the outer edge of the 3D iris
        if (distToNewIris > 0.78 && !isCatchlight) {
          const ringDarken = 1 - ((distToNewIris - 0.78) / 0.28) * 0.38;
          irSampR *= ringDarken;
          irSampG *= ringDarken;
          irSampB *= ringDarken;
        }

        // Smooth anti-aliased edge of the circular iris disc against the white sclera
        const irisAlpha =
          distToNewIris < 0.88
            ? 1.0
            : Math.max(0, Math.min(1, (1.06 - distToNewIris) / 0.18));

        finalR = finalR * (1 - irisAlpha) + irSampR * irisAlpha;
        finalG = finalG * (1 - irisAlpha) + irSampG * irisAlpha;
        finalB = finalB * (1 - irisAlpha) + irSampB * irisAlpha;
      }

      dst[outIdx] = Math.round(origR * (1 - eyeballMask) + finalR * eyeballMask);
      dst[outIdx + 1] = Math.round(origG * (1 - eyeballMask) + finalG * eyeballMask);
      dst[outIdx + 2] = Math.round(origB * (1 - eyeballMask) + finalB * eyeballMask);
    }
  }
}

/**
 * Closes ONLY the upper eyelid across the eye socket while keeping 100% of the rest of the face
 * untouched. Supports smooth sleeping lids, happy upward crescent arches (`happyArch`), and
 * wincing chevron squints (`winceArch`).
 */
function applyNaturalEyelidState(
  workCtx: CanvasRenderingContext2D,
  workSize: number,
  lm: FaceLandmarks,
  lidL: number, // 0..1
  lidR: number, // 0..1
  archMode: 'sleep' | 'happy' | 'wince' = 'sleep'
) {
  const dstData = workCtx.getImageData(0, 0, workSize, workSize);
  const dst = dstData.data;
  const srcCopy = new Uint8ClampedArray(dst);
  const [sR, sG, sB] = lm.skinRgb;
  const skinLum = 0.299 * sR + 0.587 * sG + 0.114 * sB;

  const closeSingleEye = (eye: EyeLandmark, amount: number, isLeft: boolean) => {
    if (amount <= 0.02) return;

    const cx = eye.x * workSize;
    const cy = eye.y * workSize;
    const rx = eye.rx * workSize * 1.14;
    const ry = eye.ry * workSize * 1.12;

    const x0 = Math.max(1, Math.floor(cx - rx));
    const x1 = Math.min(workSize - 2, Math.ceil(cx + rx));
    const [lshR, lshG, lshB] = eye.lashRgb;

    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx) / rx;
      if (Math.abs(nx) >= 1) continue;

      const arch = Math.cos(nx * (Math.PI * 0.5));
      const hFeather = Math.pow(arch, 0.45);

      const yTop = cy - ry * 0.98 * arch;
      let yBot = cy + ry * 0.92 * arch;
      if (archMode === 'happy') {
        // Upward smiling crescent curve (^ ^)
        yBot = cy + ry * (0.35 - 0.55 * arch);
      } else if (archMode === 'wince') {
        // Angled wince squint (> <)
        const inward = isLeft ? nx : -nx;
        yBot = cy + ry * (0.25 - 0.35 * inward);
      }

      const lidEdgeY =
        archMode === 'happy' || archMode === 'wince'
          ? cy + (yBot - cy) * amount
          : yTop + (yBot - yTop) * Math.min(1, amount * 1.04);

      const sampleTopY = Math.max(1, Math.floor(yTop - ry * 0.52));
      const sampleBotY = Math.max(sampleTopY + 2, Math.floor(yTop - ry * 0.15));

      const coverStart = Math.max(1, Math.floor(yTop - 2));
      const coverEnd = Math.min(
        workSize - 2,
        Math.ceil(Math.max(yBot, lidEdgeY) + ry * 0.35)
      );

      for (let y = coverStart; y <= coverEnd; y++) {
        const outIdx = (y * workSize + x) * 4;
        if (srcCopy[outIdx + 3] < 100) continue;

        const isCovered =
          archMode === 'happy' || archMode === 'wince'
            ? y >= yTop && y <= cy + ry * 0.95 * arch
            : y <= lidEdgeY;

        if (isCovered) {
          const span = Math.max(1, (archMode === 'sleep' ? lidEdgeY : cy + ry * 0.95 * arch) - yTop);
          const t = Math.max(0, Math.min(1, (y - yTop) / span));
          const sy = Math.round(sampleTopY + t * (sampleBotY - sampleTopY));
          const sIdx = (sy * workSize + x) * 4;

          let sampR = srcCopy[sIdx];
          let sampG = srcCopy[sIdx + 1];
          let sampB = srcCopy[sIdx + 2];
          const sampLum = 0.299 * sampR + 0.587 * sampG + 0.114 * sampB;

          if (sampLum < skinLum * 0.78 || sampLum > 225) {
            sampR = sR;
            sampG = sG;
            sampB = sB;
          }

          let lidRCol = sampR * 0.50 + sR * 0.50;
          let lidGCol = sampG * 0.50 + sG * 0.50;
          let lidBCol = sampB * 0.50 + sB * 0.50;

          const lidShade = 1.02 - 0.10 * Math.pow(t - 0.4, 2) - 0.08 * nx * nx;
          lidRCol = Math.min(255, lidRCol * lidShade);
          lidGCol = Math.min(255, lidGCol * lidShade);
          lidBCol = Math.min(255, lidBCol * lidShade);

          const vFeather = y < yTop + 3 ? (y - yTop + 2) / 5 : 1.0;
          const blend = Math.min(1, hFeather * vFeather * Math.min(1, amount * 1.18));

          dst[outIdx] = Math.round(dst[outIdx] * (1 - blend) + lidRCol * blend);
          dst[outIdx + 1] = Math.round(dst[outIdx + 1] * (1 - blend) + lidGCol * blend);
          dst[outIdx + 2] = Math.round(dst[outIdx + 2] * (1 - blend) + lidBCol * blend);
        }

        // Draw curved eyelash crease along lidEdgeY
        const distToLash = Math.abs(y - lidEdgeY);
        const lashThickness = Math.max(1.8, ry * 0.20 * arch);
        if (distToLash < lashThickness) {
          const lashAlpha =
            Math.pow(1 - distToLash / lashThickness, 1.35) * hFeather * Math.min(1, amount * 0.94);
          dst[outIdx] = Math.round(dst[outIdx] * (1 - lashAlpha) + lshR * lashAlpha);
          dst[outIdx + 1] = Math.round(dst[outIdx + 1] * (1 - lashAlpha) + lshG * lashAlpha);
          dst[outIdx + 2] = Math.round(dst[outIdx + 2] * (1 - lashAlpha) + lshB * lashAlpha);
        }
      }
    }
  };

  closeSingleEye(lm.eyeL, lidL, true);
  closeSingleEye(lm.eyeR, lidR, false);
  workCtx.putImageData(dstData, 0, 0);
}

/**
 * Renders 3D sculpted open mouths, teeth, tongue, kissing lips, heart/star eyes, and popped bubblegum
 * matching all of Mina's signature expressions from the reference video.
 */
function render3DExpressiveDetails(
  ctx: CanvasRenderingContext2D,
  size: number,
  lm: FaceLandmarks,
  effect:
    | 'laugh'
    | 'shock'
    | 'ouch'
    | 'cross_mouth'
    | 'yawn1'
    | 'yawn2'
    | 'yawn'
    | 'kiss'
    | 'tongue'
    | 'hearts'
    | 'stars'
    | 'gum1'
    | 'gum2'
    | 'gum3'
    | 'gumpop'
) {
  const mx = lm.mouth.x * size;
  const my = lm.mouth.y * size;
  const mRx = lm.mouth.rx * size;
  const mRy = lm.mouth.ry * size;
  const [lipR, lipG, lipB] = lm.mouth.lipRgb;

  ctx.save();

  if (effect === 'laugh' || effect === 'hearts' || effect === 'stars') {
    // Joyful 3D D-shaped open-mouth laugh with upper white teeth row & pink tongue
    const rx = mRx * 0.96;
    const ry = mRy * 0.92;
    const cy = my + ry * 0.12;

    ctx.beginPath();
    ctx.moveTo(mx - rx, cy - ry * 0.32);
    ctx.quadraticCurveTo(mx, cy - ry * 0.12, mx + rx, cy - ry * 0.32);
    ctx.bezierCurveTo(mx + rx * 0.85, cy + ry * 1.35, mx - rx * 0.85, cy + ry * 1.35, mx - rx, cy - ry * 0.32);
    ctx.closePath();

    const cavGrad = ctx.createLinearGradient(mx, cy - ry * 0.3, mx, cy + ry * 1.1);
    cavGrad.addColorStop(0, '#2A0B10');
    cavGrad.addColorStop(0.55, '#4A121B');
    cavGrad.addColorStop(1, '#7A1E2C');
    ctx.fillStyle = cavGrad;
    ctx.fill();

    ctx.save();
    ctx.clip();

    // Soft pink 3D tongue at bottom of mouth
    const tongueGrad = ctx.createRadialGradient(mx, cy + ry * 0.95, ry * 0.08, mx, cy + ry * 0.85, rx * 0.65);
    tongueGrad.addColorStop(0, '#FF8FA3');
    tongueGrad.addColorStop(1, '#C94A62');
    ctx.fillStyle = tongueGrad;
    ctx.beginPath();
    ctx.ellipse(mx, cy + ry * 0.92, rx * 0.58, ry * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bright 3D upper teeth arch
    const teethGrad = ctx.createLinearGradient(mx - rx, cy, mx + rx, cy);
    teethGrad.addColorStop(0, '#D8D4D2');
    teethGrad.addColorStop(0.2, '#FDFCFB');
    teethGrad.addColorStop(0.5, '#FFFFFF');
    teethGrad.addColorStop(0.8, '#FDFCFB');
    teethGrad.addColorStop(1, '#D8D4D2');
    ctx.fillStyle = teethGrad;
    ctx.beginPath();
    ctx.ellipse(mx, cy - ry * 0.18, rx * 0.86, ry * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3D Lip contour rim
    ctx.strokeStyle = `rgba(${lipR}, ${lipG}, ${lipB}, 0.92)`;
    ctx.lineWidth = Math.max(2.2, size * 0.006);
    ctx.stroke();
  }

  if (effect === 'hearts') {
    // Draw glowing 3D Ruby-Red Hearts over both eyes (matching 00:37 of Mina video)
    const draw3DHeart = (cx: number, cy: number, r: number, tilt: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);

      // Soft red outer glow
      ctx.shadowColor = 'rgba(255, 30, 70, 0.65)';
      ctx.shadowBlur = r * 0.45;

      ctx.beginPath();
      ctx.moveTo(0, r * 0.35);
      ctx.bezierCurveTo(-r * 0.1, -r * 0.35, -r * 1.15, -r * 0.25, -r * 0.85, r * 0.35);
      ctx.bezierCurveTo(-r * 0.6, r * 0.82, -r * 0.15, r * 1.05, 0, r * 1.25);
      ctx.bezierCurveTo(r * 0.15, r * 1.05, r * 0.6, r * 0.82, r * 0.85, r * 0.35);
      ctx.bezierCurveTo(r * 1.15, -r * 0.25, r * 0.1, -r * 0.35, 0, r * 0.35);
      ctx.closePath();

      const hGrad = ctx.createRadialGradient(-r * 0.25, r * 0.15, r * 0.08, 0, r * 0.4, r * 1.15);
      hGrad.addColorStop(0, '#FF758F');
      hGrad.addColorStop(0.35, '#FF1E42');
      hGrad.addColorStop(0.78, '#C90D2B');
      hGrad.addColorStop(1, '#800519');
      ctx.fillStyle = hGrad;
      ctx.fill();

      // Glossy 3D specular highlight on heart lobe
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.36, r * 0.12, r * 0.18, r * 0.10, -Math.PI / 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const hr = lm.eyeL.rx * size * 0.88;
    draw3DHeart(lm.eyeL.x * size, (lm.eyeL.y - lm.eyeL.ry * 0.25) * size, hr, -0.08);
    draw3DHeart(lm.eyeR.x * size, (lm.eyeR.y - lm.eyeR.ry * 0.25) * size, hr, 0.08);
  }

  if (effect === 'stars') {
    // Draw glowing 3D Golden Stars over both eyes (`wow` act)
    const draw3DStar = (cx: number, cy: number, outerR: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.shadowColor = 'rgba(255, 200, 40, 0.75)';
      ctx.shadowBlur = outerR * 0.45;

      const innerR = outerR * 0.44;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      const sGrad = ctx.createRadialGradient(-outerR * 0.15, -outerR * 0.15, outerR * 0.05, 0, 0, outerR);
      sGrad.addColorStop(0, '#FFF8D6');
      sGrad.addColorStop(0.4, '#FFD43B');
      sGrad.addColorStop(0.85, '#F08C00');
      sGrad.addColorStop(1, '#B45309');
      ctx.fillStyle = sGrad;
      ctx.fill();
      ctx.restore();
    };

    const sr = lm.eyeL.rx * size * 0.92;
    draw3DStar(lm.eyeL.x * size, lm.eyeL.y * size, sr);
    draw3DStar(lm.eyeR.x * size, lm.eyeR.y * size, sr);
  }

  if (
    effect === 'shock' ||
    effect === 'cross_mouth' ||
    effect === 'yawn1' ||
    effect === 'yawn2' ||
    effect === 'yawn'
  ) {
    const scaleMap: Record<string, [number, number, number]> = {
      cross_mouth: [0.30, 0.44, 0.005],
      shock: [0.46, 0.82, 0.014],
      yawn1: [0.40, 0.52, 0.008],
      yawn2: [0.54, 0.85, 0.015],
      yawn: [0.66, 1.18, 0.022],
    };
    const [sx, sy, yOff] = scaleMap[effect];
    const rx = mRx * sx;
    const ry = mRy * sy;
    const cy = my + size * yOff;

    ctx.beginPath();
    ctx.ellipse(mx, cy, rx, ry, 0, 0, Math.PI * 2);

    const cavGrad = ctx.createRadialGradient(mx, cy + ry * 0.25, ry * 0.1, mx, cy, Math.max(rx, ry));
    cavGrad.addColorStop(0, '#781D2B');
    cavGrad.addColorStop(0.65, '#340A11');
    cavGrad.addColorStop(1, '#1E0509');
    ctx.fillStyle = cavGrad;
    ctx.fill();

    // Subtle upper teeth hint inside open shock/yawn mouth
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(250, 246, 244, 0.9)';
    ctx.beginPath();
    ctx.ellipse(mx, cy - ry * 0.78, rx * 0.68, ry * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(235, 115, 135, 0.75)';
    ctx.beginPath();
    ctx.ellipse(mx, cy + ry * 0.72, rx * 0.55, ry * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = `rgba(${lipR}, ${lipG}, ${lipB}, 0.92)`;
    ctx.lineWidth = Math.max(2.5, size * 0.007);
    ctx.stroke();
  }

  if (effect === 'ouch') {
    // Angled wincing grimace showing clenched teeth (`00:06`, `00:28`, `00:58` in video)
    const rx = mRx * 0.76;
    const ry = mRy * 0.52;
    ctx.translate(mx, my);
    ctx.rotate(-0.07);

    ctx.beginPath();
    ctx.roundRect(-rx, -ry * 0.45, rx * 2, ry * 1.1, ry * 0.45);
    ctx.fillStyle = '#380C14';
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#F7F4F2';
    ctx.fillRect(-rx * 0.85, -ry * 0.45, rx * 1.7, ry * 0.52);
    ctx.restore();

    ctx.strokeStyle = `rgba(${lipR}, ${lipG}, ${lipB}, 0.9)`;
    ctx.lineWidth = Math.max(2, size * 0.0055);
    ctx.stroke();
  }

  if (effect === 'kiss') {
    // 3D Sculpted Puckered Kissing Lips (`00:36` in video)
    const kr = mRx * 0.42;
    const uGrad = ctx.createRadialGradient(mx - kr * 0.2, my - kr * 0.25, kr * 0.05, mx, my, kr * 1.1);
    uGrad.addColorStop(0, `rgb(${Math.min(255, lipR + 38)}, ${Math.min(255, lipG + 24)}, ${Math.min(255, lipB + 24)})`);
    uGrad.addColorStop(0.7, `rgb(${lipR}, ${lipG}, ${lipB})`);
    uGrad.addColorStop(1, `rgb(${Math.round(lipR * 0.68)}, ${Math.round(lipG * 0.55)}, ${Math.round(lipB * 0.55)})`);

    ctx.fillStyle = uGrad;
    // Upper cupid's bow pucker
    ctx.beginPath();
    ctx.arc(mx - kr * 0.34, my - kr * 0.16, kr * 0.46, 0, Math.PI * 2);
    ctx.arc(mx + kr * 0.34, my - kr * 0.16, kr * 0.46, 0, Math.PI * 2);
    ctx.fill();

    // Lower plush pucker lobe
    ctx.beginPath();
    ctx.ellipse(mx, my + kr * 0.26, kr * 0.66, kr * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();

    // Center pucker crease
    ctx.fillStyle = 'rgba(45, 12, 18, 0.75)';
    ctx.beginPath();
    ctx.ellipse(mx, my + kr * 0.02, kr * 0.28, kr * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Specular lip gloss highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.ellipse(mx - kr * 0.18, my + kr * 0.24, kr * 0.22, kr * 0.09, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  if (effect === 'tongue') {
    // Cute 3D pink tongue sticking out (`cheeky` idle act)
    const tw = mRx * 0.46;
    const th = mRy * 0.95;
    const tGrad = ctx.createLinearGradient(mx, my - th * 0.1, mx, my + th);
    tGrad.addColorStop(0, '#D64560');
    tGrad.addColorStop(0.35, '#FF758F');
    tGrad.addColorStop(1, '#FF9EBB');

    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.moveTo(mx - tw, my);
    ctx.lineTo(mx + tw, my);
    ctx.bezierCurveTo(mx + tw, my + th * 1.15, mx - tw, my + th * 1.15, mx - tw, my);
    ctx.closePath();
    ctx.fill();

    // Center tongue groove
    ctx.strokeStyle = 'rgba(165, 38, 62, 0.45)';
    ctx.lineWidth = Math.max(1.5, size * 0.004);
    ctx.beginPath();
    ctx.moveTo(mx, my + th * 0.05);
    ctx.lineTo(mx, my + th * 0.68);
    ctx.stroke();
  }

  if (effect === 'gum1' || effect === 'gum2' || effect === 'gum3') {
    // 3D Glossy Pink Bubblegum Sphere (`01:28 - 01:29` in video)
    const radii: Record<string, number> = {
      gum1: size * 0.042,
      gum2: size * 0.088,
      gum3: size * 0.148,
    };
    const r = radii[effect];
    const bx = mx;
    const by = my + r * 0.16;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
    ctx.beginPath();
    ctx.arc(bx + r * 0.04, by + r * 0.08, r * 1.02, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(
      bx - r * 0.32,
      by - r * 0.32,
      r * 0.08,
      bx,
      by,
      r
    );
    grad.addColorStop(0, 'rgba(255, 220, 238, 0.96)');
    grad.addColorStop(0.38, 'rgba(255, 130, 188, 0.94)');
    grad.addColorStop(0.8, 'rgba(232, 64, 145, 0.90)');
    grad.addColorStop(1, 'rgba(182, 28, 105, 0.92)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.beginPath();
    ctx.ellipse(bx - r * 0.32, by - r * 0.32, r * 0.22, r * 0.13, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (effect === 'gumpop') {
    // Popped pink bubblegum splattered across nose, cheeks, and mouth (`01:30` in video!)
    render3DExpressiveDetails(ctx, size, lm, 'shock');

    const nx = lm.nose.x * size;
    const ny = lm.nose.y * size;
    const spR = mRx * 1.45;

    const gumGrad = ctx.createRadialGradient(nx, (ny + my) * 0.5, spR * 0.1, nx, (ny + my) * 0.5, spR);
    gumGrad.addColorStop(0, 'rgba(255, 145, 195, 0.82)');
    gumGrad.addColorStop(0.65, 'rgba(238, 82, 152, 0.76)');
    gumGrad.addColorStop(1, 'rgba(210, 48, 120, 0.0)');

    ctx.fillStyle = gumGrad;
    // Irregular popped gum patches over nose bridge, cheeks, and chin
    const blobs = [
      [nx, ny - spR * 0.15, spR * 0.42, spR * 0.32],
      [nx - spR * 0.48, ny + spR * 0.12, spR * 0.38, spR * 0.26],
      [nx + spR * 0.48, ny + spR * 0.12, spR * 0.38, spR * 0.26],
      [mx - spR * 0.36, my + spR * 0.22, spR * 0.32, spR * 0.22],
      [mx + spR * 0.36, my + spR * 0.22, spR * 0.32, spR * 0.22],
    ];
    for (const [bx, by, brx, bry] of blobs) {
      ctx.beginPath();
      ctx.ellipse(bx, by, brx, bry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Thin pink gum strands around mouth & nose
    ctx.strokeStyle = 'rgba(255, 165, 208, 0.78)';
    ctx.lineWidth = Math.max(2, size * 0.005);
    ctx.beginPath();
    ctx.moveTo(nx - spR * 0.55, ny + spR * 0.08);
    ctx.quadraticCurveTo(mx, ny + spR * 0.25, nx + spR * 0.55, ny + spR * 0.08);
    ctx.moveTo(nx, ny - spR * 0.25);
    ctx.lineTo(mx - spR * 0.32, my + spR * 0.18);
    ctx.moveTo(nx, ny - spR * 0.25);
    ctx.lineTo(mx + spR * 0.32, my + spR * 0.18);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Gently calibrates and brightens the 3D character render to match the person's studio skin tone.
 */
export async function brightenAndPolishCharacter(
  characterDataUrl: string,
  targetSkinRgb?: [number, number, number]
): Promise<string> {
  const img = await loadImage(characterDataUrl);
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return characterDataUrl;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);

  if (!targetSkinRgb) {
    return canvas.toDataURL('image/png');
  }

  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;

  let sR = 0,
    sG = 0,
    sB = 0,
    sCount = 0;
  const y0 = Math.floor(size * 0.42);
  const y1 = Math.floor(size * 0.62);
  const x0 = Math.floor(size * 0.36);
  const x1 = Math.floor(size * 0.64);

  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const idx = (y * size + x) * 4;
      if (d[idx + 3] > 200 && d[idx] > 65 && d[idx] > d[idx + 2]) {
        sR += d[idx];
        sG += d[idx + 1];
        sB += d[idx + 2];
        sCount++;
      }
    }
  }

  if (sCount < 20) {
    return canvas.toDataURL('image/png');
  }

  const curR = sR / sCount;
  const curG = sG / sCount;
  const curB = sB / sCount;

  const dR = (targetSkinRgb[0] - curR) * 0.35;
  const dG = (targetSkinRgb[1] - curG) * 0.35;
  const dB = (targetSkinRgb[2] - curB) * 0.35;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 15) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const dist = Math.abs(r - curR) + Math.abs(g - curG) + Math.abs(b - curB);
    if (dist < 95 && r > b) {
      const w = Math.pow(1 - dist / 95, 1.5);
      d[i] = Math.min(255, Math.max(0, Math.round(r + dR * w)));
      d[i + 1] = Math.min(255, Math.max(0, Math.round(g + dG * w)));
      d[i + 2] = Math.min(255, Math.max(0, Math.round(b + dB * w)));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Asks the chosen image provider for one raw image (used for the master head) and returns its data URL.
 */
export async function generateRawExpressionImage(params: {
  provider: ImageProviderConfig;
  imageBase64: string;
  expression: string;
  style: 'pixar' | 'realistic';
  skinColorDescription?: string;
  characterName?: string;
}): Promise<string> {
  const { provider, ...payload } = params;
  return requestImage(provider, payload, params.expression);
}

/**
 * Generates the Master 3D Floating Head (`rest`) with the chosen provider (Gemini or OpenAI),
 * isolates the floating head on a transparent background, then generates every gaze, blink and
 * reaction frame as an edit of that master and registers them to it.
 */
export async function generateFull3DCharacterPack(params: {
  provider: ImageProviderConfig;
  referenceImageUrl: string;
  style: 'pixar' | 'realistic';
  skinColorDescription?: string;
  characterName?: string;
  targetSkinRgb?: [number, number, number];
  onProgress?: (pct: number, stepLabel: string) => void;
  onNote?: (note: string) => void;
}): Promise<ExpressionMap> {
  const {
    provider,
    referenceImageUrl,
    style,
    skinColorDescription,
    characterName,
    targetSkinRgb,
    onProgress,
    onNote,
  } = params;

  onProgress?.(
    22,
    `Synthesizing Master ${style === 'pixar' ? '3D Pixar/Anime' : 'Realistic 3D'} Floating Head with ${PROVIDER_NAMES[provider.provider]}...`
  );

  // 1. Generate Master 3D Floating Head (`rest`) on #00FF00 green screen
  const rawRestUrl = await generateRawExpressionImage({
    provider,
    imageBase64: referenceImageUrl,
    expression: 'rest',
    style,
    skinColorDescription,
    characterName,
  });

  onProgress?.(50, 'Isolating floating 3D head & registering it as the master frame...');
  const isolatedRestRaw = await ensureTransparentCharacterPng(rawRestUrl, 38);
  const masterRestUrl = await brightenAndPolishCharacter(isolatedRestRaw, targetSkinRgb);

  // 2. Generate every gaze / blink / reaction picture as an edit of the master head
  const total = SHEETS.length;
  const { frames, failedSheets, lastError } = await generateAiExpressionSheets({
    provider,
    masterRestUrl,
    style,
    skinColorDescription,
    // Same texture budget as Mina's engine path: smaller frames on phones
    frameSize: typeof innerWidth === 'number' && innerWidth < 760 ? 640 : 1024,
    onProgress: (done, count, label) =>
      onProgress?.(
        56 + Math.round((done / count) * 36),
        `Generated ${done}/${count} AI sheets (${label})...`
      ),
  });

  if (failedSheets.length === total) {
    throw new Error(lastError || `${PROVIDER_NAMES[provider.provider]} could not generate any expression sheets.`);
  }

  // 3. Anything the AI could not deliver is filled in procedurally so the character is never incomplete
  const expected = SHEETS.flatMap((s) => s.cells.map((c) => c.name));
  const missing = expected.filter((n) => !frames[n]);
  const layout = await estimateFaceLayout({ rest: masterRestUrl, ...frames });
  const pack: ExpressionMap = { rest: masterRestUrl, ...frames, [LAYOUT_KEY]: JSON.stringify(layout) };

  if (missing.length) {
    onProgress?.(94, `Filling ${missing.length} frames that ${PROVIDER_NAMES[provider.provider]} did not return...`);
    const procedural = await buildCompleteCharacterPack(masterRestUrl, {});
    let filled = 0;
    for (const [name, url] of Object.entries(procedural)) {
      if (name === 'rest' || pack[name]) continue;
      // near_* gaze and blink25/blink75 are derived from the procedural head and would not match AI frames
      if (/^near_|^blink(25|75)$/.test(name) && Object.keys(frames).length) continue;
      if (missing.includes(name)) filled++;
      pack[name] = url;
    }
    onNote?.(
      `${expected.length - missing.length} of ${expected.length} expression frames were AI-generated; ${filled} were synthesized locally` +
        (lastError ? ` (${lastError})` : '.')
    );
  }

  onProgress?.(100, 'Living 3D portrait ready!');
  return pack;
}

/** Key inside an ExpressionMap that carries the face layout (JSON) instead of an image. */
export const LAYOUT_KEY = '__layout';

/**
 * Where the eyes and mouth really are, measured from the generated frames themselves: the closed-eye
 * frame differs from rest exactly at the eyes, the open-mouth frames exactly at the mouth. Returns
 * [u, v] centers in 0..1 texture coordinates, or null for a feature that could not be measured.
 */
export async function measureFaceFeatures(frames: Record<string, string>): Promise<{
  eyeL: [number, number] | null;
  eyeR: [number, number] | null;
  mouth: [number, number] | null;
}> {
  const S = 256;
  const read = async (key: string) => {
    if (!frames[key]) return null;
    const img = await loadImage(frames[key]);
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, S, S);
    return ctx.getImageData(0, 0, S, S).data;
  };
  const centroid = (a: Uint8ClampedArray, b: Uint8ClampedArray, u0: number, u1: number, v0: number, v1: number) => {
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let y = Math.round(v0 * S); y < Math.round(v1 * S); y++) {
      for (let x = Math.round(u0 * S); x < Math.round(u1 * S); x++) {
        const i = (y * S + x) * 4;
        const d =
          (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3 +
          Math.abs(a[i + 3] - b[i + 3]) * 0.5;
        const w = d > 28 ? d : 0;
        sx += x * w;
        sy += y * w;
        sw += w;
      }
    }
    return sw > 200 ? ([sx / sw / S, sy / sw / S] as [number, number]) : null;
  };

  const rest = await read('rest');
  if (!rest) return { eyeL: null, eyeR: null, mouth: null };

  let eyeL: [number, number] | null = null;
  let eyeR: [number, number] | null = null;
  const closed = await read('closed');
  if (closed) {
    eyeL = centroid(rest, closed, 0.2, 0.5, 0.3, 0.62);
    eyeR = centroid(rest, closed, 0.5, 0.8, 0.3, 0.62);
  }

  const mouths: [number, number][] = [];
  for (const key of ['shock', 'kiss', 'cross', 'whistle1']) {
    const f = await read(key);
    const m = f && centroid(rest, f, 0.32, 0.68, 0.56, 0.86);
    if (m) mouths.push(m);
  }
  const mouth: [number, number] | null = mouths.length
    ? [mouths.reduce((s, m) => s + m[0], 0) / mouths.length, mouths.reduce((s, m) => s + m[1], 0) / mouths.length]
    : null;

  return { eyeL, eyeR, mouth };
}

// The same measurement taken on Mina's own frames (rest/closed/shock/kiss/cross/whistle1 from her sheet):
// eyes at u .391 / .606, eye line v .448, mouth change at v .679. The engine's zones are defined in Mina's
// coordinates, so a character's layout is its measurements relative to these.
const MINA_REF = { cx: 0.4985, eyeV: 0.4487, span: 0.2154, drop: 0.2305 };
const MINA_ENGINE = { cx: 0.5, eyeV: 0.455 };

/**
 * How this character's face is laid out relative to Mina's (center, eye line, width, eye-to-mouth distance),
 * so the engine can put hover zones, props (glasses, camera...) and the gaze origin on this face.
 * Clamped, so a bad measurement can never move things far from where Mina's layout would put them.
 */
export async function estimateFaceLayout(frames: Record<string, string>): Promise<FaceLayout> {
  const neutral: FaceLayout = { cx: MINA_ENGINE.cx, eyeV: MINA_ENGINE.eyeV, kx: 1, ky: 1 };
  try {
    const f = await measureFaceFeatures(frames);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const layout = { ...neutral };
    if (f.eyeL && f.eyeR) {
      const eyeV = (f.eyeL[1] + f.eyeR[1]) / 2;
      layout.cx = clamp((f.eyeL[0] + f.eyeR[0]) / 2 - MINA_REF.cx + MINA_ENGINE.cx, 0.44, 0.56);
      layout.eyeV = clamp(eyeV - MINA_REF.eyeV + MINA_ENGINE.eyeV, 0.40, 0.54);
      layout.kx = clamp((f.eyeR[0] - f.eyeL[0]) / MINA_REF.span, 0.7, 1.5);
      if (f.mouth) layout.ky = clamp((f.mouth[1] - eyeV) / MINA_REF.drop, 0.7, 1.5);
    }
    return layout;
  } catch {
    return neutral;
  }
}

/**
 * Builds the complete 76-texture ExpressionMap on top of the locked `rest` head:
 * - 16 Inner Gaze Ring (`near_right`, `near_ene`, ..., `near_ese`) + 16 Outer Gaze Ring (`right`, ..., `ese`)
 * - 4 Smooth Eyelid Blink Transitions (`blink25`, `half`, `blink75`, `closed`)
 * - 40 Expressive & Idle Faces matching Mina's reference video (`laugh`, `shock`, `ouch`, `cross`,
 *   `angry`, `smug`, `kiss`, `hearts`, `stars`, `gum1..3`, `gumpop`, `yawn1..4`, `winkl`, `winkr`, `tongue`, etc.)
 */
export async function buildCompleteCharacterPack(
  baseTransparentUrl: string,
  _aiFrames: Partial<Record<string, string>> = {},
  onProgress?: (pct: number, stepLabel: string) => void
): Promise<ExpressionMap> {
  const workSize = 512;
  const baseImg = await loadImage(baseTransparentUrl);

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = workSize;
  baseCanvas.height = workSize;
  const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
  if (!baseCtx) return { rest: baseTransparentUrl };

  baseCtx.clearRect(0, 0, workSize, workSize);
  baseCtx.drawImage(baseImg, 0, 0, workSize, workSize);

  const lm = detectFaceLandmarks(baseCtx, workSize);
  const baseImageData = baseCtx.getImageData(0, 0, workSize, workSize);
  const basePixels = baseImageData.data;

  const pack: ExpressionMap = {
    rest: baseTransparentUrl,
  };

  const workCanvas = document.createElement('canvas');
  workCanvas.width = workSize;
  workCanvas.height = workSize;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true })!;

  const makeFrame = (
    warps: WarpInstruction[],
    opts?: {
      lidL?: number;
      lidR?: number;
      archMode?: 'sleep' | 'happy' | 'wince';
      gaze?: [number, number]; // [gxNorm, gyNorm] for both eyes
      gazeL?: [number, number]; // custom left eye gaze (e.g. cross-eyes)
      gazeR?: [number, number]; // custom right eye gaze (e.g. cross-eyes)
      irisScale?: number;
      detailEffect?:
        | 'laugh'
        | 'shock'
        | 'ouch'
        | 'cross_mouth'
        | 'yawn1'
        | 'yawn2'
        | 'yawn'
        | 'kiss'
        | 'tongue'
        | 'hearts'
        | 'stars'
        | 'gum1'
        | 'gum2'
        | 'gum3'
        | 'gumpop';
    }
  ): string => {
    const warpedData =
      warps.length > 0
        ? applyLocalWarps(basePixels, workSize, warps)
        : new ImageData(new Uint8ClampedArray(basePixels), workSize, workSize);

    const gL = opts?.gazeL || opts?.gaze;
    const gR = opts?.gazeR || opts?.gaze;

    if (gL || gR) {
      const copyBeforeGaze = new Uint8ClampedArray(warpedData.data);
      if (gL) {
        render3DEyeballGaze(
          warpedData.data,
          copyBeforeGaze,
          workSize,
          lm.eyeL,
          lm.skinRgb,
          gL[0],
          gL[1],
          opts?.irisScale || 1.0
        );
      }
      if (gR) {
        render3DEyeballGaze(
          warpedData.data,
          copyBeforeGaze,
          workSize,
          lm.eyeR,
          lm.skinRgb,
          gR[0],
          gR[1],
          opts?.irisScale || 1.0
        );
      }
    }

    workCtx.putImageData(warpedData, 0, 0);

    if (opts?.lidL || opts?.lidR) {
      applyNaturalEyelidState(
        workCtx,
        workSize,
        lm,
        opts.lidL || 0,
        opts.lidR || 0,
        opts.archMode || 'sleep'
      );
    }

    if (opts?.detailEffect) {
      render3DExpressiveDetails(workCtx, workSize, lm, opts.detailEffect);
    }

    return workCanvas.toDataURL('image/png');
  };

  // 1. Synthesize 32 Multi-Ring Gaze Transition States (16 Near Ring + 16 Far Ring)
  // ZERO face warps (`[]`) — 100% of the head, hair, eyebrows, nose, and mouth stay pixel-identical to `rest`!
  const GAZE_ANGLES: Record<string, number> = {
    right: 0,
    ene: Math.PI / 8,
    upright: (2 * Math.PI) / 8,
    nne: (3 * Math.PI) / 8,
    up: (4 * Math.PI) / 8,
    nnw: (5 * Math.PI) / 8,
    nw: (6 * Math.PI) / 8,
    wnw: (7 * Math.PI) / 8,
    left: Math.PI,
    wsw: (9 * Math.PI) / 8,
    downleft: (10 * Math.PI) / 8,
    ssw: (11 * Math.PI) / 8,
    down: (12 * Math.PI) / 8,
    sse: (13 * Math.PI) / 8,
    downright: (14 * Math.PI) / 8,
    ese: (15 * Math.PI) / 8,
  };

  onProgress?.(74, 'Synthesizing 32 multi-ring 3D eyeball gaze transitions (near + far rings)...');

  for (const [name, angle] of Object.entries(GAZE_ANGLES)) {
    const gx = Math.cos(angle);
    const gy = -Math.sin(angle);
    // Full outer gaze ring (100% amplitude)
    pack[name] = makeFrame([], {
      gaze: [gx, gy],
    });
    // Intermediate inner gaze ring (52% amplitude for smooth transition from center rest)
    pack[`near_${name}`] = makeFrame([], {
      gaze: [gx * 0.52, gy * 0.52],
    });
  }

  await new Promise((r) => setTimeout(r, 10));

  // 2. Synthesize 4-Step Smooth Eyelid Blinking (`blink25`, `half`, `blink75`, `closed`)
  onProgress?.(84, 'Synthesizing 4-stage smooth eyelid blinks & winks...');

  pack['blink25'] = makeFrame([], { lidL: 0.28, lidR: 0.28, archMode: 'sleep' });
  pack['half'] = makeFrame([], { lidL: 0.55, lidR: 0.55, archMode: 'sleep' });
  pack['blink75'] = makeFrame([], { lidL: 0.80, lidR: 0.80, archMode: 'sleep' });
  pack['closed'] = makeFrame([], { lidL: 1.0, lidR: 1.0, archMode: 'sleep' });

  // 3. Expressive & Interactive Faces (matching Mina's reference video)
  onProgress?.(92, 'Synthesizing 3D expressions (Laugh, Shock, Ouch, Cross, Hearts, Bubblegum)...');

  const smileWarps: WarpInstruction[] = [
    {
      cx: lm.mouth.x - lm.mouth.rx * 0.78,
      cy: lm.mouth.y,
      rx: lm.mouth.rx * 1.15,
      ry: lm.mouth.ry * 1.35,
      dx: -0.022,
      dy: -0.032,
    },
    {
      cx: lm.mouth.x + lm.mouth.rx * 0.78,
      cy: lm.mouth.y,
      rx: lm.mouth.rx * 1.15,
      ry: lm.mouth.ry * 1.35,
      dx: 0.022,
      dy: -0.032,
    },
    { cx: lm.eyeL.x - 0.02, cy: lm.eyeL.y + 0.075, rx: 0.10, ry: 0.08, dx: -0.010, dy: -0.020 },
    { cx: lm.eyeR.x + 0.02, cy: lm.eyeR.y + 0.075, rx: 0.10, ry: 0.08, dx: 0.010, dy: -0.020 },
  ];

  pack['winkl'] = makeFrame(smileWarps, { lidL: 1.0, archMode: 'happy' });
  pack['winkr'] = makeFrame(smileWarps, { lidR: 1.0, archMode: 'happy' });
  pack['grin'] = makeFrame(smileWarps);

  // Big joyful open-mouth teeth laugh with happy crescent eyes (`00:20`, `00:50`, `01:20` in video)
  pack['laugh'] = makeFrame(
    [
      ...smileWarps,
      {
        cx: lm.mouth.x,
        cy: lm.mouth.y + lm.mouth.ry * 0.45,
        rx: lm.mouth.rx * 1.25,
        ry: lm.mouth.ry * 1.45,
        dx: 0,
        dy: 0.026,
      },
    ],
    { lidL: 0.92, lidR: 0.92, archMode: 'happy', detailEffect: 'laugh' }
  );

  // Glowing 3D Heart Eyes (`00:37` in video) & Star Eyes (`wow` act)
  pack['hearts'] = makeFrame(smileWarps, { detailEffect: 'hearts' });
  pack['stars'] = makeFrame(smileWarps, { detailEffect: 'stars' });

  // Playful wink + 3D tongue (`cheeky` act)
  pack['tongue'] = makeFrame(smileWarps, {
    lidL: 1.0,
    archMode: 'happy',
    detailEffect: 'tongue',
  });

  // Bubble-gum blow & pop sequence (`01:28 - 01:30` in video)
  const puckerWarps: WarpInstruction[] = [
    {
      cx: lm.mouth.x - lm.mouth.rx * 0.72,
      cy: lm.mouth.y,
      rx: lm.mouth.rx * 0.9,
      ry: lm.mouth.ry * 1.15,
      dx: 0.026,
      dy: 0,
    },
    {
      cx: lm.mouth.x + lm.mouth.rx * 0.72,
      cy: lm.mouth.y,
      rx: lm.mouth.rx * 0.9,
      ry: lm.mouth.ry * 1.15,
      dx: -0.026,
      dy: 0,
    },
  ];

  pack['gum1'] = makeFrame(puckerWarps, { detailEffect: 'gum1' });
  pack['gum2'] = makeFrame(puckerWarps, { detailEffect: 'gum2' });
  pack['gum3'] = makeFrame(puckerWarps, { detailEffect: 'gum3' });
  pack['gumpop'] = makeFrame(
    [
      { cx: lm.eyeL.x, cy: lm.eyeL.y - lm.eyeL.ry * 1.1, rx: lm.eyeL.rx * 1.3, ry: lm.eyeL.ry, dx: 0, dy: -0.028 },
      { cx: lm.eyeR.x, cy: lm.eyeR.y - lm.eyeR.ry * 1.1, rx: lm.eyeR.rx * 1.3, ry: lm.eyeR.ry, dx: 0, dy: -0.028 },
    ],
    { gaze: [0, -0.08], irisScale: 0.88, detailEffect: 'gumpop' }
  );

  // 4-Stage Yawn Sequence
  const makeYawn = (
    openAmt: number,
    lidAmt: number,
    effect?: 'yawn1' | 'yawn2' | 'yawn'
  ) =>
    makeFrame(
      [
        {
          cx: lm.mouth.x,
          cy: lm.mouth.y + lm.mouth.ry * 0.4,
          rx: lm.mouth.rx * 1.25,
          ry: lm.mouth.ry * 1.6,
          dx: 0,
          dy: openAmt,
        },
        { cx: lm.eyeL.x, cy: lm.eyeL.y - lm.eyeL.ry * 1.2, rx: lm.eyeL.rx * 1.2, ry: lm.eyeL.ry, dx: 0, dy: -openAmt * 0.45 },
        { cx: lm.eyeR.x, cy: lm.eyeR.y - lm.eyeR.ry * 1.2, rx: lm.eyeR.rx * 1.2, ry: lm.eyeR.ry, dx: 0, dy: -openAmt * 0.45 },
      ],
      { lidL: lidAmt, lidR: lidAmt, archMode: 'sleep', detailEffect: effect }
    );

  pack['yawn1'] = makeYawn(0.020, 0.52, 'yawn1');
  pack['yawn2'] = makeYawn(0.032, 0.78, 'yawn2');
  pack['yawn'] = makeYawn(0.044, 1.0, 'yawn');
  pack['yawn4'] = makeYawn(0.010, 0.55);

  // Cross-eyed funny face + cute open 'o' mouth (`00:07`, `00:29`, `00:48`, `00:59` in video)
  pack['cross'] = makeFrame(
    [
      { cx: lm.eyeL.x, cy: lm.eyeL.y - lm.eyeL.ry * 1.1, rx: lm.eyeL.rx * 1.2, ry: lm.eyeL.ry, dx: 0, dy: -0.018 },
      { cx: lm.eyeR.x, cy: lm.eyeR.y - lm.eyeR.ry * 1.1, rx: lm.eyeR.rx * 1.2, ry: lm.eyeR.ry, dx: 0, dy: -0.018 },
    ],
    {
      gazeL: [0.88, 0.14],
      gazeR: [-0.88, 0.14],
      detailEffect: 'cross_mouth',
    }
  );

  pack['whistle1'] = makeFrame(puckerWarps, { gaze: [0.55, -0.45], detailEffect: 'kiss' });
  pack['whistle2'] = makeFrame(puckerWarps, { gaze: [-0.55, -0.45], detailEffect: 'kiss' });

  pack['puff'] = makeFrame([
    ...puckerWarps,
    { cx: lm.eyeL.x - 0.02, cy: lm.mouth.y - 0.03, rx: 0.12, ry: 0.11, dx: -0.036, dy: -0.012 },
    { cx: lm.eyeR.x + 0.02, cy: lm.mouth.y - 0.03, rx: 0.12, ry: 0.11, dx: 0.036, dy: -0.012 },
  ]);
  pack['fish'] = makeFrame(
    [
      ...puckerWarps,
      { cx: lm.eyeL.x - 0.02, cy: lm.mouth.y - 0.03, rx: 0.11, ry: 0.10, dx: 0.032, dy: 0 },
      { cx: lm.eyeR.x + 0.02, cy: lm.mouth.y - 0.03, rx: 0.11, ry: 0.10, dx: -0.032, dy: 0 },
    ],
    { gaze: [0, -0.45], detailEffect: 'kiss' }
  );

  pack['sneeze1'] = makeFrame(
    [
      { cx: lm.nose.x, cy: lm.nose.y, rx: 0.10, ry: 0.09, dx: 0, dy: -0.022 },
      { cx: lm.mouth.x, cy: lm.mouth.y + lm.mouth.ry * 0.25, rx: lm.mouth.rx, ry: lm.mouth.ry * 1.2, dx: 0, dy: 0.022 },
    ],
    { lidL: 0.65, lidR: 0.65, detailEffect: 'yawn1' }
  );
  pack['sneeze2'] = makeFrame(
    [
      { cx: lm.nose.x, cy: lm.nose.y, rx: 0.11, ry: 0.10, dx: 0, dy: -0.030 },
      { cx: lm.mouth.x, cy: lm.mouth.y, rx: lm.mouth.rx, ry: lm.mouth.ry, dx: 0, dy: -0.022 },
    ],
    { lidL: 1.0, lidR: 1.0, archMode: 'wince', detailEffect: 'ouch' }
  );

  // Wide-eyed Shock / Surprise (`00:19`, `00:27`, `00:49` in video)
  const shockFrame = makeFrame(
    [
      { cx: lm.eyeL.x, cy: lm.eyeL.y - lm.eyeL.ry * 1.1, rx: lm.eyeL.rx * 1.35, ry: lm.eyeL.ry * 1.2, dx: 0, dy: -0.032 },
      { cx: lm.eyeR.x, cy: lm.eyeR.y - lm.eyeR.ry * 1.1, rx: lm.eyeR.rx * 1.35, ry: lm.eyeL.ry * 1.2, dx: 0, dy: -0.032 },
      { cx: lm.mouth.x, cy: lm.mouth.y + lm.mouth.ry * 0.35, rx: lm.mouth.rx, ry: lm.mouth.ry * 1.3, dx: 0, dy: 0.028 },
    ],
    { gaze: [0, -0.05], irisScale: 0.86, detailEffect: 'shock' }
  );
  pack['shock'] = shockFrame;
  pack['scared'] = shockFrame;

  // Tightly scrunched Ouch / Wince (`00:06`, `00:08`, `00:28`, `00:58` in video)
  const ouchFrame = makeFrame(
    [
      { cx: lm.eyeL.x + lm.eyeL.rx * 0.5, cy: lm.eyeL.y - lm.eyeL.ry * 0.9, rx: lm.eyeL.rx * 1.2, ry: lm.eyeL.ry, dx: 0.018, dy: 0.026 },
      { cx: lm.eyeR.x - lm.eyeR.rx * 0.5, cy: lm.eyeR.y - lm.eyeR.ry * 0.9, rx: lm.eyeR.rx * 1.2, ry: lm.eyeR.ry, dx: -0.018, dy: 0.026 },
      { cx: lm.nose.x, cy: lm.nose.y, rx: 0.11, ry: 0.09, dx: 0, dy: -0.028 },
    ],
    { lidL: 0.95, lidR: 0.95, archMode: 'wince', detailEffect: 'ouch' }
  );
  pack['ouch'] = ouchFrame;
  pack['scrunch'] = ouchFrame;

  // Grumpy Angry Pout (`00:30` in video)
  pack['angry'] = makeFrame(
    [
      { cx: lm.eyeL.x + lm.eyeL.rx * 0.55, cy: lm.eyeL.y - lm.eyeL.ry * 0.95, rx: lm.eyeL.rx * 1.3, ry: lm.eyeL.ry * 1.2, dx: 0.022, dy: 0.036 },
      { cx: lm.eyeR.x - lm.eyeR.rx * 0.55, cy: lm.eyeR.y - lm.eyeR.ry * 0.95, rx: lm.eyeR.rx * 1.3, ry: lm.eyeR.ry * 1.2, dx: -0.022, dy: 0.036 },
      { cx: lm.mouth.x - lm.mouth.rx * 0.68, cy: lm.mouth.y, rx: lm.mouth.rx, ry: lm.mouth.ry * 1.2, dx: 0, dy: 0.028 },
      { cx: lm.mouth.x + lm.mouth.rx * 0.68, cy: lm.mouth.y, rx: lm.mouth.rx, ry: lm.mouth.ry * 1.2, dx: 0, dy: 0.028 },
      { cx: lm.mouth.x, cy: lm.mouth.y, rx: lm.mouth.rx * 0.8, ry: lm.mouth.ry, dx: 0, dy: -0.014 },
    ],
    { lidL: 0.25, lidR: 0.25 }
  );

  // Smug / Raised Eyebrow (`00:35` in video)
  const smugFrame = makeFrame(
    [
      { cx: lm.eyeL.x, cy: lm.eyeL.y - lm.eyeL.ry * 1.1, rx: lm.eyeL.rx * 1.4, ry: lm.eyeL.ry * 1.2, dx: 0, dy: -0.036 },
      { cx: lm.eyeR.x, cy: lm.eyeR.y - lm.eyeR.ry * 0.9, rx: lm.eyeR.rx * 1.2, ry: lm.eyeR.ry, dx: 0, dy: 0.016 },
      { cx: lm.mouth.x + lm.mouth.rx * 0.72, cy: lm.mouth.y, rx: lm.mouth.rx * 1.1, ry: lm.mouth.ry * 1.2, dx: 0.022, dy: -0.034 },
      { cx: lm.mouth.x - lm.mouth.rx * 0.72, cy: lm.mouth.y, rx: lm.mouth.rx, ry: lm.mouth.ry, dx: 0, dy: 0.010 },
    ],
    { lidL: 0.30, lidR: 0.42, gaze: [0.28, 0] }
  );
  pack['smug'] = smugFrame;
  pack['raised'] = smugFrame;

  // Kissing Lips (`00:36` in video)
  pack['kiss'] = makeFrame(puckerWarps, {
    lidL: 1.0,
    lidR: 1.0,
    archMode: 'sleep',
    detailEffect: 'kiss',
  });

  pack['cry'] = makeFrame(
    [
      { cx: lm.eyeL.x + lm.eyeL.rx * 0.5, cy: lm.eyeL.y - lm.eyeL.ry, rx: lm.eyeL.rx * 1.2, ry: lm.eyeL.ry, dx: 0, dy: -0.026 },
      { cx: lm.eyeR.x - lm.eyeR.rx * 0.5, cy: lm.eyeR.y - lm.eyeR.ry, rx: lm.eyeR.rx * 1.2, ry: lm.eyeR.ry, dx: 0, dy: -0.026 },
      { cx: lm.mouth.x - lm.mouth.rx * 0.72, cy: lm.mouth.y, rx: lm.mouth.rx, ry: lm.mouth.ry, dx: 0, dy: 0.030 },
      { cx: lm.mouth.x + lm.mouth.rx * 0.72, cy: lm.mouth.y, rx: lm.mouth.rx, ry: lm.mouth.ry, dx: 0, dy: 0.030 },
    ],
    { lidL: 0.48, lidR: 0.48 }
  );

  pack['shy'] = makeFrame(smileWarps, { lidL: 0.35, lidR: 0.35, gaze: [-0.48, 0.35] });
  pack['deadpan'] = makeFrame([], { lidL: 0.52, lidR: 0.52 });
  pack['snore'] = makeYawn(0.020, 1.0, 'yawn1');
  pack['dizzy'] = makeFrame([], {
    gazeL: [-0.72, 0.55],
    gazeR: [0.72, -0.55],
    lidL: 0.32,
    lidR: 0.18,
    detailEffect: 'cross_mouth',
  });
  pack['wind'] = makeFrame([], { lidL: 0.68, lidR: 0.68 });
  pack['sick'] = makeFrame(puckerWarps, { lidL: 0.65, lidR: 0.65 });

  onProgress?.(100, '76-State Living 3D Portrait Ready!');
  return pack;
}
