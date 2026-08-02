/**
 * Ahrefs SEO Toolbar OAuth (scope: tool-data) + local token cache.
 *
 * Evidence (2026-08-02):
 *   - Authorize: https://app.ahrefs.com/web/oauth/authorize
 *     client_id=Ahrefs SEO Toolbar, scope=tool-data, PKCE S256
 *     redirect_uri=https://hgmoccdbjhknikckedaaebbpdeebhiei.chromiumapp.org/
 *   - Token: POST https://ahrefs.com/oauth/token
 *     body { grant_type, redirect_uri, code, client_id, code_verifier }
 *     → { access_token, expires_in, token_type, scope }
 *   - Live expires_in ≈ 315359999s (~10y); cache under ~/.opencli/sites/ahrefs/
 *   - After Allow, tab may land on chrome-error://; recover code URL via
 *     performance.getEntriesByType('navigation')[0].name
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import {
  AuthRequiredError,
  CommandExecutionError,
} from '@jackwener/opencli/errors';

export const TOOLBAR_CLIENT_ID = 'Ahrefs SEO Toolbar';
export const TOOLBAR_REDIRECT_URI =
  'https://hgmoccdbjhknikckedaaebbpdeebhiei.chromiumapp.org/';
export const TOOLBAR_SCOPE = 'tool-data';
export const OAUTH_AUTHORIZE_URL =
  'https://app.ahrefs.com/web/oauth/authorize';
export const OAUTH_TOKEN_URL = 'https://ahrefs.com/oauth/token';
export const TB_GET_ICON_URL = 'https://ahrefs.com/v4/tbGetIconV3';

const TOKEN_CACHE_DIR = join(homedir(), '.opencli', 'sites', 'ahrefs');
const TOKEN_CACHE_PATH = join(TOKEN_CACHE_DIR, 'toolbar-token.json');

/** Refresh a bit early to avoid edge expiry. */
const EXPIRY_SKEW_MS = 60_000;
const OAUTH_TIMEOUT_SEC = 90;

export type ToolbarToken = {
  accessToken: string;
  expiresAt: number;
  scope?: string;
  obtainedAt: number;
};

export type PageLike = {
  evaluate: (code: string) => Promise<unknown>;
  wait: (seconds: number) => Promise<void>;
  goto: (url: string) => Promise<unknown>;
  newTab?: (url?: string) => Promise<string | undefined>;
  selectTab?: (target: string | number) => Promise<void>;
};

