# mcp-panel

A Claude Code mod that shows your MCP servers as a card grid in a side pane.

- Lists every server: the ones in your own config and the connections the Claude app adds (Notion, Asana, Meta Ads and so on)
- Readable names ("Google Ads MCP", not `google-ads-mcp`)
- Grouped by what each one is for: Ads, Work tools, Automation, Browser and screen, Helpers
- Anything broken sits on top under **Needs a look**, with a short reason and a **Retry** button
- Servers turned off for a folder show **Turn on**
- An **MCP** button in the prompt footer opens the pane (shows "MCP · 1 down" when something is broken)

## Install

```
/plugin install mcp-panel --marketplace peiliangkrausse-oss/mcp-panel
```

Then open it with `/mcp-panel` or the **MCP** footer button.
