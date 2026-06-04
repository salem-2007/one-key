# ONE KEY

<p align="center">
  <strong>统一 AI API 代理平台</strong>
  <br>
  一个 API 密钥，访问所有主流 AI 模型
</p>

---

## 📖 简介

**ONE KEY**（前身 FreeLLMAPI）是一个自托管的统一 AI API 代理平台。它将多家 AI 供应商的 API 整合为一个兼容 OpenAI 格式的端点，让你只需管理一个 API 密钥，就能自由切换和使用不同供应商的模型。

### 为什么需要 ONE KEY？

- **统一入口**：所有模型通过 `http://localhost:3001/v1/chat/completions` 访问
- **智能故障转移**：主供应商不可用时自动切换到备用供应商
- **密钥管理**：集中管理多个供应商的 API 密钥，支持健康检查
- **成本控制**：月度 Token 预算、速率限制、用量统计
- **隐私安全**：所有数据本地存储，API 密钥加密保存

---

## ✨ 核心功能

### 🔑 统一 API 密钥
生成一个通用 API 密钥，以 OpenAI 兼容格式访问所有已配置的模型。

### 🔄 智能故障转移
配置模型的优先级链，当主供应商出现错误或限流时，自动切换到下一个可用供应商。

### 🏥 密钥健康检查
定期自动检测 API 密钥状态，自动禁用连续失败的密钥，支持手动检查。

### 📊 数据分析仪表盘
- 总请求数、成功率、平均延迟
- Token 使用量统计
- 按供应商/模型分组的详细数据
- 月度 Token 预算追踪

### 🛡️ 速率限制
支持按密钥配置：
- 每分钟请求数 (RPM)
- 每日请求数 (RPD)
- 每分钟 Token 数 (TPM)
- 每日 Token 数 (TPD)

### 🌐 自定义供应商
支持添加任何 OpenAI API 兼容的自定义供应商（如 Ollama、vLLM、One API 等）。

---

## 🏢 支持的供应商

| 供应商 | 免费额度 | 备注 |
|--------|----------|------|
| **Google Gemini** | ✅ 免费层 | Gemini 2.5/2.0 系列 |
| **Groq** | ✅ 免费层 | 极速推理 |
| **Cerebras** | ✅ 免费层 | 超快推理 |
| **SambaNova** | ✅ 免费层 | 高性能推理 |
| **NVIDIA** | ✅ 免费层 | 多模型支持 |
| **Mistral** | ✅ 免费层 | 欧洲领先模型 |
| **OpenRouter** | ✅ 免费模型 | 聚合多供应商 |
| **GitHub Models** | ✅ 免费层 | GitHub 账号即可 |
| **Cohere** | ✅ 免费层 | 企业级模型 |
| **Cloudflare Workers AI** | ✅ 免费层 | 边缘推理 |
| **智谱 AI** | ✅ 免费层 | 国产大模型 |
| **Ollama** | ✅ 完全免费 | 本地运行 |
| **HuggingFace** | ✅ 免费层 | 开源模型 |
| **Pollinations** | ✅ 完全免费 | 无需密钥 |
| **LLM7** | ✅ 完全免费 | 无需密钥 |
| **Kilo** | ✅ 免费层 | 多模型 |
| **自定义** | - | 任何 OpenAI 兼容 API |

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
# 克隆项目
git clone https://github.com/salem-2007/one-key.git
cd one-key

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 首次使用

1. 打开浏览器访问 `http://localhost:5173`
2. 使用默认账号登录：`admin` / `admin`
3. 首次登录会要求修改密码
4. 在「令牌管理」页面添加 API 密钥
5. 复制统一 API 密钥和 Base URL

### 在应用中使用

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-unified-api-key",
    base_url="http://localhost:3001/v1"
)

response = client.chat.completions.create(
    model="gemini-2.5-flash",  # 或任何已配置的模型
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

---

## 📁 项目结构

```
one-key/
├── client/                 # 前端 (React + TypeScript)
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── lib/            # 工具库 (API、i18n)
│   │   └── pages/          # 页面组件
│   │       ├── AnalyticsPage.tsx    # 数据分析
│   │       ├── ProvidersPage.tsx    # 供应商管理
│   │       ├── FallbackPage.tsx     # 故障转移配置
│   │       ├── KeysPage.tsx         # 密钥管理
│   │       └── PlaygroundPage.tsx   # 操练场
│   └── package.json
├── server/                 # 后端 (Node.js + Express)
│   ├── src/
│   │   ├── db/             # 数据库 (SQLite)
│   │   ├── lib/            # 工具库 (加密、日志)
│   │   ├── providers/      # 供应商适配器
│   │   ├── routes/         # API 路由
│   │   └── services/       # 业务逻辑
│   └── package.json
├── shared/                 # 共享类型定义
└── package.json
```

---

## 🔧 配置

### 环境变量

```bash
# 服务器端口
PORT=3001

# 加密密钥（生产环境必须设置）
# 生成方式: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-64-char-hex-key

# 日志级别
LOG_LEVEL=info
```

### 数据库

使用 SQLite 本地存储，数据库文件位于 `server/data/freeapi.db`。

---

## 🌍 国际化

支持中文和英文界面，可在页面右上角切换语言。

---

## 🔒 安全特性

- API 密钥使用 AES-256-GCM 加密存储
- 密钥在前端仅显示脱敏版本
- 统一 API 密钥与用户密码分离
- 支持强制首次登录修改密码

---

## 📝 API 端点

### 统一 API（OpenAI 兼容）

```
POST /v1/chat/completions      # 聊天补全
POST /v1/completions           # 文本补全
POST /v1/embeddings            # 文本嵌入
GET  /v1/models                # 模型列表
```

### 管理 API

```
POST   /api/auth/login         # 登录
POST   /api/auth/change-password # 修改密码
GET    /api/keys               # 获取密钥列表
POST   /api/keys               # 添加密钥
POST   /api/keys/custom        # 添加自定义供应商
GET    /api/health             # 健康状态
POST   /api/health/check-all   # 检查所有密钥
GET    /api/analytics          # 用量统计
```

---

## 🛠️ 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **后端**：Node.js + Express + TypeScript
- **数据库**：SQLite (better-sqlite3)
- **构建**：npm workspaces + concurrently

---

## 📄 许可证

MIT License

---

## 🔗 链接

- [GitHub 仓库](https://github.com/salem-2007/one-key)
- [问题反馈](https://github.com/salem-2007/one-key/issues)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/salem-2007">salem-2007</a>
</p>
