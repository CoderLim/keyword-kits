#!/usr/bin/env python3
"""
ph-report: Product Hunt launches → real domains → AITDK filter → report.

Default: top 100 by votes for a given day; keep domains with
  Monthly Visits > 1000, registered within 1 year, search traffic >= 20%.

Usage:
  python3 scripts/ph_report.py
  python3 scripts/ph_report.py --date 2026-08-19 --limit 100
  python3 scripts/ph_report.py --limit 5 --json
"""
from __future__ import annotations

import argparse
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


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Product Hunt → AITDK filtered report")
    p.add_argument(
        "--date",
        help="Launch day YYYY-MM-DD (default: yesterday, local calendar)",
    )
    p.add_argument(
        "--limit",
        "-l",
        type=int,
        default=100,
        help="Top N posts by votes (default: 100)",
    )
    p.add_argument(
        "--min-visits",
        type=int,
        default=1000,
        help="Min Monthly Visits (default: 1000)",
    )
    p.add_argument(
        "--min-search",
        type=float,
        default=0.20,
        help="Min search traffic share 0-1 (default: 0.20)",
    )
    p.add_argument(
        "--max-age-days",
        type=int,
        default=365,
        help="Max domain age in days (default: 365)",
    )
    p.add_argument(
        "--aitdk-delay",
        type=float,
        default=2.5,
        help="Seconds between AITDK calls (default: 2.5)",
    )
    p.add_argument(
        "--include-platforms",
        action="store_true",
        help="Do not skip App Store / GitHub / Google / Vercel hosts",
    )
    p.add_argument("--json", "-j", action="store_true", help="JSON output")
    p.add_argument(
        "--keep-raw",
        type=Path,
        help="Optional path to write full pipeline debug JSON",
    )
    return p.parse_args()


def day_window(day: date) -> tuple[str, str]:
    """UTC window covering PH calendar day loosely: [day 00:00Z, next day 00:00Z)."""
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return (
        start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        end.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def parse_opencli_json(text: str) -> dict | None:
    text = text.strip()
    if not text:
        return None
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


def aitdk_get(domain: str, timeout: int = 60) -> dict | None:
    r = subprocess.run(
        ["opencli", "aitdk", "get-data", domain, "-f", "json"],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
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
        if isinstance(k, dict):
            name = k.get("name")
        else:
            name = str(k)
        if name:
            names.append(name)
        if len(names) >= limit:
            break
    return names


def main() -> None:
    args = parse_args()
    day = (
        date.fromisoformat(args.date)
        if args.date
        else date.today() - timedelta(days=1)
    )
    posted_after, posted_before = day_window(day)
    cutoff = day - timedelta(days=args.max_age_days)

    print(
        f"# fetching PH posts for {day} (limit={args.limit} by votes)…",
        file=sys.stderr,
    )
    # PH list order ≠ votes order; pull enough of the day then sort.
    posts = fetch_posts(
        posted_after,
        posted_before,
        max_posts=max(args.limit * 2, 200),
    )
    posts.sort(key=lambda p: p.get("votesCount") or 0, reverse=True)
    top = posts[: args.limit]
    print(f"# got {len(posts)} posts, taking top {len(top)}", file=sys.stderr)

    resolved = []
    for i, post in enumerate(top, 1):
        short = website_short_url(post)
        website = None
        domain = None
        err = None
        if short:
            try:
                website = resolve_short_url(short)
                domain = url_to_domain(website)
            except SystemExit:
                raise
            except Exception as e:
                err = str(e)
        else:
            err = "no website short url"
        row = {
            "rank": i,
            "name": post.get("name"),
            "tagline": post.get("tagline") or "",
            "votes": post.get("votesCount") or 0,
            "slug": post.get("slug"),
            "short_url": short,
            "website": website,
            "domain": domain,
            "err": err,
        }
        resolved.append(row)
        print(
            f"# resolve {i}/{len(top)} {domain or '-'} | {post.get('name')}",
            file=sys.stderr,
        )
        time.sleep(0.3)

    matched = []
    all_rows = []
    errors = []

    for i, row in enumerate(resolved, 1):
        domain = row.get("domain")
        if not domain:
            errors.append({**row, "stage": "resolve"})
            continue
        if not args.include_platforms and is_platform_domain(domain):
            all_rows.append({**row, "skipped_platform": True, "passed": False})
            print(f"# skip platform {domain}", file=sys.stderr)
            continue

        print(f"# aitdk {i}/{len(resolved)} {domain}", file=sys.stderr)
        data = aitdk_get(domain)
        if not data or "_error" in data:
            err = (data or {}).get("_error")
            errors.append({**row, "stage": "aitdk", "aitdk_error": err})
            msg = json.dumps(err) if not isinstance(err, str) else err
            if "429" in msg or "rate limit" in msg.lower():
                print("# rate limited — sleeping 30s", file=sys.stderr)
                time.sleep(30)
            else:
                time.sleep(args.aitdk_delay)
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

        passed = (
            visits > args.min_visits
            and reg_ok
            and ratio >= args.min_search
        )
        out = {
            "domain": domain,
            "description": row["tagline"],
            "visits": visits,
            "top_keywords": kws,
            # extras for debug / keep-raw
            "name": row["name"],
            "votes": row["votes"],
            "registered": registered,
            "search_ratio": round(ratio, 4),
            "website": row.get("website"),
            "passed": passed,
            "pass_visits": visits > args.min_visits,
            "pass_registered": reg_ok,
            "pass_search": ratio >= args.min_search,
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
            print(f"# PASS {domain} visits={visits} search={ratio:.1%}", file=sys.stderr)
        time.sleep(args.aitdk_delay)

    payload = {
        "date": day.isoformat(),
        "limit": args.limit,
        "filters": {
            "min_visits": args.min_visits,
            "min_search": args.min_search,
            "max_age_days": args.max_age_days,
            "registered_on_or_after": cutoff.isoformat(),
        },
        "matched": matched,
        "count": len(matched),
        "queried": len(all_rows),
        "errors": errors,
    }

    if args.keep_raw:
        args.keep_raw.write_text(
            json.dumps(
                {"resolved": resolved, "all": all_rows, "report": payload},
                ensure_ascii=False,
                indent=2,
            )
        )

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    print(f"## PH Report ({day}) — matched {len(matched)}/{args.limit}\n")
    print("| 域名 | 一句话描述 | 流量 | Top Keywords |")
    print("|------|------------|------|--------------|")
    if not matched:
        print("| — | 无符合条件的结果 | — | — |")
    for m in matched:
        kws = ", ".join(m["top_keywords"][:5]) if m["top_keywords"] else "—"
        desc = (m["description"] or "").replace("|", "\\|")
        print(f"| {m['domain']} | {desc} | {m['visits']:,} | {kws} |")


if __name__ == "__main__":
    main()
