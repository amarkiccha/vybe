import { Router } from 'express';
import { z } from 'zod';
import { User, Report } from '../models.ts';
import { authenticate, me, myId, oid, publicUser, selfUser, PUBLIC_USER, audit, rateCheck, fail } from '../lib.ts';

const r = Router();
r.use(authenticate);

r.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const u = me(res);
  const filter: any = { _id: { $ne: u._id, $nin: u.blocked }, blocked: { $ne: u._id } };
  if (q) filter.$or = [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { username: new RegExp(q.replace(/[^a-z0-9_]/gi, ''), 'i') }];
  const users = await User.find(filter, PUBLIC_USER).limit(30).lean();
  res.json({ users: users.map(publicUser) });
});

const LANGS = ['en', 'kn', 'hi', 'te', 'ta', 'ml', 'mr', 'bn'] as const;
r.patch('/me', async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(1).max(60).optional(),
    bio: z.string().max(160).optional(),
    avatar: z.string().max(200).optional(),
    language: z.enum(LANGS).optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    contentFilter: z.boolean().optional(),
    privacy: z.object({
      readReceipts: z.boolean().optional(),
      messageRequests: z.enum(['everyone', 'requests']).optional(),
      storyAudience: z.enum(['everyone', 'contacts', 'close_friends']).optional(),
    }).optional(),
  }).parse(req.body);
  const u = me(res);
  const { privacy, ...rest } = b;
  Object.assign(u, rest);
  if (privacy) for (const [k, v] of Object.entries(privacy)) if (v !== undefined) u.privacy[k] = v;
  await u.save();
  res.json({ user: selfUser(u) });
});

r.put('/me/close-friends', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.string()).max(500) }).parse(req.body);
  const u = me(res);
  u.closeFriends = ids.map(oid);
  await u.save();
  res.json({ user: selfUser(u) });
});

r.get('/blocked', async (_req, res) => {
  const users = await User.find({ _id: { $in: me(res).blocked } }, PUBLIC_USER).lean();
  res.json({ users: users.map(publicUser) });
});
r.post('/:id/block', async (req, res) => {
  const id = oid(req.params.id);
  if (id.equals(myId(res))) fail(400, 'cannot_block_self');
  await User.updateOne({ _id: myId(res) }, { $addToSet: { blocked: id } });
  audit(myId(res), 'user_blocked', String(id));
  res.status(204).end();
});
r.delete('/:id/block', async (req, res) => {
  await User.updateOne({ _id: myId(res) }, { $pull: { blocked: oid(req.params.id) } });
  res.status(204).end();
});
r.post('/:id/mute-stories', async (req, res) => {
  const op = req.body?.muted === false ? '$pull' : '$addToSet';
  await User.updateOne({ _id: myId(res) }, { [op]: { mutedStories: oid(req.params.id) } });
  res.status(204).end();
});
r.get('/:id', async (req, res) => {
  const u = await User.findById(oid(req.params.id), PUBLIC_USER).lean();
  if (!u) fail(404, 'not_found');
  res.json({ user: publicUser(u), blocked: me(res).blocked.some((b: any) => String(b) === req.params.id) });
});

// Reports (any content type) — persisted for admin review.
export const reports = Router();
reports.use(authenticate);
reports.post('/', async (req, res) => {
  rateCheck(`report:${myId(res)}`, 20, 3600_000);
  const b = z.object({ targetType: z.enum(['user', 'message', 'story', 'community', 'community_message', 'conversation']), targetId: z.string().min(1).max(64), reason: z.string().trim().min(1).max(500) }).parse(req.body);
  const rep = await Report.create({ ...b, reporter: myId(res) });
  res.status(201).json({ id: String(rep._id), status: rep.status });
});
reports.get('/admin', async (_req, res) => {
  if (!me(res).isAdmin) fail(403, 'forbidden');
  const list = await Report.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ reports: list.map((x) => ({ ...x, id: String(x._id), _id: undefined })) });
});
reports.patch('/admin/:id', async (req, res) => {
  if (!me(res).isAdmin) fail(403, 'forbidden');
  const { status } = z.object({ status: z.enum(['reviewing', 'actioned', 'dismissed']) }).parse(req.body);
  await Report.updateOne({ _id: oid(req.params.id) }, { status });
  audit(myId(res), 'report_status', req.params.id, { status });
  res.status(204).end();
});

export default r;
