#!/usr/bin/env python3
"""Fetch keyword historical metrics from Google Ads Keyword Plan Idea Service."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Iterable, Sequence

MICROS = 1_000_000
DEFAULT_LANGUAGE_ID = "1017"
DEFAULT_LOGIN_CUSTOMER_ID = "2748189611"
TABLE_FIELDNAMES = [
    "keyword",
    "close_variants",
    "average_monthly_searches",
    "competition",
    "competition_index",
    "average_cpc",
    "low_top_of_page_bid",
    "high_top_of_page_bid",
]
CSV_FIELDNAMES = TABLE_FIELDNAMES + ["monthly_search_volumes"]


def normalize_customer_id(value: str) -> str:
    return "".join(character for character in value if character.isdigit())


def format_results(rows: Sequence[dict]) -> list[dict]:
    return sorted(
        rows,
        key=lambda row: row["average_monthly_searches"],
        reverse=True,
    )


def micros_to_currency(micros: int | None) -> float | None:
    if micros is None:
        return None
    return micros / MICROS


def competition_name(competition) -> str | None:
    if competition is None:
        return None
    name = getattr(competition, "name", None)
    if name:
        return name
    return str(competition)


def enum_name(value) -> str | None:
    if value is None:
        return None
    name = getattr(value, "name", None)
    if name:
        return name
    return str(value)


def parse_monthly_search_volumes(volumes) -> list[dict]:
    return [
        {
            "year": volume.year,
            "month": enum_name(volume.month),
            "monthly_searches": volume.monthly_searches or 0,
        }
        for volume in volumes or []
    ]


def parse_metric_result(result) -> dict:
    metrics = result.keyword_metrics
    return {
        "keyword": result.text,
        "close_variants": list(result.close_variants) if result.close_variants else [],
        "average_monthly_searches": metrics.avg_monthly_searches or 0,
        "competition": competition_name(metrics.competition),
        "competition_index": metrics.competition_index,
        "average_cpc": micros_to_currency(metrics.average_cpc_micros),
        "low_top_of_page_bid": micros_to_currency(
            metrics.low_top_of_page_bid_micros
        ),
        "high_top_of_page_bid": micros_to_currency(
            metrics.high_top_of_page_bid_micros
        ),
        "monthly_search_volumes": parse_monthly_search_volumes(
            metrics.monthly_search_volumes
        ),
    }


def fetch_keyword_metrics(
    client,
    customer_id: str,
    keywords: Sequence[str],
    language_id: str | None = None,
    geo_target_ids: Sequence[str] | None = None,
) -> list[dict]:
    googleads_service = client.get_service("GoogleAdsService")
    keyword_plan_idea_service = client.get_service("KeywordPlanIdeaService")

    request = client.get_type("GenerateKeywordHistoricalMetricsRequest")
    request.customer_id = normalize_customer_id(customer_id)
    request.keywords.extend(keywords)
    if geo_target_ids:
        for geo_target_id in geo_target_ids:
            request.geo_target_constants.append(
                googleads_service.geo_target_constant_path(geo_target_id)
            )
    request.keyword_plan_network = (
        client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH
    )
    # Omit language = all languages (API default).
    if language_id:
        request.language = googleads_service.language_constant_path(language_id)
    request.historical_metrics_options.include_average_cpc = True

    response = keyword_plan_idea_service.generate_keyword_historical_metrics(
        request=request
    )
    return [parse_metric_result(result) for result in response.results]


def row_for_csv(row: dict) -> dict:
    close_variants = row.get("close_variants") or []
    if isinstance(close_variants, list):
        close_variants = ", ".join(close_variants)
    monthly_volumes = row.get("monthly_search_volumes") or []
    if isinstance(monthly_volumes, list):
        monthly_volumes = json.dumps(monthly_volumes, ensure_ascii=False)
    return {
        **row,
        "close_variants": close_variants,
        "monthly_search_volumes": monthly_volumes,
    }


def write_csv(rows: Sequence[dict], output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDNAMES)
        writer.writeheader()
        for row in rows:
            csv_row = row_for_csv(row)
            writer.writerow(
                {
                    field: "" if csv_row.get(field) is None else csv_row.get(field)
                    for field in CSV_FIELDNAMES
                }
            )


def print_json(rows: Sequence[dict]) -> None:
    print(json.dumps(rows, ensure_ascii=False, indent=2))


def print_table(rows: Sequence[dict]) -> None:
    if not rows:
        print("No keyword metrics returned.")
        return

    headers = TABLE_FIELDNAMES
    widths = {
        header: max(
            len(header),
            *(
                len(str(_table_cell(row, header)))
                for row in rows
            ),
        )
        for header in headers
    }

    header_line = " | ".join(header.ljust(widths[header]) for header in headers)
    separator = "-+-".join("-" * widths[header] for header in headers)
    print(header_line)
    print(separator)
    for row in rows:
        print(
            " | ".join(
                _table_cell(row, header).ljust(widths[header]) for header in headers
            )
        )
    print("\nUse --json for full data including monthly_search_volumes.")


def _table_cell(row: dict, header: str) -> str:
    value = row.get(header)
    if header == "close_variants" and isinstance(value, list):
        value = ", ".join(value)
    if value is None:
        return ""
    return str(value)


def load_google_ads_client(
    config_path: Path | None = None,
    login_customer_id: str | None = None,
):
    from google.ads.googleads import config as google_ads_config
    from google.ads.googleads.client import GoogleAdsClient

    config_data = google_ads_config.load_from_yaml_file(
        str(config_path) if config_path else None
    )
    if login_customer_id:
        config_data["login_customer_id"] = normalize_customer_id(login_customer_id)

    return GoogleAdsClient.load_from_dict(config_data)


def format_google_ads_error(exc) -> str:
    lines = [
        f'Request with ID "{exc.request_id}" failed with status '
        f'"{exc.error.code().name}".'
    ]
    for error in exc.failure.errors:
        lines.append(f"- {error.message}")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch keyword historical metrics via Google Ads "
            "GenerateKeywordHistoricalMetrics."
        )
    )
    parser.add_argument(
        "keywords",
        nargs="+",
        help="One or more keywords to query.",
    )
    parser.add_argument(
        "--customer-id",
        required=True,
        help="Google Ads customer ID used for the API request.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=Path("google-ads.yaml"),
        help="Path to google-ads.yaml (default: ./google-ads.yaml).",
    )
    parser.add_argument(
        "--geo-target-id",
        action="append",
        dest="geo_target_ids",
        metavar="ID",
        help=(
            "Geo target constant ID (2156=China, 2840=US). Repeat for multiple "
            "regions (max 10). Omit for worldwide."
        ),
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
        "--login-customer-id",
        help=(
            "Override login customer ID from config (e.g. test manager "
            "1265134925 for Test Account Access)."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print full results as JSON to stdout (for scripting/API use).",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        help="Optional CSV output path.",
    )
    return parser


def main(argv: Iterable[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    if not args.config.is_file():
        print(
            f"Config file not found: {args.config}. "
            "Run generate_refresh_token.py first.",
            file=sys.stderr,
        )
        return 1

    try:
        client = load_google_ads_client(
            args.config,
            login_customer_id=args.login_customer_id,
        )
        rows = fetch_keyword_metrics(
            client=client,
            customer_id=args.customer_id,
            keywords=args.keywords,
            language_id=args.language_id,
            geo_target_ids=args.geo_target_ids,
        )
    except Exception as exc:
        from google.ads.googleads.errors import GoogleAdsException

        if isinstance(exc, GoogleAdsException):
            print(format_google_ads_error(exc), file=sys.stderr)
        else:
            print(str(exc), file=sys.stderr)
        return 1

    rows = format_results(rows)
    if args.json:
        print_json(rows)
    else:
        print_table(rows)

    if args.csv:
        write_csv(rows, args.csv)
        print(f"\nWrote CSV to {args.csv.resolve()}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
