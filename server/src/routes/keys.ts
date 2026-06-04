import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { resolveProvider } from '../providers/index.js';
import { encrypt, decrypt, maskKey } from '../lib/crypto.js';

export const keysRouter = Router();

// Active providers — must match providers/index.ts registrations + shared/types.ts Platform.
// Moonshot and MiniMax direct integrations were dropped in V4. HuggingFace
// was dropped in V4 and re-added in V13 via the router.huggingface.co route.
const PLATFORMS = [
  'google', 'groq', 'cerebras', 'sambanova', 'nvidia', 'mistral',
  'openrouter', 'github', 'cohere', 'cloudflare', 'zhipu', 'ollama',
  'kilo', 'pollinations', 'llm7', 'huggingface', 'opencode', 'custom',
] as const;

// `key` is optional so keyless providers (Kilo's anonymous gateway) can be added
// without one; the handler enforces a non-empty key for everyone else.
const addKeySchema = z.object({
  platform: z.enum(PLATFORMS),
  key: z.string().optional(),
  label: z.string().optional(),
});

const updateKeySchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().optional(),
}).refine(data => data.enabled !== undefined || data.label !== undefined, {
  message: 'At least one of enabled or label must be provided',
});

// List all keys (masked)
keysRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as any[];

  const keys = rows.map(row => {
    let maskedKey = '****';
    try {
      const realKey = decrypt(row.encrypted_key, row.iv, row.auth_tag);
      maskedKey = maskKey(realKey);
    } catch {
      maskedKey = '[decrypt failed]';
    }
    return {
      id: row.id,
      platform: row.platform,
      label: row.label,
      maskedKey,
      baseUrl: row.base_url ?? null,
      status: row.status,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      lastCheckedAt: row.last_checked_at,
    };
  });

  res.json(keys);
});

// Add a key
keysRouter.post('/', (req: Request, res: Response) => {
  const parsed = addKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const { platform, label } = parsed.data;
  const isKeyless = resolveProvider(platform)?.keyless === true;
  const rawKey = parsed.data.key?.trim() ?? '';

  if (!isKeyless && !rawKey) {
    res.status(400).json({ error: { message: 'key is required' } });
    return;
  }

  // Keyless providers (Kilo anon) store a sentinel so routing sees the platform
  // as configured; the provider omits the auth header on outgoing calls.
  const keyToStore = isKeyless ? (rawKey || 'no-key') : rawKey;

  const db = getDb();

  // A keyless provider needs only one sentinel row — re-enable an existing one
  // instead of piling up duplicates each time the user clicks "Add".
  if (isKeyless) {
    const existing = db.prepare('SELECT id FROM api_keys WHERE platform = ? LIMIT 1').get(platform) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE api_keys SET enabled = 1, status = 'unknown' WHERE id = ?").run(existing.id);
      res.status(200).json({
        id: existing.id,
        platform,
        label: label ?? '',
        maskedKey: maskKey(keyToStore),
        status: 'unknown',
        enabled: true,
      });
      return;
    }
  }

  const { encrypted, iv, authTag } = encrypt(keyToStore);
  const result = db.prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
    VALUES (?, ?, ?, ?, ?, 'unknown', 1)
  `).run(platform, label ?? '', encrypted, iv, authTag);

  const newKeyId = result.lastInsertRowid as number;
  
  // Auto-fetch models in background (don't block response)
  setTimeout(async () => {
    try {
      const provider = resolveProvider(platform);
      if (!provider) return;
      
      let url: string;
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      if (platform === 'google') {
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyToStore}`;
      } else if (platform === 'cohere') {
        url = 'https://api.cohere.ai/compatibility/v1/models';
        headers['Authorization'] = `Bearer ${keyToStore}`;
      } else {
        const baseUrl = provider.baseUrl;
        url = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
        headers['Authorization'] = `Bearer ${keyToStore}`;
      }
      
      const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(30000) });
      if (!response.ok) return;
      
      const data = await response.json() as any;
      let models: string[] = [];
      if (platform === 'google') {
        models = (data.models || []).map((m: any) => m.name?.replace('models/', '') || m.name).filter(Boolean);
      } else {
        models = (data.data || []).map((m: any) => m.id).filter(Boolean);
      }
      
      if (models.length === 0) return;
      
      const insModel = db.prepare("INSERT OR IGNORE INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, context_window, enabled, supports_vision) VALUES (?, ?, ?, 50, 50, NULL, 1, 0)");
      const maxPri = db.prepare('SELECT COALESCE(MAX(priority),0) as max FROM fallback_config').get() as any;
      let nextPri = maxPri.max + 1;
      const insFb = db.prepare('INSERT OR IGNORE INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');
      
      for (const mid of models) {
        const rr = insModel.run(platform, mid, mid);
        if (rr.changes > 0) {
          const row = db.prepare("SELECT id FROM models WHERE platform = ? AND model_id = ?").get(platform, mid) as any;
          if (row) insFb.run(row.id, nextPri++);
        }
      }
      
      db.prepare("UPDATE api_keys SET status = 'healthy', last_checked_at = datetime('now') WHERE id = ?").run(newKeyId);
      console.log(`[Keys] Auto-registered ${models.length} models for ${platform}`);
    } catch (err: any) {
      console.error(`[Keys] Auto-fetch models failed for ${platform}:`, err.message);
    }
  }, 100);
  
  res.status(201).json({
    id: newKeyId,
    platform,
    label: label ?? '',
    maskedKey: maskKey(keyToStore),
    status: 'unknown',
    enabled: true,
  });
});

