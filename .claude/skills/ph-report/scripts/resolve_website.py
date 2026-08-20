#!/usr/bin/env python3
"""Resolve Product Hunt /r/ short links to destination URLs (no browser)."""
from __future__ import annotations

import re
from urllib.parse import urlparse

# Known multi-part public suffixes (minimal set)
_MULTI_TLD = {
    "co.uk",
    "com.au",
    "co.jp",
    "com.br",
    "co.in",
    "com.cn",
    "co.nz",
    "com.sg",
    "co.kr",
    "com.tw",
    "com.hk",
    "co.za",
}


def registrable_domain(host: str) -> str:
    host = host.lower().removeprefix("www.").rstrip(".")
    parts = host.split(".")
    if len(parts) < 2:
        return host
    last2 = ".".join(parts[-2:])
    if last2 in _MULTI_TLD and len(parts) >= 3:
        return ".".join(parts[-3:])
    # e.g. foo.co.uk handled above; foo.com.br etc.
    if len(parts) >= 3 and parts[-2] in {"co", "com", "net", "org", "ac"} and len(parts[-1]) <= 3:
        return ".".join(parts[-3:])
    return last2


def resolve_short_url(short_url: str, timeout: float = 20.0) -> str | None:
    """Follow PH redirect once; return Location destination. Requires curl_cffi."""
    try:
        from curl_cffi import requests
    except ImportError:
        raise SystemExit(
            "error: curl_cffi required. Install: pip install curl_cffi"
        )

    # strip tracking noise but keep path
    url = short_url.split("?")[0] if "producthunt.com/r/" in short_url else short_url
    r = requests.get(
        url,
        impersonate="chrome131",
        allow_redirects=False,
        timeout=timeout,
    )
    loc = r.headers.get("Location") or r.headers.get("location")
    if r.status_code in (301, 302, 303, 307, 308) and loc:
        return loc
    # rare: already final
    if r.status_code == 200 and "producthunt.com" not in url:
        return url
    return None


def url_to_domain(url: str | None) -> str | None:
    if not url:
        return None
    try:
        host = urlparse(url).hostname
        if not host:
            return None
        return registrable_domain(host)
    except Exception:
        return None


_PLATFORM_DOMAINS = frozenset(
    {
        "apple.com",
        "apps.apple.com",
        "github.com",
        "google.com",
        "play.google.com",
        "vercel.app",
        "netlify.app",
        "herokuapp.com",
        "pages.dev",
        "web.app",
        "facebook.com",
        "instagram.com",
        "twitter.com",
        "x.com",
        "linkedin.com",
        "youtube.com",
        "producthunt.com",
        "lu.ma",
    }
)


def is_platform_domain(domain: str | None) -> bool:
    if not domain:
        return True
    d = domain.lower()
    if d in _PLATFORM_DOMAINS:
        return True
    # also skip if registrable is a known platform
    return any(d == p or d.endswith("." + p) for p in _PLATFORM_DOMAINS)
