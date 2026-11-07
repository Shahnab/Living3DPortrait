/**
 * Chroma-Key Green Background Isolation, Head Bounding-Box Registration,
 * and Reference Portrait Framing Utility.
 */

export interface HeadBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  eyeAnchorY: number;
  width: number;
  height: number;
  valid: boolean;
}

export interface ProcessedPortrait {
  isolatedDataUrl: string;
  framedReferenceUrl: string;
  originalDataUrl: string;
  skinColorDescription: string;
  detectedSkinHex: string;
  skinRgb: [number, number, number];
}

/**
 * Loads an image from a Data URL or URL into an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    img.src = src;
  });
}

/**
 * Reads a File into a base64 Data URL
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  return `#${((1 << 24) + (cr << 16) + (cg << 8) + cb).toString(16).slice(1)}`;
}

/**
 * Pure HSV Chroma-Key Green (#00FF00) & Exterior Border Background Remover.
 * Removes 100% of chroma-key green and border backgrounds while keeping 100% of the 3D head,
 * hair curls, chin, and accessories completely intact with zero artificial face chopping.
 */
export function isolateSubjectOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sensitivity: number = 38
): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;

  // 1. Sample outer border pixels to detect background color
  const borderColors: [number, number, number][] = [];
  const inset = 3;
  const sampleStep = Math.max(3, Math.floor(width / 48));

  for (let x = inset; x < width - inset; x += sampleStep) {
    const iTop = (inset * width + x) * 4;
    if (data[iTop + 3] > 128) {
      borderColors.push([data[iTop], data[iTop + 1], data[iTop + 2]]);
    }
  }
  for (let y = inset; y < Math.floor(height * 0.75); y += sampleStep) {
    const iLeft = (y * width + inset) * 4;
    const iRight = (y * width + (width - 1 - inset)) * 4;
    if (data[iLeft + 3] > 128) {
      borderColors.push([data[iLeft], data[iLeft + 1], data[iLeft + 2]]);
    }
    if (data[iRight + 3] > 128) {
      borderColors.push([data[iRight], data[iRight + 1], data[iRight + 2]]);
    }
  }

  let bgR = 0,
    bgG = 255,
    bgB = 0;
  if (borderColors.length > 0) {
    let sr = 0,
      sg = 0,
      sb = 0;
    for (const [r, g, b] of borderColors) {
      sr += r;
      sg += g;
      sb += b;
    }
    bgR = sr / borderColors.length;
    bgG = sg / borderColors.length;
    bgB = sb / borderColors.length;
  }

  const alphaBuf = new Float32Array(totalPixels);

  // 2. Per-pixel HSV Chroma-Key Green Matting
  for (let i = 0; i < totalPixels; i++) {
    const idx4 = i * 4;
    const r = data[idx4];
    const g = data[idx4 + 1];
    const b = data[idx4 + 2];
    const a = data[idx4 + 3];

    if (a < 10) {
      alphaBuf[i] = 0;
      continue;
    }

    const maxRB = Math.max(r, b);
    const greenExcess = g - maxRB;
    const greenRatio = g / (maxRB + 1);

    if (g > 50 && (greenExcess > 22 || (greenExcess > 13 && greenRatio > 1.25))) {
      alphaBuf[i] = 0;
    } else if (g > 42 && greenExcess > 5) {
      const ramp = Math.max(0, Math.min(1, (22 - greenExcess) / 17));
      alphaBuf[i] = a * ramp;
      data[idx4 + 1] = Math.min(g, Math.round(r * 0.54 + b * 0.46));
    } else {
      alphaBuf[i] = a;
    }
  }

  // 3. Exterior BFS Flood-Fill if border is a non-green solid studio color
  const isBorderGreen = bgG - Math.max(bgR, bgB) > 18;
  if (!isBorderGreen) {
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    let qHead = 0,
      qTail = 0;
    const cx = width * 0.5,
      cy = height * 0.48;
    const coreRx = width * 0.22,
      coreRy = height * 0.25;

    const canFill = (idx: number, nIdx: number): boolean => {
      const x = idx % width,
        y = (idx / width) | 0;
      const dx = (x - cx) / coreRx,
        dy = (y - cy) / coreRy;
      if (dx * dx + dy * dy < 1.0) return false;

      const i4 = idx * 4,
        n4 = nIdx * 4;
      const r = data[i4],
        g = data[i4 + 1],
        b = data[i4 + 2];
      const distBg = Math.hypot(r - bgR, g - bgG, b - bgB);
      const distNeighbor = Math.hypot(r - data[n4], g - data[n4 + 1], b - data[n4 + 2]);
      return distBg < sensitivity * 1.15 && distNeighbor < 18;
    };

    for (let x = 0; x < width; x++) {
      visited[x] = 1;
      queue[qTail++] = x;
    }
    for (let y = 1; y < height - 1; y++) {
      const l = y * width,
        r = y * width + width - 1;
      visited[l] = 1;
      queue[qTail++] = l;
      visited[r] = 1;
      queue[qTail++] = r;
    }

    while (qHead < qTail) {
      const curr = queue[qHead++];
      alphaBuf[curr] = 0;
      const x = curr % width,
        y = (curr / width) | 0;
      const neighbors = [];
      if (x > 0) neighbors.push(curr - 1);
      if (x < width - 1) neighbors.push(curr + 1);
      if (y > 0) neighbors.push(curr - width);
      if (y < height - 1) neighbors.push(curr + width);
      for (const nxt of neighbors) {
        if (visited[nxt] === 0 && canFill(nxt, curr)) {
          visited[nxt] = 1;
          queue[qTail++] = nxt;
        }
      }
    }
  }

  // 4. Soft edge erosion + 3x3 feathering to remove any 1px contour fringe
  const erodedAlpha = new Float32Array(totalPixels);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const c = alphaBuf[idx];
      if (c === 0) {
        erodedAlpha[idx] = 0;
        continue;
      }
      const minNeighbor = Math.min(
        c,
        alphaBuf[idx - 1],
        alphaBuf[idx + 1],
        alphaBuf[idx - width],
        alphaBuf[idx + width]
      );
      erodedAlpha[idx] = minNeighbor < 250 ? c * 0.48 + minNeighbor * 0.52 : c;
    }
  }

  const smoothedAlpha = new Float32Array(totalPixels);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const c = erodedAlpha[idx];
      const l = erodedAlpha[idx - 1];
      const r = erodedAlpha[idx + 1];
      const u = erodedAlpha[idx - width];
      const d = erodedAlpha[idx + width];
      if (c === l && c === r && c === u && c === d) {
        smoothedAlpha[idx] = c;
      } else {
        smoothedAlpha[idx] =
          (c * 4 +
            l * 2 +
            r * 2 +
            u * 2 +
            d * 2 +
            erodedAlpha[idx - width - 1] +
            erodedAlpha[idx - width + 1] +
            erodedAlpha[idx + width - 1] +
            erodedAlpha[idx + width + 1]) /
          16;
      }
    }
  }

  // 5. Write final clean RGBA
  for (let i = 0; i < totalPixels; i++) {
    const a = Math.round(smoothedAlpha[i]);
    const idx4 = i * 4;
    if (a < 14) {
      data[idx4] = 0;
      data[idx4 + 1] = 0;
      data[idx4 + 2] = 0;
      data[idx4 + 3] = 0;
    } else {
      let r = data[idx4];
      let g = data[idx4 + 1];
      let b = data[idx4 + 2];

      if (g > Math.max(r, b)) {
        g = Math.round(r * 0.52 + b * 0.48);
      }

      if (a < 235) {
        const factor = Math.min(1, a / 225);
        r = Math.round(r * factor);
        g = Math.round(g * factor);
        b = Math.round(b * factor);
      }

      data[idx4] = r;
      data[idx4 + 1] = g;
      data[idx4 + 2] = b;
      data[idx4 + 3] = a;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Measures the opaque bounding box and eye-level anchor of an isolated head canvas.
 */
export function getOpaqueHeadBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): HeadBounds {
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width,
    maxX = 0,
    minY = height,
    maxY = 0,
    opaqueCount = 0;

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        opaqueCount++;
      }
    }
  }

  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const valid = opaqueCount > width * height * 0.015 && w > width * 0.18 && h > height * 0.18;

  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) * 0.5,
    cy: (minY + maxY) * 0.5,
    // Eye & temple anchor line sits ~38% down from top crown of hair
    eyeAnchorY: minY + h * 0.38,
    width: w,
    height: h,
    valid,
  };
}

