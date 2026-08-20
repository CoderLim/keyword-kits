from dataclasses import dataclass
import os
import secrets
from typing import Callable, Mapping, Optional, Protocol

from .errors import ProxyConfigError, ProxyRotationError


@dataclass(frozen=True)
class RotationContext:
    attempt: int
    method: Optional[str] = None
    url: Optional[str] = None
    status_code: Optional[int] = None
    error: Optional[BaseException] = None


class ProxyRotator(Protocol):
    def rotate(
        self,
        base_proxy: str,
        current_proxy: str,
        context: RotationContext,
    ) -> str:
        ...


class QingGuoRotator:
    def __init__(
        self,
        channel_prefix: str = "channel",
        tag_factory: Optional[Callable[[RotationContext], str]] = None,
    ) -> None:
        self.channel_prefix = channel_prefix
        self.tag_factory = tag_factory or self._default_tag

    @staticmethod
    def _default_tag(context: RotationContext) -> str:
        return f"rr-{context.attempt}-{secrets.token_hex(4)}"

    def rotate(
        self,
        base_proxy: str,
        current_proxy: str,
        context: RotationContext,
    ) -> str:
        del current_proxy
        marker = f":{self.channel_prefix}-"
        userinfo, separator, endpoint = base_proxy.rpartition("@")
        if not separator or marker not in userinfo:
            raise ProxyRotationError(
                f"proxy URL does not contain QingGuo marker {self.channel_prefix}-"
            )
        tag = self.tag_factory(context)
        if not tag or any(character in tag for character in ":@"):
            raise ProxyRotationError("rotation tag must be non-empty and cannot contain ':' or '@'")
        rotated_userinfo = userinfo.replace(marker, f"{marker}{tag}-", 1)
        return f"{rotated_userinfo}@{endpoint}"


def proxy_from_env(env: Optional[Mapping[str, str]] = None) -> Optional[str]:
    values = os.environ if env is None else env
    if values.get("USE_PROXY", "false").lower() != "true":
        return None

    required = ("TUNNEL_HOST", "TUNNEL_PORT", "TUNNEL_USER", "TUNNEL_PASS")
    missing = [name for name in required if not values.get(name)]
    if missing:
        raise ProxyConfigError(
            "proxy is enabled but required variables are missing: " + ", ".join(missing)
        )

    host = values["TUNNEL_HOST"]
    port = values["TUNNEL_PORT"]
    user = values["TUNNEL_USER"]
    password = values["TUNNEL_PASS"]
    if values.get("TUNNEL_PROXY_FORMAT", "plain").lower() == "tagged":
        prefix = values.get("TUNNEL_CHANNEL_PREFIX", "channel")
        ttl = values.get("TUNNEL_TTL", "60")
        return f"http://{user}:{password}:{prefix}-default:{ttl}@{host}:{port}"
    return f"http://{user}:{password}@{host}:{port}"
