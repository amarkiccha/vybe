import { Router } from 'express';
import { z } from 'zod';
import { BContact, ConsentRecord, Segment, Template, Campaign, CampaignDelivery, Conversation, Message, User } from '../models.ts';
import { authenticate, fail, myId, oid, ser, audit, envNum, rateCheck } from '../lib.ts';
import { attachMedia } from './media.ts';
import { sendMessage } from './chats.ts';

const r = Router();
r.use(authenticate);
const PHONE = /^\+?[0-9]{10,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normPhone = (p?: string) => (p ? p.replace(/[\s-()]/g, '') : undefined);

// ---- Contacts ----
r.get('/contacts', async (req, res) => {
  const q: any = { owner: myId(res) };
  if (req.query.tag) q.tags = String(req.query.tag);
  if (req.query.q) q.name = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const list = await BContact.find(q).sort({ createdAt: -1 }).limit(500).lean();
  res.json({ contacts: ser(list) });
});

const contactSchema = z.object({
  name: z.string().trim().min(1).max(80), phone: z.string().optional(), email: z.string().optional(),
  tags: z.array(z.string().trim().toLowerCase().max(30)).max(20).default([]), consent: z.enum(['opted_in', 'pending', 'opted_out']).default('pending'),
  fields: z.record(z.string(), z.string().max(200)).optional(),
});

function validateRow(b: { phone?: string; email?: string }) {
  const phone = normPhone(b.phone) || undefined;
  const email = b.email?.trim().toLowerCase() || undefined;
  if (!phone && !email) return { error: 'phone_or_email_required' };
  if (phone && !PHONE.test(phone)) return { error: 'invalid_phone' };
  if (email && !EMAIL.test(email)) return { error: 'invalid_email' };
  return { phone, email };
}

r.post('/contacts', async (req, res) => {
  const owner = myId(res);
  const b = contactSchema.parse(req.body);
  const v = validateRow(b);
  if (v.error) fail(400, v.error);
  const dup = await BContact.findOne({ owner, $or: [v.phone ? { phone: v.phone } : null, v.email ? { email: v.email } : null].filter(Boolean) as any });
  if (dup) fail(409, 'duplicate_contact');
  const c = await BContact.create({ ...b, phone: v.phone, email: v.email, owner });
  await ConsentRecord.create({ owner, contact: c._id, status: b.consent, source: 'manual' });
  res.status(201).json({ contact: ser(c) });
});

r.patch('/contacts/:id', async (req, res) => {
  const owner = myId(res);
  const b = z.object({ consent: z.enum(['opted_in', 'pending', 'opted_out']).optional(), unsubscribed: z.boolean().optional(), tags: z.array(z.string().trim().toLowerCase()).max(20).optional(), name: z.string().trim().min(1).max(80).optional() }).parse(req.body);
  const c = await BContact.findOne({ _id: oid(req.params.id), owner });
  if (!c) fail(404, 'not_found');
  if (b.unsubscribed === false && c!.unsubscribed) fail(400, 'resubscribe_requires_new_opt_in', 'Contacts who unsubscribed must opt in again themselves.');
  Object.assign(c!, b);
  await c!.save();
  if (b.consent) await ConsentRecord.create({ owner, contact: c!._id, status: b.consent, source: 'manual_update' });
  res.json({ contact: ser(c) });
});

r.delete('/contacts/:id', async (req, res) => {
  await BContact.deleteOne({ _id: oid(req.params.id), owner: myId(res) });
  res.status(204).end();
});

// CSV import: header must include name and phone and/or email; optional tags (semicolon separated), consent (yes/no).
r.post('/contacts/import', async (req, res) => {
  const owner = myId(res);
  rateCheck(`import:${owner}`, 20, 3600_000);
  const { csv, commit } = z.object({ csv: z.string().max(500_000), commit: z.boolean().default(false) }).parse(req.body);
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) fail(400, 'csv_empty', 'CSV needs a header row and at least one contact.');
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  if (!header.includes('name') || (!header.includes('phone') && !header.includes('email'))) fail(400, 'csv_header', 'Header must include name and phone or email.');
  if (lines.length > 2001) fail(400, 'csv_too_large', 'Import up to 2000 contacts at a time.');
  const existing = await BContact.find({ owner }, { phone: 1, email: 1 }).lean();
  const seenP = new Set(existing.map((e) => e.phone).filter(Boolean));
  const seenE = new Set(existing.map((e) => e.email).filter(Boolean));
  const rows = lines.slice(1).map((line, i) => {
    const cells = line.split(',').map((c) => c.trim());
    const get = (k: string) => cells[header.indexOf(k)] ?? '';
    const name = get('name');
    const v = validateRow({ phone: get('phone'), email: get('email') });
    let status = 'valid'; let error = v.error;
    if (!name) { status = 'invalid'; error = 'name_required'; }
    else if (v.error) status = 'invalid';
    else if ((v.phone && seenP.has(v.phone)) || (v.email && seenE.has(v.email))) { status = 'duplicate'; error = 'duplicate'; }
    if (status === 'valid') { if (v.phone) seenP.add(v.phone); if (v.email) seenE.add(v.email); }
    const consent = ['yes', 'true', 'opted_in', 'y'].includes(get('consent').toLowerCase()) ? 'opted_in' : 'pending';
    return { line: i + 2, name, phone: v.phone, email: v.email, tags: get('tags').split(';').map((t) => t.trim().toLowerCase()).filter(Boolean), consent, status, error };
  });
  const summary = { valid: rows.filter((r) => r.status === 'valid').length, invalid: rows.filter((r) => r.status === 'invalid').length, duplicate: rows.filter((r) => r.status === 'duplicate').length };
  if (commit) {
    const valid = rows.filter((r) => r.status === 'valid');
    const created = await BContact.insertMany(valid.map((v) => ({ owner, name: v.name, phone: v.phone, email: v.email, tags: v.tags, consent: v.consent })));
    await ConsentRecord.insertMany(created.map((c) => ({ owner, contact: c._id, status: c.consent, source: 'csv_import' })));
    audit(owner, 'contacts_imported', undefined, summary);
  }
  res.json({ summary, rows: rows.slice(0, 200), committed: commit });
});

