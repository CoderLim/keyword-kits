import unittest
from types import SimpleNamespace
from unittest import mock

from keyword_ideas import apply_seed, fetch_keyword_ideas, parse_idea_result


class KeywordIdeasTests(unittest.TestCase):
    def test_parse_idea_result_maps_keyword_idea_metrics(self):
        result = SimpleNamespace(
            text="image to text",
            close_variants=["img to text"],
            keyword_idea_metrics=SimpleNamespace(
                avg_monthly_searches=1200,
                competition=SimpleNamespace(name="LOW"),
                competition_index=12,
                average_cpc_micros=1_500_000,
                low_top_of_page_bid_micros=800_000,
                high_top_of_page_bid_micros=3_000_000,
                monthly_search_volumes=[],
            ),
        )

        parsed = parse_idea_result(result)
        self.assertEqual(parsed["keyword"], "image to text")
        self.assertEqual(parsed["close_variants"], ["img to text"])
        self.assertEqual(parsed["average_monthly_searches"], 1200)
        self.assertEqual(parsed["competition"], "LOW")
        self.assertEqual(parsed["average_cpc"], 1.5)

    def test_parse_idea_result_handles_missing_metrics(self):
        result = SimpleNamespace(text="obscure phrase", close_variants=[])
        parsed = parse_idea_result(result)
        self.assertEqual(parsed["keyword"], "obscure phrase")
        self.assertEqual(parsed["average_monthly_searches"], 0)
        self.assertEqual(parsed["monthly_search_volumes"], [])

    def test_apply_seed_keyword_only(self):
        request = SimpleNamespace(
            keyword_seed=SimpleNamespace(keywords=[]),
            url_seed=SimpleNamespace(url=""),
            keyword_and_url_seed=SimpleNamespace(url="", keywords=[]),
            site_seed=SimpleNamespace(site=""),
        )
        apply_seed(request, ["gpts"], None, None)
        self.assertEqual(list(request.keyword_seed.keywords), ["gpts"])

    def test_apply_seed_url_only(self):
        request = SimpleNamespace(
            keyword_seed=SimpleNamespace(keywords=[]),
            url_seed=SimpleNamespace(url=""),
            keyword_and_url_seed=SimpleNamespace(url="", keywords=[]),
            site_seed=SimpleNamespace(site=""),
        )
        apply_seed(request, [], "https://example.com/ocr", None)
        self.assertEqual(request.url_seed.url, "https://example.com/ocr")

    def test_apply_seed_keyword_and_url(self):
        request = SimpleNamespace(
            keyword_seed=SimpleNamespace(keywords=[]),
            url_seed=SimpleNamespace(url=""),
            keyword_and_url_seed=SimpleNamespace(url="", keywords=[]),
            site_seed=SimpleNamespace(site=""),
        )
        apply_seed(request, ["ocr"], "https://example.com", None)
        self.assertEqual(request.keyword_and_url_seed.url, "https://example.com")
        self.assertEqual(list(request.keyword_and_url_seed.keywords), ["ocr"])

    def test_apply_seed_site_only(self):
        request = SimpleNamespace(
            keyword_seed=SimpleNamespace(keywords=[]),
            url_seed=SimpleNamespace(url=""),
            keyword_and_url_seed=SimpleNamespace(url="", keywords=[]),
            site_seed=SimpleNamespace(site=""),
        )
        apply_seed(request, [], None, "www.example.com")
        self.assertEqual(request.site_seed.site, "www.example.com")

    def test_apply_seed_rejects_site_with_keywords(self):
        request = SimpleNamespace()
        with self.assertRaises(ValueError):
            apply_seed(request, ["gpts"], None, "www.example.com")

    def test_apply_seed_requires_input(self):
        request = SimpleNamespace()
        with self.assertRaises(ValueError):
            apply_seed(request, [], None, None)

    def _mock_client(self, request, results):
        googleads_service = mock.Mock()
        googleads_service.language_constant_path.return_value = (
            "languageConstants/1000"
        )
        googleads_service.geo_target_constant_path.return_value = (
            "geoTargetConstants/2840"
        )
        keyword_plan_idea_service = mock.Mock()
        keyword_plan_idea_service.generate_keyword_ideas.return_value = results
        client = mock.Mock()
        client.get_service.side_effect = lambda name: {
            "GoogleAdsService": googleads_service,
            "KeywordPlanIdeaService": keyword_plan_idea_service,
        }[name]
        client.get_type.return_value = request
        client.enums.KeywordPlanNetworkEnum.GOOGLE_SEARCH = "GOOGLE_SEARCH"
        return client, googleads_service, keyword_plan_idea_service

    def test_fetch_keyword_ideas_builds_keyword_seed_request(self):
        request = SimpleNamespace(
            geo_target_constants=[],
            historical_metrics_options=SimpleNamespace(include_average_cpc=False),
            keyword_seed=SimpleNamespace(keywords=[]),
            url_seed=SimpleNamespace(url=""),
            keyword_and_url_seed=SimpleNamespace(url="", keywords=[]),
            site_seed=SimpleNamespace(site=""),
        )
        results = [
            SimpleNamespace(
                text="image to text",
                close_variants=[],
                keyword_idea_metrics=SimpleNamespace(
                    avg_monthly_searches=800,
                    competition=SimpleNamespace(name="LOW"),
                    competition_index=6,
                    average_cpc_micros=900_000,
                    low_top_of_page_bid_micros=None,
                    high_top_of_page_bid_micros=None,
                    monthly_search_volumes=[],
                ),
            ),
            SimpleNamespace(
                text="ocr converter",
                close_variants=[],
                keyword_idea_metrics=SimpleNamespace(
                    avg_monthly_searches=400,
                    competition=SimpleNamespace(name="MEDIUM"),
                    competition_index=40,
                    average_cpc_micros=1_200_000,
                    low_top_of_page_bid_micros=None,
                    high_top_of_page_bid_micros=None,
                    monthly_search_volumes=[],
                ),
            ),
        ]
        client, _, idea_service = self._mock_client(request, results)

        rows = fetch_keyword_ideas(
            client=client,
            customer_id="126-513-4925",
            language_id="1000",
            keywords=["image to text converter"],
            limit=10,
        )

        self.assertEqual(request.customer_id, "1265134925")
        self.assertEqual(request.language, "languageConstants/1000")
        self.assertEqual(request.keyword_plan_network, "GOOGLE_SEARCH")
        self.assertFalse(request.include_adult_keywords)
        self.assertTrue(request.historical_metrics_options.include_average_cpc)
        self.assertEqual(
            list(request.keyword_seed.keywords),
            ["image to text converter"],
        )
        self.assertEqual(request.geo_target_constants, [])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["keyword"], "image to text")
        idea_service.generate_keyword_ideas.assert_called_once()

    def test_fetch_keyword_ideas_applies_geo_and_limit(self):
        request = SimpleNamespace(
            geo_target_constants=[],
            historical_metrics_options=SimpleNamespace(include_average_cpc=False),
            keyword_seed=SimpleNamespace(keywords=[]),
            url_seed=SimpleNamespace(url=""),
            keyword_and_url_seed=SimpleNamespace(url="", keywords=[]),
            site_seed=SimpleNamespace(site=""),
        )
        results = [
            SimpleNamespace(
                text=f"kw {index}",
                close_variants=[],
                keyword_idea_metrics=SimpleNamespace(
                    avg_monthly_searches=index,
                    competition=SimpleNamespace(name="LOW"),
                    competition_index=1,
                    average_cpc_micros=None,
                    low_top_of_page_bid_micros=None,
                    high_top_of_page_bid_micros=None,
                    monthly_search_volumes=[],
                ),
            )
            for index in range(5)
        ]
        client, googleads_service, _ = self._mock_client(request, results)

        rows = fetch_keyword_ideas(
            client=client,
            customer_id="1265134925",
            language_id="1000",
            keywords=["gpts"],
            geo_target_ids=["2840"],
            limit=3,
        )

        self.assertEqual(request.geo_target_constants, ["geoTargetConstants/2840"])
        googleads_service.geo_target_constant_path.assert_called_with("2840")
        self.assertEqual(len(rows), 3)
        self.assertEqual(request.page_size, 3)


if __name__ == "__main__":
    unittest.main()
