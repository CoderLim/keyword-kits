import json
from pathlib import Path

import pytest

from rotating_request import (
    ProxyConfigError,
    ProxyRotationError,
    QingGuoRotator,
    RotationContext,
    proxy_from_env,
)


CONTRACT_PATH = Path(__file__).parents[2] / "contract" / "qingguo-cases.json"


@pytest.mark.parametrize("case", json.loads(CONTRACT_PATH.read_text()), ids=lambda case: case["name"])
def test_qingguo_rotator_follows_shared_contract(case):
    rotator = QingGuoRotator(
        channel_prefix=case["channelPrefix"],
        tag_factory=lambda _context: case["tag"],
    )

    result = rotator.rotate(
        case["baseProxy"],
        case["baseProxy"],
        RotationContext(attempt=1, method="GET", url="https://example.com", status_code=429),
    )

    assert result == case["expected"]


def test_qingguo_rotator_always_rewrites_the_immutable_base_proxy():
    rotator = QingGuoRotator(tag_factory=lambda context: f"retry-{context.attempt}")
    base = "http://alice:secret:channel-default:60@proxy.example:1234"
    first = rotator.rotate(base, base, RotationContext(attempt=1))

    second = rotator.rotate(base, first, RotationContext(attempt=2))

    assert second == "http://alice:secret:channel-retry-2-default:60@proxy.example:1234"


def test_qingguo_rotator_rejects_proxy_without_channel_marker():
    rotator = QingGuoRotator(tag_factory=lambda _context: "retry-1")

    with pytest.raises(ProxyRotationError, match="channel-"):
        rotator.rotate(
            "http://alice:secret@proxy.example:1234",
            "http://alice:secret@proxy.example:1234",
            RotationContext(attempt=1),
        )


def test_proxy_from_env_returns_none_when_proxy_is_disabled():
    assert proxy_from_env({"USE_PROXY": "false"}) is None


def test_proxy_from_env_builds_tagged_qingguo_proxy():
    env = {
        "USE_PROXY": "true",
        "TUNNEL_HOST": "proxy.example",
        "TUNNEL_PORT": "1234",
        "TUNNEL_USER": "alice",
        "TUNNEL_PASS": "secret",
        "TUNNEL_PROXY_FORMAT": "tagged",
        "TUNNEL_CHANNEL_PREFIX": "session",
        "TUNNEL_TTL": "90",
    }

    assert proxy_from_env(env) == "http://alice:secret:session-default:90@proxy.example:1234"


def test_proxy_from_env_builds_plain_proxy():
    env = {
        "USE_PROXY": "true",
        "TUNNEL_HOST": "proxy.example",
        "TUNNEL_PORT": "1234",
        "TUNNEL_USER": "alice",
        "TUNNEL_PASS": "secret",
    }

    assert proxy_from_env(env) == "http://alice:secret@proxy.example:1234"


def test_proxy_from_env_rejects_incomplete_enabled_config():
    with pytest.raises(ProxyConfigError, match="TUNNEL_PORT"):
        proxy_from_env({"USE_PROXY": "true", "TUNNEL_HOST": "proxy.example"})
