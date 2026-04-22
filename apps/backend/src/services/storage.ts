import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads';

export async function uploadFile(buffer: Buffer, key: string, _contentType: string): Promise<string> {
  const filePath = join(UPLOADS_DIR, key);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return `/uploads/${key}`;
}
