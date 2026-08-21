# Project notes for agents

## Skills location

Skill **source of truth** is `.claude/skills/`.

- Put all skill files under `.claude/skills/<skill-name>/`
- `.cursor/skills/<skill-name>` is only a symlink to `../../.claude/skills/<skill-name>` for Cursor discovery
- `~/.claude/skills/<skill-name>` must be a symlink to this repo’s `.claude/skills/<skill-name>` so Claude Code can use the skill globally
- Do not duplicate skill source under `.cursor/skills/`

### New or moved skills

From the repo root, after creating or moving a skill:

```bash
SKILL=my-skill
ln -sf ../../.claude/skills/$SKILL .cursor/skills/$SKILL
ln -sf "$(pwd)/.claude/skills/$SKILL" ~/.claude/skills/$SKILL
```

Verify: `SKILL.md` resolves via both symlinks.

## HTTP 429 handling

- When an HTTP request can receive `429 Too Many Requests`, use the shared library under `packages/rotating-request/`. Do not add a separate retry loop, fixed sleep, or provider-specific channel rewrite inside an individual package.
- Python: use `RotatingSession.from_env()` from `rotating_request`.
- TypeScript/Node: use `RotatingClient.fromEnv()` from `@keyword-kits/rotating-request`, and call `await client.close()` when finished.
- QingGuo automatic IP rotation requires `USE_PROXY=true` and `TUNNEL_PROXY_FORMAT=tagged` with complete `TUNNEL_*` configuration.
- Automatic 429 replay is for safe methods (`GET`, `HEAD`, `OPTIONS`) only. Do not automatically replay mutation requests such as `POST`, `PUT`, `PATCH`, or `DELETE`.
- For libraries that convert blocking responses into exceptions, such as `youtube-transcript-api` raising `RequestBlocked` or `IpBlocked`, use the optional `run()` operation-level retry API and explicitly select those exceptions.
- See `packages/rotating-request/README.md` for configuration, custom rotators, concurrency constraints, and examples.