// ---- Segments & templates ----
r.get('/segments', async (_req, res) => {
  const segs = await Segment.find({ owner: myId(res) }).lean();
  const out = await Promise.all(segs.map(async (s) => ({ ...ser(s), size: await BContact.countDocuments({ owner: myId(res), tags: { $in: s.tags }, consent: 'opted_in', unsubscribed: false }) })));
  res.json({ segments: out });
});
r.post('/segments', async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(60), tags: z.array(z.string().trim().toLowerCase()).min(1).max(10) }).parse(req.body);
  res.status(201).json({ segment: ser(await Segment.create({ ...b, owner: myId(res) })) });
});
r.get('/templates', async (_req, res) => { res.json({ templates: ser(await Template.find({ owner: myId(res) }).lean()) }); });
r.post('/templates', async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(2000) }).parse(req.body);
  res.status(201).json({ template: ser(await Template.create({ ...b, owner: myId(res) })) });
});

// ---- Campaigns ----
async function recipientsOf(c: any) {
  const base: any = { owner: c.owner };
  if (c.segment) { const s = await Segment.findById(c.segment).lean(); base.tags = { $in: s?.tags ?? [] }; }
  else if (c.contactIds?.length) base._id = { $in: c.contactIds };
  const all = await BContact.find(base).lean();
  const eligible = all.filter((x) => x.consent === 'opted_in' && !x.unsubscribed);
  return { all, eligible, suppressed: all.length - eligible.length };
}

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(80), type: z.enum(['text', 'image', 'video', 'link', 'product']), body: z.string().max(2000).default(''),
  mediaId: z.string().optional(), link: z.string().url().optional().or(z.literal('')), product: z.object({ title: z.string().max(80), price: z.string().max(20) }).optional(),
  segmentId: z.string().optional(), contactIds: z.array(z.string()).max(1000).optional(), scheduledAt: z.string().datetime().optional().nullable(),
});

r.get('/campaigns', async (_req, res) => {
  const list = await Campaign.find({ owner: myId(res) }).sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ campaigns: ser(list) });
});