// ── Custom OpenAI-compatible provider (#117) ──────────────────────────────
// A single user-configured endpoint (llama.cpp / LM Studio / vLLM / Ollama /
// any OpenAI-compatible base_url). The endpoint lives on one 'custom' api_keys
// row; each call registers another model that routes through it.
const customProviderSchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid URL'),
  model: z.string().optional(),
  displayName: z.string().optional(),
  apiKey: z.string().optional(),
  label: z.string().min(1, '供应商名称不能为空'),
});

keysRouter.post('/custom', (req: Request, res: Response) => {
  const parsed = customProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const baseUrl = parsed.data.baseUrl.trim().replace(/\/+$/, '');
  const modelId = parsed.data.model?.trim();
  const displayName = parsed.data.displayName?.trim();
  // Local servers often need no key; keep a sentinel so there's always a bearer.
  const rawKey = parsed.data.apiKey?.trim() || 'no-key';
  const label = parsed.data.label!;

  const db = getDb();

  // Generate unique platform slug from label: "My Ollama" -> "custom_my_ollama"
  const platformSlug = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  
  // Upsert: update if same platform slug exists, otherwise insert new
  const existing = db.prepare("SELECT id FROM api_keys WHERE platform = ? LIMIT 1").get(platformSlug) as { id: number } | undefined;
  let keyId: number;
  if (existing) {
    const { encrypted, iv, authTag } = encrypt(rawKey);
    db.prepare("UPDATE api_keys SET platform = ?, label = ?, encrypted_key = ?, iv = ?, auth_tag = ?, status = 'unknown', enabled = 1 WHERE id = ?")
      .run(platformSlug, label, encrypted, iv, authTag, existing.id);
    keyId = existing.id;
  } else {
    const { encrypted, iv, authTag } = encrypt(rawKey);
    const r = db.prepare(`
      INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, base_url)
      VALUES (?, ?, ?, ?, ?, 'unknown', 1, ?)
    `).run(platformSlug, label, encrypted, iv, authTag, baseUrl);
    keyId = Number(r.lastInsertRowid);
  }

  // If model specified, register it directly
  if (modelId) {
    db.prepare(`
      INSERT OR IGNORE INTO models
        (platform, model_id, display_name, intelligence_rank, speed_rank, size_label,
         rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, context_window, enabled)
      VALUES (?, ?, ?, 50, 50, 'Custom', NULL, NULL, NULL, NULL, '', NULL, 1)
    `).run(platformSlug, modelId, displayName ?? modelId);

    const modelRow = db.prepare("SELECT id FROM models WHERE platform = ? AND model_id = ?").get(platformSlug, modelId) as { id: number };
    const inChain = db.prepare('SELECT 1 FROM fallback_config WHERE model_db_id = ?').get(modelRow.id);
    if (!inChain) {
      const max = db.prepare('SELECT COALESCE(MAX(priority), 0) AS m FROM fallback_config').get() as { m: number };
      db.prepare('INSERT INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)').run(modelRow.id, max.m + 1);
    }

    res.status(201).json({ success: true, keyId, platform: platformSlug, baseUrl, model: modelId, displayName: displayName ?? modelId, maskedKey: maskKey(rawKey) });
  } else {
    // No model specified — auto-fetch from API
    setTimeout(async () => {
      try {
        const modelsUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
        const response = await fetch(modelsUrl, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${rawKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) return;

        const data = await response.json() as any;
        const models = (data.data || []).map((m: any) => m.id).filter(Boolean);
        if (models.length === 0) return;

        const insModel = db.prepare("INSERT OR IGNORE INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, size_label, context_window, enabled, supports_vision) VALUES (?, ?, ?, 50, 50, 'Custom', NULL, 1, 0)");
        const maxPri = db.prepare('SELECT COALESCE(MAX(priority),0) as max FROM fallback_config').get() as any;
        let nextPri = maxPri.max + 1;
        const insFb = db.prepare('INSERT OR IGNORE INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');

        for (const mid of models) {
          const rr = insModel.run(platformSlug, mid, mid);
          if (rr.changes > 0) {
            const row = db.prepare("SELECT id FROM models WHERE platform = ? AND model_id = ?").get(platformSlug, mid) as any;
            if (row) insFb.run(row.id, nextPri++);
          }
        }

        db.prepare("UPDATE api_keys SET status = 'healthy', last_checked_at = datetime('now') WHERE id = ?").run(keyId);
        console.log(`[Keys] Auto-registered ${models.length} custom models from ${baseUrl}`);
      } catch (err: any) {
        console.error('[Keys] Auto-fetch custom models failed:', err.message);
      }
    }, 100);

    res.status(201).json({ success: true, keyId, platform: platformSlug, baseUrl, maskedKey: maskKey(rawKey), autoFetching: true });
  }
});

// Delete a key
keysRouter.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: { message: 'Invalid key ID' } });
    return;
  }

  const db = getDb();
  const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);

  if (result.changes === 0) {
    res.status(404).json({ error: { message: 'Key not found' } });
    return;
  }

  res.json({ success: true });
});

