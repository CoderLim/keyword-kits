from collections import deque

import pytest
from requests import Response
from requests.adapters import BaseAdapter

from rotating_request import QingGuoRotator, RotatingSession


BASE_PROXY = "http://alice:secret:channel-default:60@proxy.example:1234"


def make_response(status_code, headers=None):
    response = Response()
    response.status_code = status_code
    response.headers.update(headers or {})
    response.url = "https://example.com/data"
    response._content = b""
    response._content_consumed = True
    return response


class QueueAdapter(BaseAdapter):
    def __init__(self, responses):
        self.responses = deque(responses)
        self.calls = []

    def send(self, request, **kwargs):
        self.calls.append({"method": request.method, "proxies": kwargs.get("proxies")})
        return self.responses.popleft()

    def close(self):
        return None


def make_session(responses, **kwargs):
    sleeps = []
    session = RotatingSession(
        proxy=BASE_PROXY,
        rotator=QingGuoRotator(tag_factory=lambda context: f"retry-{context.attempt}"),
        sleeper=sleeps.append,
        **kwargs,
    )
    adapter = QueueAdapter(responses)
    session.mount("https://", adapter)
    return session, adapter, sleeps


def test_get_rotates_proxy_and_retries_after_429():
    session, adapter, sleeps = make_session([make_response(429), make_response(200)])

    response = session.get("https://example.com/data")

    assert response.status_code == 200
    assert sleeps == [2.0]
    assert adapter.calls[0]["proxies"] == {"http": BASE_PROXY, "https": BASE_PROXY}
    assert adapter.calls[1]["proxies"] == {
        "http": "http://alice:secret:channel-retry-1-default:60@proxy.example:1234",
        "https": "http://alice:secret:channel-retry-1-default:60@proxy.example:1234",
    }


def test_post_is_not_replayed_after_429():
    session, adapter, sleeps = make_session([make_response(429), make_response(200)])

    response = session.post("https://example.com/data", json={"value": 1})

    assert response.status_code == 429
    assert len(adapter.calls) == 1
    assert sleeps == []


def test_retry_after_header_takes_precedence_over_fallback_delay():
    session, _adapter, sleeps = make_session(
        [make_response(429, {"Retry-After": "7"}), make_response(200)]
    )

    session.get("https://example.com/data")

    assert sleeps == [7.0]


def test_non_finite_retry_after_falls_back_to_normal_delay():
    session, _adapter, sleeps = make_session(
        [make_response(429, {"Retry-After": "Infinity"}), make_response(200)]
    )

    response = session.get("https://example.com/data")

    assert response.status_code == 200
    assert sleeps == [2.0]


def test_exhaustion_returns_the_last_429_response():
    responses = [make_response(429), make_response(429), make_response(429)]
    session, adapter, sleeps = make_session(responses, max_attempts=3)

    response = session.get("https://example.com/data")

    assert response is responses[-1]
    assert len(adapter.calls) == 3
    assert sleeps == [2.0, 4.0]


def test_429_without_proxy_is_returned_without_retry():
    session = RotatingSession(sleeper=lambda _delay: None)
    adapter = QueueAdapter([make_response(429), make_response(200)])
    session.mount("https://", adapter)

    response = session.get("https://example.com/data")

    assert response.status_code == 429
    assert len(adapter.calls) == 1


def test_max_attempts_must_be_an_integer():
    with pytest.raises(ValueError, match="positive integer"):
        RotatingSession(max_attempts=2.5)


def test_from_env_uses_qingguo_proxy_without_manual_configuration():
    env = {
        "USE_PROXY": "true",
        "TUNNEL_HOST": "proxy.example",
        "TUNNEL_PORT": "1234",
        "TUNNEL_USER": "alice",
        "TUNNEL_PASS": "secret",
        "TUNNEL_PROXY_FORMAT": "tagged",
    }

    session = RotatingSession.from_env(env=env, sleeper=lambda _delay: None)

    assert session.current_proxy == BASE_PROXY


def test_from_env_reads_custom_channel_prefix_from_process_environment(monkeypatch):
    values = {
        "USE_PROXY": "true",
        "TUNNEL_HOST": "proxy.example",
        "TUNNEL_PORT": "1234",
        "TUNNEL_USER": "alice",
        "TUNNEL_PASS": "secret",
        "TUNNEL_PROXY_FORMAT": "tagged",
        "TUNNEL_CHANNEL_PREFIX": "session",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    session = RotatingSession.from_env(sleeper=lambda _delay: None)
    adapter = QueueAdapter([make_response(429), make_response(200)])
    session.mount("https://", adapter)

    response = session.get("https://example.com/data")

    assert response.status_code == 200
    rotated_proxy = adapter.calls[1]["proxies"]["https"]
    assert ":session-rr-1-" in rotated_proxy
    assert rotated_proxy.endswith("-default:60@proxy.example:1234")
