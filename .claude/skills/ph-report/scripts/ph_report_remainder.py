#!/usr/bin/env python3
"""Continue ph-report: all posts for a day, excluding already-processed domains."""
from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from ph_api import fetch_posts, website_short_url  # noqa: E402
from resolve_website import (  # noqa: E402
    is_platform_domain,
    resolve_short_url,
    url_to_domain,
)

DAY = date(2026, 8, 20)
MIN_VISITS = 1000
MIN_SEARCH = 0.20
MAX_AGE_DAYS = 365
AITDK_DELAY = 2.5
EXCLUDE_FILE = Path("/tmp/ph-already-domains.txt")
EXCLUDE_SLUGS = Path("/tmp/ph-already-slugs.txt")
RAW_PREV = Path("/tmp/ph-report-raw.json")
OUT_JSON = Path("/tmp/ph-report-rest-out.json")
OUT_RAW = Path("/tmp/ph-report-rest-raw.json")
ERR_LOG = Path("/tmp/ph-report-rest-err.log")


def log(msg: str) -> None:
    line = f"# {msg}"
    print(line, file=sys.stderr, flush=True)
    with ERR_LOG.open("a") as f:
        f.write(line + "\n")


def load_exclude() -> tuple[set[str], set[str]]:
    domains: set[str] = set()
    slugs: set[str] = set()
    if EXCLUDE_FILE.exists():
        for line in EXCLUDE_FILE.read_text().splitlines():
            d = line.strip().lower()
            if d:
                domains.add(d)
    if EXCLUDE_SLUGS.exists():
        for line in EXCLUDE_SLUGS.read_text().splitlines():
            s = line.strip()
            if s:
                slugs.add(s)
    if RAW_PREV.exists():
        raw = json.loads(RAW_PREV.read_text())
        for key in ("resolved", "all"):
            for row in raw.get(key) or []:
                d = (row.get("domain") or "").lower()
                if d:
                    domains.add(d)
                s = row.get("slug")
                if s:
                    slugs.add(s)
    return domains, slugs


