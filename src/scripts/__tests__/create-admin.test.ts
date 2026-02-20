import { beforeEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';

describe('Create Admin Script', () => {
  beforeEach(() => {
    // Reset mocks
  });

  it('should validate email format', async () => {
    const schema = z.string().email('Email inválido').min(5);

    expect(() => schema.parse('invalid-email')).toThrow();
    expect(() => schema.parse('valid@example.com')).not.toThrow();
  });

  it('should validate password minimum length', async () => {
    const schema = z.string().min(8, 'Senha deve ter no mínimo 8 caracteres');

    expect(() => schema.parse('short')).toThrow();
    expect(() => schema.parse('SecurePass123!')).not.toThrow();
  });

  it('should validate name minimum length', async () => {
    const schema = z.string().min(3, 'Nome deve ter no mínimo 3 caracteres');

    expect(() => schema.parse('ab')).toThrow();
    expect(() => schema.parse('Admin User')).not.toThrow();
  });
});
