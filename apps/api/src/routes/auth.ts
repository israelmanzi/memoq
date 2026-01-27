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
  setMfaResetToken,
  resetMfaWithToken,
} from '../services/auth.service.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendMfaResetEmail,
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
import { acceptAllPendingInvitations } from '../services/invitation.service.js';
import {
  createSession,
  generateTokenId,
  invalidateSession,
  invalidateAllUserSessions,
  listUserSessions,
} from '../services/session.service.js';
import { isRedisEnabled } from '../services/redis.service.js';

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

      // Accept any pending invitations for this user
      const invResult = await acceptAllPendingInvitations(user.id, email);

      const authUser = await getUserWithOrgs(user.id);

      // Generate token with session tracking
      const tokenId = generateTokenId();
      const authToken = app.jwt.sign({ userId: user.id, tokenId });

      // Create session in Redis if enabled
      if (isRedisEnabled()) {
        await createSession(user.id, tokenId, {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        });
      }

      return reply.status(201).send({
        user: authUser,
        token: authToken,
        message: 'Registration successful. Email verification skipped (email not configured).',
        invitationsAccepted: invResult.accepted,
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

    // Generate token with session tracking
    const tokenId = generateTokenId();
    const token = app.jwt.sign({ userId: user.id, tokenId });

    // Create session in Redis if enabled
    if (isRedisEnabled()) {
      await createSession(user.id, tokenId, {
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
    }

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

      // Generate token with session tracking
      const tokenId = generateTokenId();
      const token = app.jwt.sign({ userId: userById.id, tokenId });

      // Create session in Redis if enabled
      if (isRedisEnabled()) {
        await createSession(userById.id, tokenId, {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        });
      }

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

    // Accept any pending invitations for this user
    let invitationsAccepted = 0;
    if (result.userId) {
      const user = await findUserByIdWithAuth(result.userId);
      if (user) {
        const invResult = await acceptAllPendingInvitations(result.userId, user.email);
        invitationsAccepted = invResult.accepted;
      }
    }

    return reply.send({
      message: 'Email verified successfully',
      invitationsAccepted,
    });
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

      // Generate token with session tracking
      const tokenId = generateTokenId();
      const token = app.jwt.sign({ userId: decoded.userId, tokenId });

      // Create session in Redis if enabled
      if (isRedisEnabled()) {
        await createSession(decoded.userId, tokenId, {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
        });
      }

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

  // ============ MFA Reset ============

  const mfaResetRequestSchema = z.object({
    email: z.string().email(),
  });

  const mfaResetSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(8),
  });

  // Request MFA reset (sends email)
  app.post('/mfa-reset-request', async (request, reply) => {
    const parsed = mfaResetRequestSchema.safeParse(request.body);

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
      return reply.send({ message: 'If your email is registered and MFA is enabled, you will receive a reset email' });
    }

    // Only send if MFA is actually enabled
    if (!user.mfaEnabled) {
      return reply.send({ message: 'If your email is registered and MFA is enabled, you will receive a reset email' });
    }

    if (isEmailEnabled()) {
      const token = generateToken();
      await setMfaResetToken(user.id, token);
      await sendMfaResetEmail(email, user.name, token);
    }

    return reply.send({ message: 'If your email is registered and MFA is enabled, you will receive a reset email' });
  });

  // Complete MFA reset with token and password
  app.post('/mfa-reset', async (request, reply) => {
    const parsed = mfaResetSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { token, password } = parsed.data;
    const result = await resetMfaWithToken(token, password);

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.send({
      message: 'MFA has been disabled. You will need to set up MFA again when you log in.',
    });
  });

  // ============ Session Management ============

  // Logout current session
  app.post('/logout', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { tokenId } = request.user;

    if (tokenId && isRedisEnabled()) {
      await invalidateSession(tokenId);
    }

    return reply.send({ message: 'Logged out successfully' });
  });

  // Logout all sessions
  app.post('/logout-all', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { userId } = request.user;

    let count = 0;
    if (isRedisEnabled()) {
      count = await invalidateAllUserSessions(userId);
    }

    return reply.send({
      message: 'All sessions logged out',
      sessionsInvalidated: count,
    });
  });

  // List active sessions
  app.get('/sessions', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { userId, tokenId } = request.user;

    if (!isRedisEnabled()) {
      return reply.send({
        sessions: [],
        message: 'Session tracking not enabled',
      });
    }

    const sessions = await listUserSessions(userId);

    // Mark the current session
    const sessionsWithCurrent = sessions.map((session) => ({
      id: session.tokenId,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: new Date(session.createdAt).toISOString(),
      lastActiveAt: new Date(session.lastActiveAt).toISOString(),
      isCurrent: session.tokenId === tokenId,
    }));

    return reply.send({ sessions: sessionsWithCurrent });
  });

  // Revoke a specific session
  app.delete<{ Params: { sessionId: string } }>('/sessions/:sessionId', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { sessionId } = request.params;
    const { userId, tokenId } = request.user;

    if (!isRedisEnabled()) {
      return reply.status(400).send({ error: 'Session tracking not enabled' });
    }

    // Prevent revoking current session via this route
    if (sessionId === tokenId) {
      return reply.status(400).send({ error: 'Use /logout to end current session' });
    }

    // Verify the session belongs to the current user
    const session = await import('../services/session.service.js').then(m => m.getSession(sessionId));
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    if (session.userId !== userId) {
      return reply.status(403).send({ error: 'Cannot revoke sessions belonging to other users' });
    }

    await invalidateSession(sessionId);

    return reply.send({ message: 'Session revoked' });
  });
}
