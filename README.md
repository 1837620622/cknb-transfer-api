# CKNB Transfer API

> 把 `https://unlimited.surf` 转换成 **OpenAI 兼容** `/v1/*` 与 **Anthropic / Claude Code 兼容** `/v1/messages` 接口的通用中转服务，自带 Key 池、代理池故障转移、身份白标、流式重试，支持 **Node.js 服务器** 与 **Cloudflare Worker** 两种部署方式。

中文 | [English](#english)

---

## 目录

- [功能特性](#功能特性)
- [两种部署方式对比](#两种部署方式对比)
- [方式一：Node.js 服务器部署（推荐）](#方式一nodejs-服务器部署推荐)
- [方式二：Cloudflare Worker 部署](#方式二cloudflare-worker-部署)
- [鉴权规则](#鉴权规则)
- [接口一览](#接口一览)
- [OpenAI 兼容接口](#openai-兼容接口)
- [Anthropic / Claude Code 兼容接口](#anthropic--claude-code-兼容接口)
- [可用模型](#可用模型)
- [稳定性机制](#稳定性机制)
- [身份白标](#身份白标)
- [前端 Playground](#前端-playground)
- [配置项参考](#配置项参考)
- [English](#english)

---

## 功能特性

- **OpenAI 兼容**：`/v1/chat/completions`、`/v1/responses`、`/v1/models`、`/v1/files`。
- **Anthropic 兼容**：`/v1/messages`、`/v1/models`、`/anthropic/v1/messages`、`/anthropic/v1/models`。
- **Claude 模型 `/v1/messages` 直接透传上游原生接口**，完整保留 tools（工具调用）、thinking（思维链）、真实 usage、流式结构。
- **OpenAI `/v1/chat/completions` 带 tools 时自动转换到 Anthropic 协议**，返回标准 `tool_calls` 和 `finish_reason: tool_calls`。
- **Key 池**：通过伪造 `X-Forwarded-For` 自动生成多个独立 key 并轮询，规避单 key 限速（仅服务器版）。
- **代理池故障转移**：直连上游失败时，自动通过 `proxy.scdn.io` 的免费公共代理 IP 重试（仅服务器版）。
- **流式重试**：首个有效内容前出错自动换 key / 换代理重试，绕过上游偶发 502 / closed-without-text。
- **身份白标**：模型始终自称 `cknb-claude`，输出层自动过滤 `Claude` / `Anthropic` 等上游身份词汇。
- **原始接口代理**：`/api/*` 直接转发到上游。
- **Web Search / Merge AI / Files**：分别映射到上游 `/api/search`、`/api/merge`、`/api/attachments/extract`。
- **前端 Playground**：`/app`，支持模型选择、流式输出、思维链展示、工具调用展示、联网搜索。
- **Agent Setup / Codex / MCP**：`/v1/setup`、`/v1/codex`、`/v1/mcp`。

---

## 两种部署方式对比

| 特性 | Node.js 服务器版 | Cloudflare Worker 版 |
|------|------------------|----------------------|
| 入口文件 | `server.js` | `src/worker.js` |
| 运行环境 | 自有服务器 / VPS | Cloudflare 边缘网络 |
| Key 池（伪造 IP 轮询） | ✅ | ❌（边缘无法伪造 IP） |
| 代理池故障转移 | ✅ | ❌（边缘无需此机制） |
| 身份白标（输出层过滤） | ✅ | ❌（轻量版） |
| 流式重试 | ✅ | ❌ |
| tools / thinking 完整保留 | ✅ | ⚠️（压扁为文本走 `/api/chat`） |
| 全球加速 | ❌ | ✅ |
| 部署难度 | 中（需服务器） | 低（一条命令） |

**选型建议**：
- 需要完整 tools / thinking / 最高稳定性 → **服务器版**
- 只需快速上线、全球加速、轻量调用 → **Worker 版**

---

## 方式一：Node.js 服务器部署（推荐）

### 1. 安装

```bash
# 需要 Node.js >= 20
git clone https://github.com/1837620622/cknb-transfer-api.git /opt/unlimited-transfer-api
cd /opt/unlimited-transfer-api
npm install
cp .env.example .env
# 编辑 .env，填入 UNLIMITED_SURF_API_KEY
```

`.env` 关键变量：

```text
PORT=8788
HOST=127.0.0.1
UPSTREAM_BASE_URL=https://unlimited.surf
UNLIMITED_SURF_API_KEY=ua_xxxxxxxxxxxxxxxx
DEFAULT_MODEL=gateway-gpt-5-5
DEFAULT_CLAUDE_MODEL=claude-opus-4-8-20260101
# 可选：WORKER_API_KEY=your-custom-client-key
```

### 2. systemd 服务（开机自启 + 崩溃自动重启）

```bash
cp deploy/unlimited-transfer-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now unlimited-transfer-api
# 查看状态
systemctl status unlimited-transfer-api
# 查看日志
tail -f /var/log/unlimited-transfer-api.log
```

服务文件已配置 `Restart=always`，任何退出场景都会 5 秒后自动拉起，确保不间断运行。

### 3. nginx 反代（SSE 友好）

参考 `deploy/nginx.conf`，核心配置：

```nginx
location /ai/ {
    proxy_pass http://127.0.0.1:8788/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 600s;
    chunked_transfer_encoding on;
}
```

### 4. 验证

```bash
curl http://your-server/ai/health
curl http://your-server/ai/v1/models
curl http://your-server/ai/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-8-20260101","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
```

`/health` 返回的 JSON 包含 `key_pool` 与 `proxy_pool` 状态字段，可监控运行状况。

---

## 方式二：Cloudflare Worker 部署

### 1. 本地 Wrangler 部署

```bash
npm install
npx wrangler login
npx wrangler secret put UNLIMITED_SURF_API_KEY   # 填 unlimited.surf 的真实 key
npx wrangler secret put WORKER_API_KEY           # 可选：客户端访问密钥
npx wrangler deploy -c deploy/wrangler.toml
```

### 2. 通过 GitHub 自动部署

1. 推送本项目到 GitHub 仓库。
2. Cloudflare Dashboard → `Workers & Pages` → `Create` → `Connect to Git`。
3. 选择仓库，配置：

```text
Framework preset: None
Build command: npm install
Deploy command: npx wrangler deploy -c deploy/wrangler.toml
Root directory: /
Wrangler config: deploy/wrangler.toml
```

4. 在 Worker `Settings → Variables → Secrets` 添加：
   - `UNLIMITED_SURF_API_KEY` = 你的 unlimited.surf key
   - `WORKER_API_KEY` = 你的客户端访问密钥（可选）

### 3. 验证

```bash
curl https://<your-worker>.workers.dev/health
curl https://<your-worker>.workers.dev/v1/models \
  -H "Authorization: Bearer <WORKER_API_KEY>"
```

> **注意**：Worker 版是轻量版，不支持 Key 池、代理池故障转移、身份白标；Claude 模型的 `/v1/messages` 会压扁为文本走 `/api/chat`，不保留 tools/thinking。如需完整能力请用服务器版。

---

## 鉴权规则

```text
设置了 WORKER_API_KEY:
  客户端必须传 WORKER_API_KEY
  服务使用 UNLIMITED_SURF_API_KEY 请求上游

没有设置 WORKER_API_KEY:
  客户端传任意 key 都可以
  服务优先使用 UNLIMITED_SURF_API_KEY 请求上游
  若也没有 UNLIMITED_SURF_API_KEY，则把客户端传入的 key 当作上游 key
```

---

## 接口一览

| 路径 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 + Key 池 / 代理池状态 |
| `/v1/chat/completions` | POST | OpenAI Chat（带 tools 自动转 Anthropic） |
| `/v1/responses` | POST | OpenAI Responses |
| `/v1/models` | GET | 模型列表（OpenAI 格式） |
| `/v1/messages` | POST | Anthropic Messages（Claude 透传） |
| `/anthropic/v1/messages` | POST | Anthropic 别名 |
| `/v1/search` | POST | Web Search → 上游 `/api/search` |
| `/v1/merge` | POST | Merge AI → 上游 `/api/merge` |
| `/v1/files` | POST | 文件上传/提取 → 上游 `/api/attachments/extract` |
| `/v1/key` `/v1/usage` | GET | 上游 key / 用量查询 |
| `/v1/setup` `/v1/codex` `/v1/mcp` | GET | Agent / Codex / MCP 配置说明 |
| `/api/*` | * | 原始上游代理 |
| `/app` | GET | 前端 Playground |

---

## OpenAI 兼容接口

Base URL：`http://your-server/v1` 或 `https://<your-worker>.workers.dev/v1`

```bash
curl http://your-server/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gateway-gpt-5-5","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

带 tools（Claude 模型自动转换协议）：

```bash
curl http://your-server/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-8-20260101","max_tokens":1024,
       "messages":[{"role":"user","content":"What is the weather in Paris?"}],
       "tools":[{"type":"function","function":{"name":"get_weather","description":"Get weather","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}]'
```

---

## Anthropic / Claude Code 兼容接口

Base URL：`http://your-server` 或 `https://<your-worker>.workers.dev`

```bash
# Claude Code
export ANTHROPIC_BASE_URL="http://your-server"
export ANTHROPIC_AUTH_TOKEN="any-key"
export ANTHROPIC_MODEL="claude-opus-4-8-20260101"
claude
```

思维链 + 工具调用：

```bash
curl http://your-server/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-8-20260101","max_tokens":4096,
       "thinking":{"type":"enabled","budget_tokens":2048},
       "messages":[{"role":"user","content":"What is 17*23?"}]}'
```

---

## 可用模型

模型列表由上游 `/api/models` 动态返回，并自动过滤不可用模型。默认模型：

- **Claude**：`claude-opus-4-8-20260101`（最新 Opus，默认）
- **OpenAI**：`gateway-gpt-5-5`

完整列表可通过 `GET /v1/models` 获取。常见模型包括 `gateway-gpt-5` 系列、`claude-opus-4-8` / `claude-sonnet-4` 系列、`gateway-gemini-3-flash`、`gateway-llama-3-3-70b` 等。

---

## 稳定性机制

### Key 池（服务器版）

unlimited.surf 的 key 按 IP 绑定且 unlimited。服务器通过伪造 `X-Forwarded-For` 自动生成多个独立 key 并轮询使用，规避单 IP / 单 key 限速。`UNLIMITED_SURF_API_KEY` 作为兜底。

### 代理池故障转移（服务器版）

集成 [proxy.scdn.io](https://proxy.scdn.io) 免费公共代理 IP 池。当 unlimited.surf 直连失败（5xx / 网络超时）时，自动轮询最多 5 个代理 IP 重试；4xx 业务错误不转移。代理池定期刷新，失败代理自动淘汰。

### 流式重试

- 非流式 `/v1/messages` 内部用流式调上游并收集 SSE，绕过上游非流式端点的不稳定。
- 首个有效内容块前出错自动换 key / 换代理重试（最多 7 次）。
- `closed-without-text`（空内容块）自动识别并重试。

---

## 身份白标

服务器版内置身份白标机制，模型始终以 `cknb-claude` 身份对外：

- **系统提示词注入**：自动注入白标角色设定，引导模型自称 `cknb-claude`。
- **Assistant prefill**：对身份相关问题注入前缀补全，约束模型起手回答。
- **输出层过滤**：对返回内容做文本替换，`Claude` → `cknb-claude`、`Anthropic` → `CKNB 团队`，确保不暴露上游身份（Opus 4.8 的 RLHF 诚实约束极强，system prompt + prefill 在流式下不可靠，输出层过滤是最可靠的兜底手段）。

---

## 前端 Playground

访问 `/app`，支持：

- 模型按 provider 分组选择
- 流式输出、思维链展示、工具调用展示
- 联网搜索、温度 / max_tokens / effort 调节
- Anthropic 与 OpenAI 两种接口模式切换

---

## 配置项参考

### 服务器版（.env）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8787` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `UPSTREAM_BASE_URL` | `https://unlimited.surf` | 上游地址 |
| `UNLIMITED_SURF_API_KEY` | - | 上游 key（必填） |
| `WORKER_API_KEY` | - | 客户端访问密钥（可选） |
| `DEFAULT_MODEL` | `gateway-gpt-5-5` | 默认 OpenAI 模型 |
| `DEFAULT_CLAUDE_MODEL` | `claude-opus-4-8-20260101` | 默认 Claude 模型 |
| `KEY_POOL_ENABLED` | `true` | 启用 Key 池 |
| `KEY_POOL_SIZE` | `20` | Key 池大小 |
| `PROXY_POOL_ENABLED` | `true` | 启用代理池故障转移 |
| `PROXY_POOL_URL` | `https://proxy.scdn.io/api/get_proxy.php` | 代理池 API |
| `PROXY_POOL_PROTOCOL` | `http` | 代理协议（http/https/socks4/socks5） |
| `PROXY_POOL_FETCH_COUNT` | `20` | 每次拉取代理数 |
| `PROXY_POOL_REFRESH_MS` | `300000` | 代理池刷新间隔 |
| `PROXY_POOL_TIMEOUT_MS` | `8000` | 代理请求超时 |

### Worker 版（deploy/wrangler.toml + Secrets）

- `deploy/wrangler.toml` 的 `[vars]`：`UPSTREAM_BASE_URL`、`DEFAULT_MODEL`、`DEFAULT_CLAUDE_MODEL`
- Secrets：`UNLIMITED_SURF_API_KEY`、`WORKER_API_KEY`（可选）

---

## English

A universal adapter that converts `https://unlimited.surf` into OpenAI-compatible `/v1/*` routes and Anthropic/Claude Code-compatible `/v1/messages` routes, with built-in key pool, proxy failover, identity white-labeling, and streaming retry. Supports two deployment modes: **Node.js server** and **Cloudflare Worker**.

### Features

- OpenAI-compatible: `/v1/chat/completions`, `/v1/responses`, `/v1/models`, `/v1/files`.
- Anthropic-compatible: `/v1/messages`, `/v1/models`, `/anthropic/v1/messages`, `/anthropic/v1/models`.
- Claude `/v1/messages` passes through upstream natively, preserving tools, thinking, usage, and streaming.
- OpenAI chat with tools auto-converts to Anthropic protocol.
- Key pool: rotates multiple keys via spoofed `X-Forwarded-For` (server only).
- Proxy failover: retries via free public proxies from `proxy.scdn.io` on upstream failure (server only).
- Streaming retry with key/proxy rotation before first content.
- Identity white-label: model always identifies as `cknb-claude`; output-layer filtering strips upstream identity.
- Raw upstream proxy: `/api/*` forwards directly.
- Web Search / Merge AI / Files mapped to upstream endpoints.
- Playground at `/app`.

### Server deployment

```bash
git clone https://github.com/1837620622/cknb-transfer-api.git /opt/unlimited-transfer-api
cd /opt/unlimited-transfer-api
npm install
cp .env.example .env  # fill in UNLIMITED_SURF_API_KEY
cp deploy/unlimited-transfer-api.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now unlimited-transfer-api
```

The systemd unit uses `Restart=always` for uninterrupted operation.

### Worker deployment

```bash
npm install
npx wrangler secret put UNLIMITED_SURF_API_KEY
npx wrangler deploy -c deploy/wrangler.toml
```

Note: The Worker version is lightweight — no key pool, proxy failover, or identity white-label; Claude `/v1/messages` is flattened to text via `/api/chat` without tools/thinking. Use the server version for full capabilities.

### Auth rules

```text
WORKER_API_KEY set:    clients must send it; server uses UNLIMITED_SURF_API_KEY upstream.
WORKER_API_KEY unset:  clients may send any key; server prefers UNLIMITED_SURF_API_KEY.
```

### License

MIT