/**
 * Centers and scales an isolated floating head so its bounding box matches Mina's
 * exact framing on the canvas (occupying ~68% width, centered at (0.5, 0.48)).
 */
export async function ensureTransparentCharacterPng(
  imageDataUrl: string,
  sensitivity: number = 38
): Promise<string> {
  const img = await loadImage(imageDataUrl);
  const size = 1024;
  // Work at the generated image's own resolution (up to 2K) so the normalized head is downscaled, not upscaled
  const rawSize = Math.min(2048, Math.max(size, img.naturalWidth || img.width));

  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = rawSize;
  rawCanvas.height = rawSize;
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
  if (!rawCtx) return imageDataUrl;

  rawCtx.clearRect(0, 0, rawSize, rawSize);
  rawCtx.drawImage(img, 0, 0, rawSize, rawSize);

  isolateSubjectOnCanvas(rawCtx, rawSize, rawSize, sensitivity);

  const bounds = getOpaqueHeadBounds(rawCtx, rawSize, rawSize);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = size;
  outCanvas.height = size;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) return rawCanvas.toDataURL('image/png');

  outCtx.clearRect(0, 0, size, size);

  if (bounds.valid) {
    // Normalize to Mina's framing: her head fills ~97% of the texture height and ~87% of its width,
    // and every hover zone, prop position and physics constant in the engine is calibrated to that.
    const scale = Math.max(
      0.1,
      Math.min(3, Math.min((size * 0.96) / bounds.height, (size * 0.88) / bounds.width))
    );
    const destW = bounds.width * scale;
    const destH = bounds.height * scale;
    const destX = size * 0.5 - destW * 0.5;
    const destY = size * 0.5 - destH * 0.5;

    outCtx.drawImage(
      rawCanvas,
      bounds.minX,
      bounds.minY,
      bounds.width,
      bounds.height,
      destX,
      destY,
      destW,
      destH
    );
  } else {
    const pad = Math.round(size * 0.05);
    outCtx.drawImage(rawCanvas, 0, 0, rawSize, rawSize, pad, pad, size - pad * 2, size - pad * 2);
  }

  return outCanvas.toDataURL('image/png');
}

