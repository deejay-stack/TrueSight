import sharp from 'sharp';
import { invalid } from './LmsGrading.js';

// Shared by class enrollment and the independent academic-profile verification flow.
export async function validateCorUpload(input: any) {
  if (!input || typeof input !== 'object') invalid('A COR image upload is required.');
  const fileName = typeof input.fileName === 'string' ? input.fileName.trim() : '';
  const fileDataUrl = typeof input.fileDataUrl === 'string' ? input.fileDataUrl.trim() : '';
  const fileType = typeof input.fileType === 'string' ? input.fileType.trim().toLowerCase() : '';
  if (!fileName || !fileDataUrl) invalid('A COR image upload is required.');
  if (fileName.length > 255) invalid('The COR file name is too long.');
  if (fileDataUrl.length > 7_000_000) invalid('COR exceeds the supported upload size.', 413);
  if (!/\.(png|jpe?g|webp)$/i.test(fileName)) invalid('COR uploads only accept PNG, JPG, JPEG, or WEBP images.', 415);
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(fileDataUrl);
  if (!match) invalid('COR must contain valid PNG, JPEG, or WEBP image data.', 415);
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) invalid('COR exceeds the supported upload size.', 413);
  let metadata;
  try { metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata(); }
  catch { invalid('The COR image cannot be decoded. Select a valid image.', 415); }
  const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[metadata.format];
  if (!mime || mime !== match[1].toLowerCase() || (fileType && fileType !== mime)) invalid('COR file type does not match its image data.', 415);
  return { fileName: fileName.split(/[\\/]/).pop(), fileType: mime, fileSize: bytes.length, fileDataUrl };
}
