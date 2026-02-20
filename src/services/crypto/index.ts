import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  const key = Bun.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not set');
  return Buffer.from(key, 'hex');
}

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const ivHex = parts[0];
  const authTagHex = parts[1];
  const encrypted = parts[2];

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Safely decrypt text, returning empty string instead of throwing on invalid format.
 * Logs errors for monitoring while preventing application crashes.
 * Used for user PII data that must always be handled gracefully.
 */
export function decryptSafe(encryptedText?: string | null): string {
  if (!encryptedText) return '';
  try {
    return decrypt(encryptedText);
  } catch (error) {
    console.error('[crypto] Decryption failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dataLength: encryptedText.length,
      hasColons: encryptedText.includes(':'),
    });
    return '';
  }
}

export function hash(text: string): string {
  return createHash('sha256').update(text.toLowerCase()).digest('hex');
}

export function generateToken(lengthBytes: number = 32): string {
  return randomBytes(lengthBytes).toString('hex');
}
