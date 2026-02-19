import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dataExports } from '../db/schema.js';
import { exportUserData } from '../services/data-export/index.js';
import { sendEmail } from '../services/email/index.js';

export async function processDataExports() {
  const pendingExports = await db.query.dataExports.findMany({
    where: (table) => table.status === 'pending',
  });

  for (const exportRecord of pendingExports) {
    try {
      const data = await exportUserData(exportRecord.userId, exportRecord.format as 'json' | 'csv');

      const mimeType = exportRecord.format === 'json' ? 'application/json' : 'application/zip';
      const filename = `ta-com-quem-export-${exportRecord.format}.${exportRecord.format === 'json' ? 'json' : 'zip'}`;

      // In production, upload to S3 or similar
      // For now, store as reference
      const fileUrl = `https://storage.example.com/${exportRecord.id}/${filename}`;
      const fileSize = data instanceof ArrayBuffer ? data.byteLength : JSON.stringify(data).length;

      await db
        .update(dataExports)
        .set({
          status: 'completed',
          fileUrl,
          fileSizeBytes: fileSize,
        })
        .where((table) => table.id === exportRecord.id);

      // Send notification email
      const user = await db.query.users.findFirst({
        where: (table) => table.id === exportRecord.userId,
      });

      if (user?.emailEncrypted) {
        await sendEmail({
          to: user.emailEncrypted,
          subject: 'Your Data Export is Ready',
          template: 'export-ready',
          data: {
            downloadUrl: `${process.env.APP_URL}/api/users/me/data/export/${exportRecord.id}/download?token=${exportRecord.downloadToken}`,
            expiresIn: '7 days',
            format: exportRecord.format,
          },
        });
      }
    } catch (error) {
      // Log error, mark as failed
      console.error(`Failed to process export ${exportRecord.id}:`, error);

      await db
        .update(dataExports)
        .set({ status: 'failed' })
        .where((table) => table.id === exportRecord.id);
    }
  }
}