interface HeadProfile {
  crown: number;
  bandWidth: number;
  bandCx: number;
}

/**
 * Measures where the crown of the head starts and how wide / where the head is at eye level.
 * Using the head width at eye level (instead of the whole bounding box) keeps registration stable
 * when a frame has bubbles, hearts, tears or wind-blown hair sticking out of the head silhouette.
 */
function measureHeadProfile(ctx: CanvasRenderingContext2D, size: number, bandDrop: number): HeadProfile | null {
  const data = ctx.getImageData(0, 0, size, size).data;
  const rowMin = new Int32Array(size).fill(-1);
  const rowMax = new Int32Array(size).fill(-1);
  let maxW = 0;

  for (let y = 0; y < size; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = 0; x < size; x += 2) {
      if (data[(y * size + x) * 4 + 3] > 60) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    rowMin[y] = lo;
    rowMax[y] = hi;
    if (lo >= 0) maxW = Math.max(maxW, hi - lo);
  }
  if (maxW < size * 0.15) return null;

  // Crown = first row where the silhouette is head-wide for several rows in a row (ignores thin props)
  const need = maxW * 0.3;
  const wide = (y: number) => rowMin[y] >= 0 && rowMax[y] - rowMin[y] >= need;
  let crown = -1;
  for (let y = 0; y < size - 6; y++) {
    if (wide(y) && wide(y + 1) && wide(y + 2) && wide(y + 3) && wide(y + 4) && wide(y + 5)) {
      crown = y;
      break;
    }
  }
  if (crown < 0) return null;

  const centerRow = Math.round(crown + bandDrop);
  let sumW = 0;
  let sumC = 0;
  let n = 0;
  for (let y = centerRow - 8; y <= centerRow + 8; y++) {
    if (y < 0 || y >= size || rowMin[y] < 0) continue;
    sumW += rowMax[y] - rowMin[y];
    sumC += (rowMax[y] + rowMin[y]) / 2;
    n++;
  }
  if (!n || sumW / n < 1) return null;
  return { crown, bandWidth: sumW / n, bandCx: sumC / n };
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * Slices an AI character sprite sheet (columns x rows of equal cells) into individual frames,
 * removes the chroma-key background from each cell, and registers every head (scale + position)
 * to the master 'rest' head so there is no jumping when the engine swaps between frames.
 */
export async function sliceAndAlignGrid(
  gridDataUrl: string,
  masterCanvas: HTMLCanvasElement,
  cellNames: string[],
  columns: number = 3,
  targetSize: number = 1024
): Promise<Record<string, string>> {
  const gridImg = await loadImage(gridDataUrl);
  const gw = gridImg.naturalWidth || gridImg.width;
  const gh = gridImg.naturalHeight || gridImg.height;
  const rows = Math.ceil(cellNames.length / columns);

  const masterCtx = masterCanvas.getContext('2d', { willReadFrequently: true });
  if (!masterCtx) return {};
  const masterBounds = getOpaqueHeadBounds(masterCtx, masterCanvas.width, masterCanvas.height);
  if (!masterBounds.valid) return {};
  const bandDropM = masterBounds.height * 0.45;
  const masterProfile = measureHeadProfile(masterCtx, masterCanvas.width, bandDropM);
  if (!masterProfile) return {};
  // Everything below is expressed in targetSize pixels
  const k = targetSize / masterCanvas.width;
  const mCrown = masterProfile.crown * k;
  const mCx = masterProfile.bandCx * k;
  const mWidth = masterProfile.bandWidth * k;
  const bandDrop = bandDropM * k;

  const cellW = gw / columns;
  const cellH = gh / rows;
  // Crop a small inset inside each cell to exclude any divider artifacts
  const insetX = cellW * 0.02;
  const insetY = cellH * 0.02;

  const cellCanvas = document.createElement('canvas');
  cellCanvas.width = targetSize;
  cellCanvas.height = targetSize;
  const cellCtx = cellCanvas.getContext('2d', { willReadFrequently: true })!;

  const measured: { name: string; canvas: HTMLCanvasElement; s: number; p: HeadProfile }[] = [];

  for (let i = 0; i < cellNames.length; i++) {
    const name = cellNames[i];
    if (!name) continue;
    const col = i % columns;
    const row = Math.floor(i / columns);

    cellCtx.clearRect(0, 0, targetSize, targetSize);
    cellCtx.drawImage(
      gridImg,
      col * cellW + insetX,
      row * cellH + insetY,
      cellW - insetX * 2,
      cellH - insetY * 2,
      0,
      0,
      targetSize,
      targetSize
    );
    isolateSubjectOnCanvas(cellCtx, targetSize, targetSize, 38);

    let s = 1;
    let p: HeadProfile | null = null;
    for (let it = 0; it < 3; it++) {
      p = measureHeadProfile(cellCtx, targetSize, bandDrop / s);
      if (!p) break;
      s = Math.max(0.55, Math.min(1.8, mWidth / p.bandWidth));
    }
    if (!p) continue;

    const keep = document.createElement('canvas');
    keep.width = targetSize;
    keep.height = targetSize;
    keep.getContext('2d')!.drawImage(cellCanvas, 0, 0);
    measured.push({ name, canvas: keep, s, p });
    await new Promise((r) => setTimeout(r, 0));
  }

  if (!measured.length) return {};

  // One sheet = one render, so its heads share (almost) the same scale and offset.
  // Start from the sheet median, then refine each frame against the master image itself.
  const gs = median(measured.map((m) => m.s));
  const initial = measured.map((m) => {
    const s = Math.max(gs * 0.93, Math.min(gs * 1.07, m.s));
    return { ...m, s, dx: mCx - m.p.bandCx * s, dy: mCrown - m.p.crown * s };
  });
  const mdx = median(initial.map((m) => m.dx));
  const mdy = median(initial.map((m) => m.dy));
  const slack = targetSize * 0.025;
  const clamp = (v: number, c: number) => Math.max(c - slack, Math.min(c + slack, v));

  const target = buildRegistrationTarget(masterCanvas);
  const masterFull = document.createElement('canvas');
  masterFull.width = targetSize;
  masterFull.height = targetSize;
  const masterFullCtx = masterFull.getContext('2d', { willReadFrequently: true })!;
  masterFullCtx.drawImage(masterCanvas, 0, 0, targetSize, targetSize);
  const masterPx = masterFullCtx.getImageData(0, 0, targetSize, targetSize).data;
  const mask = buildFaceMask(targetSize);

  const out = document.createElement('canvas');
  out.width = targetSize;
  out.height = targetSize;
  const outCtx = out.getContext('2d', { willReadFrequently: true })!;
  const result: Record<string, string> = {};

  for (const m of initial) {
    const start = { s: m.s, dx: clamp(m.dx, mdx), dy: clamp(m.dy, mdy) };
    const t = refineRegistration(m.canvas, target, start, targetSize);

    outCtx.clearRect(0, 0, targetSize, targetSize);
    outCtx.drawImage(m.canvas, t.dx, t.dy, targetSize * t.s, targetSize * t.s);
    const img = outCtx.getImageData(0, 0, targetSize, targetSize);

    const gain = NO_COLOR_MATCH.has(m.name) ? null : skinGain(img.data, masterPx, targetSize);
    if (gain) applyGain(img.data, gain);
    const change = buildChangeMask(img.data, masterPx, targetSize);
    blendFaceOntoMaster(img.data, masterPx, mask, change);
    outCtx.putImageData(img, 0, 0);
    result[m.name] = out.toDataURL('image/webp', 0.95);
    await new Promise((r) => setTimeout(r, 0));
  }

  return result;
}

export interface FaceLayout {
  /** Where Mina's reference point (u .5, eye line v .455) sits on this face, and the face's size relative to Mina's. */
  cx: number;
  eyeV: number;
  kx: number;
  ky: number;
}

// Frames whose skin color is meant to differ from the master
const NO_COLOR_MATCH = new Set(['sick', 'shy', 'cry', 'angry', 'puff', 'hearts', 'stars']);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 1 where the frame's face replaces the master, 0 where the master (hair, ears, earrings, outline)
 * is kept untouched, with a soft seam in between. Everything outside the face therefore stays
 * pixel-identical across frames, which is what keeps the swaps from flickering.
 *
 * The region must contain every brow tip and eye corner completely: a brow or eyeliner that sits in the
 * soft seam is shown half from the master and half from the frame, which reads as a second, ghosted eyebrow.
 */
function buildFaceMask(size: number): Float32Array {
  const cx = 0.505;
  const cy = 0.56;
  const mask = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const d = Math.hypot((u - cx) / 0.36, (v - cy) / 0.42);
      const ell = 1 - smoothstep(0.88, 1.0, d);
      // Below the cheeks the jaw / bubble / tongue may leave the master's silhouette
      const mu = smoothstep(cx - 0.2, cx - 0.15, u) * (1 - smoothstep(cx + 0.15, cx + 0.2, u));
      const mv = smoothstep(0.58, 0.64, v) * (1 - smoothstep(0.92, 0.98, v));
      mask[y * size + x] = Math.max(ell, mu * mv);
    }
  }
  return mask;
}

