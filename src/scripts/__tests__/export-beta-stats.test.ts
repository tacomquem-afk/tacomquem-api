import { describe, expect, it, spyOn } from 'bun:test';
import { db } from '../../db/index.js';
import * as crypto from '../../services/crypto/index.js';
import { generateBetaCsv } from '../export-beta-stats.js';

describe('export-beta-stats script', () => {
  it('generateBetaCsv should return CSV with header and rows', async () => {
    const users = [
      {
        id: '1',
        emailEncrypted: 'enc1',
        nameEncrypted: 'nenc1',
        accessTier: 'BETA',
        betaAddedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      {
        id: '2',
        emailEncrypted: 'enc2',
        nameEncrypted: 'nenc2',
        accessTier: 'BETA',
        betaAddedAt: null,
      },
    ];

    spyOn(db.query.users, 'findMany').mockResolvedValueOnce(users as any);
    spyOn(crypto, 'decrypt').mockImplementation((s: string) => {
      if (s === 'enc1') return 'user1@example.com';
      if (s === 'nenc1') return 'User "One", Jr.';
      if (s === 'enc2') return 'user2@example.com';
      if (s === 'nenc2') return 'User Two';
      return 'unknown';
    });

    const csv = await generateBetaCsv();

    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('email,name,betaAddedAt');
    // first data row: email quoted, name contains quotes/commas properly escaped
    expect(lines[1]).toContain('user1@example.com');
    expect(lines[1]).toContain('"User ""One"", Jr."');
    expect(lines[1]).toContain('2025-01-01T00:00:00.000Z');
    // second data row: empty betaAddedAt
    expect(lines[2]).toContain('user2@example.com');
    expect(lines[2]).toContain('"User Two"');
  });
});
