# @keyword-kits/rotating-request

Node/TypeScript 请求库：安全请求收到 HTTP 429 后，自动改写青果 channel、切换出口 IP 并重试。

```ts
import { RotatingClient } from "@keyword-kits/rotating-request";

const client = RotatingClient.fromEnv();
try {
  const response = await client.get("https://example.com/data");
} finally {
  await client.close();
}
```

默认只重试 `GET`、`HEAD`、`OPTIONS`，最多总计请求 5 次。配置使用 `USE_PROXY` 和 `TUNNEL_*` 环境变量；青果自动 channel 轮换需要 `TUNNEL_PROXY_FORMAT=tagged`。