/** Per-channel gain that matches the cheeks of a frame to the master (kills lighting / tint flicker). */
function skinGain(
  px: Uint8ClampedArray,
  masterPx: Uint8ClampedArray,
  size: number
): [number, number, number] | null {
  const cy = 0.57;
  const cx = 0.505;
  const acc = [0, 0, 0, 0, 0, 0];
  let n = 0;
  for (const side of [-1, 1]) {
    const px0 = Math.round((cx + side * 0.13) * size);
    const py0 = Math.round(cy * size);
    const r = Math.round(size * 0.035);
    for (let y = py0 - r; y <= py0 + r; y += 2) {
      for (let x = px0 - r; x <= px0 + r; x += 2) {
        const i = (y * size + x) * 4;
        if (px[i + 3] < 250 || masterPx[i + 3] < 250) continue;
        for (let c = 0; c < 3; c++) {
          acc[c] += px[i + c];
          acc[3 + c] += masterPx[i + c];
        }
        n++;
      }
    }
  }
  if (n < 40) return null;
  const g = (c: number) => Math.max(0.88, Math.min(1.12, acc[3 + c] / Math.max(1, acc[c])));
  return [g(0), g(1), g(2)];
}

function applyGain(px: Uint8ClampedArray, gain: [number, number, number]): void {
  for (let i = 0; i < px.length; i += 4) {
    px[i] = Math.min(255, px[i] * gain[0]);
    px[i + 1] = Math.min(255, px[i + 1] * gain[1]);
    px[i + 2] = Math.min(255, px[i + 2] * gain[2]);
  }
}

