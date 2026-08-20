from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import os
import time
from typing import Any, Callable, Iterable, Mapping, Optional, Tuple, Type, TypeVar, Union

import requests

from .proxy import ProxyRotator, QingGuoRotator, RotationContext, proxy_from_env


DEFAULT_RETRY_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
T = TypeVar("T")
RotateOn = Union[Tuple[Type[BaseException], ...], Callable[[BaseException], bool]]


class RotatingSession(requests.Session):
    def __init__(
        self,
        proxy: Optional[str] = None,
        rotator: Optional[ProxyRotator] = None,
        max_attempts: int = 5,
        retry_methods: Iterable[str] = DEFAULT_RETRY_METHODS,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        super().__init__()
        if max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")
        self.base_proxy = proxy
        self.current_proxy = proxy
        self.rotator = rotator or (QingGuoRotator() if proxy else None)
        self.max_attempts = max_attempts
        self.retry_methods = frozenset(method.upper() for method in retry_methods)
        self.sleeper = sleeper
        if proxy:
            self.trust_env = False
        self._apply_proxy(proxy)

    @classmethod
    def from_env(
        cls,
        env: Optional[Mapping[str, str]] = None,
        **kwargs: Any,
    ) -> "RotatingSession":
        proxy = kwargs.pop("proxy", None)
        if proxy is None:
            proxy = proxy_from_env(env)
        if "rotator" not in kwargs and proxy:
            values = os.environ if env is None else env
            prefix = values.get("TUNNEL_CHANNEL_PREFIX", "channel")
            kwargs["rotator"] = QingGuoRotator(channel_prefix=prefix)
        return cls(proxy=proxy, **kwargs)

    def _apply_proxy(self, proxy: Optional[str]) -> None:
        self.proxies.clear()
        if proxy:
            self.proxies.update({"http": proxy, "https": proxy})

    def _rotate(self, context: RotationContext) -> None:
        if not self.base_proxy or not self.current_proxy or not self.rotator:
            return
        self.current_proxy = self.rotator.rotate(
            self.base_proxy,
            self.current_proxy,
            context,
        )
        self._apply_proxy(self.current_proxy)

    @staticmethod
    def _retry_delay(retry_after: Optional[str], retry_number: int) -> float:
        if retry_after:
            try:
                return max(0.0, float(retry_after))
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after)
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    return max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds())
                except (TypeError, ValueError, OverflowError):
                    pass
        return float(retry_number * 2)

    def request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        normalized_method = method.upper()
        for attempt in range(1, self.max_attempts + 1):
            request_kwargs = dict(kwargs)
            if self.current_proxy:
                request_kwargs["proxies"] = {
                    "http": self.current_proxy,
                    "https": self.current_proxy,
                }
            response = super().request(method, url, **request_kwargs)
            can_retry = (
                response.status_code == 429
                and normalized_method in self.retry_methods
                and self.current_proxy is not None
                and self.rotator is not None
                and attempt < self.max_attempts
            )
            if not can_retry:
                return response

            delay = self._retry_delay(response.headers.get("Retry-After"), attempt)
            response.close()
            self._rotate(
                RotationContext(
                    attempt=attempt,
                    method=normalized_method,
                    url=url,
                    status_code=429,
                )
            )
            self.sleeper(delay)

        raise RuntimeError("unreachable")

    def run(
        self,
        operation: Callable[[], T],
        rotate_on: RotateOn,
        max_attempts: Optional[int] = None,
    ) -> T:
        attempts = self.max_attempts if max_attempts is None else max_attempts
        if attempts < 1:
            raise ValueError("max_attempts must be at least 1")

        for attempt in range(1, attempts + 1):
            try:
                return operation()
            except Exception as error:
                selected = (
                    isinstance(error, rotate_on)
                    if isinstance(rotate_on, tuple)
                    else bool(rotate_on(error))
                )
                if not selected:
                    raise
                if (
                    attempt >= attempts
                    or not self.base_proxy
                    or not self.current_proxy
                    or not self.rotator
                ):
                    raise
                self._rotate(RotationContext(attempt=attempt, error=error))
                self.sleeper(float(attempt * 2))

        raise RuntimeError("unreachable")
