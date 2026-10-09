import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Conversation, Message, User } from '../models.ts';
import { authenticate, fail, me, myId, oid, publicUser, PUBLIC_USER, isBlockedBetween, rateCheck, ser } from '../lib.ts';
import { attachMedia } from './media.ts';

const r = Router();
r.use(authenticate);
const typing = new Map<string, Map<string, { name: string; until: number }>>();

const memberOf = (c: any, uid: any) => c.members.find((m: any) => String(m.user?._id ?? m.user) === String(uid));
async function loadConv(id: string, uid: any) {
  const c = await Conversation.findById(oid(id));
  if (!c || !memberOf(c, uid)) fail(404, 'not_found');
  return c!;
}
const isAdmin = (c: any, uid: any) => ['owner', 'admin'].includes(memberOf(c, uid)?.role);

async function present(c: any, uid: any) {
  const ids = c.members.map((m: any) => m.user);
  const users = await User.find({ _id: { $in: ids } }, PUBLIC_USER).lean();
  const byId = new Map(users.map((u) => [String(u._id), publicUser(u)]));
  const mine = memberOf(c, uid);
  const unread = await Message.countDocuments({ conversation: c._id, sender: { $ne: uid }, createdAt: { $gt: mine.lastReadAt }, deletedAt: null, type: { $ne: 'system' } });
  const other = c.type !== 'group' ? c.members.find((m: any) => String(m.user) !== String(uid)) : null;
  const otherUser = other ? byId.get(String(other.user)) : null;
  return {
    id: String(c._id), type: c.type,
    name: c.type === 'group' ? c.name : otherUser?.name ?? 'VYBE user',
    avatar: c.type === 'group' ? c.avatar : otherUser?.avatar,
    description: c.description,
    otherUserId: otherUser?.id,
    members: c.members.map((m: any) => ({ ...byId.get(String(m.user)), role: m.role })),
    lastMessage: c.lastMessage?.at ? { text: c.lastMessage.text, type: c.lastMessage.type, sender: String(c.lastMessage.sender), at: c.lastMessage.at } : null,
    unread, muted: mine.muted, archived: mine.archived, pinned: mine.pinned, favorite: mine.favorite, request: mine.request,
    myRole: mine.role, disappearingSeconds: c.disappearingSeconds, onlyAdminsCanPost: c.onlyAdminsCanPost,
    pinnedMessage: c.pinnedMessage ? String(c.pinnedMessage) : null, updatedAt: c.updatedAt,
  };
}

r.get('/', async (req, res) => {
  const uid = myId(res);
  const filter = String(req.query.filter ?? 'all');
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const convs = await Conversation.find({ 'members.user': uid }).sort({ updatedAt: -1 }).limit(200);
  // Mark incoming messages delivered when the client syncs its inbox.
  await Message.updateMany({ conversation: { $in: convs.map((c) => c._id) }, sender: { $ne: uid }, deliveredTo: { $ne: uid } }, { $addToSet: { deliveredTo: uid } });
  let list = await Promise.all(convs.map((c) => present(c, uid)));
  list = list.filter((c) => {
    if (filter === 'archived') return c.archived;
    if (c.archived) return false;
    if (filter === 'requests') return c.request;
    if (filter === 'unread') return c.unread > 0;
    if (filter === 'groups') return c.type === 'group';
    if (filter === 'favorites') return c.favorite;
    return true;
  });
  if (q) list = list.filter((c) => c.name?.toLowerCase().includes(q) || c.lastMessage?.text?.toLowerCase().includes(q));
  list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const unreadTotal = list.reduce((n, c) => n + (c.muted ? 0 : c.unread), 0);
  res.json({ conversations: list, unreadTotal });
});

r.post('/', async (req, res) => {
  const uid = myId(res);
  const b = z.discriminatedUnion('type', [
    z.object({ type: z.literal('direct'), userId: z.string() }),
    z.object({ type: z.literal('group'), name: z.string().trim().min(1).max(60), memberIds: z.array(z.string()).min(1).max(255), avatar: z.string().optional() }),
  ]).parse(req.body);
  if (b.type === 'direct') {
    const other = oid(b.userId);
    if (other.equals(uid)) fail(400, 'cannot_chat_self');
    const target = await User.findById(other);
    if (!target) fail(404, 'user_not_found');
    if (await isBlockedBetween(uid, other)) fail(403, 'blocked');
    let c = await Conversation.findOne({ type: 'direct', 'members.user': { $all: [uid, other] } });
    if (!c) {
      c = await Conversation.create({ type: 'direct', createdBy: uid, members: [{ user: uid }, { user: other, request: target!.privacy?.messageRequests === 'requests' }] });
    }
    return res.status(201).json({ conversation: await present(c, uid) });
  }
  rateCheck(`group:${uid}`, 10, 3600_000);
  const ids = [...new Set(b.memberIds)].map(oid).filter((i) => !i.equals(uid));
  const blocked = await User.find({ _id: { $in: ids }, blocked: uid }, { _id: 1 }).lean();
  const allowed = ids.filter((i) => !blocked.some((x) => x._id.equals(i)) && !me(res).blocked.some((x: any) => x.equals(i)));
  const c = await Conversation.create({ type: 'group', name: b.name, avatar: b.avatar, createdBy: uid, members: [{ user: uid, role: 'owner' }, ...allowed.map((user) => ({ user }))] });
  await Message.create({ conversation: c._id, sender: uid, clientId: `sys-${c._id}`, type: 'system', text: `group_created:${b.name}` });
  res.status(201).json({ conversation: await present(c, uid) });
});

