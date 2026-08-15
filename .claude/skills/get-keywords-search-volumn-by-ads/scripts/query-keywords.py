#!/usr/bin/env python3
"""Query keyword search volume via packages/google-ads with skill-friendly output."""

from __future__ import annotations

import argparse
import calendar
import json
import subprocess
import sys
from pathlib import Path

MONTHS = {
    "JANUARY": 1,
    "FEBRUARY": 2,
    "MARCH": 3,
    "APRIL": 4,
    "MAY": 5,
    "JUNE": 6,
    "JULY": 7,
    "AUGUST": 8,
    "SEPTEMBER": 9,
    "OCTOBER": 10,
    "NOVEMBER": 11,
    "DECEMBER": 12,
}

REPO_ROOT = Path(__file__).resolve().parents[4]
GOOGLE_ADS_DIR = REPO_ROOT / "packages" / "google-ads"
DEFAULT_CUSTOMER_ID = "1265134925"


def latest_month(volumes: list[dict]) -> dict | None:
    if not volumes:
        return None
    return max(volumes, key=lambda volume: (volume["year"], MONTHS[volume["month"]]))


def daily_average(monthly_searches: int, year: int, month: int) -> float:
    days = calendar.monthrange(year, month)[1]
    return monthly_searches / days


def enrich_rows(rows: list[dict], include_daily: bool) -> list[dict]:
    enriched: list[dict] = []
    for row in rows:
        item = dict(row)
        month = latest_month(row.get("monthly_search_volumes") or [])
        if month:
            month_num = MONTHS[month["month"]]
            item["latest_month"] = f"{month['year']}-{month_num:02d}"
            item["latest_monthly_searches"] = month["monthly_searches"]
            if include_daily:
                item["daily_average"] = round(
                    daily_average(month["monthly_searches"], month["year"], month_num)
                )
        else:
            item["latest_month"] = None
            item["latest_monthly_searches"] = None
            if include_daily:
                item["daily_average"] = None
        enriched.append(item)
    # Default ranking: latest complete month, not 12-month average.
    enriched.sort(
        key=lambda row: row.get("latest_monthly_searches") or 0,
        reverse=True,
    )
    return enriched


def build_command(args: argparse.Namespace) -> list[str]:
    python_bin = GOOGLE_ADS_DIR / ".venv" / "bin" / "python"
    if not python_bin.is_file():
        python_bin = Path(sys.executable)

    command = [
        str(python_bin),
        "keyword_volume.py",
        "--config",
        str(GOOGLE_ADS_DIR / "google-ads.yaml"),
        "--login-customer-id",
        args.login_customer_id,
        "--customer-id",
        args.customer_id,
        "--json",
        *args.keywords,
    ]
    if args.language_id:
        command.extend(["--language-id", args.language_id])
    for geo_target_id in args.geo_target_ids or []:
        command.extend(["--geo-target-id", geo_target_id])
    if args.csv:
        command.extend(["--csv", str(args.csv)])
    return command


def print_markdown(rows: list[dict], include_daily: bool, include_average: bool) -> None:
    if not rows:
        print("No keyword metrics returned.")
        return

    headers = [
        "keyword",
        "latest_month",
        "latest_monthly_searches",
        "competition",
        "average_cpc",
    ]
    if include_daily:
        headers.append("daily_average")
    if include_average:
        headers.append("average_monthly_searches")

    widths = {
        header: max(
            len(header),
            *(len(str(row.get(header, "") or "")) for row in rows),
        )
        for header in headers
    }

    print(" | ".join(header.ljust(widths[header]) for header in headers))
    print("-+-".join("-" * widths[header] for header in headers))
    for row in rows:
        values = []
        for header in headers:
            value = row.get(header, "")
            if value is None:
                value = ""
            values.append(str(value).ljust(widths[header]))
        print(" | ".join(values))

    variants = [
        (row["keyword"], row.get("close_variants") or [])
        for row in rows
        if row.get("close_variants")
    ]
    if variants:
        print("\nclose_variants:")
        for keyword, close_variants in variants:
            print(f"- {keyword}: {', '.join(close_variants)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Query Google Ads keyword search volume (skill wrapper)."
    )
    parser.add_argument("keywords", nargs="+", help="Keywords to query.")
    parser.add_argument(
        "--customer-id",
        default=DEFAULT_CUSTOMER_ID,
        help=f"Google Ads customer ID (default: {DEFAULT_CUSTOMER_ID}).",
    )
    parser.add_argument(
        "--login-customer-id",
        default=DEFAULT_CUSTOMER_ID,
        help=f"Login customer ID (default: {DEFAULT_CUSTOMER_ID}).",
    )
    parser.add_argument(
        "--language-id",
        default=None,
        help=(
            "Language constant ID (1000=English, 1017=Chinese Simplified). "
            "Omit for all languages."
        ),
    )
    parser.add_argument(
        "--geo-target-id",
        action="append",
        dest="geo_target_ids",
        metavar="ID",
        help="Geo target ID. Omit for worldwide. Repeat for multiple regions.",
    )
    parser.add_argument(
        "--daily",
        action="store_true",
        help="Also show daily average of the latest complete month.",
    )
    parser.add_argument(
        "--average",
        action="store_true",
        help="Also show 12-month average_monthly_searches.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print JSON to stdout.",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        help="Optional CSV output path (passed to keyword_volume.py).",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()

    config_path = GOOGLE_ADS_DIR / "google-ads.yaml"
    if not config_path.is_file():
        print(
            f"Config not found: {config_path}. Run generate_refresh_token.py first.",
            file=sys.stderr,
        )
        return 1

    command = build_command(args)
    completed = subprocess.run(
        command,
        cwd=GOOGLE_ADS_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        sys.stderr.write(completed.stderr or completed.stdout)
        return completed.returncode

    rows = json.loads(completed.stdout)
    rows = enrich_rows(rows, include_daily=args.daily)

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_markdown(
            rows,
            include_daily=args.daily,
            include_average=args.average,
        )

    if args.csv:
        print(f"\nWrote CSV to {args.csv.resolve()}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
