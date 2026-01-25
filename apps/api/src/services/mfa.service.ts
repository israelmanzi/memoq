import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import { randomBytes, createHash } from 'crypto';

const APP_NAME = 'OXY';

/**
 * Generate a new MFA secret for a user
 */
export function generateMFASecret(email: string): { secret: string; uri: string } {
  const secret = new Secret({ size: 20 });

  const totp = new TOTP({
    issuer: APP_NAME,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Generate a QR code data URL for the TOTP URI
 */
export async function generateQRCode(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, {
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

/**
 * Verify a TOTP token against a secret
 */
export function verifyTOTP(secret: string, token: string): boolean {
  const totp = new TOTP({
    issuer: APP_NAME,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });

  // Allow 1 period window (30 seconds) for clock drift
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/**
 * Generate backup codes for MFA recovery
 * Returns plain text codes (show to user once) and hashed codes (store in DB)
 */
export function generateBackupCodes(count = 10): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code (easy to type)
    const code = randomBytes(4).toString('hex').toUpperCase();
    plainCodes.push(code);
    hashedCodes.push(hashBackupCode(code));
  }

  return { plainCodes, hashedCodes };
}

/**
 * Hash a backup code for storage
 */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase()).digest('hex');
}

/**
 * Verify a backup code and return remaining codes if valid
 */
export function verifyBackupCode(
  code: string,
  hashedCodes: string[]
): { valid: boolean; remainingCodes: string[] } {
  const hashedInput = hashBackupCode(code);
  const index = hashedCodes.findIndex((hc) => hc === hashedInput);

  if (index === -1) {
    return { valid: false, remainingCodes: hashedCodes };
  }

  // Remove the used code
  const remainingCodes = [...hashedCodes];
  remainingCodes.splice(index, 1);

  return { valid: true, remainingCodes };
}

/**
 * Format backup codes for display (add dashes for readability)
 */
export function formatBackupCode(code: string): string {
  // Format as XXXX-XXXX
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Parse a backup code input (remove dashes and spaces)
 */
export function parseBackupCode(input: string): string {
  return input.replace(/[-\s]/g, '').toUpperCase();
}
