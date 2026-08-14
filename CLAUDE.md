# Project notes for agents

## Skills location

Skill **source of truth** is `.claude/skills/`.

- Put all skill files under `.claude/skills/<skill-name>/`
- `.cursor/skills/<skill-name>` is only a symlink to `../../.claude/skills/<skill-name>` for Cursor discovery
- Do not duplicate skill source under `.cursor/skills/`
