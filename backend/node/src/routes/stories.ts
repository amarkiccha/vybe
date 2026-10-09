import { Router } from 'express';
import { z } from 'zod';
import { Story, User, Conversation } from '../models.ts';
import { authenticate, fail, me, myId, oid, publicUser, PUBLIC_USER, contactIdsOf, isExplicit, rateCheck, ser } from '../lib.ts';
import { attachMedia } from './media.ts';
import { sendMessage } from './chats.ts';

const r = Router();
r.use(authenticate);

export async function canViewStory(uid: any, s: any) {
  if (s.expiresAt < new Date()) return false;
  if (String(s.user) === String(uid)) return true;
  const author = await User.findById(s.user, { blocked: 1, closeFriends: 1 }).lean();
  const viewer = await User.findById(uid, { blocked: 1 }).lean();
  if (!author || !viewer) return false;
  if (author.blocked.some((b) => String(b) === String(uid)) || viewer.blocked.some((b) => String(b) === String(s.user))) return false;
  if (s.audience === 'everyone') return true;
  if (s.audience === 'close_friends') return author.closeFriends.some((b) => String(b) === String(uid));
  return (await contactIdsOf(s.user)).includes(String(uid));
}

const shape = (s: any, uid: any) => {
  const o = ser(s);
  o.viewed = (s.views ?? []).some((v: any) => String(v.user) === String(uid));
  o.viewCount = (s.views ?? []).length;
  o.myReaction = (s.reactions ?? []).find((x: any) => String(x.user) === String(uid))?.emoji ?? null;
  if (String(s.user) !== String(uid)) { delete o.views; delete o.reactions; }
  return o;
};

// Feed: grouped by author. scope=friends (contacts only) | explore (public stories) | all
r.get('/feed', async (req, res) => {
  const u = me(res);
  const uid = u._id;
  const scope = String(req.query.scope ?? 'all');
  const contacts = await contactIdsOf(uid);
  const blockedMe = (await User.find({ blocked: uid }, { _id: 1 }).lean()).map((x) => String(x._id));
  const exclude = new Set([...u.blocked.map(String), ...blockedMe, ...u.mutedStories.map(String)]);
  const stories = await Story.find({ expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).limit(500).lean();
  const authors = await User.find({ _id: { $in: [...new Set(stories.map((s) => s.user))] } }, PUBLIC_USER + ' closeFriends').lean();
  const amap = new Map(authors.map((a) => [String(a._id), a]));
  const groups = new Map<string, any>();
  for (const s of stories) {
    const aid = String(s.user);
    const isMine = aid === String(uid);
    if (!isMine && exclude.has(aid)) continue;
    const a: any = amap.get(aid);
    if (!a) continue;
    const isContact = contacts.includes(aid);
    const visible = isMine || s.audience === 'everyone' || (s.audience === 'contacts' && isContact) || (s.audience === 'close_friends' && a.closeFriends.some((x: any) => String(x) === String(uid)));
    if (!visible) continue;
    if (!isMine && scope === 'friends' && !isContact) continue;
    if (!isMine && scope === 'explore' && (isContact || s.audience !== 'everyone')) continue;
    if (!groups.has(aid)) groups.set(aid, { user: publicUser(a), isMine, stories: [] });
    groups.get(aid).stories.push(shape(s, uid));
  }
  const list = [...groups.values()].map((g) => ({ ...g, hasUnseen: g.stories.some((s: any) => !s.viewed) }));
  list.sort((a, b) => Number(b.isMine) - Number(a.isMine) || Number(b.hasUnseen) - Number(a.hasUnseen));
  res.json({ groups: list });
});

r.post('/', async (req, res) => {
  const u = me(res);
  rateCheck(`story:${u._id}`, 30, 86400_000);
  const b = z.object({
    type: z.enum(['text', 'image', 'video']), text: z.string().max(500).default(''), bg: z.string().max(20).optional(),
    mediaId: z.string().optional(), location: z.string().max(60).optional(),
    audience: z.enum(['everyone', 'contacts', 'close_friends']).optional(), durationHours: z.number().int().min(1).max(48).default(24),
  }).parse(req.body);
  if (b.type === 'text' && !b.text.trim()) fail(400, 'empty_story');
  if (b.type !== 'text' && !b.mediaId) fail(400, 'media_required');
  const audience = b.audience ?? u.privacy?.storyAudience ?? 'contacts';
  if (audience === 'everyone' && isExplicit(b.text)) fail(422, 'content_blocked', 'This text appears to contain explicit content.');
  const s = await Story.create({ user: u._id, type: b.type, text: b.text, bg: b.bg, location: b.location, audience, expiresAt: new Date(Date.now() + b.durationHours * 3600_000) });
  if (b.mediaId) { s.media = (await attachMedia(u._id, b.mediaId, 'story', String(s._id))) as any; await s.save(); }
  res.status(201).json({ story: shape(s.toObject(), u._id) });
});

async function load(id: string, uid: any) {
  const s = await Story.findById(oid(id));
  if (!s || !(await canViewStory(uid, s))) fail(404, 'not_found');
  return s!;
}

r.post('/:id/view', async (req, res) => {
  const uid = myId(res);
  const s = await load(req.params.id, uid);
  if (!s.user.equals(uid) && !s.views.some((v: any) => v.user.equals(uid))) { s.views.push({ user: uid, at: new Date() }); await s.save(); }
  res.status(204).end();
});

r.post('/:id/react', async (req, res) => {
  const uid = myId(res);
  const s = await load(req.params.id, uid);
  const { emoji } = z.object({ emoji: z.string().max(8) }).parse(req.body);
  s.reactions = s.reactions.filter((x: any) => !x.user.equals(uid)) as any;
  s.reactions.push({ user: uid, emoji });
  await s.save();
  res.status(204).end();
});

r.post('/:id/reply', async (req, res) => {
  const u = me(res);
  const s = await load(req.params.id, u._id);
  if (s.user.equals(u._id)) fail(400, 'own_story');
  const { text } = z.object({ text: z.string().trim().min(1).max(1000) }).parse(req.body);
  let c = await Conversation.findOne({ type: 'direct', 'members.user': { $all: [u._id, s.user] } });
  if (!c) c = await Conversation.create({ type: 'direct', createdBy: u._id, members: [{ user: u._id }, { user: s.user, request: true }] });
  await sendMessage(c, u, { clientId: `story-${s._id}-${Date.now()}`, type: 'text', text: `↪ ${s.text ? s.text.slice(0, 40) : 'Story'}\n${text}` });
  res.status(201).json({ conversationId: String(c._id) });
});

r.get('/:id/viewers', async (req, res) => {
  const s = await Story.findOne({ _id: oid(req.params.id), user: myId(res) }).lean();
  if (!s) fail(404, 'not_found');
  const users = await User.find({ _id: { $in: s!.views.map((v) => v.user) } }, PUBLIC_USER).lean();
  const rx = new Map(s!.reactions.map((x) => [String(x.user), x.emoji]));
  res.json({ viewers: users.map((v) => ({ ...publicUser(v), reaction: rx.get(String(v._id)) ?? null })) });
});

r.delete('/:id', async (req, res) => {
  const out = await Story.deleteOne({ _id: oid(req.params.id), user: myId(res) });
  if (!out.deletedCount) fail(404, 'not_found');
  res.status(204).end();
});

export default r;