r.get('/:id', async (req, res) => {
  const c = await loadConv(req.params.id, myId(res));
  res.json({ conversation: await present(c, myId(res)) });
});

r.patch('/:id', async (req, res) => {
  const uid = myId(res);
  const c = await loadConv(req.params.id, uid);
  const b = z.object({
    muted: z.boolean().optional(), archived: z.boolean().optional(), pinned: z.boolean().optional(), favorite: z.boolean().optional(), acceptRequest: z.boolean().optional(),
    name: z.string().trim().min(1).max(60).optional(), description: z.string().max(300).optional(), disappearingSeconds: z.number().int().min(0).max(7 * 86400).optional(), onlyAdminsCanPost: z.boolean().optional(),
  }).parse(req.body);
  const m = memberOf(c, uid);
  for (const k of ['muted', 'archived', 'pinned', 'favorite'] as const) if (b[k] !== undefined) m[k] = b[k];
  if (b.acceptRequest) m.request = false;
  if (b.name || b.description !== undefined || b.onlyAdminsCanPost !== undefined) {
    if (c.type !== 'group' || !isAdmin(c, uid)) fail(403, 'admin_only');
    if (b.name) c.name = b.name;
    if (b.description !== undefined) c.description = b.description;
    if (b.onlyAdminsCanPost !== undefined) c.onlyAdminsCanPost = b.onlyAdminsCanPost;
  }
  if (b.disappearingSeconds !== undefined) {
    if (c.type === 'group' && !isAdmin(c, uid)) fail(403, 'admin_only');
    c.disappearingSeconds = b.disappearingSeconds;
  }
  await c.save();
  res.json({ conversation: await present(c, uid) });
});

r.post('/:id/members', async (req, res) => {
  const uid = myId(res);
  const c = await loadConv(req.params.id, uid);
  if (c.type !== 'group' || !isAdmin(c, uid)) fail(403, 'admin_only');
  const { userIds } = z.object({ userIds: z.array(z.string()).min(1).max(50) }).parse(req.body);
  for (const id of userIds.map(oid)) {
    if (memberOf(c, id) || (await isBlockedBetween(uid, id))) continue;
    c.members.push({ user: id });
  }
  await c.save();
  res.json({ conversation: await present(c, uid) });
});

r.patch('/:id/members/:uid', async (req, res) => {
  const uid = myId(res);
  const c = await loadConv(req.params.id, uid);
  if (memberOf(c, uid)?.role !== 'owner') fail(403, 'owner_only');
  const { role } = z.object({ role: z.enum(['admin', 'member']) }).parse(req.body);
  const m = memberOf(c, req.params.uid);
  if (!m || m.role === 'owner') fail(400, 'invalid_member');
  m.role = role;
  await c.save();
  res.json({ conversation: await present(c, uid) });
});

r.delete('/:id/members/:uid', async (req, res) => {
  const uid = myId(res);
  const c = await loadConv(req.params.id, uid);
  const self = req.params.uid === String(uid);
  if (!self && (c.type !== 'group' || !isAdmin(c, uid))) fail(403, 'admin_only');
  const target = memberOf(c, req.params.uid);
  if (!target) fail(404, 'not_member');
  if (target.role === 'owner' && !self) fail(403, 'cannot_remove_owner');
  c.members = c.members.filter((m: any) => String(m.user) !== req.params.uid) as any;
  if (self && target.role === 'owner' && c.members.length) c.members[0].role = 'owner';
  await c.save();
  res.status(204).end();
});

r.post('/:id/read', async (req, res) => {
  const uid = myId(res);
  const c = await loadConv(req.params.id, uid);
  memberOf(c, uid).lastReadAt = new Date();
  await Conversation.updateOne({ _id: c._id, 'members.user': uid }, { $set: { 'members.$.lastReadAt': new Date() } });
  if (me(res).privacy?.readReceipts !== false) await Message.updateMany({ conversation: c._id, sender: { $ne: uid }, readBy: { $ne: uid } }, { $addToSet: { readBy: uid, deliveredTo: uid } });
  res.status(204).end();
});

