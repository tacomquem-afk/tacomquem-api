import { describe, expect, it } from 'bun:test';
import { processAndUploadImage } from '../index.js';

describe('storage service', () => {
  describe('processAndUploadImage', () => {
    it('should reject file > 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      const largeFile = {
        filename: 'large.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        file: (async function* () {
          yield largeBuffer;
        })(),
      };

      await expect(processAndUploadImage(largeFile, 'user-id')).rejects.toThrow(
        'Arquivo muito grande'
      );
    });

    it('should reject invalid file type', async () => {
      const textBuffer = Buffer.from('not an image');
      const textFile = {
        filename: 'file.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        file: (async function* () {
          yield textBuffer;
        })(),
      };

      await expect(processAndUploadImage(textFile, 'user-id')).rejects.toThrow(
        'Tipo de arquivo não permitido'
      );
    });
  });
});
