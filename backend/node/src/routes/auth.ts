import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Session, Message, Story, Conversation, CommunityMember } from '../models.ts';
import { authenticate, createSession, fail, me, myId, selfUser, audit, rateCheck, ser, PUBLIC_USER, oid } from '../lib.ts';

const r = Router();
const LANGS = ['en', 'kn', 'hi', 'te', 'ta', 'ml', 'mr', 'bn'] as const;

const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/).optional().or(z.literal('')),
  language: z.enum(LANGS).optional(),
});

r.post('/register', async (req, res) => {
  rateCheck(`reg:${req.ip}`, 10, 3600_000);
  const b = registerSchema.parse(req.body);
  if (await User.exists({ email: b.email })) fail(409, 'email_taken');
  const username = b.email.split('@')[0].replace(/[^a-z0-9_]/g, '') + Math.floor(Math.random() * 900 + 100);
  const user = await User.create({ name: b.name, email: b.email, phone: b.phone || undefined, username, language: b.language ?? 'en', passwordHash: await bcrypt.hash(b.password, 12) });
  const token = await createSession(user._id, req.get('user-agent') ?? 'unknown');
  res.status(201).json({ token, user: selfUser(user) });
});

r.post('/login', async (req, res) => {
  rateCheck(`login:${req.ip}`, 20, 15 * 60_000);
  const b = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128), pin: z.string().optional() }).parse(req.body);
  const user = await User.findOne({ email: b.email });
  if (user?.lockedUntil && user.lockedUntil > new Date()) fail(423, 'account_locked', 'Too many failed attempts. Try again in 15 minutes.');
  const ok = user && (await bcrypt.compare(b.password, user.passwordHash));
  if (!user || !ok) {
    if (user) {
      user.failedLogins = (user.failedLogins ?? 0) + 1;
      if (user.failedLogins >= 5) { user.lockedUntil = new Date(Date.now() + 15 * 60_000); user.failedLogins = 0; audit(user._id, 'login_lockout'); }
      await user.save();
    }
    fail(401, 'invalid_credentials');
  }
  if (user!.twoStep?.enabled) {
    if (!b.pin) fail(401, 'pin_required');
    if (!(await bcrypt.compare(b.pin!, user!.twoStep.pinHash!))) fail(401, 'invalid_pin');
  }
  user!.failedLogins = 0; user!.lockedUntil = undefined; await user!.save();
  const token = await createSession(user!._id, req.get('user-agent') ?? 'unknown');
  res.json({ token, user: selfUser(user) });
});

r.post('/recover', (_req, res) => {
  res.status(501).json({ error: 'recovery_not_configured', message: 'Account recovery requires an email/SMS provider which is not configured yet.' });
});

r.use(authenticate);
r.get('/me', (_req, res) => { res.json({ user: selfUser(me(res)) }); });

r.post('/logout', async (_req, res) => {
  await Session.updateOne({ jti: res.locals.jti }, { revokedAt: new Date() });
  res.status(204).end();
});

r.get('/sessions', async (_req, res) => {
  const s = await Session.find({ userId: myId(res), revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).lean();
  res.json({ sessions: s.map((x) => ({ id: String(x._id), device: x.device, lastSeenAt: x.lastSeenAt, createdAt: x.createdAt, current: x.jti === res.locals.jti })) });
});
r.delete('/sessions/:id', async (req, res) => {
  await Session.updateOne({ _id: oid(req.params.id), userId: myId(res) }, { revokedAt: new Date() });
  audit(myId(res), 'session_revoked', req.params.id);
  res.status(204).end();
});

r.post('/two-step', async (req, res) => {
  const b = z.object({ enabled: z.boolean(), pin: z.string().regex(/^[0-9]{6}$/).optional() }).parse(req.body);
  const u = me(res);
  if (b.enabled) { if (!b.pin) fail(400, 'pin_required'); u.twoStep = { enabled: true, pinHash: await bcrypt.hash(b.pin!, 10) }; }
  else u.twoStep = { enabled: false };
  await u.save();
  audit(u._id, b.enabled ? 'two_step_enabled' : 'two_step_disabled');
  res.json({ user: selfUser(u) });
});

r.delete('/account', async (req, res) => {
  const { password } = z.object({ password: z.string() }).parse(req.body);
  const u = me(res);
  if (!(await bcrypt.compare(password, u.passwordHash))) fail(401, 'invalid_credentials');
  await Promise.all([
    Message.updateMany({ sender: u._id }, { deletedAt: new Date(), text: '', $unset: { media: 1 } }),
    Story.deleteMany({ user: u._id }),
    Session.updateMany({ userId: u._id }, { revokedAt: new Date() }),
    Conversation.updateMany({}, { $pull: { members: { user: u._id } } }),
    CommunityMember.deleteMany({ user: u._id }),
  ]);
  audit(u._id, 'account_deleted');
  await u.deleteOne();
  res.status(204).end();
});

r.get('/export', async (_req, res) => {
  const u = me(res);
  const [msgs, stories] = await Promise.all([Message.find({ sender: u._id, deletedAt: null }).limit(5000).lean(), Story.find({ user: u._id }).lean()]);
  res.json({ user: selfUser(u), messages: ser(msgs), stories: ser(stories) });
});

export default r;
export { PUBLIC_USER };
