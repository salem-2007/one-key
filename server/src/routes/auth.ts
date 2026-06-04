import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  userCount,
  createUser,
  verifyCredentials,
  createSession,
  validateSession,
  deleteSession,
  createPasswordReset,
  validateResetToken,
  resetPassword,
  changePassword,
  createDefaultAdmin,
} from '../services/auth.js';

export const authRouter = Router();

// ── Password Reset ──────────────────────────────────────────────────────
const resetRequestSchema = z.object({
  email: z.string().min(1, '请输入用户名'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, '请输入重置令牌'),
  password: z.string().min(8, '密码至少需要8个字符'),
});

// Request password reset - generates a token
authRouter.post('/forgot-password', (req: Request, res: Response) => {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const token = createPasswordReset(parsed.data.email);
  // Always return success to prevent enumeration
  res.json({
    success: true,
    message: 'If an account with that username exists, a reset token has been generated.',
    resetToken: token || undefined,
  });
});

// Validate reset token
authRouter.post('/validate-reset-token', (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    res.status(400).json({ error: { message: '请输入重置令牌' } });
    return;
  }

  const userId = validateResetToken(token);
  if (!userId) {
    res.status(400).json({ error: { message: '重置令牌无效或已过期', type: 'invalid_token' } });
    return;
  }

  res.json({ valid: true });
});

// Reset password with token
authRouter.post('/reset-password', (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const success = resetPassword(parsed.data.token, parsed.data.password);
  if (!success) {
    res.status(400).json({ error: { message: 'Invalid or expired reset token', type: 'invalid_token' } });
    return;
  }

  res.json({ success: true, message: '密码已重置，请使用新密码登录' });
});

// Dashboard auth (#35). These routes are mounted BEFORE requireAuth, so
// /status, /setup and /login are reachable without a session (bootstrap);
// /logout and /me validate the token themselves.

const credentialsSchema = z.object({
  email: z.string().min(1, '请输入用户名').email('请输入有效的邮箱地址'),
  password: z.string().min(8, '密码至少需要8个字符'),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, '密码至少需要8个字符'),
});

// ── Brute-force throttle ──────────────────────────────────────────────────
// Simple in-memory per-email limiter. A local single-user tool doesn't need a
// distributed store; this just blunts online password guessing.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(email: string): boolean {
  const a = attempts.get(email.toLowerCase());
  return !!a && a.lockedUntil > Date.now();
}
function recordFailure(email: string): void {
  const key = email.toLowerCase();
  const a = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  a.count++;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = Date.now() + LOCKOUT_MS;
    a.count = 0;
  }
  attempts.set(key, a);
}
function clearFailures(email: string): void {
  attempts.delete(email.toLowerCase());
}

function bearer(req: Request): string | undefined {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '')
    ?? (req.headers['x-dashboard-token'] as string | undefined);
}

// Has the dashboard been set up yet, and is this caller authenticated?
authRouter.get('/status', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  res.json({
    needsSetup: userCount() === 0,
    authenticated: !!session,
    email: session?.email ?? null,
    mustChangePassword: session?.mustChangePassword ?? false,
  });
});

// First-run account creation. Only allowed while there are zero users, so it
// can't be used to add accounts once the dashboard is claimed.
authRouter.post('/setup', (req: Request, res: Response) => {
  if (userCount() > 0) {
    res.status(409).json({ error: { message: 'Setup already completed. Use login instead.', type: 'setup_complete' } });
    return;
  }
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  const user = createUser(parsed.data.email, parsed.data.password);
  const token = createSession(user.userId);
  res.status(201).json({ token, email: user.email, mustChangePassword: false });
});

authRouter.post('/login', (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  const { email, password } = parsed.data;

  if (isLockedOut(email)) {
    res.status(429).json({ error: { message: '登录尝试次数过多，请稍后再试', type: 'rate_limit_error' } });
    return;
  }

  const user = verifyCredentials(email, password);
  if (!user) {
    recordFailure(email);
    res.status(401).json({ error: { message: '用户名或密码错误', type: 'authentication_error' } });
    return;
  }

  clearFailures(email);
  const token = createSession(user.userId);
  res.json({ token, email: user.email, mustChangePassword: user.mustChangePassword });
});

// Change password (authenticated)
authRouter.post('/change-password', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  if (!session) {
    res.status(401).json({ error: { message: '请先登录', type: 'authentication_error' } });
    return;
  }

  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  changePassword(session.userId, parsed.data.newPassword);
  res.json({ success: true, message: '密码修改成功' });
});

authRouter.post('/logout', (req: Request, res: Response) => {
  deleteSession(bearer(req));
  res.json({ success: true });
});

authRouter.get('/me', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  if (!session) {
    res.status(401).json({ error: { message: 'Authentication required', type: 'authentication_error' } });
    return;
  }
  res.json({ email: session.email, mustChangePassword: session.mustChangePassword });
});
