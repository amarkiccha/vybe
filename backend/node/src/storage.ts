// Emergent managed object storage client. All reads/writes go through the VYBE API (no public URLs).
import { env } from './lib.ts';

const base = () => ((process.env.INTEGRATION_PROXY_URL || '').trim() || 'https://integrations.emergentagent.com').replace(/\/$/, '') + '/objstore/api/v1/storage';
let storageKey: string | null = null;

async function init(force = false) {
  if (storageKey && !force) return storageKey;
  const r = await fetch(`${base()}/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emergent_key: env('EMERGENT_LLM_KEY') }) });
  if (!r.ok) throw new Error(`storage init failed ${r.status}`);
  storageKey = ((await r.json()) as { storage_key: string }).storage_key;
  return storageKey;
}
export const initStorage = () => init().catch((e) => console.error('[storage]', e.message));

export async function putObject(path: string, data: Buffer, contentType: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = await init(attempt > 0);
    const r = await fetch(`${base()}/objects/${path}`, { method: 'PUT', headers: { 'X-Storage-Key': key, 'Content-Type': contentType }, body: new Uint8Array(data) });
    if (r.ok) return (await r.json()) as { path: string; size: number };
    if (r.status === 402) throw Object.assign(new Error('storage_quota'), { status: 402 });
    if (r.status !== 503) throw new Error(`storage put ${r.status}`);
  }
  throw new Error('storage unavailable');
}

export async function getObject(path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = await init(attempt > 0);
    const r = await fetch(`${base()}/objects/${path}`, { headers: { 'X-Storage-Key': key } });
    if (r.ok) return { data: Buffer.from(await r.arrayBuffer()), type: r.headers.get('Content-Type') || 'application/octet-stream' };
    if (r.status !== 503) throw new Error(`storage get ${r.status}`);
  }
  throw new Error('storage unavailable');
}
