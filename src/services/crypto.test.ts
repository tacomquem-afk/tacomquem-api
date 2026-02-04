import { describe, it, expect, beforeAll } from 'bun:test';
import { encrypt, decrypt, hash } from './crypto.js';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('crypto service', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const original = 'test@example.com';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(original);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext for same input', () => {
      const text = 'same text';
      const encrypted1 = encrypt(text);
      const encrypted2 = encrypt(text);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('hash', () => {
    it('should produce consistent hash for same input', () => {
      const text = 'test@example.com';
      const hash1 = hash(text);
      const hash2 = hash(text);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', () => {
      const hash1 = hash('test1@example.com');
      const hash2 = hash('test2@example.com');

      expect(hash1).not.toBe(hash2);
    });
  });
});