r.post('/campaigns', async (req, res) => {
  const owner = myId(res);
  const b = campaignSchema.parse(req.body);
  const c = await Campaign.create({ owner, name: b.name, type: b.type, body: b.body, link: b.link || undefined, product: b.product, segment: b.segmentId ? oid(b.segmentId) : undefined, contactIds: (b.contactIds ?? []).map(oid), scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : undefined });
  if (b.mediaId) { c.media = (await attachMedia(owner, b.mediaId, 'campaign', String(c._id))) as any; await c.save(); }
  res.status(201).json({ campaign: ser(c) });
});

r.get('/campaigns/:id', async (req, res) => {
  const c = await Campaign.findOne({ _id: oid(req.params.id), owner: myId(res) }).lean();
  if (!c) fail(404, 'not_found');
  const { all, eligible, suppressed } = await recipientsOf(c);
  const deliveries = await CampaignDelivery.find({ campaign: c!._id }).populate('contact', 'name phone email').lean();
  res.json({ campaign: ser(c), audience: { total: all.length, eligible: eligible.length, suppressed }, deliveries: ser(deliveries) });
});

r.delete('/campaigns/:id', async (req, res) => {
  const c = await Campaign.findOne({ _id: oid(req.params.id), owner: myId(res) });
  if (!c) fail(404, 'not_found');
  if (!['draft', 'scheduled', 'pending_approval'].includes(c!.status)) fail(400, 'cannot_delete_sent');
  await c!.deleteOne();
  res.status(204).end();
});

// Submit: validates consent, limits, confirmation and approval. Sends now or schedules.
r.post('/campaigns/:id/submit', async (req, res) => {
  const owner = myId(res);
  const { confirm } = z.object({ confirm: z.boolean().default(false) }).parse(req.body ?? {});
  const c = await Campaign.findOne({ _id: oid(req.params.id), owner });
  if (!c) fail(404, 'not_found');
  if (!['draft', 'pending_approval'].includes(c!.status)) fail(400, 'already_submitted');
  if (!c!.body.trim() && !c!.media?.id) fail(400, 'empty_campaign');
  const { eligible } = await recipientsOf(c);
  if (!eligible.length) fail(400, 'no_eligible_recipients', 'No opted-in, subscribed contacts in this audience.');
  if (eligible.length > envNum('MAX_CAMPAIGN_RECIPIENTS')) fail(400, 'too_many_recipients');
  const since = new Date(Date.now() - 86400_000);
  const sentToday = await CampaignDelivery.countDocuments({ campaign: { $in: (await Campaign.find({ owner, sentAt: { $gt: since } }, { _id: 1 }).lean()).map((x) => x._id) } });
  if (sentToday + eligible.length > envNum('DAILY_SEND_LIMIT')) fail(429, 'daily_limit', 'Daily sending limit reached.');
  if (eligible.length > envNum('LARGE_CAMPAIGN_THRESHOLD') && !confirm) return res.status(409).json({ error: 'confirmation_required', recipients: eligible.length });
  c!.recipientCount = eligible.length;
  if (eligible.length > envNum('APPROVAL_THRESHOLD') && !c!.approvedAt) {
    c!.status = 'pending_approval'; await c!.save();
    return res.json({ campaign: ser(c) });
  }
  if (c!.scheduledAt && c!.scheduledAt > new Date()) { c!.status = 'scheduled'; await c!.save(); return res.json({ campaign: ser(c) }); }
  await runCampaign(c);
  res.json({ campaign: ser(await Campaign.findById(c!._id).lean()) });
});

r.post('/campaigns/:id/approve', async (req, res) => {
  const c = await Campaign.findOne({ _id: oid(req.params.id), owner: myId(res), status: 'pending_approval' });
  if (!c) fail(404, 'not_found');
  c!.approvedAt = new Date(); c!.status = 'draft'; await c!.save();
  audit(myId(res), 'campaign_approved', String(c!._id));
  res.json({ campaign: ser(c) });
});

