/**
 * ahrefs get-dr — Domain Rating via Ahrefs SEO Toolbar API (tbGetIconV3).
 *
 * Strategy: UI (browser used for first-time Toolbar OAuth only)
 * Contract:
 *   - GET https://ahrefs.com/v4/tbGetIconV3?input={"target":"<domain>"}
 *   - Auth: Authorization Bearer from Toolbar OAuth (scope tool-data)
 *   - Token cached at ~/.opencli/sites/ahrefs/toolbar-token.json (long-lived)
 * Evidence (2026-08-02 live):
 *   - Without Bearer → ["Error","Forbidden"]
 *   - With Bearer → ["Ok",{"stats":{"domain_rating":86.0,"ahrefs_rank":4357,"url_rating":25}}]
 *   - OAuth: app.ahrefs.com/web/oauth/authorize → Allow → chromiumapp.org/?code=…
 *     → POST ahrefs.com/oauth/token (PKCE). expires_in ~10y observed.
 * Auth: Chrome logged into Ahrefs for first OAuth / --reauth; later calls reuse cache
 *   (API fetch is plain HTTPS + Bearer; no captcha).
 * Browser: true
 */
import {
  AuthRequiredError,
  EmptyResultError,
} from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { normalizeDomain } from './lib.js';
import {
  fetchTbGetIcon,
  getToolbarToken,
  obtainToolbarToken,
  type PageLike,
} from './toolbar-auth.js';

const COLUMNS = ['domain', 'dr', 'ur', 'ahrefsRank'] as const;

type GetDrRow = {
  domain: string;
  dr: number;
  ur: number | null;
  ahrefsRank: number | null;
};

cli({
  site: 'ahrefs',
  name: 'get-dr',
  access: 'read',
  description:
    '查询域名 DR（Ahrefs SEO Toolbar tbGetIconV3；首次需浏览器 OAuth，token 会缓存）',
  domain: 'ahrefs.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'domain',
      type: 'string',
      required: true,
      positional: true,
      help: '目标域名（如 www.veed.io 或 veed.io）',
    },
    {
      name: 'reauth',
      type: 'boolean',
      default: false,
      help: '强制重新走 Toolbar OAuth 并刷新本地 token 缓存',
    },
  ],
  columns: [...COLUMNS],
  func: async (page, kwargs) => {
    const domain = normalizeDomain(kwargs.domain);
    const reauth = Boolean(kwargs.reauth);

    let token = reauth
      ? await obtainToolbarToken(page as PageLike)
      : await getToolbarToken(page as PageLike, { reauth: false });

    let stats;
    try {
      stats = await fetchTbGetIcon(domain, token.accessToken);
    } catch (err) {
      if (err instanceof AuthRequiredError && !reauth) {
        token = await obtainToolbarToken(page as PageLike);
        stats = await fetchTbGetIcon(domain, token.accessToken);
      } else {
        throw err;
      }
    }

    const row: GetDrRow = {
      domain,
      dr: Math.round(stats.domainRating),
      ur:
        typeof stats.urlRating === 'number'
          ? Math.round(stats.urlRating)
          : null,
      ahrefsRank:
        typeof stats.ahrefsRank === 'number' ? stats.ahrefsRank : null,
    };

    if (!Number.isFinite(row.dr)) {
      throw new EmptyResultError(
        'ahrefs get-dr',
        `No domain rating for ${domain}`,
      );
    }

    return [row];
  },
});
