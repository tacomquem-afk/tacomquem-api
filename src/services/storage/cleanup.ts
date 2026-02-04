import { and, eq, isNull, lt } from 'drizzle-orm';
import cron from 'node-cron';
import { db } from '../../db/index.js';
import { uploads } from '../../db/schema.js';
import { deleteUploadFromR2 } from './index.js';

const ORPHAN_TTL_HOURS = 24;

export function startCleanupJob() {
  cron.schedule('0 3 * * *', async () => {
    try {
      console.log('🧹 Starting orphan upload cleanup...');

      const orphanThreshold = new Date(Date.now() - ORPHAN_TTL_HOURS * 60 * 60 * 1000);

      const orphans = await db
        .select()
        .from(uploads)
        .where(and(isNull(uploads.confirmedAt), lt(uploads.createdAt, orphanThreshold)));

      if (orphans.length === 0) {
        console.log('✅ No orphan uploads found');
        return;
      }

      console.log(`🗑️  Found ${orphans.length} orphan uploads to clean up`);

      for (const orphan of orphans) {
        try {
          await deleteUploadFromR2(orphan.key);

          await db.delete(uploads).where(eq(uploads.id, orphan.id));

          console.log(`✅ Cleaned up: ${orphan.key}`);
        } catch (error) {
          console.error(`❌ Failed to clean up ${orphan.key}:`, error);
        }
      }

      console.log('🧹 Cleanup job completed');
    } catch (error) {
      console.error('❌ Cleanup job failed:', error);
    }
  });
}
