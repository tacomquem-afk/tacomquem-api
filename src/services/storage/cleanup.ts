import { and, eq, isNull, lt } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import cron from 'node-cron';
import { db } from '../../db/index.js';
import { uploads } from '../../db/schema.js';
import { deleteUploadFromR2 } from './index.js';

const ORPHAN_TTL_HOURS = 24;

export function startCleanupJob(logger: FastifyBaseLogger) {
  cron.schedule('0 3 * * *', async () => {
    try {
      logger.info('Starting orphan upload cleanup');

      const orphanThreshold = new Date(Date.now() - ORPHAN_TTL_HOURS * 60 * 60 * 1000);

      const orphans = await db
        .select()
        .from(uploads)
        .where(and(isNull(uploads.confirmedAt), lt(uploads.createdAt, orphanThreshold)));

      if (orphans.length === 0) {
        logger.info('No orphan uploads found');
        return;
      }

      logger.info({ count: orphans.length }, 'Found orphan uploads to clean up');

      for (const orphan of orphans) {
        try {
          await deleteUploadFromR2(orphan.key);

          await db.delete(uploads).where(eq(uploads.id, orphan.id));

          logger.info({ key: orphan.key }, 'Cleaned up orphan upload');
        } catch (error) {
          logger.error({ err: error, key: orphan.key }, 'Failed to clean up orphan upload');
        }
      }

      logger.info('Cleanup job completed');
    } catch (error) {
      logger.error({ err: error }, 'Cleanup job failed');
    }
  });
}
