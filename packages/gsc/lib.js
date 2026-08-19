import { ArgumentError } from "@jackwener/opencli/errors";
const SEARCH_CONSOLE_URL = "https://search.google.com/search-console";
function normalizeTargetUrl(raw) {
  const input = String(raw ?? "").trim();
  if (!input) throw new ArgumentError("url is required");
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new ArgumentError(`invalid url "${input}"`);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ArgumentError(`unsupported url protocol "${parsed.protocol}"`);
  }
  if (!parsed.hostname) {
    throw new ArgumentError(`invalid url "${input}"`);
  }
  return parsed.toString();
}
function normalizeProperty(raw, targetUrl) {
  const input = String(raw ?? "").trim();
  if (!input) {
    const parsed2 = new URL(targetUrl);
    return `${parsed2.origin}/`;
  }
  if (input.startsWith("sc-domain:")) return input;
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new ArgumentError(
      `invalid property "${input}". Use sc-domain:example.com or a full URL-prefix property`
    );
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ArgumentError(`unsupported property protocol "${parsed.protocol}"`);
  }
  if (!parsed.pathname.endsWith("/")) parsed.pathname = `${parsed.pathname}/`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}
function buildPropertyUrl(property) {
  return `${SEARCH_CONSOLE_URL}?resource_id=${encodeURIComponent(property)}`;
}
export {
  SEARCH_CONSOLE_URL,
  buildPropertyUrl,
  normalizeProperty,
  normalizeTargetUrl
};
