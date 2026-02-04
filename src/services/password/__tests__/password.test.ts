import { describe, expect, it } from 'bun:test';
import { hashPassword, verifyPassword } from '../index.js';

describe('password service', () => {
  it('should hash and verify password correctly', async () => {
    const password = 'my-secret-password';
    const hashed = await hashPassword(password);

    expect(hashed).not.toBe(password);
    expect(await verifyPassword(password, hashed)).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hashed = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hashed)).toBe(false);
  });

  it('should produce different hashes for same password', async () => {
    const password = 'same-password';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
  });
});