/**
 * 0..1 map of where a frame really differs from the master (iris and lids for a gaze or blink frame,
 * the mouth for a yawn...). Gemini re-renders skin, brows and hair a little differently in every
 * frame; taking only the changed areas from the frame and everything else from the master removes
 * that shimmer when the engine swaps frames.
 */
function buildChangeMask(px: Uint8ClampedArray, masterPx: Uint8ClampedArray, size: number): Float32Array {
  const S = 256;
  const k = size / S;
  const diff = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let sum = 0;
      for (let yy = 0; yy < k; yy += 2) {
        for (let xx = 0; xx < k; xx += 2) {
          const i = ((y * k + yy) * size + (x * k + xx)) * 4;
          const a = Math.max(px[i + 3], masterPx[i + 3]) / 255;
          sum +=
            ((Math.abs(px[i] - masterPx[i]) + Math.abs(px[i + 1] - masterPx[i + 1]) + Math.abs(px[i + 2] - masterPx[i + 2])) / 3) * a +
            Math.abs(px[i + 3] - masterPx[i + 3]) * 0.6;
        }
      }
      diff[y * S + x] = sum / ((k / 2) * (k / 2));
    }
  }

  const box = (src: Float32Array, r: number, op: 'avg' | 'max' | 'min'): Float32Array => {
    const tmp = new Float32Array(S * S);
    const out = new Float32Array(S * S);
    const pick = (a: number, b: number) => (op === 'max' ? Math.max(a, b) : op === 'min' ? Math.min(a, b) : a + b);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let v = op === 'min' ? 1e9 : 0;
        for (let d = -r; d <= r; d++) v = pick(v, src[y * S + Math.min(S - 1, Math.max(0, x + d))]);
        tmp[y * S + x] = op === 'avg' ? v / (2 * r + 1) : v;
      }
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let v = op === 'min' ? 1e9 : 0;
        for (let d = -r; d <= r; d++) v = pick(v, tmp[Math.min(S - 1, Math.max(0, y + d)) * S + x]);
        out[y * S + x] = op === 'avg' ? v / (2 * r + 1) : v;
      }
    }
    return out;
  };

  const smooth = box(diff, 1, 'avg');
  const bin = new Float32Array(S * S);
  for (let i = 0; i < bin.length; i++) bin[i] = smooth[i] > 24 ? 1 : 0;
  // opening removes isolated texture differences; the wide dilation keeps lashes, lid lines and the soft shadow edges around
  // every real change fully inside the replaced area (the blur below then only fades pixels that did not change at all)
  const grown = box(box(bin, 1, 'min'), 8, 'max');
  const soft = box(box(grown, 2, 'avg'), 2, 'avg');

  // bilinear upsample to full resolution
  const full = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = Math.min(S - 1.001, Math.max(0, (y + 0.5) / k - 0.5));
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = Math.min(S - 1.001, Math.max(0, (x + 0.5) / k - 0.5));
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const a = soft[y0 * S + x0] * (1 - tx) + soft[y0 * S + x0 + 1] * tx;
      const b = soft[(y0 + 1) * S + x0] * (1 - tx) + soft[(y0 + 1) * S + x0 + 1] * tx;
      full[y * size + x] = a * (1 - ty) + b * ty;
    }
  }
  return full;
}

