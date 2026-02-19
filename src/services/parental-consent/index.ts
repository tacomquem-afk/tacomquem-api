import { randomBytes } from 'crypto';

export function calculateAgeFromBirthDate(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const month = today.getMonth() - birthDate.getMonth();

  if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

export function isChildUnder12(birthDate: Date): boolean {
  return calculateAgeFromBirthDate(birthDate) < 12;
}

export function generateParentalConsentToken(): string {
  return randomBytes(32).toString('hex');
}

export function getParentalTokenExpiryDate(): Date {
  const expires = new Date();
  expires.setHours(expires.getHours() + 48); // 48 hour expiry
  return expires;
}

export interface ParentalConsentData {
  parentalEmail: string;
  parentalName: string;
  childEmail: string;
  childName: string;
  parentalConsentToken: string;
  confirmUrl: string;
}

export function createParentalConsentEmailData(
  parentalEmail: string,
  parentalName: string,
  childEmail: string,
  childName: string,
  token: string,
  appUrl: string
): ParentalConsentData {
  return {
    parentalEmail,
    parentalName,
    childEmail,
    childName,
    parentalConsentToken: token,
    confirmUrl: `${appUrl}/api/auth/parental-consent/confirm?token=${token}`,
  };
}