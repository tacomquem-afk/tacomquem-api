import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { decrypt } from '../services/crypto/index.js';

export async function generateBetaCsv(): Promise<string> {
  const betaUsers = await db.query.users.findMany({ where: eq(users.accessTier, 'BETA') });

  // CSV header
  // email,name,betaAddedAt
  const rows: string[] = ['email,name,betaAddedAt'];

  for (const u of betaUsers) {
    const email = u.emailEncrypted ? decrypt(u.emailEncrypted) : '';
    const name = decrypt(u.nameEncrypted);
    const addedAt = u.betaAddedAt ? u.betaAddedAt.toISOString() : '';
    // Escape quotes and commas in fields
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    rows.push(`${esc(email)},${esc(name)},${addedAt}`);
  }

  return `${rows.join('\n')}\n`;
}

async function main() {
  const csv = await generateBetaCsv();
  process.stdout.write(csv);
  process.exit(0);
}

if (import.meta.path === Bun.main) {
  main();
}
