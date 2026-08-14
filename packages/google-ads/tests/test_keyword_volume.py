import csv
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from keyword_volume import (
    CSV_FIELDNAMES,
    parse_metric_result,
    parse_monthly_search_volumes,
    format_results,
    micros_to_currency,
    normalize_customer_id,
    write_csv,
)


class KeywordVolumeTests(unittest.TestCase):
    def test_normalize_customer_id_removes_dashes_and_spaces(self):
        self.assertEqual(normalize_customer_id("274-818-9611"), "2748189611")
        self.assertEqual(normalize_customer_id(" 274 818 9611 "), "2748189611")

    def test_format_results_sorts_by_monthly_searches_descending(self):
        rows = [
            {
                "keyword": "small keyword",
                "average_monthly_searches": 120,
                "competition": "LOW",
            },
            {
                "keyword": "large keyword",
                "average_monthly_searches": 4200,
                "competition": "HIGH",
            },
        ]

        self.assertEqual(
            format_results(rows),
            [
                {
                    "keyword": "large keyword",
                    "average_monthly_searches": 4200,
                    "competition": "HIGH",
                },
                {
                    "keyword": "small keyword",
                    "average_monthly_searches": 120,
                    "competition": "LOW",
                },
            ],
        )

    def test_micros_to_currency_converts_micros(self):
        self.assertEqual(micros_to_currency(2_500_000), 2.5)
        self.assertIsNone(micros_to_currency(None))

    def test_parse_metric_result_maps_api_fields(self):
        competition = SimpleNamespace(name="HIGH")
        metrics = SimpleNamespace(
            avg_monthly_searches=1200,
            competition=competition,
            competition_index=78,
            average_cpc_micros=2_000_000,
            low_top_of_page_bid_micros=1_000_000,
            high_top_of_page_bid_micros=3_500_000,
            monthly_search_volumes=[
                SimpleNamespace(
                    year=2025,
                    month=SimpleNamespace(name="AUGUST"),
                    monthly_searches=900,
                ),
                SimpleNamespace(
                    year=2025,
                    month=SimpleNamespace(name="SEPTEMBER"),
                    monthly_searches=1500,
                ),
            ],
        )
        result = SimpleNamespace(
            text="独立站",
            close_variants=["独立站 搭建"],
            keyword_metrics=metrics,
        )

        parsed = parse_metric_result(result)
        self.assertEqual(parsed["keyword"], "独立站")
        self.assertEqual(parsed["close_variants"], ["独立站 搭建"])
        self.assertEqual(parsed["average_monthly_searches"], 1200)
        self.assertEqual(parsed["competition"], "HIGH")
        self.assertEqual(parsed["competition_index"], 78)
        self.assertEqual(parsed["average_cpc"], 2.0)
        self.assertEqual(parsed["low_top_of_page_bid"], 1.0)
        self.assertEqual(parsed["high_top_of_page_bid"], 3.5)
        self.assertEqual(
            parsed["monthly_search_volumes"],
            parse_monthly_search_volumes(metrics.monthly_search_volumes),
        )

    def test_parse_monthly_search_volumes_returns_structured_entries(self):
        volumes = [
            SimpleNamespace(
                year=2026,
                month=SimpleNamespace(name="JULY"),
                monthly_searches=2740000,
            )
        ]
        self.assertEqual(
            parse_monthly_search_volumes(volumes),
            [{"year": 2026, "month": "JULY", "monthly_searches": 2740000}],
        )

    def test_write_csv_writes_expected_columns(self):
        rows = [
            {
                "keyword": "google ads",
                "close_variants": [],
                "average_monthly_searches": 9900,
                "competition": "MEDIUM",
                "competition_index": 55,
                "average_cpc": 1.5,
                "low_top_of_page_bid": 1.25,
                "high_top_of_page_bid": 4.75,
                "monthly_search_volumes": [
                    {"year": 2026, "month": "JULY", "monthly_searches": 9900}
                ],
            }
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "metrics.csv"
            write_csv(rows, output_path)

            with output_path.open(encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                self.assertEqual(reader.fieldnames, CSV_FIELDNAMES)
                read_rows = list(reader)
                self.assertEqual(len(read_rows), 1)
                self.assertEqual(read_rows[0]["keyword"], "google ads")
                self.assertEqual(read_rows[0]["close_variants"], "")
                self.assertEqual(read_rows[0]["average_monthly_searches"], "9900")
                self.assertEqual(read_rows[0]["competition"], "MEDIUM")
                self.assertEqual(read_rows[0]["competition_index"], "55")
                self.assertEqual(read_rows[0]["average_cpc"], "1.5")
                self.assertEqual(read_rows[0]["low_top_of_page_bid"], "1.25")
                self.assertEqual(read_rows[0]["high_top_of_page_bid"], "4.75")
                self.assertIn("monthly_searches", read_rows[0]["monthly_search_volumes"])

    def test_fetch_keyword_metrics_builds_request(self):
        googleads_service = mock.Mock()
        googleads_service.geo_target_constant_path.return_value = (
            "geoTargetConstants/2156"
        )
        googleads_service.language_constant_path.return_value = (
            "languageConstants/1017"
        )

        keyword_plan_idea_service = mock.Mock()
        response = SimpleNamespace(
            results=[
                SimpleNamespace(
                    text="独立站",
                    close_variants=[],
                    keyword_metrics=SimpleNamespace(
                        avg_monthly_searches=500,
                        competition=SimpleNamespace(name="LOW"),
                        competition_index=20,
                        average_cpc_micros=800_000,
                        low_top_of_page_bid_micros=500_000,
                        high_top_of_page_bid_micros=1_500_000,
                        monthly_search_volumes=[],
                    ),
                )
            ]
        )
        keyword_plan_idea_service.generate_keyword_historical_metrics.return_value = (
            response
        )

        request = SimpleNamespace(
            keywords=[],
            geo_target_constants=[],
            historical_metrics_options=SimpleNamespace(include_average_cpc=False),
        )

        client = mock.Mock()
        client.get_service.side_effect = lambda name: {
            "GoogleAdsService": googleads_service,
            "KeywordPlanIdeaService": keyword_plan_idea_service,
        }[name]
        client.get_type.return_value = request
        client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH = "GOOGLE_SEARCH"

        from keyword_volume import fetch_keyword_metrics

        from keyword_volume import fetch_keyword_metrics

        rows = fetch_keyword_metrics(
            client=client,
            customer_id="274-818-9611",
            keywords=["独立站"],
            language_id="1017",
            geo_target_ids=["2156"],
        )

        self.assertEqual(request.customer_id, "2748189611")
        self.assertEqual(list(request.keywords), ["独立站"])
        self.assertEqual(request.geo_target_constants, ["geoTargetConstants/2156"])
        self.assertEqual(request.language, "languageConstants/1017")
        self.assertEqual(request.keyword_plan_network, "GOOGLE_SEARCH")
        self.assertTrue(request.historical_metrics_options.include_average_cpc)
        self.assertEqual(rows[0]["keyword"], "独立站")
        self.assertEqual(rows[0]["average_monthly_searches"], 500)
        self.assertEqual(rows[0]["average_cpc"], 0.8)

    def test_fetch_keyword_metrics_omits_geo_for_worldwide(self):
        googleads_service = mock.Mock()
        keyword_plan_idea_service = mock.Mock()
        keyword_plan_idea_service.generate_keyword_historical_metrics.return_value = (
            SimpleNamespace(results=[])
        )

        request = SimpleNamespace(
            keywords=[],
            geo_target_constants=[],
            historical_metrics_options=SimpleNamespace(include_average_cpc=False),
        )

        client = mock.Mock()
        client.get_service.side_effect = lambda name: {
            "GoogleAdsService": googleads_service,
            "KeywordPlanIdeaService": keyword_plan_idea_service,
        }[name]
        client.get_type.return_value = request
        client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH = "GOOGLE_SEARCH"

        from keyword_volume import fetch_keyword_metrics

        fetch_keyword_metrics(
            client=client,
            customer_id="1265134925",
            keywords=["gpts"],
            language_id="1000",
        )

        self.assertEqual(request.geo_target_constants, [])
        googleads_service.geo_target_constant_path.assert_not_called()


if __name__ == "__main__":
    unittest.main()
