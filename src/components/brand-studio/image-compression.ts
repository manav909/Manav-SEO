/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/image-compression.ts
   Brand Studio Phase 1C — Client-side image compression.

   Strategy: if file is under target size, return unchanged. Otherwise
   read it as an Image, draw to canvas at reduced dimensions (max 2048px
   on the longest edge), and re-encode as JPEG at quality 0.85.

   Returns base64 (raw, no data-URL prefix), content-type, and dimensions.

   SVGs are passed through unchanged — they don't need raster compression.
═══════════════════════════════════════════════════════════════ */

const COMPRESS_THRESHOLD = 2 * 1024 * 1024;  /* 2MB — compress if above this */
const MAX_DIMENSION       = 2048;             /* longest edge after resize */
const JPEG_QUALITY        = 0.85;

export interface CompressedImage {
  base64:       string;
  contentType:  string;
  sizeBytes:    number;
  width?:       number;
  height?:      number;
  originalSize: number;
  compressed:   boolean;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const originalSize = file.size;

  /* SVG and small images — pass through */
  if (file.type === 'image/svg+xml' || file.size <= COMPRESS_THRESHOLD) {
    const base64 = await readAsBase64(file);
    /* Try to measure dimensions for raster images */
    let width: number | undefined;
    let height: number | undefined;
    if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
      try {
        const dims = await measureDimensions(base64, file.type);
        width = dims.width;
        height = dims.height;
      } catch { /* not fatal */ }
    }
    return {
      base64,
      contentType:  file.type || 'application/octet-stream',
      sizeBytes:    file.size,
      width, height,
      originalSize,
      compressed:   false,
    };
  }

  /* Compress: read → resize on canvas → JPEG encode */
  const dataUrl = await readAsDataUrl(file);
  const img     = await loadImage(dataUrl);

  const { width, height } = scaleToMaxDimension(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.fillStyle = 'white';   /* white background for transparent PNGs */
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  /* Always recompress as JPEG — better ratio than re-PNG */
  const newDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64     = newDataUrl.split(',')[1] || '';

  /* Approximate size: base64 length * 3/4 */
  const newSize = Math.round((base64.length * 3) / 4);

  return {
    base64,
    contentType:  'image/jpeg',
    sizeBytes:    newSize,
    width, height,
    originalSize,
    compressed:   true,
  };
}

/* ─── Helpers ────────────────────────────────────────────────── */

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = () => reject(new Error('FileReader error'));
    r.readAsDataURL(file);
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('FileReader error'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

async function measureDimensions(base64: string, contentType: string): Promise<{ width: number; height: number }> {
  const dataUrl = `data:${contentType};base64,${base64}`;
  const img = await loadImage(dataUrl);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

function scaleToMaxDimension(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  if (w >= h) {
    const scale = max / w;
    return { width: max, height: Math.round(h * scale) };
  } else {
    const scale = max / h;
    return { width: Math.round(w * scale), height: max };
  }
}
