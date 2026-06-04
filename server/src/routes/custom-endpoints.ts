import { Router, Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { encrypt, decrypt, maskKey } from '../lib/crypto.js';

export const customEndpointsRouter = Router();

customEndpointsRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const keys = db.prepare("SELECT * FROM api_keys WHERE platform = 'custom'").all() as any[];
  res.json(keys.map(k => {
    let masked = '****';
    try { masked = maskKey(decrypt(k.encrypted_key, k.iv, k.auth_tag)); } catch {}
    return { id: k.id, label: k.label, base_url: k.base_url, masked_key: masked, enabled: k.enabled === 1, status: k.status };
  }));
});

customEndpointsRouter.post('/', (req: Request, res: Response) => {
  const { label, base_url, api_key } = req.body;
  if (!base_url) { res.status(400).json({ error: { message: 'base_url required' } }); return; }
  const db = getDb();
  const { encrypted, iv, authTag } = encrypt(api_key || 'no-key');
  const r = db.prepare("INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, base_url, status, enabled) VALUES ('custom', ?, ?, ?, ?, ?, 'unknown', 1)").run(label || base_url, encrypted, iv, authTag, base_url.replace(/\/v1$/, ''));
  res.json({ id: r.lastInsertRowid });
});

customEndpointsRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  db.prepare("DELETE FROM api_keys WHERE id = ? AND platform = 'custom'").run(req.params.id);
  res.json({ ok: true });
});

customEndpointsRouter.patch('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const { enabled } = req.body;
  if (enabled !== undefined) db.prepare("UPDATE api_keys SET enabled = ? WHERE id = ? AND platform = 'custom'").run(enabled ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

customEndpointsRouter.post('/:id/test', async (req: Request, res: Response) => {
  const db = getDb();
  const key = db.prepare("SELECT * FROM api_keys WHERE id = ? AND platform = 'custom'").get(req.params.id) as any;
  if (!key) { res.status(404).json({ error: { message: 'Not found' } }); return; }
  try {
    const realKey = decrypt(key.encrypted_key, key.iv, key.auth_tag);
    const r = await fetch(key.base_url + '/v1/models', { headers: { Authorization: 'Bearer ' + realKey }, signal: AbortSignal.timeout(10000) });
    const ok = r.ok;
    db.prepare("UPDATE api_keys SET status = ?, last_checked_at = datetime('now') WHERE id = ?").run(ok ? 'healthy' : 'error', key.id);
    res.json({ ok, status: ok ? 'healthy' : 'error' });
  } catch (e: any) {
    db.prepare("UPDATE api_keys SET status = 'error', last_checked_at = datetime('now') WHERE id = ?").run(key.id);
    res.json({ ok: false, status: 'error', error: e.message });
  }
});

customEndpointsRouter.post('/:id/fetch-models', async (req: Request, res: Response) => {
  const db = getDb();
  const key = db.prepare("SELECT * FROM api_keys WHERE id = ? AND platform = 'custom'").get(req.params.id) as any;
  if (!key) { res.status(404).json({ error: { message: 'Not found' } }); return; }
  try {
    const realKey = decrypt(key.encrypted_key, key.iv, key.auth_tag);
    const r = await fetch(key.base_url + '/v1/models', { headers: { Authorization: 'Bearer ' + realKey }, signal: AbortSignal.timeout(10000) });
    const data: any = await r.json();
    const models = (data.data || []).map((m: any) => m.id);
    const ins = db.prepare("INSERT OR IGNORE INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, context_window, enabled, supports_vision) VALUES ('custom', ?, ?, 50, 50, NULL, 1, 0)");
    const maxPri = db.prepare('SELECT COALESCE(MAX(priority),0) as max FROM fallback_config').get() as any;
    let nextPri = maxPri.max + 1;
    const insFb = db.prepare('INSERT OR IGNORE INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');
    for (const mid of models) {
      const rr = ins.run(mid, mid);
      if (rr.changes > 0) {
        const row = db.prepare("SELECT id FROM models WHERE platform = 'custom' AND model_id = ?").get(mid) as any;
        if (row) insFb.run(row.id, nextPri++);
      }
    }
    res.json({ models });
  } catch (e: any) {
    res.status(500).json({ error: { message: e.message } });
  }
});