function blendFaceOntoMaster(
  px: Uint8ClampedArray,
  masterPx: Uint8ClampedArray,
  mask: Float32Array,
  change: Float32Array
): void {
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const m = mask[p] * change[p];
    if (m <= 0.002) {
      px[i] = masterPx[i];
      px[i + 1] = masterPx[i + 1];
      px[i + 2] = masterPx[i + 2];
      px[i + 3] = masterPx[i + 3];
      continue;
    }
    const ca = (px[i + 3] / 255) * m;
    const ma = (masterPx[i + 3] / 255) * (1 - m);
    const oa = ca + ma;
    if (oa <= 0.001) {
      px[i + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) px[i + c] = (px[i + c] * ca + masterPx[i + c] * ma) / oa;
    px[i + 3] = Math.round(oa * 255);
  }
}

interface RegistrationTarget {
  data: Float32Array;
  weight: Float32Array;
}

const REG = 128;

/** The master at low resolution (premultiplied) plus per-pixel weights that down-weight the mouth area. */
function buildRegistrationTarget(masterCanvas: HTMLCanvasElement): RegistrationTarget {
  const c = document.createElement('canvas');
  c.width = c.height = REG;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(masterCanvas, 0, 0, REG, REG);
  const px = ctx.getImageData(0, 0, REG, REG).data;
  const data = new Float32Array(REG * REG * 4);
  const weight = new Float32Array(REG * REG);
  for (let p = 0; p < REG * REG; p++) {
    const a = px[p * 4 + 3] / 255;
    data[p * 4] = (px[p * 4] / 255) * a;
    data[p * 4 + 1] = (px[p * 4 + 1] / 255) * a;
    data[p * 4 + 2] = (px[p * 4 + 2] / 255) * a;
    data[p * 4 + 3] = a;
    const u = ((p % REG) + 0.5) / REG;
    const v = (Math.floor(p / REG) + 0.5) / REG;
    weight[p] = v > 0.58 && Math.abs(u - 0.505) < 0.22 ? 0.25 : 1;
  }
  return { data, weight };
}