// Toggle all keys for a platform
keysRouter.patch('/platform/:platform', (req: Request, res: Response) => {
  const platform = req.params.platform as string;
  if (!(PLATFORMS as readonly string[]).includes(platform)) {
    res.status(400).json({ error: { message: `Invalid platform '${platform}'` } });
    return;
  }

  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ error: { message: 'enabled must be a boolean' } });
    return;
  }

  const db = getDb();
  const result = db.prepare('UPDATE api_keys SET enabled = ? WHERE platform = ?').run(enabled ? 1 : 0, platform);

  res.json({ success: true, enabled, updatedKeys: result.changes });
});

// Update key (toggle enable/disable or edit label)
keysRouter.patch('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: { message: 'Invalid key ID' } });
    return;
  }

  const parsed = updateKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }

  const { enabled, label } = parsed.data;
  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(enabled ? 1 : 0);
  }
  if (label !== undefined) {
    updates.push('label = ?');
    values.push(label);
  }

  values.push(id);

  const db = getDb();
  const result = db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  if (result.changes === 0) {
    res.status(404).json({ error: { message: 'Key not found' } });
    return;
  }

  const response: Record<string, unknown> = { success: true };
  if (enabled !== undefined) response.enabled = enabled;
  if (label !== undefined) response.label = label;
  res.json(response);
});

// Fetch available models for a specific key
keysRouter.post('/:id/fetch-models', async (req: Request, res: Response) => {
  const keyId = parseInt(req.params.id, 10);
  if (isNaN(keyId)) {
    res.status(400).json({ error: { message: 'Invalid key ID' } });
    return;
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId) as any;
  if (!row) {
    res.status(404).json({ error: { message: 'Key not found' } });
    return;
  }

  const provider = resolveProvider(row.platform, row.base_url);
  if (!provider) {
    res.status(400).json({ error: { message: 'Provider not available' } });
    return;
  }

  try {
    const apiKey = decrypt(row.encrypted_key, row.iv, row.auth_tag);
    const baseUrl = row.base_url || provider.baseUrl;
    
    // 构建模型列表API URL
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (row.platform === 'google') {
      // Google Gemini API
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    } else if (row.platform === 'cohere') {
      // Cohere API
      url = 'https://api.cohere.ai/compatibility/v1/models';
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      // OpenAI兼容格式 (大部分供应商)
      url = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    // 解析模型列表
    let models: string[] = [];
    if (row.platform === 'google') {
      // Google返回 { models: [{ name: "models/xxx", ... }] }
      models = (data.models || [])
        .map((m: any) => m.name?.replace('models/', '') || m.name)
        .filter(Boolean)
        .sort();
    } else {
      // OpenAI兼容格式返回 { data: [{ id: "xxx", ... }] }
      models = (data.data || []).map((m: any) => m.id).filter(Boolean).sort();
    }
    
    // Update key status to healthy
    db.prepare("UPDATE api_keys SET status = 'healthy', last_checked_at = datetime('now') WHERE id = ?")
      .run(keyId);
    
    // 注册模型到数据库，使其可被路由系统调用
    const insModel = db.prepare("INSERT OR IGNORE INTO models (platform, model_id, display_name, intelligence_rank, speed_rank, context_window, enabled, supports_vision) VALUES (?, ?, ?, 50, 50, NULL, 1, 0)");
    const maxPri = db.prepare('SELECT COALESCE(MAX(priority),0) as max FROM fallback_config').get() as any;
    let nextPri = maxPri.max + 1;
    const insFb = db.prepare('INSERT OR IGNORE INTO fallback_config (model_db_id, priority, enabled) VALUES (?, ?, 1)');
    
    let newModels = 0;
    for (const mid of models) {
      const rr = insModel.run(row.platform, mid, mid);
      if (rr.changes > 0) {
        newModels++;
        const modelRow = db.prepare("SELECT id FROM models WHERE platform = ? AND model_id = ?").get(row.platform, mid) as any;
        if (modelRow) insFb.run(modelRow.id, nextPri++);
      }
    }
    
    res.json({ 
      success: true, 
      models,
      count: models.length,
      newModels,
    });
  } catch (err: any) {
    console.error(`[Keys] Fetch models error for key ${keyId}:`, err.message);
    
    // Update key status to error
    db.prepare("UPDATE api_keys SET status = 'error', last_checked_at = datetime('now') WHERE id = ?")
      .run(keyId);
    
    res.status(500).json({ 
      error: { message: err.message },
      success: false,
    });
  }
});
