# keyword-kits-rotating-request

Python `requests.Session` 兼容请求库：安全请求收到 HTTP 429 后，自动改写青果 channel、切换出口 IP 并重试。

```python
from rotating_request import RotatingSession

with RotatingSession.from_env() as client:
    response = client.get("https://example.com/data")
```

默认只重试 `GET`、`HEAD`、`OPTIONS`，最多总计请求 5 次。配置使用 `USE_PROXY` 和 `TUNNEL_*` 环境变量；青果自动 channel 轮换需要 `TUNNEL_PROXY_FORMAT=tagged`。

它也是 `requests.Session` 的子类，可以作为 `youtube-transcript-api` 的 `http_client`。第三方库抛出 `RequestBlocked` 或 `IpBlocked` 时，可使用 `session.run(..., rotate_on=(RequestBlocked, IpBlocked))` 执行操作级轮换重试。
