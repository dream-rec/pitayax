# Dependencies

`pitaya` requires Trellis and vendors the grill-me PRD skill behavior. It no longer installs MCP servers.

## Trellis

Source: https://github.com/mindfold-ai/trellis

```bash
npm install -g @mindfoldhq/trellis@latest
```

Initialize per platform:

```bash
trellis init -u your-name --cursor
trellis init -u your-name --claude
trellis init -u your-name --opencode
```

## Grill Me

Source: https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md

`pitaya` vendors the behavior as `pitaya-grill-prd` rather than depending on a global skill installer.
