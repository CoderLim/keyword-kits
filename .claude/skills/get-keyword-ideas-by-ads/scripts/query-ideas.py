#!/usr/bin/env python3
"""Generate keyword ideas via packages/google-ads with skill-friendly output."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
GOOGLE_ADS_DIR = REPO_ROOT / "packages" / "google-ads"
DEFAULT_CUSTOMER_ID = "1265134925"


def build_command(args: argparse.Namespace) -> list[str]:
    python_bin = GOOGLE_ADS_DIR / ".venv" / "bin" / "python"
    if not python_bin.is_file():
        python_bin = Path(sys.executable)

    command = [
        str(python_bin),
        "keyword_ideas.py",
        "--config",
        str(GOOGLE_ADS_DIR / "google-ads.yaml"),
        "--login-customer-id",
        args.login_customer_id,
        "--customer-id",
        args.customer_id,
        "--language-id",
        args.language_id,
        "--limit",
        str(args.limit),
        "--json",
        *args.keywords,
    ]
    for geo_target_id in args.geo_target_ids or []:
        command.extend(["--geo-target-id", geo_target_id])
    if args.url:
        command.extend(["--url", args.url])
    if args.site:
        command.extend(["--site", args.site])
    if args.csv:
        command.extend(["--csv", str(args.csv)])
    return command


def print_markdown(rows: list[dict]) -> None:
    if not rows:
        print("No keyword ideas returned.")
        return

    headers = [
        "keyword",
        "average_monthly_searches",
        "competition",
        "average_cpc",
    ]
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
        description="Generate Google Ads keyword ideas (skill wrapper)."
    )
    parser.add_argument(
        "keywords",
        nargs="*",
        help="Seed keywords. Optional if --url or --site is set.",
    )
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
        default="1000",
        help="Language constant ID (default: 1000 English).",
    )
    parser.add_argument(
        "--geo-target-id",
        action="append",
        dest="geo_target_ids",
        metavar="ID",
        help="Geo target ID. Omit for worldwide. Repeat for multiple regions.",
    )
    parser.add_argument(
        "--url",
        help="Page URL seed.",
    )
    parser.add_argument(
        "--site",
        help="Site domain seed. Cannot be combined with keywords or --url.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Max ideas to return (default: 50, max: 1000).",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print JSON to stdout.",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        help="Optional CSV output path.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if not args.keywords and not args.url and not args.site:
        print("Provide at least one keyword, --url, or --site.", file=sys.stderr)
        return 1

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
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_markdown(rows)

    if args.csv:
        print(f"\nWrote CSV to {args.csv.resolve()}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
