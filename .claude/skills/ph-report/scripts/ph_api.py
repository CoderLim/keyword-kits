#!/usr/bin/env python3
"""Minimal Product Hunt GraphQL client for ph-report."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

API_URL = "https://api.producthunt.com/v2/api/graphql"

POSTS_QUERY = """
query GetPosts($first: Int, $after: String, $postedAfter: DateTime, $postedBefore: DateTime) {
  posts(first: $first, after: $after, postedAfter: $postedAfter, postedBefore: $postedBefore) {
    totalCount
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name
        tagline
        slug
        votesCount
        commentsCount
        url
        website
        featuredAt
        createdAt
        productLinks { type url }
      }
    }
  }
}
"""


def get_token() -> str:
    token = os.environ.get("PRODUCTHUNT_ACCESS_TOKEN")
    if not token:
        print("error: PRODUCTHUNT_ACCESS_TOKEN not set", file=sys.stderr)
        sys.exit(1)
    return token


def graphql(query: str, variables: dict | None = None) -> dict:
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {get_token()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"error: HTTP {e.code} - {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    if "errors" in data:
        print(f"error: {data['errors'][0]['message']}", file=sys.stderr)
        sys.exit(1)
    return data.get("data", {})


def fetch_posts(posted_after: str, posted_before: str, max_posts: int = 200) -> list[dict]:
    """Fetch posts in [posted_after, posted_before). Dates are ISO DateTime strings."""
    all_posts: list[dict] = []
    cursor = None
    while len(all_posts) < max_posts:
        page_size = min(20, max_posts - len(all_posts))  # PH caps ~20
        data = graphql(
            POSTS_QUERY,
            {
                "first": page_size,
                "after": cursor,
                "postedAfter": posted_after,
                "postedBefore": posted_before,
            },
        )
        posts_data = data.get("posts") or {}
        edges = posts_data.get("edges") or []
        for edge in edges:
            node = edge.get("node")
            if node:
                all_posts.append(node)
        page = posts_data.get("pageInfo") or {}
        if not page.get("hasNextPage") or not edges:
            break
        cursor = page.get("endCursor")
    return all_posts


def website_short_url(post: dict) -> str | None:
    """Prefer productLinks Website, else post.website."""
    for link in post.get("productLinks") or []:
        if (link.get("type") or "").lower() == "website" and link.get("url"):
            return link["url"]
    return post.get("website") or None
