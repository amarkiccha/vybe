import { Router } from 'express';
import { z } from 'zod';
import { Community, CommunityMember, Channel, CommunityMessage, User } from '../models.ts';
import { authenticate, fail, myId, oid, publicUser, PUBLIC_USER, isExplicit, rateCheck, ser, audit } from '../lib.ts';
import { attachMedia } from './media.ts';

const r = Router();
r.use(authenticate);
const CATS = ['learning', 'tech', 'jobs', 'creators', 'business', 'lifestyle'] as const;
const STAFF = ['owner', 'admin', 'moderator'];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function membership(cid: any, uid: any) {
  return CommunityMember.findOne({ community: cid, user: uid }).lean();
}
async function present(c: any, uid: any) {
  const m = await membership(c._id, uid);
  return { ...ser(c), myRole: m?.status === 'active' ? m.role : null, myStatus: m?.status ?? null };
}
async function loadReadable(id: string, uid: any) {
  const c = await Community.findById(oid(id));
  if (!c) fail(404, 'not_found');
  const m = await membership(c!._id, uid);
  if (m?.status === 'banned') fail(403, 'banned');
  const active = m?.status === 'active';
  if (c!.isPrivate && !active) fail(403, 'private_community');
  return { c: c!, m: active ? m : null };
}
async function requireStaff(id: string, uid: any, roles = STAFF) {
  const c = await Community.findById(oid(id));
  if (!c) fail(404, 'not_found');
  const m = await membership(c!._id, uid);
  if (!m || m.status !== 'active' || !roles.includes(m.role)) fail(403, 'staff_only');
  return { c: c!, m: m! };
}

r.get('/', async (req, res) => {
  const uid = myId(res);
  const q: any = {};
  const cat = String(req.query.category ?? '');
  if ((CATS as readonly string[]).includes(cat)) q.category = cat;
  if (req.query.q) q.$or = [{ name: new RegExp(esc(String(req.query.q)), 'i') }, { description: new RegExp(esc(String(req.query.q)), 'i') }];
  if (req.query.featured === '1') q.featured = true;
  const list = await Community.find(q).sort({ featured: -1, memberCount: -1 }).limit(50).lean();
  const mems = await CommunityMember.find({ user: uid, community: { $in: list.map((c) => c._id) } }).lean();
  const mm = new Map(mems.map((m) => [String(m.community), m]));
  res.json({ communities: list.filter((c) => mm.get(String(c._id))?.status !== 'banned').map((c) => ({ ...ser(c), myRole: mm.get(String(c._id))?.status === 'active' ? mm.get(String(c._id))!.role : null, myStatus: mm.get(String(c._id))?.status ?? null })) });
});

r.get('/mine', async (_req, res) => {
  const mems = await CommunityMember.find({ user: myId(res), status: 'active' }).lean();
  const list = await Community.find({ _id: { $in: mems.map((m) => m.community) } }).lean();
  const mm = new Map(mems.map((m) => [String(m.community), m.role]));
  res.json({ communities: list.map((c) => ({ ...ser(c), myRole: mm.get(String(c._id)), myStatus: 'active' })) });
});

r.post('/', async (req, res) => {
  const uid = myId(res);
  rateCheck(`community:${uid}`, 5, 86400_000);
  const b = z.object({ name: z.string().trim().min(3).max(80), description: z.string().max(500).default(''), category: z.enum(CATS), isPrivate: z.boolean().default(false), language: z.string().max(5).default('en'), coverId: z.string().optional() }).parse(req.body);
  if (isExplicit(b.name) || isExplicit(b.description)) fail(422, 'content_blocked');
  const c = await Community.create({ name: b.name, description: b.description, category: b.category, isPrivate: b.isPrivate, language: b.language, owner: uid, memberCount: 1 });
  if (b.coverId) { const m = await attachMedia(uid, b.coverId, 'community', String(c._id)); c.cover = m?.id; await c.save(); }
  await CommunityMember.create({ community: c._id, user: uid, role: 'owner' });
  await Channel.insertMany([{ community: c._id, name: 'announcements', kind: 'announcement' }, { community: c._id, name: 'general', kind: 'discussion' }, { community: c._id, name: 'resources', kind: 'resources' }]);
  res.status(201).json({ community: await present(c, uid) });
});

r.get('/:id', async (req, res) => {
  const uid = myId(res);
  const c = await Community.findById(oid(req.params.id));
  if (!c) fail(404, 'not_found');
  const p = await present(c, uid);
  if (p.myStatus === 'banned') fail(403, 'banned');
  const canRead = !c!.isPrivate || p.myStatus === 'active';
  const channels = canRead ? ser(await Channel.find({ community: c!._id }).sort({ createdAt: 1 }).lean()) : [];
  res.json({ community: p, channels, canRead });
});

