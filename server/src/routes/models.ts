import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { hasProvider } from '../providers/index.js';

export const modelsRouter = Router();

// List all models with availability info
modelsRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const models = db.prepare(`
    SELECT m.*, fc.priority, fc.enabled as fallback_enabled
    FROM models m
    LEFT JOIN fallback_config fc ON fc.model_db_id = m.id
    ORDER BY COALESCE(fc.priority, m.intelligence_rank) ASC
  `).all() as any[];

  // Count keys per platform
  const keyCounts = db.prepare(`
    SELECT platform, COUNT(*) as count
    FROM api_keys
    WHERE enabled = 1
    GROUP BY platform
  `).all() as { platform: string; count: number }[];

  const keyCountMap = new Map(keyCounts.map(k => [k.platform, k.count]));

  const result = models.map(m => ({
    id: m.id,
    platform: m.platform,
    modelId: m.model_id,
    displayName: m.display_name,
    intelligenceRank: m.intelligence_rank,
    speedRank: m.speed_rank,
    sizeLabel: m.size_label,
    rpmLimit: m.rpm_limit,
    rpdLimit: m.rpd_limit,
    tpmLimit: m.tpm_limit,
    tpdLimit: m.tpd_limit,
    monthlyTokenBudget: m.monthly_token_budget,
    contextWindow: m.context_window,
    enabled: m.enabled === 1,
    supportsVision: m.supports_vision === 1,
    supportsTools: m.supports_tools === 1,
    priority: m.priority,
    fallbackEnabled: m.fallback_enabled === 1,
    hasProvider: hasProvider(m.platform),
    keyCount: keyCountMap.get(m.platform) ?? 0,
  }));

  res.json(result);
});

// GET /api/models/providers — list provider metadata
modelsRouter.get('/providers', (_req: Request, res: Response) => {
  const db = getDb();
  const models = db.prepare('SELECT platform, COUNT(*) as cnt FROM models WHERE enabled = 1 GROUP BY platform').all() as any[];
  const keys = db.prepare('SELECT platform, COUNT(*) as cnt FROM api_keys WHERE enabled = 1 GROUP BY platform').all() as any[];
  const keyMap = new Map(keys.map((k: any) => [k.platform, k.cnt]));
  const providers = models.map((m: any) => ({
    platform: m.platform,
    name: m.platform,
    configured: (keyMap.get(m.platform) ?? 0) > 0,
    keyCount: keyMap.get(m.platform) ?? 0,
    modelCount: m.cnt,
    status: (keyMap.get(m.platform) ?? 0) > 0 ? 'healthy' : 'unconfigured',
  }));
  res.json({ providers });
});

// GET /api/models/capabilities — list model capabilities
modelsRouter.get('/capabilities', (_req: Request, res: Response) => {
  const db = getDb();
  const models = db.prepare('SELECT * FROM models WHERE enabled = 1').all() as any[];
  const keys = db.prepare('SELECT platform, COUNT(*) as cnt FROM api_keys WHERE enabled = 1 GROUP BY platform').all() as any[];
  const configuredProviderCount = new Set(keys.map((k: any) => k.platform)).size;
  res.json({
    models: models.map(m => ({
      modelId: m.model_id,
      displayName: m.display_name,
      platform: m.platform,
      supportsVision: m.supports_vision === 1,
      supportsTools: m.supports_tools === 1,
      supportsStreaming: true,
      intelligenceRank: m.intelligence_rank,
      speedRank: m.speed_rank,
    })),
    configuredProviderCount,
    totalModelCount: models.length,
  });
});
