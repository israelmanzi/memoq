import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  getUserWithOrgs,
  emailExists,
  generateToken,
  setEmailVerificationToken,
  setEmailVerified,
  verifyEmailToken,
  setPasswordResetToken,
  resetPasswordWithToken,
} from '../services/auth.service.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  isEmailEnabled,
} from '../services/email.service.js';
import {
  verifyTOTP,
  verifyBackupCode,
  parseBackupCode,
  generateMFASecret,
  generateQRCode,
  generateBackupCodes,
  formatBackupCode,
} from '../services/mfa.service.js';
import {
  updateMFABackupCodes,
  findUserByIdWithAuth,
  updateMFASecret,
  enableMFA,
} from '../services/auth.service.js';
import { sendMFAEnabledEmail } from '../services/email.service.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().optional(),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password, name } = parsed.data;

    // Check if email already exists
    if (await emailExists(email)) {
      return reply.status(409).send({
        error: 'Email already registered',
      });
    }

    try {
      const user = await createUser({ email, password, name });

      // Send verification email if email is enabled
      if (isEmailEnabled()) {
        const token = generateToken();
        await setEmailVerificationToken(user.id, token);
        await sendVerificationEmail(email, name, token);

        return reply.status(201).send({
          message: 'Registration successful. Please check your email to verify your account.',
          requiresEmailVerification: true,
        });
      }

      // If email is not enabled, auto-verify and return token (dev mode)
      await setEmailVerified(user.id);
      const authUser = await getUserWithOrgs(user.id);
      const authToken = app.jwt.sign({ userId: user.id });

      return reply.status(201).send({
        user: authUser,
        token: authToken,
        message: 'Registration successful. Email verification skipped (email not configured).',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create user');
      return reply.status(500).send({ error: 'Failed to create user' });
    }
  });

  // Login
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email, password, mfaCode } = parsed.data;

    const user = await findUserByEmail(email);

    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const validPassword = await verifyPassword(user.passwordHash, password);

    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Check email verification
    if (!user.emailVerified) {
      return reply.status(403).send({
        error: 'Please verify your email before logging in',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Check if MFA is enabled
    if (!user.mfaEnabled) {
      // MFA not set up - require setup before login
      const setupToken = app.jwt.sign(
        { userId: user.id, mfaType: 'setup' } as { userId: string },
        { expiresIn: '15m' }
      );
      return reply.send({
        requiresMFASetup: true,
        setupToken,
      });
    }

    // MFA is enabled - verify code
    if (!mfaCode) {
      // Generate a short-lived MFA token for verification
      const mfaToken = app.jwt.sign(
        { userId: user.id, mfaType: 'pending' } as { userId: string },
        { expiresIn: '5m' }
      );
      return reply.send({
        requiresMFA: true,
        mfaToken,
      });
    }

    // Verify MFA code
    const code = parseBackupCode(mfaCode);
    let mfaValid = false;

    // Try TOTP first
    if (code.length === 6 && user.mfaSecret) {
      mfaValid = verifyTOTP(user.mfaSecret, code);
    }

    // Try backup code if TOTP failed
    if (!mfaValid && code.length === 8 && user.mfaBackupCodes) {
      const result = verifyBackupCode(code, user.mfaBackupCodes);
      if (result.valid) {
        mfaValid = true;
        // Update remaining backup codes
        await updateMFABackupCodes(user.id, result.remainingCodes);
      }
    }

    if (!mfaValid) {
      return reply.status(401).send({ error: 'Invalid MFA code' });
    }

    const authUser = await getUserWithOrgs(user.id);
    const token = app.jwt.sign({ userId: user.id });

    return reply.send({
      user: authUser,
      token,
    });
  });

  // Verify MFA (separate endpoint for two-step login)
  app.post('/verify-mfa', async (request, reply) => {
    const parsed = mfaVerifySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { mfaToken, code } = parsed.data;

    try {
      const decoded = app.jwt.verify(mfaToken) as { userId: string; mfaType?: string };

      if (decoded.mfaType !== 'pending') {
        return reply.status(401).send({ error: 'Invalid MFA token' });
      }

      // Get user by ID for MFA verification
      const userById = await import('../services/auth.service.js').then(m =>
        m.findUserByIdWithAuth(decoded.userId)
      );

      if (!userById || !userById.mfaEnabled || !userById.mfaSecret) {
        return reply.status(401).send({ error: 'MFA not enabled for this user' });
      }

      const parsedCode = parseBackupCode(code);
      let mfaValid = false;

      // Try TOTP first
      if (parsedCode.length === 6) {
        mfaValid = verifyTOTP(userById.mfaSecret, parsedCode);
      }

      // Try backup code if TOTP failed
      if (!mfaValid && parsedCode.length === 8 && userById.mfaBackupCodes) {
        const result = verifyBackupCode(parsedCode, userById.mfaBackupCodes);
        if (result.valid) {
          mfaValid = true;
          await updateMFABackupCodes(userById.id, result.remainingCodes);
        }
      }

      if (!mfaValid) {
        return reply.status(401).send({ error: 'Invalid MFA code' });
      }

      const authUser = await getUserWithOrgs(userById.id);
      const token = app.jwt.sign({ userId: userById.id });

      return reply.send({
        user: authUser,
        token,
      });
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired MFA token' });
    }
  });

  // Verify email
  app.post('/verify-email', async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { token } = parsed.data;
    const result = await verifyEmailToken(token);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.send({ message: 'Email verified successfully' });
  });

  // Resend verification email
  app.post('/resend-verification', async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email } = parsed.data;
    const user = await findUserByEmail(email);

    // Don't reveal if user exists
    if (!user) {
      return reply.send({ message: 'If your email is registered, you will receive a verification email' });
    }

    if (user.emailVerified) {
      return reply.status(400).send({ error: 'Email is already verified' });
    }

    if (isEmailEnabled()) {
      const token = generateToken();
      await setEmailVerificationToken(user.id, token);
      await sendVerificationEmail(email, user.name, token);
    }

    return reply.send({ message: 'If your email is registered, you will receive a verification email' });
  });

  // Forgot password
  app.post('/forgot-password', async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { email } = parsed.data;
    const user = await findUserByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return reply.send({ message: 'If your email is registered, you will receive a password reset email' });
    }

    if (isEmailEnabled()) {
      const token = generateToken();
      await setPasswordResetToken(user.id, token);
      await sendPasswordResetEmail(email, user.name, token);
    }

    return reply.send({ message: 'If your email is registered, you will receive a password reset email' });
  });

  // Reset password
  app.post('/reset-password', async (request, reply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { token, password } = parsed.data;
    const result = await resetPasswordWithToken(token, password);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.send({ message: 'Password reset successfully' });
  });

  // Get current user
  app.get('/me', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };

    const user = await getUserWithOrgs(userId);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(user);
  });

  // MFA Setup during login (uses setupToken, not full auth)
  const mfaSetupSchema = z.object({
    setupToken: z.string().min(1),
  });

  const mfaVerifySetupSchema = z.object({
    setupToken: z.string().min(1),
    code: z.string().length(6),
  });

  // Start MFA setup during login
  app.post('/mfa-setup', async (request, reply) => {
    const parsed = mfaSetupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { setupToken } = parsed.data;

    try {
      const decoded = app.jwt.verify(setupToken) as { userId: string; mfaType?: string };

      if (decoded.mfaType !== 'setup') {
        return reply.status(401).send({ error: 'Invalid setup token' });
      }

      const user = await findUserByIdWithAuth(decoded.userId);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      if (user.mfaEnabled) {
        return reply.status(400).send({ error: 'MFA is already enabled' });
      }

      // Generate new secret
      const { secret, uri } = generateMFASecret(user.email);

      // Store secret temporarily
      await updateMFASecret(decoded.userId, secret);

      // Generate QR code
      const qrCode = await generateQRCode(uri);

      return reply.send({
        secret,
        qrCode,
        uri,
      });
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired setup token' });
    }
  });

  // Complete MFA setup during login and get auth token
  app.post('/mfa-setup-verify', async (request, reply) => {
    const parsed = mfaVerifySetupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { setupToken, code } = parsed.data;

    try {
      const decoded = app.jwt.verify(setupToken) as { userId: string; mfaType?: string };

      if (decoded.mfaType !== 'setup') {
        return reply.status(401).send({ error: 'Invalid setup token' });
      }

      const user = await findUserByIdWithAuth(decoded.userId);
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      if (user.mfaEnabled) {
        return reply.status(400).send({ error: 'MFA is already enabled' });
      }

      if (!user.mfaSecret) {
        return reply.status(400).send({ error: 'MFA setup not started' });
      }

      // Verify the code
      const valid = verifyTOTP(user.mfaSecret, code);
      if (!valid) {
        return reply.status(400).send({ error: 'Invalid verification code' });
      }

      // Generate backup codes
      const { plainCodes, hashedCodes } = generateBackupCodes();

      // Enable MFA
      await enableMFA(decoded.userId, hashedCodes);

      // Send notification email
      if (isEmailEnabled()) {
        await sendMFAEnabledEmail(user.email, user.name);
      }

      // Now log the user in
      const authUser = await getUserWithOrgs(decoded.userId);
      const token = app.jwt.sign({ userId: decoded.userId });

      return reply.send({
        message: 'MFA enabled successfully',
        backupCodes: plainCodes.map(formatBackupCode),
        user: authUser,
        token,
      });
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired setup token' });
    }
  });
}
