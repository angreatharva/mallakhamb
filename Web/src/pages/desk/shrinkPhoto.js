/**
 * Shrink a phone photo before upload: 12 MP straight off an iPhone is 3–6 MB
 * of HEIC/JPEG, and the reader works at about 2,400 px on the long side.
 * Re-encoding through a canvas also turns HEIC (which iOS hands Safari as
 * JPEG when read this way) and EXIF-rotated photos into an upright JPEG.
 */
export const MAX_SIDE = 2400;

export async function shrinkPhoto(file, { maxSide = MAX_SIDE, quality = 0.85 } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  const source = bitmap || await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a photo this browser can open'));
    img.src = URL.createObjectURL(file);
  });
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  bitmap?.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not prepare the photo');
  return blob;
}
