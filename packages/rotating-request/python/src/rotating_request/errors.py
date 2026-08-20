class ProxyConfigError(ValueError):
    """Raised when proxy configuration is incomplete or invalid."""


class ProxyRotationError(RuntimeError):
    """Raised when a proxy rotator cannot produce a new proxy URL."""
