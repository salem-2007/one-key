1|// ---- Platform & Model Types ----
2|
3|// Active platforms — must match server/src/providers/index.ts and
4|// server/src/routes/keys.ts PLATFORMS allowlist.
5|// Moonshot and MiniMax direct integrations were dropped in migrateModelsV4
6|// (see server/src/db/index.ts). HuggingFace was dropped in V4 and re-added
7|// in V13 via the router.huggingface.co Inference Providers meta-router.
8|export type Platform =
9|  | 'google'
10|  | 'groq'
11|  | 'cerebras'
12|  | 'sambanova'
13|  | 'nvidia'
14|  | 'mistral'
15|  | 'openrouter'
16|  | 'github'
17|  | 'cohere'
18|  | 'cloudflare'
19|  | 'zhipu'
20|  | 'ollama'
21|  | 'kilo'
22|  | 'pollinations'
23|  | 'llm7'
24|  | 'huggingface'
25|  // OpenCode Zen — OpenAI-compatible gateway. Free promotional models require a
26|  // free (no-card) account key from opencode.ai/auth; see migrateModelsV18.
27|  | 'opencode'
28|  // User-configured OpenAI-compatible endpoint (llama.cpp, LM Studio, vLLM,
29|  // Ollama, any base_url). The endpoint URL lives on the api_keys row; see #117.
30|  | 'custom';
31|
32|export interface Model {
33|  id: number;
34|  platform: Platform;
35|  modelId: string;
36|  displayName: string;
37|  intelligenceRank: number;
38|  speedRank: number;
39|  sizeLabel: string;
40|  rpmLimit: number | null;
41|  rpdLimit: number | null;
42|  tpmLimit: number | null;
43|  tpdLimit: number | null;
44|  monthlyTokenBudget: string;
45|  contextWindow: number | null;
46|  enabled: boolean;
47|  supportsVision: boolean;
48|  supportsTools: boolean;
49|}
50|
51|export type KeyStatus = 'healthy' | 'rate_limited' | 'invalid' | 'error' | 'unknown';
52|
53|export interface ApiKey {
54|  id: number;
55|  platform: Platform;
56|  label: string;
57|  maskedKey: string;
58|  status: KeyStatus;
59|  enabled: boolean;
60|  createdAt: string;
61|  lastCheckedAt: string | null;
62|}
63|
64|export interface ApiKeyCreate {
65|  platform: Platform;
66|  key: string;
67|  label?: string;
68|}
69|
70|// ---- Fallback Config ----
71|
72|export interface FallbackEntry {
73|  modelId: number;
74|  platform: Platform;
75|  displayName: string;
76|  intelligenceRank: number;
77|  speedRank: number;
78|  priority: number;
79|  enabled: boolean;
80|}
81|
82|// ---- OpenAI-Compatible Types ----
83|
84|export interface ChatToolCallFunction {
85|  name: string;
86|  arguments: string;
87|}
88|
89|export interface ChatToolCall {
90|  id: string;
91|  type: 'function';
92|  function: ChatToolCallFunction;
93|  thought_signature?: string;
94|}
95|
96|export interface ChatToolFunctionDefinition {
97|  name: string;
98|  description?: string;
99|  parameters?: Record<string, unknown>;
100|  strict?: boolean;
101|}
102|
103|export interface ChatToolDefinition {
104|  type: 'function';
105|  function: ChatToolFunctionDefinition;
106|}
107|
108|export type ChatToolChoice =
109|  | 'none'
110|  | 'auto'
111|  | 'required'
112|  | {
113|    type: 'function';
114|    function: {
115|      name: string;
116|    };
117|  };
118|
119|// OpenAI's multimodal envelope: clients like opencode / continue.dev send
120|// content as an array of typed blocks even for text-only messages. We accept
121|// it on the wire and flatten to string for providers that don't support it
122|// (Cohere, Cloudflare). See server/src/lib/content.ts.
123|export type ChatContentBlock = { type: string; text?: string; [key: string]: unknown };
124|export type ChatContent = string | null | ChatContentBlock[];
125|
126|export interface ChatMessage {
127|  role: 'system' | 'user' | 'assistant' | 'tool';
128|  content: ChatContent;
129|  name?: string;
130|  tool_call_id?: string;
131|  tool_calls?: ChatToolCall[];
132|}
133|
134|export interface ChatCompletionRequest {
135|  model?: string;
136|  messages: ChatMessage[];
137|  temperature?: number;
138|  max_tokens?: number;
139|  stream?: boolean;
140|  top_p?: number;
141|  tools?: ChatToolDefinition[];
142|  tool_choice?: ChatToolChoice;
143|  parallel_tool_calls?: boolean;
144|}
145|
146|export interface ChatCompletionChoice {
147|  index: number;
148|  message: ChatMessage;
149|  finish_reason: string | null;
150|}
151|
152|export interface TokenUsage {
153|  prompt_tokens: number;
154|  completion_tokens: number;
155|  total_tokens: number;
156|}
157|
158|export interface ChatCompletionResponse {
159|  id: string;
160|  object: 'chat.completion';
161|  created: number;
162|  model: string;
163|  choices: ChatCompletionChoice[];
164|  usage: TokenUsage;
165|  _routed_via?: {
166|    platform: Platform;
167|    model: string;
168|  };
169|}
170|
171|export interface ChatCompletionChunk {
172|  id: string;
173|  object: 'chat.completion.chunk';
174|  created: number;
175|  model: string;
176|  choices: {
177|    index: number;
178|    delta: {
179|      role?: 'assistant';
180|      content?: string;
181|      tool_calls?: ChatToolCall[];
182|    };
183|    finish_reason: string | null;
184|  }[];
185|}
186|
187|// ---- Analytics Types ----
188|
189|export interface AnalyticsSummary {
190|  totalRequests: number;
191|  successRate: number;
192|  totalInputTokens: number;
193|  totalOutputTokens: number;
194|  avgLatencyMs: number;
195|  estimatedCostSavings: number;
196|}
197|
198|export interface PlatformStats {
199|  platform: Platform;
200|  requests: number;
201|  successRate: number;
202|  avgLatencyMs: number;
203|  totalInputTokens: number;
204|  totalOutputTokens: number;
205|}
206|
207|export interface TimelinePoint {
208|  timestamp: string;
209|  requests: number;
210|  successCount: number;
211|  failureCount: number;
212|}
213|
214|export interface RequestLog {
215|  id: number;
216|  platform: Platform;
217|  modelId: string;
218|  status: 'success' | 'error';
219|  inputTokens: number;
220|  outputTokens: number;
221|  latencyMs: number;
222|  error: string | null;
223|  createdAt: string;
224|}
225|
226|// ---- Rate Limit Types ----
227|
228|export interface RateLimitStatus {
229|  platform: Platform;
230|  modelId: string;
231|  rpm: { used: number; limit: number | null };
232|  rpd: { used: number; limit: number | null };
233|  tpm: { used: number; limit: number | null };
234|  available: boolean;
235|  nextResetAt: string | null;
236|}
237|


// ---- Additional UI Types ----

export interface ProviderMetadata {
  platform: Platform
  name: string
  configured: boolean
  keyCount: number
  modelCount: number
  status: 'healthy' | 'degraded' | 'unconfigured'
}

export interface ProvidersResponse {
  providers: ProviderMetadata[]
}

export interface ModelCapability {
  modelId: string
  displayName: string
  platform: Platform
  supportsVision: boolean
  supportsTools: boolean
  supportsStreaming: boolean
  intelligenceRank: number
  speedRank: number
}

export interface CapabilitiesResponse {
  models: ModelCapability[]
  providers: ProviderMetadata[]
  configuredProviderCount: number
  totalModelCount: number
}

export interface ModelSweepJob {
  id: number
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt: string | null
  modelsFound: number
  error: string | null
}

export interface RealtimeSessionResponse {
  sessionUrl: string
  sessionId: string
  expiresAt: string
}

export interface UsageEstimatesResponse {
  totalRequests: number
  totalTokens: number
  dailyRequests: number
  dailyTokens: number
  monthlyRequests: number
  monthlyTokens: number
}

export interface UsagePressure {
  platform: Platform
  modelId: string
  pressure: number // 0-1
  reason: string
}