/**
 * Fine registration of a frame against the master image (outline, hair, ears, brow and nose line up),
 * using a truncated L1 difference so the parts that are supposed to change do not dominate.
 * Returns the draw rectangle: origin (dx, dy) and scale s of the full-size cell canvas.
 */
function refineRegistration(
  cell: HTMLCanvasElement,
  target: RegistrationTarget,
  init: { s: number; dx: number; dy: number },
  size: number
): { s: number; dx: number; dy: number } {
  const small = document.createElement('canvas');
  small.width = small.height = REG * 2;
  small.getContext('2d')!.drawImage(cell, 0, 0, REG * 2, REG * 2);
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = REG;
  const ctx = tmp.getContext('2d', { willReadFrequently: true })!;

  // Scale about the canvas center: rect origin = Q*(1 - s) + t
  const q = size / 2;
  const toT = (p: { s: number; dx: number; dy: number }) => ({ s: p.s, tx: p.dx - q * (1 - p.s), ty: p.dy - q * (1 - p.s) });
  const fromT = (p: { s: number; tx: number; ty: number }) => ({ s: p.s, dx: p.tx + q * (1 - p.s), dy: p.ty + q * (1 - p.s) });

  const cost = (p: { s: number; tx: number; ty: number }) => {
    const o = fromT(p);
    const k = REG / size;
    ctx.clearRect(0, 0, REG, REG);
    ctx.drawImage(small, o.dx * k, o.dy * k, REG * p.s, REG * p.s);
    const d = ctx.getImageData(0, 0, REG, REG).data;
    let sum = 0;
    let wsum = 0;
    for (let i = 0, j = 0; j < REG * REG; i += 4, j++) {
      const a = d[i + 3] / 255;
      const w = target.weight[j];
      const t = j * 4;
      const e =
        Math.min(0.35, Math.abs((d[i] / 255) * a - target.data[t])) +
        Math.min(0.35, Math.abs((d[i + 1] / 255) * a - target.data[t + 1])) +
        Math.min(0.35, Math.abs((d[i + 2] / 255) * a - target.data[t + 2])) +
        Math.min(0.35, Math.abs(a - target.data[t + 3]));
      sum += e * w;
      wsum += w;
    }
    return sum / wsum;
  };

  const start = toT(init);
  let best = start;
  let bestCost = cost(best);
  const levels: [number, number][] = [
    [size * 0.012, 0.02],
    [size * 0.006, 0.01],
    [size * 0.003, 0.005],
    [size * 0.0015, 0.0025],
  ];
  const maxMove = size * 0.06;

  for (const [step, sStep] of levels) {
    for (let iter = 0; iter < 8; iter++) {
      let improved = false;
      for (const [ds, dtx, dty] of [
        [0, step, 0],
        [0, -step, 0],
        [0, 0, step],
        [0, 0, -step],
        [sStep, 0, 0],
        [-sStep, 0, 0],
      ]) {
        const cand = { s: best.s + ds, tx: best.tx + dtx, ty: best.ty + dty };
        if (
          Math.abs(cand.tx - start.tx) > maxMove ||
          Math.abs(cand.ty - start.ty) > maxMove ||
          Math.abs(cand.s - start.s) > 0.12
        )
          continue;
        const c = cost(cand);
        if (c < bestCost - 1e-5) {
          best = cand;
          bestCost = c;
          improved = true;
        }
      }
      if (!improved) break;
    }
  }

  return fromT(best);
}

/**
 * Crops a clean head-centered square reference portrait and detects the person's true skin tone.
 */
