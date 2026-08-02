import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads';

export async function uploadFile(buffer: Buffer, key: string, _contentType: string): Promise<string> {
  const filePath = join(UPLOADS_DIR, key);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return `/uploads/${key}`;
}

// Turns a stored "/uploads/..." URL (as returned by uploadFile above) back
// into an absolute filesystem path. Only ever called on server-generated
// values already in the DB (e.g. Ticket.receiptLink) — never on raw request
// input — so there's no path-traversal surface to sanitize against here.
export function resolveUploadPath(url: string): string {
  return join(UPLOADS_DIR, url.replace(/^\/uploads\//, ''));
}