r.post('/:id/join', async (req, res) => {
  const uid = myId(res);
  rateCheck(`join:${uid}`, 30, 3600_000);
  const c = await Community.findById(oid(req.params.id));
  if (!c) fail(404, 'not_found');
  const m = await CommunityMember.findOne({ community: c!._id, user: uid });
  if (m?.status === 'banned') fail(403, 'banned');
  if (m?.status === 'active') return res.json({ community: await present(c, uid) });
  const status = c!.isPrivate && m?.status !== 'invited' ? 'pending' : 'active';
  await CommunityMember.updateOne({ community: c!._id, user: uid }, { $set: { status, role: 'member' } }, { upsert: true });
  if (status === 'active') await Community.updateOne({ _id: c!._id }, { $inc: { memberCount: 1 } });
  res.json({ community: await present(await Community.findById(c!._id), uid) });
});

r.post('/:id/leave', async (req, res) => {
  const uid = myId(res);
  const m = await CommunityMember.findOne({ community: oid(req.params.id), user: uid });
  if (!m) fail(404, 'not_member');
  if (m!.role === 'owner') fail(400, 'owner_cannot_leave');
  const wasActive = m!.status === 'active';
  await m!.deleteOne();
  if (wasActive) await Community.updateOne({ _id: m!.community }, { $inc: { memberCount: -1 } });
  res.status(204).end();
});

r.get('/:id/members', async (req, res) => {
  const uid = myId(res);
  const { c, m } = await loadReadable(req.params.id, uid);
  const isStaff = m && STAFF.includes(m.role);
  const filter: any = { community: c._id, status: isStaff && req.query.status ? String(req.query.status) : 'active' };
  const mems = await CommunityMember.find(filter).limit(200).lean();
  const users = await User.find({ _id: { $in: mems.map((x) => x.user) } }, PUBLIC_USER).lean();
  const um = new Map(users.map((u) => [String(u._id), publicUser(u)]));
  res.json({ members: mems.map((x) => ({ ...um.get(String(x.user)), role: x.role, status: x.status })) });
});

r.post('/:id/invite', async (req, res) => {
  const uid = myId(res);
  rateCheck(`invite:${uid}`, 50, 86400_000);
  const { c } = await requireStaff(req.params.id, uid);
  const { userId } = z.object({ userId: z.string() }).parse(req.body);
  const existing = await CommunityMember.findOne({ community: c._id, user: oid(userId) });
  if (existing?.status === 'banned') fail(400, 'user_banned');
  if (existing?.status === 'pending') { existing.status = 'active'; await existing.save(); await Community.updateOne({ _id: c._id }, { $inc: { memberCount: 1 } }); }
  else if (!existing) await CommunityMember.create({ community: c._id, user: oid(userId), status: 'invited' });
  res.status(204).end();
});

r.post('/:id/members/:uid/:action', async (req, res) => {
  const uid = myId(res);
  const { c, m } = await requireStaff(req.params.id, uid);
  const action = req.params.action;
  const target = await CommunityMember.findOne({ community: c._id, user: oid(req.params.uid) });
  if (!target && action !== 'ban') fail(404, 'not_member');
  if (target?.role === 'owner') fail(403, 'cannot_moderate_owner');
  if (action === 'approve') {
    if (target!.status !== 'pending') fail(400, 'not_pending');
    target!.status = 'active'; await target!.save();
    await Community.updateOne({ _id: c._id }, { $inc: { memberCount: 1 } });
  } else if (action === 'remove' || action === 'ban') {
    const wasActive = target?.status === 'active';
    if (action === 'remove') await target!.deleteOne();
    else await CommunityMember.updateOne({ community: c._id, user: oid(req.params.uid) }, { $set: { status: 'banned', role: 'member' } }, { upsert: true });
    if (wasActive) await Community.updateOne({ _id: c._id }, { $inc: { memberCount: -1 } });
  } else if (['admin', 'moderator', 'member'].includes(action)) {
    if (m.role !== 'owner') fail(403, 'owner_only');
    target!.role = action as any; await target!.save();
  } else fail(400, 'invalid_action');
  audit(uid, `community_${action}`, req.params.uid, { community: String(c._id) });
  res.status(204).end();
});

r.post('/:id/channels', async (req, res) => {
  const { c } = await requireStaff(req.params.id, myId(res), ['owner', 'admin']);
  const b = z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(['announcement', 'discussion', 'resources']) }).parse(req.body);
  const ch = await Channel.create({ community: c._id, ...b });
  res.status(201).json({ channel: ser(ch) });
});

async function loadChannel(cid: string, uid: any) {
  const ch = await Channel.findById(oid(cid));
  if (!ch) fail(404, 'not_found');
  const { c, m } = await loadReadable(String(ch!.community), uid);
  return { ch: ch!, c, m };
}

