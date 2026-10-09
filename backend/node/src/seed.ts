// DEV-ONLY demo data. Runs only when SEED_DEMO=true. Demo records are flagged isDemo.
import bcrypt from 'bcryptjs';
import { User, Conversation, Message, Story, Community, CommunityMember, Channel, CommunityMessage, BContact, ConsentRecord, Segment, Template } from './models.ts';

const AV = (id: string) => `https://images.unsplash.com/${id}?w=200&h=200&fit=crop&q=70`;
const PEOPLE = [
  { name: 'Priya Sharma', email: 'demo@vybe.app', phone: '+919900000001', avatar: AV('photo-1494790108377-be9c29b29330'), admin: true },
  { name: 'Aarav Rao', email: 'aarav@vybe.app', phone: '+919900000002', avatar: AV('photo-1500648767791-00dcc994a43e') },
  { name: 'Sneha Iyer', email: 'sneha@vybe.app', phone: '+919900000003', avatar: AV('photo-1573497019940-1c28c88b4f3e') },
  { name: 'Rohan Gowda', email: 'rohan@vybe.app', phone: '+919900000004', avatar: AV('photo-1506794778202-cad84cf45f1d') },
  { name: 'Ananya Hegde', email: 'ananya@vybe.app', phone: '+919900000005', avatar: AV('photo-1580489944761-15a19d654956') },
];