export async function processPortraitImage(
  dataUrl: string,
  options: {
    targetSize?: number;
  } = {}
): Promise<ProcessedPortrait> {
  const { targetSize = 1024 } = options;

  const img = await loadImage(dataUrl);
  const imgWidth = img.naturalWidth || img.width;
  const imgHeight = img.naturalHeight || img.height;

  const scanSize = 256;
  const scanCanvas = document.createElement('canvas');
  scanCanvas.width = scanSize;
  scanCanvas.height = scanSize;
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

  let faceCenterX = 0.5;
  let faceCenterY = 0.38;
  const skinSamples: [number, number, number, number][] = [];

  if (scanCtx) {
    scanCtx.drawImage(img, 0, 0, scanSize, scanSize);
    const sData = scanCtx.getImageData(0, 0, scanSize, scanSize).data;
    let sumX = 0,
      sumY = 0,
      sumW = 0;

    for (let y = Math.floor(scanSize * 0.08); y < Math.floor(scanSize * 0.68); y += 2) {
      for (let x = Math.floor(scanSize * 0.16); x < Math.floor(scanSize * 0.84); x += 2) {
        const idx = (y * scanSize + x) * 4;
        const r = sData[idx];
        const g = sData[idx + 1];
        const b = sData[idx + 2];
        const a = sData[idx + 3];

        if (
          a > 180 &&
          r > 75 &&
          g > 45 &&
          b > 30 &&
          r > g * 1.04 &&
          g > b * 0.85 &&
          r - b > 18 &&
          r - b < 135 &&
          r + g + b < 710
        ) {
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const nx = x / scanSize;
          const ny = y / scanSize;
          const centerWeight = 1 - Math.abs(nx - 0.5) * 0.85;
          const w = lum * centerWeight;
          sumX += nx * w;
          sumY += ny * w;
          sumW += w;
          skinSamples.push([r, g, b, lum]);
        }
      }
    }

    if (sumW > 1000) {
      faceCenterX = Math.max(0.30, Math.min(0.70, sumX / sumW));
      faceCenterY = Math.max(0.24, Math.min(0.52, sumY / sumW));
    }
  }

  let avgR = 216,
    avgG = 168,
    avgB = 136;

  if (skinSamples.length > 10) {
    skinSamples.sort((a, b) => a[3] - b[3]);
    const pStart = Math.floor(skinSamples.length * 0.42);
    const pEnd = Math.floor(skinSamples.length * 0.76);
    let sr = 0,
      sg = 0,
      sb = 0,
      cnt = 0;
    for (let i = pStart; i <= pEnd; i++) {
      sr += skinSamples[i][0];
      sg += skinSamples[i][1];
      sb += skinSamples[i][2];
      cnt++;
    }
    if (cnt > 0) {
      avgR = Math.min(248, Math.round((sr / cnt) * 1.04));
      avgG = Math.min(225, Math.round((sg / cnt) * 1.04));
      avgB = Math.min(208, Math.round((sb / cnt) * 1.04));
    }
  }

  const detectedSkinHex = rgbToHex(avgR, avgG, avgB);
  const lum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;

  let skinColorDescription = `natural warm studio-lit skin tone (hex ${detectedSkinHex})`;
  if (lum > 205) {
    skinColorDescription = `fair warm peach skin tone (hex ${detectedSkinHex})`;
  } else if (lum > 172) {
    skinColorDescription = `warm light-medium golden-beige complexion (hex ${detectedSkinHex})`;
  } else if (lum > 138) {
    skinColorDescription = `warm medium golden-tan / olive complexion (hex ${detectedSkinHex})`;
  } else if (lum > 105) {
    skinColorDescription = `rich warm bronze-brown complexion (hex ${detectedSkinHex})`;
  } else {
    skinColorDescription = `deep warm espresso-ebony complexion (hex ${detectedSkinHex})`;
  }

  // Create clean un-chopped head-centered square reference crop for Gemini
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context not available.');

  const cropSize = Math.min(imgWidth, imgHeight) * 0.84;
  const srcX = Math.max(0, Math.min(imgWidth - cropSize, faceCenterX * imgWidth - cropSize * 0.5));
  const srcY = Math.max(0, Math.min(imgHeight - cropSize, faceCenterY * imgHeight - cropSize * 0.45));

  ctx.clearRect(0, 0, targetSize, targetSize);
  ctx.drawImage(img, srcX, srcY, cropSize, cropSize, 0, 0, targetSize, targetSize);

  const framedReferenceUrl = canvas.toDataURL('image/png');

  return {
    isolatedDataUrl: framedReferenceUrl,
    framedReferenceUrl,
    originalDataUrl: dataUrl,
    skinColorDescription,
    detectedSkinHex,
    skinRgb: [avgR, avgG, avgB],
  };
}
