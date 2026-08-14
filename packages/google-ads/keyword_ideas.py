#!/usr/bin/env python3
"""Generate keyword ideas from Google Ads Keyword Plan Idea Service."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Iterable, Sequence

from keyword_volume import (
    CSV_FIELDNAMES,
    DEFAULT_LANGUAGE_ID,
    format_google_ads_error,
    format_results,
    load_google_ads_client,
    normalize_customer_id,
    parse_metric_result,
    print_json,
    print_table,
    write_csv,
)

DEFAULT_LIMIT = 50
MAX_LIMIT = 1000


def parse_idea_result(result) -> dict:
    metrics = getattr(result, "keyword_idea_metrics", None)
    close_variants = getattr(result, "close_variants", None)
    if metrics is None:
        metrics = SimpleNamespace(
            avg_monthly_searches=0,
            competition=None,
            competition_index=None,
            average_cpc_micros=None,
            low_top_of_page_bid_micros=None,
            high_top_of_page_bid_micros=None,
            monthly_search_volumes=[],
        )
    wrapper = SimpleNamespace(
        text=result.text,
        close_variants=close_variants,
        keyword_metrics=metrics,
    )
    return parse_metric_result(wrapper)


def apply_seed(
    request,
    keywords: Sequence[str],
    page_url: str | None,
    site: str | None,
) -> None:
    has_keywords = bool(keywords)
    if site and (has_keywords or page_url):
        raise ValueError("--site cannot be combined with keywords or --url.")
    if not has_keywords and not page_url and not site:
        raise ValueError("Provide at least one keyword, --url, or --site.")

    if site:
        request.site_seed.site = site
        return
    if has_keywords and page_url:
        request.keyword_and_url_seed.url = page_url
        request.keyword_and_url_seed.keywords.extend(keywords)
        return
    if page_url:
        request.url_seed.url = page_url
        return
    request.keyword_seed.keywords.extend(keywords)


def fetch_keyword_ideas(
    client,
    customer_id: str,
    language_id: str,
    keywords: Sequence[str] | None = None,
    page_url: str | None = None,
    site: str | None = None,
    geo_target_ids: Sequence[str] | None = None,
    limit: int = DEFAULT_LIMIT,
) -> list[dict]:
    googleads_service = client.get_service("GoogleAdsService")
    keyword_plan_idea_service = client.get_service("KeywordPlanIdeaService")

    request = client.get_type("GenerateKeywordIdeasRequest")
    request.customer_id = normalize_customer_id(customer_id)
    request.language = googleads_service.language_constant_path(language_id)
    request.keyword_plan_network = (
        client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH
    )
    request.include_adult_keywords = False
    request.historical_metrics_options.include_average_cpc = True
    request.page_size = max(1, min(limit, MAX_LIMIT))
    if geo_target_ids:
        for geo_target_id in geo_target_ids:
            request.geo_target_constants.append(
                googleads_service.geo_target_constant_path(geo_target_id)
            )
    apply_seed(request, keywords or [], page_url, site)

    response = keyword_plan_idea_service.generate_keyword_ideas(request=request)
    results = response if hasattr(response, "__iter__") else response.results

    rows: list[dict] = []
    for result in results:
        rows.append(parse_idea_result(result))
        if len(rows) >= limit:
            break
    return rows


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Generate keyword ideas via Google Ads GenerateKeywordIdeas."
        )
    )
    parser.add_argument(
        "keywords",
        nargs="*",
        help="Seed keywords (KeywordSeed). Optional if --url or --site is set.",
    )
    parser.add_argument(
        "--url",
        help="Page URL seed (UrlSeed, or KeywordAndUrlSeed when combined with keywords).",
    )
    parser.add_argument(
        "--site",
        help="Site domain seed (SiteSeed). Cannot be combined with keywords or --url.",
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
        default=DEFAULT_LANGUAGE_ID,
        help=(
            f"Language constant ID (default: {DEFAULT_LANGUAGE_ID} for "
            "Chinese Simplified)."
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
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Max ideas to return (default: {DEFAULT_LIMIT}, max: {MAX_LIMIT}).",
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

    if args.limit < 1 or args.limit > MAX_LIMIT:
        print(f"--limit must be an integer 1-{MAX_LIMIT}.", file=sys.stderr)
        return 1

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
        rows = fetch_keyword_ideas(
            client=client,
            customer_id=args.customer_id,
            language_id=args.language_id,
            keywords=args.keywords,
            page_url=args.url,
            site=args.site,
            geo_target_ids=args.geo_target_ids,
            limit=args.limit,
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
