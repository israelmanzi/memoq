import { Resend } from 'resend';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// Initialize Resend client (only if API key is configured)
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Check if email sending is enabled
 */
export function isEmailEnabled(): boolean {
  return !!resend;
}

/**
 * Send verification email to new user
 */
export async function sendVerificationEmail(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const verifyUrl = `${env.APP_URL}/verify-email?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0;">Welcome to OXY!</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thanks for signing up. Please verify your email address by clicking the button below:</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">Verify Email</a>
    </p>
    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="color: #666; font-size: 14px; word-break: break-all;">${verifyUrl}</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #666; font-size: 12px;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
  </div>
</body>
</html>
  `.trim();

  await sendEmail({
    to: email,
    subject: 'Verify your OXY account',
    html,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0;">Reset your password</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>We received a request to reset your password. Click the button below to choose a new password:</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">Reset Password</a>
    </p>
    <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
    <p style="color: #666; font-size: 14px; word-break: break-all;">${resetUrl}</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #666; font-size: 12px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
  </div>
</body>
</html>
  `.trim();

  await sendEmail({
    to: email,
    subject: 'Reset your OXY password',
    html,
  });
}

/**
 * Send MFA enabled notification
 */
export async function sendMFAEnabledEmail(email: string, name: string): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MFA Enabled</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0;">Two-factor authentication enabled</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Two-factor authentication has been successfully enabled on your OXY account.</p>
    <p>From now on, you'll need to enter a code from your authenticator app when signing in.</p>
    <p style="color: #666; font-size: 14px; margin-top: 20px;">Make sure to keep your backup codes in a safe place. You'll need them if you lose access to your authenticator app.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #666; font-size: 12px;">If you didn't enable two-factor authentication, please contact support immediately.</p>
  </div>
</body>
</html>
  `.trim();

  await sendEmail({
    to: email,
    subject: 'Two-factor authentication enabled on your OXY account',
    html,
  });
}

/**
 * Send MFA disabled notification
 */
export async function sendMFADisabledEmail(email: string, name: string): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MFA Disabled</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-top: 0;">Two-factor authentication disabled</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Two-factor authentication has been disabled on your OXY account.</p>
    <p>Your account is now protected only by your password. We recommend re-enabling two-factor authentication for better security.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #666; font-size: 12px;">If you didn't disable two-factor authentication, please change your password and contact support immediately.</p>
  </div>
</body>
</html>
  `.trim();

  await sendEmail({
    to: email,
    subject: 'Two-factor authentication disabled on your OXY account',
    html,
  });
}

/**
 * Internal function to send email
 */
async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!resend) {
    logger.warn({ to: options.to, subject: options.subject }, 'Email not sent: RESEND_API_KEY not configured');
    // In development, log the email content
    if (env.NODE_ENV === 'development') {
      logger.info({ ...options }, 'Email content (dev mode)');
    }
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      logger.error({ error, to: options.to }, 'Failed to send email');
      throw new Error(`Failed to send email: ${error.message}`);
    }

    logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully');
  } catch (error) {
    logger.error({ error, to: options.to }, 'Failed to send email');
    throw error;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] ?? char);
}
