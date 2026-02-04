import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { fileTypeFromBuffer } from 'file-type';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { env } from '../../config/env.js';
import { r2Client } from '../../config/r2.js';
import { db } from '../../db/index.js';
import { uploads } from '../../db/schema.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_MAX_WIDTH = 1080;
const WEBP_QUALITY = 80;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/tiff'];

export interface UploadResult {
  url: string;
  key: string;
  sizeBytes: number;
}

export interface ImageFile {
  filename: string;
  encoding: string;
  mimetype: string;
  file: AsyncIterable<Buffer>;
}

export async function processAndUploadImage(
  file: ImageFile,
  userId: string
): Promise<UploadResult> {
  const buffers: Buffer[] = [];
  for await (const chunk of file.file) {
    buffers.push(chunk);
  }
  const fileBuffer = Buffer.concat(buffers);

  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`Arquivo muito grande (máx ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  const fileType = await fileTypeFromBuffer(fileBuffer);
  if (!fileType || !ALLOWED_MIMES.includes(fileType.mime)) {
    throw new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.');
  }

  let processedBuffer: Buffer;
  try {
    processedBuffer = await sharp(fileBuffer)
      .resize(IMAGE_MAX_WIDTH, IMAGE_MAX_WIDTH, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    throw new Error(
      `Erro ao processar imagem: ${error instanceof Error ? error.message : 'unknown'}`
    );
  }

  const id = nanoid(8);
  const timestamp = Date.now();
  const key = `items/${userId}/${id}-${timestamp}.webp`;
  const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: processedBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      })
    );
  } catch (error) {
    throw new Error(`Erro ao fazer upload: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  try {
    const [upload] = await db
      .insert(uploads)
      .values({
        userId,
        url: publicUrl,
        key,
        filename: file.filename,
        mimeType: 'image/webp',
        sizeBytes: processedBuffer.length,
      })
      .returning();

    if (!upload) {
      throw new Error('Failed to insert upload record');
    }

    return {
      url: publicUrl,
      key: upload.key,
      sizeBytes: upload.sizeBytes,
    };
  } catch (error) {
    try {
      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: key,
        })
      );
    } catch {
      // Ignore cleanup error
    }
    throw new Error(
      `Erro ao registrar upload: ${error instanceof Error ? error.message : 'unknown'}`
    );
  }
}

export async function deleteUploadFromR2(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );
}
