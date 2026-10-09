import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { Media, Conversation, Story, Community, CommunityMember, CampaignDelivery } from '../models.ts';
import { authenticate, env, fail, myId, oid, rateCheck } from '../lib.ts';
import { putObject, getObject } from '../storage.ts';
import { canViewStory } from './stories.ts';

const r = Router();
const MAX = 25 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic)|video\/(mp4|quicktime|webm)|audio\/(m4a|mp4|mpeg|aac|webm|x-m4a|wav)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\..+)|text\/plain)$/;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX } });

r.use(authenticate);

r.post('/upload', upload.single('file'), async (req, res) => {
  rateCheck(`upload:${myId(res)}`, 60, 3600_000);
  const f = req.file;
  if (!f) fail(400, 'file_required');
  let mime = f!.mimetype;
  if (mime === 'application/octet-stream') {
    const ext = (f!.originalname.split('.').pop() ?? '').toLowerCase();
    mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', mov: 'video/quicktime', m4a: 'audio/m4a', pdf: 'application/pdf' } as Record<string, string>)[ext] ?? mime;
  }
  if (!ALLOWED.test(mime)) fail(415, 'unsupported_type');
  const ext = (f!.originalname.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `${env('APP_NAME')}/uploads/${myId(res)}/${crypto.randomUUID()}.${ext}`;
  try {
    const out = await putObject(path, f!.buffer, mime);
    const m = await Media.create({ owner: myId(res), path: out.path, mime, size: f!.size, name: f!.originalname.slice(0, 120), scope: req.body?.scope === 'public' ? 'public' : 'private' });
    res.status(201).json({ media: { id: String(m._id), mime, name: m.name, size: m.size } });
  } catch (e: any) {
    if (e.status === 402) fail(402, 'storage_quota', 'Storage credits exhausted');
    throw e;
  }
});

async function canAccess(userId: any, m: any) {
  if (String(m.owner) === String(userId) || m.scope === 'public') return true;
  for (const ref of m.refs ?? []) {
    if (ref.kind === 'conversation' && (await Conversation.exists({ _id: ref.id, 'members.user': userId }))) return true;
    if (ref.kind === 'story') { const s = await Story.findById(ref.id); if (s && (await canViewStory(userId, s))) return true; }
    if (ref.kind === 'community') {
      const c = await Community.findById(ref.id);
      if (c && (!c.isPrivate || (await CommunityMember.exists({ community: c._id, user: userId, status: 'active' })))) return true;
    }
    if (ref.kind === 'campaign' && (await CampaignDelivery.exists({ campaign: ref.id, recipientUser: userId }))) return true;
  }
  return false;
}

r.get('/:id', async (req, res) => {
  const m = await Media.findById(oid(req.params.id));
  if (!m) fail(404, 'not_found');
  if (!(await canAccess(myId(res), m))) fail(403, 'forbidden');
  const obj = await getObject(m!.path);
  res.set('Content-Type', m!.mime || obj.type).set('Cache-Control', 'private, max-age=86400').send(obj.data);
});

// Attach owned media to a resource so authorized members can read it.
export async function attachMedia(ownerId: any, mediaId: string | undefined, kind: string, refId: string) {
  if (!mediaId) return null;
  const m = await Media.findOne({ _id: oid(mediaId), owner: ownerId });
  if (!m) fail(400, 'invalid_media');
  m!.refs.push({ kind, id: refId });
  await m!.save();
  return { id: String(m!._id), mime: m!.mime, name: m!.name, size: m!.size };
}

export default r;
