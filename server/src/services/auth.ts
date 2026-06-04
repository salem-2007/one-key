import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

// Dashboard authentication: email + password accounts with opaque session
// tokens. Distinct from the unified API key, which authenticates the /v1 proxy
// for apps — this gates the /api/* admin surface for the human operator (#35).

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  userId: number;
  email: string;
  mustChangePassword: boolean;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function userCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  return row.c;
}

/** Create a user. Throws { code: 'email_taken' } if the email already exists. */
export function createUser(email: string, password: string): SessionUser {
  const db = getDb();
  const normalized = normalizeEmail(email);
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (existing) {
    const err = new Error('An account with that email already exists') as any;
    err.code = 'email_taken';
    throw err;
  }
  const result = db.prepare('INSERT INTO users (email, password_hash, must_change_password) VALUES (?, ?, ?)')
    .run(normalized, hashPassword(password), 0);
  return { userId: Number(result.lastInsertRowid), email: normalized, mustChangePassword: false };
}

/** Verify credentials. Returns the user on success, null on failure. */
export function verifyCredentials(email: string, password: string): SessionUser | null {
  const db = getDb();
  const row = db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .get(normalizeEmail(email)) as { id: number; email: string; password_hash: string; must_change_password?: number } | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return { userId: row.id, email: row.email, mustChangePassword: !!row.must_change_password };
}

/** Mint a session and return the raw token (only the hash is persisted). */
export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, expires_at_ms) VALUES (?, ?, ?)')
    .run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

/** Resolve a session token to its user, or null if missing/expired. */
export function validateSession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT s.user_id, s.expires_at_ms, u.email, u.must_change_password
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token)) as { user_id: number; expires_at_ms: number; email: string; must_change_password?: number } | undefined;
  if (!row) return null;
  if (row.expires_at_ms < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return null;
  }
  return { userId: row.user_id, email: row.email, mustChangePassword: !!row.must_change_password };
}

export function deleteSession(token: string | undefined | null): void {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

// ── Change Password ──────────────────────────────────────────────────────

/** Change password for authenticated user. */
export function changePassword(userId: number, newPassword: string): void {
  const db = getDb();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hashPassword(newPassword), userId);
  // Invalidate all existing sessions except current
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Check if user must change password (default admin). */
export function mustChangePassword(userId: number): boolean {
  const db = getDb();
  const row = db.prepare('SELECT must_change_password FROM users WHERE id = ?').get(userId) as { must_change_password: number } | undefined;
  return !!row?.must_change_password;
}

/** Create default admin user if no users exist. */
export function createDefaultAdmin(): void {
  const db = getDb();
  const count = userCount();
  if (count === 0) {
    db.prepare('INSERT INTO users (email, password_hash, must_change_password) VALUES (?, ?, ?)')
      .run('admin', hashPassword('admin'), 1);
    console.log('[auth] Default admin user created (admin/admin)');
  }
}

// ── Password Reset ────────────────────────────────────────────────────────
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Generate a password reset token for the given email. Returns the raw token. */
export function createPasswordReset(email: string): string | null {
  const db = getDb();
  const normalized = normalizeEmail(email);
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized) as { id: number } | undefined;
  if (!user) return null; // Don't reveal if email exists

  // Invalidate any existing unused tokens for this user
  db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at_ms) VALUES (?, ?, ?)')
    .run(user.id, sha256(token), Date.now() + RESET_TTL_MS);

  return token;
}

/** Validate a reset token and return the user ID if valid. */
export function validateResetToken(token: string): number | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, user_id, expires_at_ms, used
    FROM password_resets
    WHERE token_hash = ?
  `).get(sha256(token)) as { id: number; user_id: number; expires_at_ms: number; used: number } | undefined;

  if (!row) return null;
  if (row.used) return null;
  if (row.expires_at_ms < Date.now()) return null;

  return row.user_id;
}

/** Reset the password using a valid token. */
export function resetPassword(token: string, newPassword: string): boolean {
  const db = getDb();
  const userId = validateResetToken(token);
  if (!userId) return false;

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
  db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(sha256(token));

  // Invalidate all existing sessions for this user
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

  return true;
}
