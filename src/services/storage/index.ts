import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FastifyBaseLogger } from 'fastify';
import { fileTypeFromBuffer } from 'file-type';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { env } from '../../config/env.js';
import { r2Client } from '../../config/r2.js';
import { db } from '../../db/index.js';
import { uploads } from '../../db/schema.js';
import { BadRequestError, ErrorCodes, PayloadTooLargeError } from '../../errors/index.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_MAX_WIDTH = 1080;
const WEBP_QUALITY = 80;
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/tiff'];
const PRESIGNED_URL_EXPIRY = 3600;

export interface UploadResult {
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
  userId: string,
  log: FastifyBaseLogger
): Promise<UploadResult> {
  const buffers: Buffer[] = [];
  for await (const chunk of file.file) {
    buffers.push(chunk);
  }
  const fileBuffer = Buffer.concat(buffers);

  log.info(
    { filename: file.filename, originalSize: fileBuffer.length, mimetype: file.mimetype },
    'Image file buffered'
  );

  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new PayloadTooLargeError(
      ErrorCodes.STORAGE_FILE_TOO_LARGE,
      `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }

  const fileType = await fileTypeFromBuffer(fileBuffer);
  if (!fileType || !ALLOWED_MIMES.includes(fileType.mime)) {
    log.warn({ filename: file.filename, detectedType: fileType?.mime }, 'Unsupported file format');
    throw new BadRequestError(
      ErrorCodes.STORAGE_UNSUPPORTED_FORMAT,
      'Unsupported file format. Use JPEG, PNG or WebP'
    );
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

    log.info(
      {
        filename: file.filename,
        originalSize: fileBuffer.length,
        compressedSize: processedBuffer.length,
      },
      'Image compressed to WebP'
    );
  } catch (error) {
    log.error({ err: error, filename: file.filename }, 'Failed to process image with sharp');
    throw new BadRequestError(ErrorCodes.STORAGE_PROCESSING_FAILED, 'Failed to process image');
  }

  const id = nanoid(8);
  const timestamp = Date.now();
  const key = `items/${userId}/${id}-${timestamp}.webp`;

  try {
    log.info({ key, bucket: env.R2_BUCKET_NAME, size: processedBuffer.length }, 'Uploading to R2');

    await r2Client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: processedBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      })
    );

    log.info({ key }, 'Upload to R2 completed');
  } catch (error) {
    log.error({ err: error, key, bucket: env.R2_BUCKET_NAME }, 'Failed to upload to R2');
    throw new BadRequestError(ErrorCodes.STORAGE_UPLOAD_FAILED, 'Failed to upload file');
  }

  try {
    const [upload] = await db
      .insert(uploads)
      .values({
        userId,
        url: key,
        key,
        filename: file.filename,
        mimeType: 'image/webp',
        sizeBytes: processedBuffer.length,
      })
      .returning();

    if (!upload) {
      throw new BadRequestError(ErrorCodes.STORAGE_RECORD_FAILED, 'Failed to save upload record');
    }

    return {
      key: upload.key,
      sizeBytes: upload.sizeBytes,
    };
  } catch (error) {
    log.error({ err: error, key }, 'Failed to save upload record, rolling back R2 upload');
    try {
      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: key,
        })
      );
    } catch (cleanupError) {
      log.error({ err: cleanupError, key }, 'Failed to clean up R2 object after DB error');
    }
    throw new BadRequestError(ErrorCodes.STORAGE_RECORD_FAILED, 'Failed to register upload');
  }
}

export async function generatePresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
  });
  // biome-ignore lint/suspicious/noExplicitAny: S3Client type mismatch between aws-sdk packages
  return getSignedUrl(r2Client as any, command, { expiresIn: PRESIGNED_URL_EXPIRY });
}

export async function resolveImageKeys(imagesJson: string): Promise<string[]> {
  let keys: string[];
  try {
    keys = JSON.parse(imagesJson);
  } catch {
    return [];
  }
  if (keys.length === 0) return [];
  return Promise.all(keys.map(generatePresignedUrl));
}

export async function deleteUploadFromR2(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    })
  );
}

export async function deleteUploadsFromR2(
  keys: string[]
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  if (keys.length === 0) {
    return { deleted: [], failed: [] };
  }

  const results = await Promise.allSettled(keys.map((key) => deleteUploadFromR2(key)));

  const deleted: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  results.forEach((result, index) => {
    const key = keys[index] as string;
    if (result.status === 'fulfilled') {
      deleted.push(key);
    } else {
      const errorMessage = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      failed.push({ key, error: errorMessage });
    }
  });

  return { deleted, failed };
}
