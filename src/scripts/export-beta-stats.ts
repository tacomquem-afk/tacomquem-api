import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { decrypt } from '../services/crypto/index.js';

async function main() {
  const betaUsers = await db.query.users.findMany({ where: eq(users.accessTier, 'BETA') });

  // CSV header
  // email,name,betaAddedAt
  process.stdout.write('email,name,betaAddedAt\n');

  for (const u of betaUsers) {
    const email = decrypt(u.emailEncrypted);
    const name = decrypt(u.nameEncrypted);
    const addedAt = u.betaAddedAt ? u.betaAddedAt.toISOString() : '';
    // Escape quotes and commas in fields
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    process.stdout.write(`${esc(email)},${esc(name)},${addedAt}\n`);
  }

  process.exit(0);
}

if (import.meta.path === Bun.main) {
  main();
}
