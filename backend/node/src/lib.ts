import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Session, User, AuditEvent, Conversation } from './models.ts';

export const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};
export const envNum = (k: string) => Number(env(k));

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status: number, code: string, message?: string): never => { throw new HttpError(status, code, message); };

export const oid = (v: unknown) => {
  if (typeof v !== 'string' || !mongoose.isValidObjectId(v)) fail(400, 'invalid_id');
  return new mongoose.Types.ObjectId(v as string);
};

// Serialize Mongo docs: ObjectId -> string, _id -> id, drop __v.
export function ser(doc: unknown): any {
  const plain = JSON.parse(JSON.stringify(doc ?? null));
  const walk = (o: any): any => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === 'object') {
      const r: any = {};
      for (const [k, v] of Object.entries(o)) {
        if (k === '__v' || k === 'passwordHash' || k === 'tokenHash') continue;
        r[k === '_id' ? 'id' : k] = walk(v);
      }
      return r;
    }
    return o;
  };
  return walk(plain);
}

export const PUBLIC_USER = '_id name username avatar bio';
export const publicUser = (u: any) => u && ({ id: String(u._id), name: u.name, username: u.username, avatar: u.avatar, bio: u.bio });
export const selfUser = (u: any) => ({
  ...publicUser(u), email: u.email, phone: u.phone, language: u.language, theme: u.theme,
  privacy: u.privacy, contentFilter: u.contentFilter, twoStepEnabled: !!u.twoStep?.enabled,
  closeFriends: (u.closeFriends ?? []).map(String), isAdmin: u.isAdmin,
});

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const SESSION_DAYS = 30;

export async function createSession(userId: mongoose.Types.ObjectId, device: string) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: String(userId), jti }, env('JWT_SECRET'), { algorithm: 'HS256', expiresIn: `${SESSION_DAYS}d`, issuer: 'vybe' });
  await Session.create({ userId, jti, tokenHash: hashToken(token), device: device.slice(0, 120), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) });
  return token;
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : (typeof req.query.token === 'string' ? req.query.token : undefined);
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const c = jwt.verify(token, env('JWT_SECRET'), { algorithms: ['HS256'], issuer: 'vybe' }) as { sub: string; jti: string };
    const s = await Session.findOne({ jti: c.jti, tokenHash: hashToken(token), revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!s) return res.status(401).json({ error: 'session_revoked' });
    const user = await User.findById(c.sub);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (!s.lastSeenAt || Date.now() - s.lastSeenAt.getTime() > 60_000) { s.lastSeenAt = new Date(); await s.save(); }
    res.locals.user = user;
    res.locals.jti = c.jti;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

export const me = (res: Response) => res.locals.user as any;
export const myId = (res: Response) => (res.locals.user as any)._id as mongoose.Types.ObjectId;

export const audit = (actor: unknown, action: string, target?: string, meta?: unknown) =>
  AuditEvent.create({ actor, action, target, meta }).catch(() => undefined);

// Basic keyword filter for public/community content (not applied to private chats).
const BLOCKLIST = ['porn', 'nude', 'nudes', 'xxx', 'sex video', 'onlyfans', 'escort'];
export const isExplicit = (text?: string) => !!text && BLOCKLIST.some((w) => text.toLowerCase().includes(w));

export const isBlockedBetween = async (a: mongoose.Types.ObjectId, b: mongoose.Types.ObjectId) => {
  const n = await User.countDocuments({ $or: [{ _id: a, blocked: b }, { _id: b, blocked: a }] } as any);
  return n > 0;
};

// "Contacts" = users you share a direct conversation with.
export async function contactIdsOf(userId: any) {
  const convs = await Conversation.find({ type: 'direct', 'members.user': userId as any }, { members: 1 }).lean();
  return convs.flatMap((c) => c.members.map((m) => String(m.user))).filter((id) => id !== String(userId));
}

// Simple in-memory per-key rate limiter (single-process; use Redis when scaling horizontally).
const buckets = new Map<string, number[]>();
export function rateCheck(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) fail(429, 'rate_limited', 'Too many requests, slow down.');
  arr.push(now);
  buckets.set(key, arr);
}
