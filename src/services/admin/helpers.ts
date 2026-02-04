/**
 * Masks an email address for LGPD compliance
 * Example: john.doe@example.com -> jo***@example.com
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  if (local.length <= 2) {
    return `${local}***@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Masks a person's name for LGPD compliance
 * Single name: John -> Jo***
 * Multiple names: John Doe -> John D***
 */
export function maskName(name: string): string {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length === 1) {
    const single = parts[0];
    if (!single) return name;
    if (single.length === 1) return `${single}***`;
    if (single.length === 2) return single;
    return `${single.slice(0, 2)}***`;
  }

  const firstName = parts[0];
  const lastPart = parts[parts.length - 1];
  const lastInitial = lastPart?.[0] ?? '';
  return `${firstName} ${lastInitial}***`;
}

/**
 * Extracts client IP address from request headers or direct IP
 * Checks x-forwarded-for, x-real-ip, then request.ip
 */
export function getClientIp(request: {
  headers?: Record<string, unknown>;
  ip?: string;
}): string | undefined {
  const forwardedFor = request.headers?.['x-forwarded-for'];
  if (forwardedFor) {
    const ipStr = typeof forwardedFor === 'string' ? forwardedFor : (forwardedFor as unknown[])[0];
    if (ipStr) {
      const parts = String(ipStr).split(',');
      return parts[0]?.trim();
    }
  }

  const realIp = request.headers?.['x-real-ip'];
  if (realIp) {
    return typeof realIp === 'string' ? realIp : ((realIp as unknown[])[0] as string);
  }

  return request.ip;
}
