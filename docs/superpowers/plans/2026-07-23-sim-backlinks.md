# sim backlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use opencli-adapter-author for recon → strategy → adapter → verify.

**Goal:** Deliver `opencli sim backlinks <domain> [--limit N]` via an opencli plugin in this repo.

**Architecture:** Plugin site `sim` targeting `sim.3ue.com`. Prefer COOKIE/PAGE_FETCH of the backlinks JSON API discovered via browser recon; fall back to INTERCEPT if needed.

**Tech Stack:** opencli plugin (TypeScript), Chrome session bridge, `@jackwener/opencli` registry.

---

### Task 1: Scaffold plugin

**Files:**
- Create: `opencli-plugin.json`, `package.json`, `README.md`, `backlinks.ts` (stub)

- [ ] Create plugin manifest + package.json at repo root
- [ ] Install with `opencli plugin install file://...`

### Task 2: Site recon

- [ ] `opencli browser analyze` on backlinks URL with sample domain
- [ ] Capture network XHR / page state for backlinks JSON
- [ ] Write strategy note

### Task 3: Implement backlinks

- [ ] Normalize domain, fetch API, map columns, honor `--limit`
- [ ] Typed errors for auth / empty / API failure

### Task 4: Verify

- [ ] `opencli sim backlinks <domain> -f json`
- [ ] `opencli browser verify` / fixture if applicable
- [ ] Update README
