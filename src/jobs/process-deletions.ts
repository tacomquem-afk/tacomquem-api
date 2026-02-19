import { processPendingDeletions } from '../services/account-deletion/index.js';

/**
 * Cron job to process pending account deletions
 * Runs daily to anonymize users whose deletion grace period has expired
 */
export async function processDeleteionsJob() {
  try {
    console.log('Starting pending deletions processing...');
    const results = await processPendingDeletions();

    const successCount = results.filter((r) => r.status === 'success').length;
    const failureCount = results.filter((r) => r.status === 'failed').length;

    console.log(
      `Deletions processed: ${successCount} successful, ${failureCount} failed`
    );

    return {
      status: 'success',
      processed: successCount,
      failed: failureCount,
    };
  } catch (error) {
    console.error('Error processing deletions:', error);
    throw error;
  }
}
