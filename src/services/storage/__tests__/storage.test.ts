import { describe, expect, it } from 'bun:test';

import { BadRequestError, ErrorCodes, PayloadTooLargeError } from '../../../errors/index.js';
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

      let errorThrown = false;
      try {
        await processAndUploadImage(largeFile, 'user-id');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(PayloadTooLargeError);
        expect((e as PayloadTooLargeError).code).toBe(ErrorCodes.STORAGE_FILE_TOO_LARGE);
      }
      expect(errorThrown).toBe(true);
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

      let errorThrown = false;
      try {
        await processAndUploadImage(textFile, 'user-id');
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.STORAGE_UNSUPPORTED_FORMAT);
      }
      expect(errorThrown).toBe(true);
    });
  });
});
