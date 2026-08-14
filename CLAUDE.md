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