// Delivery: VYBE-native announcement to matched VYBE users. External providers are not configured,
// so non-VYBE contacts are recorded as failed with an honest reason.
export async function runCampaign(c: any) {
  c.status = 'sending'; await c.save();
  const owner = await User.findById(c.owner);
  const { eligible, all } = await recipientsOf(c);
  for (const contact of all.filter((x) => !eligible.includes(x))) await CampaignDelivery.create({ campaign: c._id, contact: contact._id, status: 'suppressed', error: contact.unsubscribed ? 'unsubscribed' : 'no_consent' });
  for (const contact of eligible) {
    const user = await User.findOne({ $or: [contact.email ? { email: contact.email } : null, contact.phone ? { phone: contact.phone } : null].filter(Boolean) as any });
    if (!user || user.blocked.some((b) => b.equals(c.owner))) {
      await CampaignDelivery.create({ campaign: c._id, contact: contact._id, channel: 'external', status: 'failed', error: user ? 'recipient_blocked_sender' : 'external_provider_not_configured' });
      continue;
    }
    let conv = await Conversation.findOne({ type: 'broadcast', 'members.user': { $all: [c.owner, user._id] } });
    if (!conv) conv = await Conversation.create({ type: 'broadcast', createdBy: c.owner, name: owner!.name, members: [{ user: c.owner, role: 'owner' }, { user: user._id }] });
    const d = await CampaignDelivery.create({ campaign: c._id, contact: contact._id, channel: 'vybe', status: 'queued', recipientUser: user._id });
    const msg = await sendMessage(conv, owner, { clientId: `camp-${c._id}-${contact._id}`, type: 'text', text: c.body || c.name }, {
      type: 'campaign', media: c.media?.id ? c.media : undefined, campaign: { title: c.product?.title || c.name, link: c.link, price: c.product?.price, campaignId: String(c._id), deliveryId: String(d._id) },
    });
    d.status = 'delivered'; d.message = msg._id; await d.save();
  }
  c.status = 'completed'; c.sentAt = new Date(); await c.save();
  audit(c.owner, 'campaign_sent', String(c._id), { recipients: eligible.length });
}

export async function processScheduled() {
  const due = await Campaign.find({ status: 'scheduled', scheduledAt: { $lte: new Date() } }).limit(5);
  for (const c of due) await runCampaign(c).catch(async (e) => { console.error('[campaign]', e); c.status = 'failed'; await c.save(); });
}

r.get('/analytics', async (_req, res) => {
  const owner = myId(res);
  const camps = await Campaign.find({ owner }, { _id: 1, name: 1, status: 1, sentAt: 1 }).lean();
  const ids = camps.map((c) => c._id);
  const ds = await CampaignDelivery.find({ campaign: { $in: ids } }).lean();
  const msgIds = ds.filter((d) => d.message).map((d) => d.message);
  const read = await Message.countDocuments({ _id: { $in: msgIds }, 'readBy.0': { $exists: true } });
  const [contacts, optedIn, unsub] = await Promise.all([BContact.countDocuments({ owner }), BContact.countDocuments({ owner, consent: 'opted_in', unsubscribed: false }), BContact.countDocuments({ owner, unsubscribed: true })]);
  const count = (s: string) => ds.filter((d) => d.status === s).length;
  res.json({ campaigns: camps.length, sent: camps.filter((c) => c.status === 'completed').length, deliveries: ds.length, delivered: count('delivered'), read, failed: count('failed'), suppressed: count('suppressed'), contacts, optedIn, unsubscribed: unsub });
});

// Recipient-side unsubscribe from a VYBE announcement.
r.post('/unsubscribe', async (req, res) => {
  const { messageId } = z.object({ messageId: z.string() }).parse(req.body);
  const msg = await Message.findById(oid(messageId));
  if (!msg?.campaign?.deliveryId) fail(404, 'not_found');
  const d = await CampaignDelivery.findOne({ _id: oid(msg!.campaign!.deliveryId!), recipientUser: myId(res) });
  if (!d) fail(403, 'forbidden');
  const contact = await BContact.findByIdAndUpdate(d!.contact, { unsubscribed: true, consent: 'opted_out' });
  await ConsentRecord.create({ owner: contact!.owner, contact: d!.contact, status: 'unsubscribed', source: 'recipient_unsubscribe' });
  res.status(204).end();
});

export default r;
