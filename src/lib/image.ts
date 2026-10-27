/** Bilder im Browser laden und verkleinern (Essens-Scan und gemeinsame Fotos). */

export interface Bitmap {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/** Lädt ein Foto – gedreht so, wie es aufgenommen wurde. */
export async function loadBitmap(file: Blob): Promise<Bitmap> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Ältere Browser: über ein <img> laden.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Maße, damit die längere Seite höchstens `max` Pixel hat (nie vergrößern). */
export function fitSize(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Zeichnet das Bild verkleinert auf ein Canvas. */
export function drawScaled(bmp: Bitmap, max: number): HTMLCanvasElement {
  const { width, height } = fitSize(bmp.width, bmp.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kein Canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp.source, 0, 0, width, height);
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG fehlgeschlagen'))), 'image/jpeg', quality));
}