export async function seedDemo() {
  if (await User.exists({ email: 'demo@vybe.app' })) return;
  const passwordHash = await bcrypt.hash('VybeDemo123!', 10);
  const users = await User.insertMany(PEOPLE.map((p, i) => ({ name: p.name, email: p.email, phone: p.phone, avatar: p.avatar, username: p.email.split('@')[0], passwordHash, isDemo: true, isAdmin: !!p.admin, privacy: { messageRequests: 'everyone', storyAudience: 'contacts', readReceipts: true }, closeFriends: i === 0 ? [] : [] })));
  const [me, aarav, sneha, rohan, ananya] = users;
  const now = Date.now();
  const mins = (m: number) => new Date(now - m * 60_000);
  const direct = async (other: any, msgs: [any, string, number][]) => {
    const c = await Conversation.create({ type: 'direct', createdBy: me._id, members: [{ user: me._id, lastReadAt: mins(5000) }, { user: other._id, lastReadAt: new Date() }] });
    await addMsgs(c, msgs);
    return c;
  };
  const addMsgs = async (c: any, msgs: [any, string, number][]) => {
    let last: any;
    for (const [i, [sender, text, ago]] of msgs.entries()) {
      last = await Message.create({ conversation: c._id, sender: sender._id, clientId: `seed-${c._id}-${i}`, text, createdAt: mins(ago), updatedAt: mins(ago), deliveredTo: c.members.map((m: any) => m.user), readBy: sender._id.equals(me._id) ? c.members.map((m: any) => m.user).filter((u: any) => !u.equals(me._id)) : [] });
    }
    await Conversation.updateOne({ _id: c._id }, { lastMessage: { text: last.text, type: 'text', sender: last.sender, at: last.createdAt }, updatedAt: last.createdAt }, { timestamps: false });
  };
  await direct(aarav, [[me, 'Hey Aarav! Long time', 200], [aarav, 'Haha yes! Busy with the new project', 190], [aarav, 'Hey! Are you coming today?', 30]]);
  await direct(sneha, [[sneha, 'Did you see the new design?', 900], [me, 'Yes, looks premium!', 880]]);
  const fam = await Conversation.create({ type: 'group', name: 'Family', createdBy: me._id, members: [{ user: me._id, role: 'owner', lastReadAt: mins(5000), favorite: true }, { user: ananya._id }, { user: rohan._id }] });
  await addMsgs(fam, [[ananya, 'Mom: Dinner at 8', 60]]);
  const team = await Conversation.create({ type: 'group', name: 'Project Team', createdBy: sneha._id, members: [{ user: sneha._id, role: 'owner' }, { user: me._id, lastReadAt: new Date() }, { user: aarav._id }, { user: rohan._id }] });
  await addMsgs(team, [[sneha, 'Sneha: UI looks great!', 1500]]);
  const travel = await Conversation.create({ type: 'group', name: 'Travel Buddies', createdBy: rohan._id, members: [{ user: rohan._id, role: 'owner' }, { user: me._id, lastReadAt: new Date() }, { user: aarav._id }] });
  await addMsgs(travel, [[rohan, 'Plan for Coorg next weekend?', 1600]]);

  const IMG = (id: string) => `https://images.unsplash.com/${id}?w=800&q=70`;
  const exp = new Date(now + 20 * 3600_000);
  await Story.insertMany([
    { user: aarav._id, type: 'image', externalUrl: IMG('photo-1507525428034-b723cf961d3e'), text: 'Sunset', location: 'Nandi Hills', audience: 'contacts', expiresAt: exp, createdAt: mins(120) },
    { user: sneha._id, type: 'image', externalUrl: IMG('photo-1495474472287-4d71bcdd2085'), text: 'Coffee Time', audience: 'contacts', expiresAt: exp, createdAt: mins(600) },
    { user: sneha._id, type: 'text', text: 'Good Vibes Only', bg: '#6E0901', audience: 'contacts', expiresAt: exp, createdAt: mins(300) },
    { user: rohan._id, type: 'image', externalUrl: IMG('photo-1506905925346-21bda4d32df4'), text: 'Work Mode', audience: 'everyone', expiresAt: exp, createdAt: mins(900) },
    { user: ananya._id, type: 'image', externalUrl: IMG('photo-1504674900247-0877df9cc836'), text: 'Food', audience: 'everyone', expiresAt: exp, createdAt: mins(400) },
  ]);

  const COV = (id: string) => `https://images.unsplash.com/${id}?w=400&q=70`;
  const comms = [
    { name: 'Kannada Tech Space', category: 'tech', language: 'kn', description: 'Learn, discuss and build in Kannada — from basics to advanced.', icon: COV('photo-1519389950473-47ba0277781c'), featured: true },
    { name: 'Freelancers Hub', category: 'jobs', description: 'Projects, clients, tools and support for freelancers.', icon: COV('photo-1497366216548-37526070297c') },
    { name: 'Exam Prep Circle', category: 'learning', description: 'Study groups, notes, doubt solving and mock tests.', icon: COV('photo-1434030216411-0b793f4b4173'), featured: true },
    { name: 'Creators Club', category: 'creators', description: 'For creators, influencers and storytellers.', icon: COV('photo-1492691527719-9d1e07e534b4') },
    { name: 'Bengaluru Founders', category: 'business', description: 'Private network for early-stage founders.', icon: COV('photo-1556761175-5973dc0f32e7'), isPrivate: true },
    { name: 'Mindful Living', category: 'lifestyle', description: 'Wellness, fitness and slow living.', icon: COV('photo-1506126613408-eca07ce68773') },
  ];
  for (const [i, cd] of comms.entries()) {
    const owner = [aarav, sneha, rohan, ananya, aarav, sneha][i];
    const c: any = await Community.create({ ...(cd as any), owner: owner._id, memberCount: 1 });
    await CommunityMember.create({ community: c._id, user: owner._id, role: 'owner' });
    const chans = await Channel.insertMany([{ community: c._id, name: 'announcements', kind: 'announcement' }, { community: c._id, name: 'general', kind: 'discussion' }, { community: c._id, name: 'resources', kind: 'resources' }]);
    await CommunityMessage.create({ community: c._id, channel: chans[0]._id, sender: owner._id, text: `Welcome to ${cd.name}! Please read the community guidelines.`, pinned: true });
    await CommunityMessage.create({ community: c._id, channel: chans[1]._id, sender: owner._id, text: 'Introduce yourself here 👋' });
    if (i === 2) {
      await CommunityMember.create({ community: c._id, user: me._id, role: 'member' });
      await Community.updateOne({ _id: c._id }, { $inc: { memberCount: 1 } });
      await CommunityMessage.create({ community: c._id, channel: chans[1]._id, sender: owner._id, text: '', poll: { question: 'Which mock test this Sunday?', options: [{ text: 'Quant', votes: [] }, { text: 'Reasoning', votes: [] }, { text: 'English', votes: [] }] } });
    }
  }

  const contacts = await BContact.insertMany([
    { owner: me._id, name: 'Aarav Rao', email: 'aarav@vybe.app', phone: '+919900000002', tags: ['customers', 'vip'], consent: 'opted_in' },
    { owner: me._id, name: 'Sneha Iyer', email: 'sneha@vybe.app', tags: ['customers'], consent: 'opted_in' },
    { owner: me._id, name: 'Kiran Kumar', phone: '+919811111111', tags: ['customers'], consent: 'opted_in' },
    { owner: me._id, name: 'Meera Nair', phone: '+919822222222', tags: ['leads'], consent: 'pending' },
  ]);
  await ConsentRecord.insertMany(contacts.map((c) => ({ owner: me._id, contact: c._id, status: c.consent, source: 'seed_demo' })));
  await Segment.create({ owner: me._id, name: 'Customers', tags: ['customers'] });
  await Template.create({ owner: me._id, name: 'Festive offer', body: 'Happy festive season! Enjoy 20% off this week.' });
  console.log('[seed] demo data created');
}