r.post('/:id/typing', async (req, res) => {
  const c = await loadConv(req.params.id, myId(res));
  const map = typing.get(String(c._id)) ?? new Map();
  map.set(String(myId(res)), { name: me(res).name, until: Date.now() + 5000 });
  typing.set(String(c._id), map);
  res.status(204).end();
});

function shape(m: any, uid: any, others: number) {
  const o = ser(m);
  if (o.deletedAt) { o.text = ''; o.media = null; }
  if (String(m.sender) === String(uid)) {
    const read = (m.readBy ?? []).length >= others && others > 0;
    const delivered = (m.deliveredTo ?? []).length >= others && others > 0;
    o.status = read ? 'read' : delivered ? 'delivered' : 'sent';
  }
  delete o.readBy; delete o.deliveredTo;
  return o;
}

r.get('/:id/messages', async (req, res) => {
  const uid = myId(res);
  const c = await loadConv(req.params.id, uid);
  const others = c.members.length - 1;
  const since = req.query.since ? new Date(String(req.query.since)) : null;
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  const q: any = { conversation: c._id, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] };
  let msgs;
  if (since) msgs = await Message.find({ ...q, updatedAt: { $gt: since } }).sort({ updatedAt: 1 }).limit(200).populate('replyTo', 'text sender type deletedAt').lean();
  else {
    if (before) q.createdAt = { $lt: before };
    msgs = (await Message.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 30, 100)).populate('replyTo', 'text sender type deletedAt').lean()).reverse();
  }
  await Message.updateMany({ conversation: c._id, sender: { $ne: uid }, deliveredTo: { $ne: uid } }, { $addToSet: { deliveredTo: uid } });
  const tmap = typing.get(String(c._id));
  const typingNames = tmap ? [...tmap.entries()].filter(([k, v]) => k !== String(uid) && v.until > Date.now()).map(([, v]) => v.name) : [];
  res.json({ messages: msgs.map((m) => shape(m, uid, others)), typing: typingNames, serverTime: new Date().toISOString() });
});

const sendSchema = z.object({
  clientId: z.string().min(6).max(64),
  type: z.enum(['text', 'image', 'video', 'audio', 'file', 'snap']).default('text'),
  text: z.string().max(4000).default(''),
  mediaId: z.string().optional(),
  duration: z.number().optional(),
  replyTo: z.string().optional(),
  viewOnce: z.boolean().optional(),
  expiresInSec: z.number().int().min(5).max(7 * 86400).optional(),
});

export async function sendMessage(c: any, sender: any, b: z.infer<typeof sendSchema>, extra: Record<string, unknown> = {}) {
  const existing = await Message.findOne({ sender: sender._id, clientId: b.clientId });
  if (existing) return existing; // idempotent retry
  if (c.type === 'direct') {
    const other = c.members.find((m: any) => String(m.user) !== String(sender._id));
    if (other && (await isBlockedBetween(sender._id, other.user))) fail(403, 'blocked');
  }
  if (c.type === 'group' && c.onlyAdminsCanPost && !isAdmin(c, sender._id)) fail(403, 'admin_only');
  if (b.type === 'text' && !b.text.trim()) fail(400, 'empty_message');
  const media = await attachMedia(sender._id, b.mediaId, 'conversation', String(c._id));
  if (b.type !== 'text' && !media) fail(400, 'media_required');
  if (media && b.duration) (media as any).duration = b.duration;
  const ttl = b.expiresInSec ?? (c.disappearingSeconds || undefined);
  const msg = await Message.create({
    conversation: c._id, sender: sender._id, clientId: b.clientId, type: b.type, text: b.text, media: media ?? undefined,
    replyTo: b.replyTo ? oid(b.replyTo) : undefined, viewOnce: !!b.viewOnce, expiresAt: ttl ? new Date(Date.now() + ttl * 1000) : undefined, ...extra,
  });
  const preview = b.text || b.type;
  await Conversation.updateOne({ _id: c._id }, { lastMessage: { text: preview.slice(0, 120), type: b.type, sender: sender._id, at: msg.createdAt } });
  if (String(c.members.find((m: any) => String(m.user) === String(sender._id))?.request) === 'true')
    await Conversation.updateOne({ _id: c._id, 'members.user': sender._id }, { $set: { 'members.$.request': false } });
  typing.get(String(c._id))?.delete(String(sender._id));
  return msg;
}

