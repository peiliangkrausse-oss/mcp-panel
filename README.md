# mcp-panel

A Claude Code mod that shows your MCP servers as a card grid in a side pane.

- One card per server: icon, live/down dot, tool count, short error ("Not running", "Timed out")
- **Retry** on broken servers, **Turn off / Turn on** per server (uses `/mcp disable|enable`, saved per folder)
- Grouped by source, newest-added first, with a **Refresh** button
- An **MCP** button in the prompt footer opens the pane (shows "MCP · 1 down" when something is broken)

## Install

```
/plugin install mcp-panel --marketplace peiliangkrausse-oss/mcp-panel
```

Then open it with `/mcp-panel` or the **MCP** footer button.
