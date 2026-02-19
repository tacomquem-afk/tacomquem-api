import { describe, expect, it } from 'bun:test';
import { calculateAgeFromBirthDate, isChildUnder12 } from '../index.js';

describe('Parental Consent', () => {
  it('should identify users under 12 years old', () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 11); // 11 years old

    expect(isChildUnder12(birthDate)).toBe(true);
  });

  it('should identify users 12 and older', () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 12); // 12 years old

    expect(isChildUnder12(birthDate)).toBe(false);
  });

  it('should calculate correct age', () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 25);

    expect(calculateAgeFromBirthDate(birthDate)).toBe(25);
  });

  it('should handle edge cases (birthday today)', () => {
    const today = new Date();
    const birthDate = new Date(today.getFullYear() - 12, today.getMonth(), today.getDate());

    expect(isChildUnder12(birthDate)).toBe(false);
  });
});
