// VYBE data model (Mongoose). Schema version: 1. See /app/backend/node/README.md for change procedure.
import mongoose from 'mongoose';
const { Schema } = mongoose;
const Id = Schema.Types.ObjectId;

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, sparse: true, index: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  username: { type: String, unique: true, sparse: true, lowercase: true },
  avatar: String, // media id or external url (demo only)
  bio: { type: String, maxlength: 160, default: '' },
  language: { type: String, default: 'en' },
  theme: { type: String, default: 'system' },
  privacy: {
    readReceipts: { type: Boolean, default: true },
    messageRequests: { type: String, enum: ['everyone', 'requests'], default: 'requests' },
    storyAudience: { type: String, enum: ['everyone', 'contacts', 'close_friends'], default: 'contacts' },
  },
  contentFilter: { type: Boolean, default: true },
  twoStep: { enabled: { type: Boolean, default: false }, pinHash: String },
  closeFriends: [{ type: Id, ref: 'User' }],
  blocked: [{ type: Id, ref: 'User' }],
  mutedStories: [{ type: Id, ref: 'User' }],
  failedLogins: { type: Number, default: 0 },
  lockedUntil: Date,
  isAdmin: { type: Boolean, default: false },
  isDemo: { type: Boolean, default: false },
}, { timestamps: true });
userSchema.index({ name: 'text', username: 'text' });
export const User = mongoose.model('User', userSchema);

const sessionSchema = new Schema({
  userId: { type: Id, ref: 'User', required: true, index: true },
  jti: { type: String, required: true, unique: true },
  tokenHash: { type: String, required: true },
  device: String,
  lastSeenAt: Date,
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
}, { timestamps: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = mongoose.model('Session', sessionSchema);

const memberSchema = new Schema({
  user: { type: Id, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
  lastReadAt: { type: Date, default: Date.now },
  muted: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  favorite: { type: Boolean, default: false },
  request: { type: Boolean, default: false },
}, { _id: false });

const conversationSchema = new Schema({
  type: { type: String, enum: ['direct', 'group', 'broadcast'], required: true },
  name: String,
  avatar: String,
  description: String,
  members: [memberSchema],
  createdBy: { type: Id, ref: 'User' },
  lastMessage: { text: String, type: { type: String }, sender: { type: Id, ref: 'User' }, at: Date },
  pinnedMessage: { type: Id, ref: 'Message' },
  disappearingSeconds: { type: Number, default: 0 },
  onlyAdminsCanPost: { type: Boolean, default: false },
}, { timestamps: true });
conversationSchema.index({ 'members.user': 1, updatedAt: -1 });
export const Conversation = mongoose.model('Conversation', conversationSchema);

const mediaRef = { id: String, mime: String, name: String, size: Number, duration: Number };
const messageSchema = new Schema({
  conversation: { type: Id, ref: 'Conversation', required: true },
  sender: { type: Id, ref: 'User', required: true },
  clientId: { type: String, required: true },
  type: { type: String, enum: ['text', 'image', 'video', 'audio', 'file', 'system', 'campaign', 'snap'], default: 'text' },
  text: { type: String, maxlength: 4000, default: '' },
  media: mediaRef,
  campaign: { title: String, link: String, price: String, campaignId: String, deliveryId: String },
  replyTo: { type: Id, ref: 'Message' },
  reactions: [{ user: { type: Id, ref: 'User' }, emoji: String, _id: false }],
  forwarded: { type: Boolean, default: false },
  forwardCount: { type: Number, default: 0 },
  deliveredTo: [{ type: Id, ref: 'User' }],
  readBy: [{ type: Id, ref: 'User' }],
  viewOnce: { type: Boolean, default: false },
  editedAt: Date,
  deletedAt: Date,
  expiresAt: Date,
}, { timestamps: true });
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, updatedAt: 1 });
messageSchema.index({ sender: 1, clientId: 1 }, { unique: true });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ text: 'text' });
export const Message = mongoose.model('Message', messageSchema);

const mediaSchema = new Schema({
  owner: { type: Id, ref: 'User', required: true },
  path: { type: String, required: true },
  mime: String, size: Number, name: String,
  scope: { type: String, enum: ['private', 'public'], default: 'private' },
  refs: [{ kind: String, id: String, _id: false }],
}, { timestamps: true });
export const Media = mongoose.model('Media', mediaSchema);

