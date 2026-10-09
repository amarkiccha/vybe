// Run: cd /app/backend/node && node --test test/   (requires the API running; uses API_URL or http://127.0.0.1:8002)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const API = (process.env.API_URL ?? 'http://127.0.0.1:8002') + '/api';
const j = async (path: string, opts: any = {}, token?: string) => {
  const r = await fetch(API + path, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: r.status, data: r.status === 204 ? null : await r.json().catch(() => null) };
};
const login = async (email: string) => (await j('/auth/login', { body: { email, password: 'VybeDemo123!' } })).data.token as string;

test('locales share identical keys', () => {
  const flat = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, p + k + '.') : [p + k]));
  const dir = '/app/frontend/src/locales';
  const en = flat(JSON.parse(fs.readFileSync(`${dir}/en.json`, 'utf8'))).sort();
  for (const l of ['kn', 'hi', 'te', 'ta', 'ml', 'mr', 'bn']) assert.deepEqual(flat(JSON.parse(fs.readFileSync(`${dir}/${l}.json`, 'utf8'))).sort(), en, l);
});

test('protected endpoints require auth', async () => {
  for (const p of ['/conversations', '/stories/feed', '/communities', '/broadcast/contacts']) assert.equal((await j(p)).status, 401);
});

test('messaging persists, dedups and respects blocks', async () => {
  const a = await login('demo@vybe.app');
  const b = await login('rohan@vybe.app');
  const rohan = (await j('/auth/me', {}, b)).data.user.id;
  const conv = (await j('/conversations', { body: { type: 'direct', userId: rohan } }, a)).data.conversation;
  const clientId = `t-${Date.now()}`;
  const m1 = await j(`/conversations/${conv.id}/messages`, { body: { clientId, text: 'ನಮಸ್ಕಾರ' } }, a);
  const m2 = await j(`/conversations/${conv.id}/messages`, { body: { clientId, text: 'ನಮಸ್ಕಾರ' } }, a);
  assert.equal(m1.data.message.id, m2.data.message.id);
  const seen = await j(`/conversations/${conv.id}/messages`, {}, b);
  assert.ok(seen.data.messages.some((m: any) => m.text === 'ನಮಸ್ಕಾರ'));
  await j(`/users/${rohan}/block`, { method: 'POST' }, a);
  assert.equal((await j(`/conversations/${conv.id}/messages`, { body: { clientId: clientId + 'x', text: 'hi' } }, b)).status, 403);
  await j(`/users/${rohan}/block`, { method: 'DELETE' }, a);
});

test('private community hides channels from non-members', async () => {
  const a = await login('ananya@vybe.app');
  const list = (await j('/communities?category=business', {}, a)).data.communities;
  const priv = list.find((c: any) => c.isPrivate);
  const detail = await j(`/communities/${priv.id}`, {}, a);
  assert.equal(detail.data.canRead, false);
  assert.equal(detail.data.channels.length, 0);
});

test('logout revokes session', async () => {
  const t = await login('sneha@vybe.app');
  assert.equal((await j('/auth/logout', { method: 'POST' }, t)).status, 204);
  assert.equal((await j('/auth/me', {}, t)).status, 401);
});
