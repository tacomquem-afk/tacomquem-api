import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { FastifyBaseLogger } from 'fastify';
import { r2Client } from '../../../config/r2.js';
import { BadRequestError, ErrorCodes, PayloadTooLargeError } from '../../../errors/index.js';
import { deleteUploadsFromR2, processAndUploadImage } from '../index.js';

const mocks: Array<{ mockRestore: () => void }> = [];

const mockLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  fatal: () => {},
  trace: () => {},
  child: () => mockLog,
} as unknown as FastifyBaseLogger;

beforeEach(() => {
  mocks.length = 0;
});

afterEach(() => {
  for (const mock of mocks) {
    mock.mockRestore();
  }
  mocks.length = 0;
});

describe('storage service', () => {
  describe('deleteUploadsFromR2', () => {
    it('should delete multiple images in parallel', async () => {
      const sendSpy = spyOn(r2Client, 'send').mockResolvedValue({} as never);
      mocks.push(sendSpy);

      const result = await deleteUploadsFromR2(['key1', 'key2', 'key3']);

      expect(result.deleted).toEqual(['key1', 'key2', 'key3']);
      expect(result.failed).toHaveLength(0);
      expect(sendSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures gracefully', async () => {
      const sendSpy = spyOn(r2Client, 'send')
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(new Error('Network error') as never)
        .mockResolvedValueOnce({} as never);
      mocks.push(sendSpy);

      const result = await deleteUploadsFromR2(['key1', 'key2', 'key3']);

      expect(result.deleted).toEqual(['key1', 'key3']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.key).toBe('key2');
    });

    it('should return empty result for empty array', async () => {
      const sendSpy = spyOn(r2Client, 'send').mockResolvedValue({} as never);
      mocks.push(sendSpy);

      const result = await deleteUploadsFromR2([]);

      expect(result.deleted).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

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
        await processAndUploadImage(largeFile, 'user-id', mockLog);
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
        await processAndUploadImage(textFile, 'user-id', mockLog);
      } catch (e) {
        errorThrown = true;
        expect(e).toBeInstanceOf(BadRequestError);
        expect((e as BadRequestError).code).toBe(ErrorCodes.STORAGE_UNSUPPORTED_FORMAT);
      }
      expect(errorThrown).toBe(true);
    });
  });
});
