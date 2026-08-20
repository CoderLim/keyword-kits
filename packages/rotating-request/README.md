# Rotating Request

通用 HTTP 请求库：安全请求收到 HTTP 429 后，切换代理出口 IP 并重试。Python 和 TypeScript 使用相同的青果 channel 改写规则，也都支持自定义代理轮换器。

## 默认行为

- 仅自动重试 `GET`、`HEAD`、`OPTIONS`，不会自动重放 `POST`、`PUT`、`PATCH` 或 `DELETE`。
- 默认最多发起 5 次请求（首次请求 + 最多 4 次重试）。
- 每次重试都从原始代理 URL 生成新 channel，不会叠加旧的重试标签。
- 优先遵守 `Retry-After`；没有时等待 `2、4、6、8` 秒。
- 没有代理时直接返回 429；普通网络异常默认不重试。
- 重试耗尽后返回最后一个 429 原生响应。

## 环境变量

```dotenv
USE_PROXY=true
TUNNEL_HOST=proxy.example.com
TUNNEL_PORT=1234
TUNNEL_USER=your-user
TUNNEL_PASS=your-password
TUNNEL_PROXY_FORMAT=tagged
TUNNEL_CHANNEL_PREFIX=channel
TUNNEL_TTL=60
```

自动切换青果 channel 必须使用 `TUNNEL_PROXY_FORMAT=tagged`。`plain` 格式可以发送代理请求，但 URL 中没有 channel 标记，429 后无法按此规则生成新 IP。

库只读取进程环境变量，不加载 `.env` 文件；应用可自行使用 `python-dotenv`、Node `--env-file` 或其他配置工具。

## Python

安装：

```bash
pip install ./packages/rotating-request/python
```

普通请求：

```python
from rotating_request import RotatingSession

with RotatingSession.from_env() as client:
    response = client.get("https://example.com/data")
    response.raise_for_status()
    print(response.json())
```

`RotatingSession` 是 `requests.Session` 的子类，可传给需要 `requests.Session` 的第三方库。

### youtube-transcript-api

YouTube 限流有时会被第三方库转换成 `RequestBlocked` 或 `IpBlocked`，此时用操作级 `run()`：

```python
from rotating_request import RotatingSession
from youtube_transcript_api import YouTubeTranscriptApi, RequestBlocked, IpBlocked

# HTTP 层只请求一次，由 run() 统一管理本次操作的 5 次尝试，避免嵌套重试。
session = RotatingSession.from_env(max_attempts=1)

try:
    transcript = session.run(
        lambda: YouTubeTranscriptApi(http_client=session).fetch(
            "VIDEO_ID",
            languages=["zh-Hans", "zh", "en"],
        ),
        rotate_on=(RequestBlocked, IpBlocked),
        max_attempts=5,
    )
finally:
    session.close()
```

`run()` 只捕获 `rotate_on` 明确指定的异常；其他异常立即原样抛出。

## TypeScript/npm

安装：

```bash
npm install ./packages/rotating-request/typescript
```

```ts
import { RotatingClient } from "@keyword-kits/rotating-request";

const client = RotatingClient.fromEnv();

try {
  const response = await client.get("https://example.com/data");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  console.log(await response.json());
} finally {
  await client.close();
}
```

Node 实现使用 `undici.ProxyAgent`。调用结束后应执行 `close()`，释放为各个代理 channel 缓存的连接池。

操作级重试使用异常判断函数：

```ts
const result = await client.run(
  () => fetchTranscript(),
  {
    rotateOn: (error) => error instanceof Error && error.name === "RequestBlocked",
    maxAttempts: 5,
  },
);
```

## 自定义代理轮换器

高级用法可以传入实现相同接口的轮换器。它接收不可变的初始代理、当前代理和本次重试上下文，返回下一条代理 URL。

Python：

```python
class ProxyListRotator:
    def __init__(self, proxies):
        self.proxies = iter(proxies)

    def rotate(self, base_proxy, current_proxy, context):
        return next(self.proxies)

client = RotatingSession(proxy="http://first-proxy", rotator=ProxyListRotator(proxies))
```

TypeScript：

```ts
const rotator = {
  rotate(_baseProxy: string, _currentProxy: string) {
    return proxyQueue.shift()!;
  },
};

const client = new RotatingClient({ proxy: "http://first-proxy", rotator });
```

## 开发验证

```bash
/tmp/keyword-kits-rotating-request-venv/bin/python -m pytest packages/rotating-request/python/tests -v
npm test -w @keyword-kits/rotating-request
npm run build -w @keyword-kits/rotating-request
```
