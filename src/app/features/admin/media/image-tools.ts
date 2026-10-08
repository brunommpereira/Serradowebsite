import { PreparedImage } from '../data/admin-source';

export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Prepara uma imagem no browser antes de a enviar:
 *  - reduz para `maxSize` px no lado maior (fotografias de telemóvel têm 4000 px ou mais);
 *  - converte para WebP (ou JPEG, se o browser não souber gerar WebP);
 *  - ao redesenhar, deixa para trás os metadados EXIF, incluindo a localização GPS.
 */
export async function prepareImage(file: File, maxSize: number, alt = ''): Promise<PreparedImage> {
  if (!ACCEPTED_IMAGES.split(',').includes(file.type)) throw new Error(`«${file.name}» não é uma imagem JPEG, PNG, WebP ou GIF.`);
  if (file.size > MAX_INPUT_BYTES) throw new Error(`«${file.name}» tem mais de 25 MB.`);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`Não foi possível ler «${file.name}».`);
  }
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O browser não permite processar imagens.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await toBlob(canvas, 'image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new Error(`Não foi possível converter «${file.name}».`);

  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 150) || 'imagem';
  return { name: `${base}.${ext}`, mime: blob.type, base64: await toBase64(blob), width, height, alt };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function toBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Falha ao ler a imagem'));
    r.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

export function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
