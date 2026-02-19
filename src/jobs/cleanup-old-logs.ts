import { db } from '../db/index.js';
import { accessLogs } from '../db/schema.js';
import { lt } from 'drizzle-orm';

/**
 * Cron job to clean up access logs older than 6 months
 * Compliance with Marco Civil Article 15 (6-month retention)
 */
export async function cleanupOldLogsJob() {
  try {
    console.log('Starting access logs cleanup...');

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);

    const result = await db.delete(accessLogs).where(lt(accessLogs.createdAt, cutoffDate));

    console.log(`Deleted old access logs created before ${cutoffDate.toISOString()}`);

    return {
      status: 'success',
      message: 'Cleanup completed successfully',
    };
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    throw error;
  }
}