r.post('/:id/messages', async (req, res) => {
  const uid = myId(res);
  rateCheck(`msg:${uid}`, 60, 60_000);
  const c = await loadConv(req.params.id, uid);
  const b = sendSchema.parse(req.body);
  const msg = await sendMessage(c, me(res), b);
  const full = await Message.findById(msg._id).populate('replyTo', 'text sender type deletedAt').lean();
  res.status(201).json({ message: shape(full, uid, c.members.length - 1) });
});

r.post('/:id/pin', async (req, res) => {
  const uid = myId(res);
  const c = await loadConv(req.params.id, uid);
  if (c.type === 'group' && !isAdmin(c, uid)) fail(403, 'admin_only');
  const { messageId } = z.object({ messageId: z.string().nullable() }).parse(req.body);
  c.pinnedMessage = messageId ? oid(messageId) : undefined;
  await c.save();
  res.status(204).end();
});

// --- Message-level actions ---
export const messages = Router();
messages.use(authenticate);

async function loadMsg(id: string, uid: any) {
  const m = await Message.findById(oid(id));
  if (!m) fail(404, 'not_found');
  const c = await loadConv(String(m!.conversation), uid);
  return { m: m!, c };
}

messages.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const convs = await Conversation.find({ 'members.user': myId(res) }, { _id: 1, name: 1 }).lean();
  const found = await Message.find({ conversation: { $in: convs.map((c) => c._id) }, deletedAt: null, text: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ results: found.map((m) => ({ id: String(m._id), conversationId: String(m.conversation), text: m.text, createdAt: m.createdAt, sender: String(m.sender) })) });
});

messages.patch('/:id', async (req, res) => {
  const uid = myId(res);
  const { m } = await loadMsg(req.params.id, uid);
  const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
  if (!m.sender.equals(uid)) fail(403, 'not_owner');
  if (m.type !== 'text' || m.deletedAt) fail(400, 'not_editable');
  if (Date.now() - m.createdAt.getTime() > 15 * 60_000) fail(400, 'edit_window_passed', 'Messages can be edited within 15 minutes.');
  m.text = text; m.editedAt = new Date();
  await m.save();
  res.json({ message: ser(m) });
});

messages.delete('/:id', async (req, res) => {
  const uid = myId(res);
  const { m, c } = await loadMsg(req.params.id, uid);
  const own = m.sender.equals(uid);
  if (!own && !(c.type === 'group' && isAdmin(c, uid))) fail(403, 'not_allowed');
  if (own && Date.now() - m.createdAt.getTime() > 60 * 60_000 && !isAdmin(c, uid)) fail(400, 'delete_window_passed', 'Messages can be deleted for everyone within 1 hour.');
  m.deletedAt = new Date(); m.text = ''; m.media = undefined;
  await m.save();
  res.status(204).end();
});

messages.post('/:id/react', async (req, res) => {
  const uid = myId(res);
  const { m } = await loadMsg(req.params.id, uid);
  const { emoji } = z.object({ emoji: z.string().max(8).nullable() }).parse(req.body);
  m.reactions = m.reactions.filter((x: any) => !x.user.equals(uid)) as any;
  if (emoji) m.reactions.push({ user: uid, emoji });
  await m.save();
  res.status(204).end();
});

messages.post('/:id/view', async (req, res) => {
  const uid = myId(res);
  const { m } = await loadMsg(req.params.id, uid);
  if (m.viewOnce && !m.sender.equals(uid)) { m.deletedAt = new Date(); m.media = undefined; await m.save(); }
  res.status(204).end();
});

messages.post('/:id/forward', async (req, res) => {
  const uid = myId(res);
  rateCheck(`fwd:${uid}`, 20, 3600_000);
  const { m } = await loadMsg(req.params.id, uid);
  const { conversationIds } = z.object({ conversationIds: z.array(z.string()).min(1).max(5) }).parse(req.body);
  if (m.deletedAt || m.viewOnce || m.type === 'snap') fail(400, 'not_forwardable');
  const highly = m.forwardCount >= 5;
  if (highly && conversationIds.length > 1) fail(400, 'forward_limit', 'Highly forwarded messages can only be sent to one chat at a time.');
  for (const cid of conversationIds) {
    const c = await loadConv(cid, uid);
    if (m.media?.id) await attachMedia(m.sender, m.media.id, 'conversation', cid).catch(() => undefined);
    const fwd = await sendMessage(c, me(res), { clientId: `fwd-${m._id}-${cid}-${Date.now()}`, type: m.type as any, text: m.text });
    fwd.media = m.media; fwd.forwarded = true; fwd.forwardCount = m.forwardCount + 1;
    await fwd.save();
  }
  await Message.updateOne({ _id: m._id }, { $inc: { forwardCount: 1 } });
  res.status(204).end();
});

export { loadConv };
export const _mongoose = mongoose;
export default r;
