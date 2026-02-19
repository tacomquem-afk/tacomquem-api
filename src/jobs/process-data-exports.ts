import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { dataExports, users } from '../db/schema.js';
import { decrypt } from '../services/crypto/index.js';
import { exportUserData } from '../services/data-export/index.js';
import { buildDataExportReadyEmail, sendEmail } from '../services/email/index.js';

export async function processDataExports() {
  const pendingExports = await db.query.dataExports.findMany({
    where: eq(dataExports.status, 'pending'),
  });

  for (const exportRecord of pendingExports) {
    try {
      const data = await exportUserData(exportRecord.userId, exportRecord.format as 'json' | 'csv');

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
        .where(eq(dataExports.id, exportRecord.id));

      // Send notification email
      const user = await db.query.users.findFirst({
        where: eq(users.id, exportRecord.userId),
      });

      if (user?.emailEncrypted) {
        const downloadUrl = `${process.env.APP_URL}/api/users/me/data/export/${exportRecord.id}/download?token=${exportRecord.downloadToken}`;
        await sendEmail({
          to: decrypt(user.emailEncrypted),
          subject: 'Seu Dado de Exportação está Pronto',
          html: buildDataExportReadyEmail(downloadUrl, '7 days', exportRecord.format),
        });
      }
    } catch (error) {
      // Log error, mark as failed
      console.error(`Failed to process export ${exportRecord.id}:`, error);

      await db
        .update(dataExports)
        .set({ status: 'failed' })
        .where(eq(dataExports.id, exportRecord.id));
    }
  }
}
