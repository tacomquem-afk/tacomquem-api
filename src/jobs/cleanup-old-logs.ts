import { lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accessLogs } from '../db/schema.js';

/**
 * Cron job to clean up access logs older than 6 months
 * Compliance with Marco Civil Article 15 (6-month retention)
 */
export async function cleanupOldLogsJob() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);

    await db.delete(accessLogs).where(lt(accessLogs.createdAt, cutoffDate));

    return {
      status: 'success',
      message: 'Cleanup completed successfully',
    };
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    throw error;
  }
}