export function tokenCachePath(): string {
  return TOKEN_CACHE_PATH;
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const qs = new URLSearchParams({
    response_type: 'code',
    client_id: TOOLBAR_CLIENT_ID,
    scope: TOOLBAR_SCOPE,
    state,
    redirect_uri: TOOLBAR_REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${OAUTH_AUTHORIZE_URL}?${qs.toString()}`;
}

export async function loadCachedToken(): Promise<ToolbarToken | null> {
  try {
    const raw = await readFile(TOKEN_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ToolbarToken>;
    if (
      typeof parsed.accessToken !== 'string'
      || !parsed.accessToken
      || typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      scope: typeof parsed.scope === 'string' ? parsed.scope : undefined,
      obtainedAt:
        typeof parsed.obtainedAt === 'number' ? parsed.obtainedAt : 0,
    };
  } catch {
    return null;
  }
}

export function isTokenValid(
  token: ToolbarToken | null,
  now = Date.now(),
): token is ToolbarToken {
  return !!token && token.expiresAt - EXPIRY_SKEW_MS > now;
}

export async function saveToken(token: ToolbarToken): Promise<void> {
  await mkdir(TOKEN_CACHE_DIR, { recursive: true });
  await writeFile(TOKEN_CACHE_PATH, `${JSON.stringify(token, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export async function exchangeCodeForToken(
  code: string,
  verifier: string,
): Promise<ToolbarToken> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      redirect_uri: TOOLBAR_REDIRECT_URI,
      code,
      client_id: TOOLBAR_CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new CommandExecutionError(
      `Ahrefs OAuth token exchange failed (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }
  let json: {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new CommandExecutionError(
      `Ahrefs OAuth token response is not JSON: ${text.slice(0, 200)}`,
    );
  }
  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new CommandExecutionError(
      'Ahrefs OAuth token response missing access_token / expires_in',
    );
  }
  const now = Date.now();
  return {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
    scope: json.scope,
    obtainedAt: now,
  };
}

async function openUrl(page: PageLike, url: string): Promise<void> {
  if (typeof page.newTab === 'function' && typeof page.selectTab === 'function') {
    const tabId = await page.newTab(url);
    if (tabId) await page.selectTab(tabId);
    return;
  }
  await page.goto(url);
}

const OAUTH_STATUS_JS = `(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const navUrl = nav && nav.name ? String(nav.name) : '';
  const href = location.href || '';
  const pick = navUrl.includes('code=') ? navUrl : href;
  try {
    const u = new URL(pick);
    const code = u.searchParams.get('code');
    if (code) return JSON.stringify({ status: 'code', code: code, url: pick });
    const err = u.searchParams.get('error');
    if (err) return JSON.stringify({ status: 'denied', error: err, url: pick });
  } catch {}

  const text = document.body?.innerText || '';
  if (/Allow access to your workspace/i.test(text)
    && /\\bAllow\\b/i.test(text)) {
    return JSON.stringify({ status: 'allow' });
  }
  if (/Choose your workspace/i.test(text)) {
    return JSON.stringify({ status: 'workspace' });
  }
  if (/Couldn.?t fetch data|invalid.?redirect|access_denied/i.test(text)) {
    return JSON.stringify({ status: 'error', detail: text.slice(0, 200) });
  }
  if (/sign in|log in|登录/i.test(text) && /ahrefs/i.test(document.title || '')) {
    return JSON.stringify({ status: 'auth' });
  }
  return JSON.stringify({ status: 'loading' });
})()`;

const CLICK_WORKSPACE_JS = `(() => {
  const row = document.querySelector('[class*="accountRow"]');
  if (row) { row.click(); return true; }
  return false;
})()`;

const CLICK_ALLOW_JS = `(() => {
  const btn = [...document.querySelectorAll('button, a, [role=button]')]
    .find((b) => /^\\s*Allow\\s*$/i.test((b.textContent || '').trim()));
  if (btn) { btn.click(); return true; }
  return false;
})()`;

/**
 * Interactive OAuth in the attached Chrome session. Caches token on success.
 * Requires the user to already be logged into Ahrefs (workspace picker / Allow).
 */
export async function obtainToolbarToken(page: PageLike): Promise<ToolbarToken> {
  const { verifier, challenge } = createPkce();
  const state = `opencli-${randomBytes(8).toString('hex')}`;
  const authorizeUrl = buildAuthorizeUrl(challenge, state);
  await openUrl(page, authorizeUrl);

  let clickedWorkspace = false;
  let clickedAllow = false;
  const deadline = Date.now() + OAUTH_TIMEOUT_SEC * 1000;

  while (Date.now() < deadline) {
    const raw = await page.evaluate(OAUTH_STATUS_JS);
    let status: {
      status: string;
      code?: string;
      error?: string;
      detail?: string;
    };
    try {
      status = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof status);
    } catch {
      status = { status: 'loading' };
    }

    if (status.status === 'code' && status.code) {
      const token = await exchangeCodeForToken(status.code, verifier);
      await saveToken(token);
      return token;
    }
    if (status.status === 'denied') {
      throw new AuthRequiredError(
        'ahrefs.com',
        `Ahrefs OAuth denied (${status.error || 'access_denied'}). Re-run and click Allow.`,
      );
    }
    if (status.status === 'auth') {
      throw new AuthRequiredError(
        'ahrefs.com',
        'Not logged in to Ahrefs — sign in via Chrome, then re-run opencli ahrefs get-dr',
      );
    }
    if (status.status === 'error') {
      throw new CommandExecutionError(
        `Ahrefs OAuth page error: ${status.detail || 'unknown'}`,
      );
    }
    if (status.status === 'workspace' && !clickedWorkspace) {
      clickedWorkspace = true;
      await page.evaluate(CLICK_WORKSPACE_JS);
    }
    if (status.status === 'allow' && !clickedAllow) {
      clickedAllow = true;
      await page.evaluate(CLICK_ALLOW_JS);
    }

    await page.wait(0.5);
  }

  throw new CommandExecutionError(
    `Timed out waiting for Ahrefs Toolbar OAuth (${OAUTH_TIMEOUT_SEC}s). `
      + 'Ensure Chrome is logged into Ahrefs and retry.',
  );
}

export async function getToolbarToken(
  page: PageLike,
  opts: { reauth?: boolean } = {},
): Promise<ToolbarToken> {
  if (!opts.reauth) {
    const cached = await loadCachedToken();
    if (isTokenValid(cached)) return cached;
  }
  return obtainToolbarToken(page);
}

export type IconStats = {
  domainRating: number;
  urlRating?: number;
  ahrefsRank?: number | null;
};

/** Parse Ahrefs v4 envelope ["Ok", payload] | ["Error", reason]. */
export function parseTbGetIconResponse(raw: unknown): IconStats {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new CommandExecutionError(
        `tbGetIconV3 response is not JSON: ${String(raw).slice(0, 200)}`,
      );
    }
  }
  if (!Array.isArray(data) || data.length < 2) {
    throw new CommandExecutionError(
      `Unexpected tbGetIconV3 shape: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  const tag = data[0];
  if (tag === 'Error') {
    const reason = String(data[1] ?? 'Error');
    if (/forbidden|unauthorized|invalid.?token/i.test(reason)) {
      throw new AuthRequiredError(
        'ahrefs.com',
        `tbGetIconV3 ${reason} — token missing/expired; re-run with --reauth`,
      );
    }
    throw new CommandExecutionError(`tbGetIconV3 error: ${reason}`);
  }
  if (tag !== 'Ok') {
    throw new CommandExecutionError(
      `Unexpected tbGetIconV3 tag: ${String(tag)}`,
    );
  }
  const payload = data[1] as {
    stats?: {
      domain_rating?: number;
      url_rating?: number;
      ahrefs_rank?: number | null;
    };
  };
  const dr = payload?.stats?.domain_rating;
  if (typeof dr !== 'number' || !Number.isFinite(dr)) {
    throw new CommandExecutionError(
      'tbGetIconV3 Ok payload missing stats.domain_rating',
    );
  }
  return {
    domainRating: dr,
    urlRating:
      typeof payload.stats?.url_rating === 'number'
        ? payload.stats.url_rating
        : undefined,
    ahrefsRank:
      payload.stats?.ahrefs_rank === null
        || typeof payload.stats?.ahrefs_rank === 'number'
        ? payload.stats.ahrefs_rank
        : undefined,
  };
}

export function buildTbGetIconUrl(target: string): string {
  const input = JSON.stringify({ target });
  return `${TB_GET_ICON_URL}?input=${encodeURIComponent(input)}`;
}

export async function fetchTbGetIcon(
  target: string,
  accessToken: string,
): Promise<IconStats> {
  const res = await fetch(buildTbGetIconUrl(target), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json;charset=utf-8',
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new AuthRequiredError(
      'ahrefs.com',
      `tbGetIconV3 HTTP ${res.status} — re-run with --reauth`,
    );
  }
  if (!res.ok) {
    throw new CommandExecutionError(
      `tbGetIconV3 HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  return parseTbGetIconResponse(text);
}
