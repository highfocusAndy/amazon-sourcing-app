/** Client-only: shrink large photos before upload so we stay inside API limits without sharp. */

const MAX_DIMENSION = 384;

export async function resizeImageToJpegBlob(file: File, quality = 0.88): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  let { width: w, height: h } = bmp;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bmp, 0, 0, tw, th);
  bmp.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/jpeg", quality);
  });
}
