---
name: gen-cloudflare-email
description: >-
  用 wrangler Email Routing 为 Cloudflare 托管域名创建自定义邮箱（如 support@domain），
  固定转发到 gengliming110@gmail.com。处理 enable、MX 冲突（含 Namecheap eforward）、
  路由规则创建与验证。在用户提到 Cloudflare 邮箱、Email Routing、support@、
  opencli/wrangler 建邮箱时使用。
---

# gen-cloudflare-email

为 Cloudflare 托管域名创建自定义收件地址，转发到固定 destination。

## 固定约定

| 项 | 值 |
|----|-----|
| CLI | `wrangler`（opencli 的 Cloudflare 入口；无独立 `cloudflare` adapter） |
| Destination | `gengliming110@gmail.com`（已验证，勿改除非用户明确要求） |
| 默认 local-part | 用户指定；未指定时用 `support` |

输入：`domain`（如 `73-9.org`）、可选 `local`（如 `support`）→ 地址 `local@domain`。

## 前置

```bash
wrangler whoami   # 需含 email_routing (write)
wrangler email routing addresses list   # 确认 gengliming110@gmail.com 已 verified
```

若 destination 未验证：

```bash
wrangler email routing addresses create gengliming110@gmail.com
# 用户需点验证邮件后才能启用转发规则
```

域名须已在 Cloudflare（NS 指向 Cloudflare）。

## 执行步骤

### 1. 查状态

```bash
wrangler email routing settings <domain>
wrangler email routing rules list <domain>
```

- 已有同地址规则且转发目标正确 → 告知已存在，结束  
- `Enabled: true` / `ready` → 跳到步骤 3  
- `Enabled: false` 或 `unconfigured` → 步骤 2

### 2. 启用 Email Routing

```bash
wrangler email routing enable <domain>
```

#### MX 冲突（必处理）

若报错 `Non-Cloudflare MX records exist [code: 2008]`：

1. 查出 zone id（`settings` 输出的 Tag，或 Dashboard URL）  
2. **wrangler OAuth 通常无 DNS 写权限**，不要指望 API token 删 MX  
3. 用已登录 Cloudflare 的 `opencli browser` 在 Dashboard 会话里删非 CF MX：

```bash
opencli browser cf-email open "https://dash.cloudflare.com/<account_id>/<domain>/dns/records" --window background
```

```js
// opencli browser cf-email eval '...'
(async () => {
  const zoneId = "<ZONE_ID>";
  const list = await fetch(`/api/v4/zones/${zoneId}/dns_records?type=MX&per_page=100`, { credentials: "include" }).then(r => r.json());
  const victims = (list.result || []).filter(r => !/\.mx\.cloudflare\.net\.?$/i.test(r.content));
  const deleted = [];
  for (const r of victims) {
    const j = await fetch(`/api/v4/zones/${zoneId}/dns_records/${r.id}`, { method: "DELETE", credentials: "include" }).then(x => x.json());
    deleted.push({ id: r.id, content: r.content, success: j.success });
  }
  return JSON.stringify({ deleted, remaining: (await fetch(`/api/v4/zones/${zoneId}/dns_records?type=MX&per_page=100`, { credentials: "include" }).then(r => r.json())).result?.map(x => x.content) });
})()
```

常见冲突源：Namecheap `eforward*.registrar-servers.com`。

删完后重跑：

```bash
wrangler email routing enable <domain>
# 期望：Email Routing enabled … (status: ready)
```

结束后 `opencli browser cf-email close`。

### 3. 创建路由规则

```bash
wrangler email routing rules create <domain> \
  --name "<local>" \
  --match-type literal \
  --match-field to \
  --match-value "<local>@<domain>" \
  --action-type forward \
  --action-value "gengliming110@gmail.com" \
  --enabled true
```

### 4. 验证

```bash
wrangler email routing settings <domain>    # Enabled: true, Status: ready
wrangler email routing rules list <domain>  # Matchers: to:<local>@<domain> → forward:gengliming110@gmail.com
```

Dashboard 侧确认 MX 为 `route{1,2,3}.mx.cloudflare.net`，以及 SPF / `cf2024-1._domainkey` TXT。  
公开 `dig MX <domain>` 可能滞后数分钟，以 Dashboard/API 为准。

## 输出给用户

简要说明：

- 地址：`<local>@<domain>`  
- 转发到：`gengliming110@gmail.com`  
- 是否处理过 MX 冲突  
- 建议用其他邮箱发一封测试（勿用 destination 本账号自发自收）

## 注意

- 不要动已锁定的 CF Email Routing MX/SPF/DKIM；冲突时只删**非** Cloudflare MX。  
- `wrangler email routing dns unlock` 用于解锁 CF 托管记录以便迁出，**不是**解决 enable 冲突的手段。  
- Catch-all 默认保持禁用（drop），除非用户要求开启。  
- 同 local-part 多条规则时只有优先级最高的生效；创建前先 `rules list`。
