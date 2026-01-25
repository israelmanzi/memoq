import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findUserByIdWithAuth,
  verifyPassword,
  updateMFASecret,
  enableMFA,
  disableMFA,
  updateMFABackupCodes,
} from '../services/auth.service.js';
import {
  generateMFASecret,
  generateQRCode,
  verifyTOTP,
  generateBackupCodes,
  formatBackupCode,
} from '../services/mfa.service.js';
import {
  sendMFAEnabledEmail,
  sendMFADisabledEmail,
  isEmailEnabled,
} from '../services/email.service.js';

const verifySetupSchema = z.object({
  code: z.string().length(6),
});

const disableMFASchema = z.object({
  password: z.string().min(1),
});

const regenerateBackupCodesSchema = z.object({
  password: z.string().min(1),
});

export async function mfaRoutes(app: FastifyInstance) {
  // Require authentication for all MFA routes
  app.addHook('onRequest', app.authenticate);

  // Start MFA setup - generate secret and QR code
  app.post('/setup', async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const user = await findUserByIdWithAuth(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (user.mfaEnabled) {
      return reply.status(400).send({ error: 'MFA is already enabled' });
    }

    // Generate new secret
    const { secret, uri } = generateMFASecret(user.email);

    // Store secret temporarily (will be confirmed during verify-setup)
    await updateMFASecret(userId, secret);

    // Generate QR code
    const qrCode = await generateQRCode(uri);

    return reply.send({
      secret, // Allow manual entry
      qrCode, // Data URL for QR code image
      uri, // For debugging/manual entry in authenticator
    });
  });

  // Complete MFA setup - verify code and enable MFA
  app.post('/verify-setup', async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const parsed = verifySetupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { code } = parsed.data;

    const user = await findUserByIdWithAuth(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (user.mfaEnabled) {
      return reply.status(400).send({ error: 'MFA is already enabled' });
    }

    if (!user.mfaSecret) {
      return reply.status(400).send({ error: 'MFA setup not started. Call /mfa/setup first' });
    }

    // Verify the code
    const valid = verifyTOTP(user.mfaSecret, code);
    if (!valid) {
      return reply.status(400).send({ error: 'Invalid verification code' });
    }

    // Generate backup codes
    const { plainCodes, hashedCodes } = generateBackupCodes();

    // Enable MFA
    await enableMFA(userId, hashedCodes);

    // Send notification email
    if (isEmailEnabled()) {
      await sendMFAEnabledEmail(user.email, user.name);
    }

    return reply.send({
      message: 'MFA enabled successfully',
      backupCodes: plainCodes.map(formatBackupCode), // Show formatted codes to user (only once!)
    });
  });

  // Disable MFA
  app.post('/disable', async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const parsed = disableMFASchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { password } = parsed.data;

    const user = await findUserByIdWithAuth(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (!user.mfaEnabled) {
      return reply.status(400).send({ error: 'MFA is not enabled' });
    }

    // Verify password
    const validPassword = await verifyPassword(user.passwordHash, password);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    // Disable MFA
    await disableMFA(userId);

    // Send notification email
    if (isEmailEnabled()) {
      await sendMFADisabledEmail(user.email, user.name);
    }

    return reply.send({ message: 'MFA disabled successfully' });
  });

  // Regenerate backup codes
  app.post('/backup-codes', async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const parsed = regenerateBackupCodesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { password } = parsed.data;

    const user = await findUserByIdWithAuth(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (!user.mfaEnabled) {
      return reply.status(400).send({ error: 'MFA is not enabled' });
    }

    // Verify password
    const validPassword = await verifyPassword(user.passwordHash, password);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    // Generate new backup codes
    const { plainCodes, hashedCodes } = generateBackupCodes();

    // Update backup codes
    await updateMFABackupCodes(userId, hashedCodes);

    return reply.send({
      message: 'Backup codes regenerated successfully',
      backupCodes: plainCodes.map(formatBackupCode),
    });
  });

  // Get MFA status
  app.get('/status', async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const user = await findUserByIdWithAuth(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({
      mfaEnabled: user.mfaEnabled,
      hasBackupCodes: !!(user.mfaBackupCodes && user.mfaBackupCodes.length > 0),
      backupCodesCount: user.mfaBackupCodes?.length ?? 0,
    });
  });
}
