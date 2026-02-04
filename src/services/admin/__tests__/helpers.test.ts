import { describe, expect, it } from 'bun:test';
import { getClientIp, maskEmail, maskName } from '../helpers.js';

describe('Admin Helpers', () => {
  describe('maskEmail', () => {
    it('should mask email with 2+ local characters', () => {
      expect(maskEmail('john.doe@example.com')).toBe('jo***@example.com');
      expect(maskEmail('maria@gmail.com')).toBe('ma***@gmail.com');
    });

    it('should handle short emails', () => {
      expect(maskEmail('a@test.com')).toBe('a***@test.com');
      expect(maskEmail('ab@test.com')).toBe('ab***@test.com');
    });

    it('should handle emails with special characters', () => {
      expect(maskEmail('john+test@example.com')).toBe('jo***@example.com');
    });
  });

  describe('maskName', () => {
    it('should mask single-word names', () => {
      expect(maskName('John')).toBe('Jo***');
      expect(maskName('Maria')).toBe('Ma***');
    });

    it('should mask multi-word names keeping first and last initial', () => {
      expect(maskName('John Doe')).toBe('John D***');
      expect(maskName('Maria Silva Santos')).toBe('Maria S***');
    });

    it('should handle very short names', () => {
      expect(maskName('Jo')).toBe('Jo');
      expect(maskName('A')).toBe('A***');
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const mockRequest = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
        ip: '127.0.0.1',
      };
      expect(getClientIp(mockRequest)).toBe('192.168.1.1');
    });

    it('should fallback to x-real-ip header', () => {
      const mockRequest = {
        headers: { 'x-real-ip': '192.168.1.1' },
        ip: '127.0.0.1',
      };
      expect(getClientIp(mockRequest)).toBe('192.168.1.1');
    });

    it('should fallback to request.ip', () => {
      const mockRequest = {
        headers: {},
        ip: '127.0.0.1',
      };
      expect(getClientIp(mockRequest)).toBe('127.0.0.1');
    });

    it('should handle missing IP', () => {
      const mockRequest = { headers: {} };
      expect(getClientIp(mockRequest)).toBeUndefined();
    });
  });
});
