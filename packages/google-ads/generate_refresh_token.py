#!/usr/bin/env python3
"""Generate a refresh token and write a local google-ads.yaml config file."""

import argparse
import getpass
import json
import os
import stat
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPE = "https://www.googleapis.com/auth/adwords"
DEFAULT_LOGIN_CUSTOMER_ID = "2748189611"


def load_client_credentials(client_secrets_path: Path) -> tuple[str, str]:
    with client_secrets_path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    installed = payload.get("installed") or payload.get("web")
    if not installed:
        raise ValueError("OAuth JSON must contain an 'installed' or 'web' section.")

    client_id = installed["client_id"]
    client_secret = installed["client_secret"]
    return client_id, client_secret


def write_google_ads_yaml(
    output_path: Path,
    *,
    developer_token: str,
    client_id: str,
    client_secret: str,
    refresh_token: str,
    login_customer_id: str,
) -> None:
    content = (
        "developer_token: {developer_token}\n"
        "client_id: {client_id}\n"
        "client_secret: {client_secret}\n"
        "refresh_token: {refresh_token}\n"
        "login_customer_id: {login_customer_id}\n"
        "use_proto_plus: true\n"
    ).format(
        developer_token=developer_token,
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=refresh_token,
        login_customer_id=login_customer_id,
    )
    output_path.write_text(content, encoding="utf-8")
    output_path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Authorize Google Ads OAuth and create google-ads.yaml."
    )
    parser.add_argument(
        "--client-secrets",
        required=True,
        type=Path,
        help="Path to the downloaded Desktop OAuth client JSON.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("google-ads.yaml"),
        help="Output path for google-ads.yaml (default: ./google-ads.yaml).",
    )
    parser.add_argument(
        "--login-customer-id",
        default=DEFAULT_LOGIN_CUSTOMER_ID,
        help="MCC login customer ID without dashes.",
    )
    parser.add_argument(
        "--developer-token",
        default=os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", ""),
        help="Developer token (or set GOOGLE_ADS_DEVELOPER_TOKEN).",
    )
    args = parser.parse_args()

    if not args.client_secrets.is_file():
        print(f"Client secrets file not found: {args.client_secrets}", file=sys.stderr)
        return 1

    developer_token = args.developer_token.strip()
    if not developer_token:
        developer_token = getpass.getpass("Developer token: ").strip()
    if not developer_token:
        print("Developer token is required.", file=sys.stderr)
        return 1

    client_id, client_secret = load_client_credentials(args.client_secrets)

    flow = InstalledAppFlow.from_client_secrets_file(
        str(args.client_secrets),
        scopes=[SCOPE],
    )
    credentials = flow.run_local_server(
        port=0,
        access_type="offline",
        prompt="consent",
    )

    if not credentials.refresh_token:
        print(
            "No refresh token returned. Re-run with prompt=consent and use the "
            "authorized test user account.",
            file=sys.stderr,
        )
        return 1

    write_google_ads_yaml(
        args.output,
        developer_token=developer_token,
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=credentials.refresh_token,
        login_customer_id=args.login_customer_id,
    )

    print(f"Saved Google Ads config to {args.output.resolve()}")
    print("Do not commit this file. It is ignored by .gitignore.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