r.get('/channels/:cid/messages', async (req, res) => {
  const uid = myId(res);
  const { ch } = await loadChannel(req.params.cid, uid);
  const q: any = { channel: ch._id, deletedAt: null };
  if (req.query.q) q.text = new RegExp(esc(String(req.query.q)), 'i');
  if (req.query.pinned === '1') q.pinned = true;
  if (req.query.since) q.updatedAt = { $gt: new Date(String(req.query.since)) };
  else if (req.query.before) q.createdAt = { $lt: new Date(String(req.query.before)) };
  const msgs = (await CommunityMessage.find(q).sort({ createdAt: -1 }).limit(50).lean()).reverse();
  const users = await User.find({ _id: { $in: [...new Set(msgs.map((x) => String(x.sender)))] } }, PUBLIC_USER).lean();
  const um = new Map(users.map((u) => [String(u._id), publicUser(u)]));
  res.json({
    messages: msgs.map((x) => ({
      ...ser(x), sender: um.get(String(x.sender)),
      poll: x.poll?.question ? { question: x.poll.question, options: x.poll.options.map((o: any, i: number) => ({ index: i, text: o.text, votes: o.votes.length, mine: o.votes.some((v: any) => String(v) === String(uid)) })) } : null,
    })),
    serverTime: new Date().toISOString(),
  });
});

r.post('/channels/:cid/messages', async (req, res) => {
  const uid = myId(res);
  const { ch, c, m } = await loadChannel(req.params.cid, uid);
  if (!m) fail(403, 'join_to_post');
  if (ch.kind === 'announcement' && !STAFF.includes(m!.role)) fail(403, 'staff_only');
  rateCheck(`cmsg:${uid}:${c._id}`, 10, 60_000);
  const b = z.object({ text: z.string().max(4000).default(''), mediaId: z.string().optional(), poll: z.object({ question: z.string().trim().min(1).max(200), options: z.array(z.string().trim().min(1).max(80)).min(2).max(6) }).optional() }).parse(req.body);
  if (!b.text.trim() && !b.mediaId && !b.poll) fail(400, 'empty_message');
  if (isExplicit(b.text) || isExplicit(b.poll?.question)) fail(422, 'content_blocked', 'Message blocked by community content filter.');
  const media = await attachMedia(uid, b.mediaId, 'community', String(c._id));
  const msg = await CommunityMessage.create({ community: c._id, channel: ch._id, sender: uid, text: b.text, media: media ?? undefined, poll: b.poll ? { question: b.poll.question, options: b.poll.options.map((text) => ({ text, votes: [] })) } : undefined });
  res.status(201).json({ message: ser(msg) });
});

async function loadCMsg(id: string, uid: any) {
  const msg = await CommunityMessage.findById(oid(id));
  if (!msg) fail(404, 'not_found');
  const { m } = await loadReadable(String(msg!.community), uid);
  return { msg: msg!, m };
}

r.post('/messages/:id/vote', async (req, res) => {
  const uid = myId(res);
  const { msg, m } = await loadCMsg(req.params.id, uid);
  if (!m) fail(403, 'join_to_vote');
  const { option } = z.object({ option: z.number().int().min(0).max(5) }).parse(req.body);
  if (!msg.poll?.options?.[option]) fail(400, 'invalid_option');
  msg.poll!.options.forEach((o: any) => { o.votes = o.votes.filter((v: any) => !v.equals(uid)); });
  msg.poll!.options[option].votes.push(uid);
  await msg.save();
  res.status(204).end();
});

r.post('/messages/:id/react', async (req, res) => {
  const uid = myId(res);
  const { msg, m } = await loadCMsg(req.params.id, uid);
  if (!m) fail(403, 'join_to_react');
  const { emoji } = z.object({ emoji: z.string().max(8).nullable() }).parse(req.body);
  msg.reactions = msg.reactions.filter((x: any) => !x.user.equals(uid)) as any;
  if (emoji) msg.reactions.push({ user: uid, emoji });
  await msg.save();
  res.status(204).end();
});

r.post('/messages/:id/pin', async (req, res) => {
  const uid = myId(res);
  const { msg, m } = await loadCMsg(req.params.id, uid);
  if (!m || !STAFF.includes(m.role)) fail(403, 'staff_only');
  msg.pinned = !msg.pinned; await msg.save();
  res.status(204).end();
});

r.delete('/messages/:id', async (req, res) => {
  const uid = myId(res);
  const { msg, m } = await loadCMsg(req.params.id, uid);
  if (!msg.sender.equals(uid) && !(m && STAFF.includes(m.role))) fail(403, 'not_allowed');
  msg.deletedAt = new Date(); await msg.save();
  if (!msg.sender.equals(uid)) audit(uid, 'community_message_removed', String(msg._id));
  res.status(204).end();
});

export default r;