def day_window(day: date) -> tuple[str, str]:
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return (
        start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        end.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def parse_opencli_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def aitdk_get(domain: str, timeout: int = 90) -> dict | None:
    try:
        r = subprocess.run(
            ["opencli", "aitdk", "get-data", domain, "-f", "json"],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"_error": f"timeout after {timeout}s"}
    out = (r.stdout or "") + (r.stderr or "")
    data = parse_opencli_json(out)
    if not data:
        return {"_error": out.strip()[:400] or f"exit {r.returncode}"}
    if data.get("ok") is False or (
        "error" in data and "visits" not in data and "domain" not in data
    ):
        return {"_error": data.get("error") or data}
    return data


def search_ratio(sources: dict) -> float:
    return float(sources.get("searchOrganic") or 0) + float(
        sources.get("searchPaid") or 0
    )


def keyword_names(top_keywords: list, limit: int = 10) -> list[str]:
    names = []
    for k in top_keywords or []:
        name = k.get("name") if isinstance(k, dict) else str(k)
        if name:
            names.append(name)
        if len(names) >= limit:
            break
    return names


def wait_for_ph_api(max_wait: int = 900) -> None:
    from ph_api import graphql

    waited = 0
    while waited < max_wait:
        try:
            graphql("{ posts(first: 1) { totalCount } }")
            log("PH API ready")
            return
        except SystemExit:
            log(f"PH still rate-limited; sleep 60s ({waited}/{max_wait})")
            time.sleep(60)
            waited += 60
    raise SystemExit("PH API still rate-limited after wait")


def main() -> None:
    ERR_LOG.write_text("")
    exclude, exclude_slugs = load_exclude()
    log(f"exclude domains={len(exclude)} slugs={len(exclude_slugs)}")
    cutoff = DAY - timedelta(days=MAX_AGE_DAYS)
    posted_after, posted_before = day_window(DAY)

    wait_for_ph_api()

    log(f"fetching ALL posts for {DAY}…")
    posts = fetch_posts(posted_after, posted_before, max_posts=2000)
    # dedupe by id
    seen_ids: set[str] = set()
    unique = []
    for p in posts:
        pid = p.get("id")
        if pid in seen_ids:
            continue
        seen_ids.add(pid)
        unique.append(p)
    unique.sort(key=lambda p: p.get("votesCount") or 0, reverse=True)
    log(f"fetched {len(posts)} rows, unique {len(unique)}")

    todo = [p for p in unique if p.get("slug") not in exclude_slugs]
    log(f"after slug exclude: {len(todo)} to resolve (skipped {len(unique) - len(todo)})")

    # resolve remaining only
    candidates = []
    for i, post in enumerate(todo, 1):
        short = website_short_url(post)
        website = None
        domain = None
        err = None
        if short:
            try:
                website = resolve_short_url(short)
                domain = url_to_domain(website)
            except Exception as e:
                err = str(e)
        else:
            err = "no website"
        if domain and domain.lower() in exclude:
            continue
        if domain and is_platform_domain(domain):
            continue
        if not domain:
            log(f"resolve miss {i}/{len(todo)} {post.get('slug')}: {err}")
            continue
        candidates.append(
            {
                "name": post.get("name"),
                "tagline": post.get("tagline") or "",
                "votes": post.get("votesCount") or 0,
                "slug": post.get("slug"),
                "website": website,
                "domain": domain,
                "err": err,
            }
        )
        if i % 25 == 0 or i == len(todo):
            log(f"resolved {i}/{len(todo)}, candidates={len(candidates)}")
        time.sleep(0.25)

    log(f"remaining candidates after exclude/platform: {len(candidates)}")

    matched = []
    all_rows = []
    errors = []

    for i, row in enumerate(candidates, 1):
        domain = row["domain"]
        log(f"aitdk {i}/{len(candidates)} {domain} | {row['name']}")
        data = aitdk_get(domain)
        if not data or "_error" in data:
            err = (data or {}).get("_error")
            errors.append({**row, "stage": "aitdk", "aitdk_error": err})
            msg = json.dumps(err) if not isinstance(err, str) else err
            if "429" in msg or "rate limit" in msg.lower():
                log("rate limited — sleep 30s")
                time.sleep(30)
            else:
                time.sleep(AITDK_DELAY)
            continue

        visits = int(data.get("visits") or 0)
        registered = data.get("registered") or ""
        ratio = search_ratio(data.get("trafficSources") or {})
        kws = keyword_names(data.get("topKeywords") or [])
        reg_ok = False
        if registered:
            try:
                reg_date = datetime.strptime(registered[:10], "%Y-%m-%d").date()
                reg_ok = reg_date >= cutoff
            except ValueError:
                reg_ok = False

        passed = visits > MIN_VISITS and reg_ok and ratio >= MIN_SEARCH
        out = {
            "domain": domain,
            "description": row["tagline"],
            "visits": visits,
            "top_keywords": kws,
            "name": row["name"],
            "votes": row["votes"],
            "registered": registered,
            "search_ratio": round(ratio, 4),
            "passed": passed,
        }
        all_rows.append(out)
        if passed:
            matched.append(
                {
                    "domain": domain,
                    "description": row["tagline"],
                    "visits": visits,
                    "top_keywords": kws,
                }
            )
            log(f"PASS {domain} visits={visits} search={ratio:.1%}")
        time.sleep(AITDK_DELAY)

    payload = {
        "date": DAY.isoformat(),
        "mode": "remainder_after_top100",
        "excluded_domains": len(exclude),
        "unique_posts": len(unique),
        "candidates": len(candidates),
        "matched": matched,
        "count": len(matched),
        "queried": len(all_rows),
        "errors": errors,
        "filters": {
            "min_visits": MIN_VISITS,
            "min_search": MIN_SEARCH,
            "max_age_days": MAX_AGE_DAYS,
            "registered_on_or_after": cutoff.isoformat(),
        },
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    OUT_RAW.write_text(
        json.dumps(
            {"candidates": candidates, "all": all_rows, "report": payload},
            ensure_ascii=False,
            indent=2,
        )
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    log(f"DONE matched={len(matched)} queried={len(all_rows)} errors={len(errors)}")


if __name__ == "__main__":
    main()