const storySchema = new Schema({
  user: { type: Id, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['text', 'image', 'video'], required: true },
  text: { type: String, maxlength: 500, default: '' },
  bg: String,
  media: mediaRef,
  externalUrl: String, // demo seed only
  location: String,
  audience: { type: String, enum: ['everyone', 'contacts', 'close_friends'], default: 'contacts' },
  views: [{ user: { type: Id, ref: 'User' }, at: Date, _id: false }],
  reactions: [{ user: { type: Id, ref: 'User' }, emoji: String, _id: false }],
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Story = mongoose.model('Story', storySchema);

const communitySchema = new Schema({
  name: { type: String, required: true, maxlength: 80 },
  description: { type: String, maxlength: 500, default: '' },
  category: { type: String, enum: ['learning', 'tech', 'jobs', 'creators', 'business', 'lifestyle'], required: true },
  language: { type: String, default: 'en' },
  cover: String,
  icon: String,
  isPrivate: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  owner: { type: Id, ref: 'User', required: true },
  memberCount: { type: Number, default: 0 },
}, { timestamps: true });
communitySchema.index({ name: 'text', description: 'text' }, { language_override: 'textLang' });
export const Community = mongoose.model('Community', communitySchema);

const cmemberSchema = new Schema({
  community: { type: Id, ref: 'Community', required: true },
  user: { type: Id, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'admin', 'moderator', 'member'], default: 'member' },
  status: { type: String, enum: ['active', 'pending', 'invited', 'banned'], default: 'active' },
}, { timestamps: true });
cmemberSchema.index({ community: 1, user: 1 }, { unique: true });
export const CommunityMember = mongoose.model('CommunityMember', cmemberSchema);

const channelSchema = new Schema({
  community: { type: Id, ref: 'Community', required: true, index: true },
  name: { type: String, required: true, maxlength: 40 },
  kind: { type: String, enum: ['announcement', 'discussion', 'resources'], default: 'discussion' },
}, { timestamps: true });
export const Channel = mongoose.model('Channel', channelSchema);

const cmessageSchema = new Schema({
  community: { type: Id, ref: 'Community', required: true },
  channel: { type: Id, ref: 'Channel', required: true },
  sender: { type: Id, ref: 'User', required: true },
  text: { type: String, maxlength: 4000, default: '' },
  media: mediaRef,
  poll: { question: String, options: [{ text: String, votes: [{ type: Id, ref: 'User' }] }] },
  pinned: { type: Boolean, default: false },
  reactions: [{ user: { type: Id, ref: 'User' }, emoji: String, _id: false }],
  deletedAt: Date,
}, { timestamps: true });
cmessageSchema.index({ channel: 1, createdAt: -1 });
cmessageSchema.index({ text: 'text' });
export const CommunityMessage = mongoose.model('CommunityMessage', cmessageSchema);

const reportSchema = new Schema({
  reporter: { type: Id, ref: 'User', required: true },
  targetType: { type: String, enum: ['user', 'message', 'story', 'community', 'community_message', 'conversation'], required: true },
  targetId: { type: String, required: true },
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['open', 'reviewing', 'actioned', 'dismissed'], default: 'open' },
}, { timestamps: true });
export const Report = mongoose.model('Report', reportSchema);

const contactSchema = new Schema({
  owner: { type: Id, ref: 'User', required: true },
  name: { type: String, required: true },
  phone: String,
  email: String,
  tags: [String],
  fields: { type: Map, of: String },
  consent: { type: String, enum: ['opted_in', 'pending', 'opted_out'], default: 'pending' },
  unsubscribed: { type: Boolean, default: false },
}, { timestamps: true });
contactSchema.index({ owner: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
contactSchema.index({ owner: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
export const BContact = mongoose.model('BContact', contactSchema);

export const ConsentRecord = mongoose.model('ConsentRecord', new Schema({
  owner: { type: Id, ref: 'User', required: true },
  contact: { type: Id, ref: 'BContact', required: true },
  status: { type: String, required: true },
  source: String,
}, { timestamps: true }));

export const Segment = mongoose.model('Segment', new Schema({
  owner: { type: Id, ref: 'User', required: true },
  name: { type: String, required: true },
  tags: [String],
}, { timestamps: true }));

export const Template = mongoose.model('Template', new Schema({
  owner: { type: Id, ref: 'User', required: true },
  name: { type: String, required: true },
  body: { type: String, required: true, maxlength: 2000 },
}, { timestamps: true }));

export const Campaign = mongoose.model('Campaign', new Schema({
  owner: { type: Id, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['text', 'image', 'video', 'link', 'product'], default: 'text' },
  body: { type: String, default: '', maxlength: 2000 },
  media: mediaRef,
  link: String,
  product: { title: String, price: String },
  segment: { type: Id, ref: 'Segment' },
  contactIds: [{ type: Id, ref: 'BContact' }],
  status: { type: String, enum: ['draft', 'pending_approval', 'scheduled', 'sending', 'completed', 'failed'], default: 'draft' },
  scheduledAt: Date,
  approvedAt: Date,
  sentAt: Date,
  recipientCount: Number,
}, { timestamps: true }));

const deliverySchema = new Schema({
  campaign: { type: Id, ref: 'Campaign', required: true, index: true },
  contact: { type: Id, ref: 'BContact', required: true },
  channel: { type: String, enum: ['vybe', 'external'], default: 'vybe' },
  status: { type: String, enum: ['queued', 'delivered', 'read', 'failed', 'suppressed'], default: 'queued' },
  error: String,
  message: { type: Id, ref: 'Message' },
  recipientUser: { type: Id, ref: 'User' },
}, { timestamps: true });
export const CampaignDelivery = mongoose.model('CampaignDelivery', deliverySchema);

export const AuditEvent = mongoose.model('AuditEvent', new Schema({
  actor: { type: Id, ref: 'User' },
  action: { type: String, required: true },
  target: String,
  meta: Schema.Types.Mixed,
}, { timestamps: true }));
