import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, Health, Server } from '../types'

const PANE = 'mcp-panel'
const EMPTY: Board = { servers: [], checkedAt: 0, isChecking: false, busy: '', note: '' }
const boardAtom = atom({ plugin: 'mcp-panel', key: 'board' } as const, EMPTY)

// A picture per server, picked from words in its name; a plug otherwise.
const ICONS: [RegExp, string][] = [
  [/unreal|unity|game/i, '🎮'],
  [/blender|3d/i, '🧊'],
  [/photo|image/i, '🖼️'],
  [/film|video|movie/i, '🎬'],
  [/effect|motion/i, '✨'],
  [/light/i, '💡'],
  [/pdf|doc/i, '📄'],
  [/vector|design|figma/i, '✏️'],
  [/mail|gmail/i, '✉️'],
  [/notion|drive|slack|asana/i, '🗂️'],
  [/rea|reverse|search/i, '🔍'],
  [/laya|decide|route/i, '🧭'],
]
export const iconFor = (name: string) => ICONS.find(([re]) => re.test(name))?.[1] ?? '🔌'

// How tool names spell a server: anything but letters, digits, _ and - becomes _.
const toolKey = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, '_')

// One line of `claude mcp list`: "name: command - ✔ Connected".
export const parseList = (stdout: string): { name: string; group: string; order: number; health: Health; detail: string }[] =>
  stdout.split('\n').flatMap((line, order) => {
    const colon = line.indexOf(': ')
    const dash = line.lastIndexOf(' - ')
    if (colon <= 0 || dash <= colon) return []
    const name = line.slice(0, colon).trim()
    const status = line.slice(dash + 3).trim()
    const health: Health = /\bConnected\b/.test(status) ? 'ok' : /auth/i.test(status) ? 'auth' : /fail/i.test(status) ? 'down' : 'unknown'
    const command = line.slice(colon + 2, dash)
    return [{ name, group: groupFor(name, command), order, health, detail: health === 'ok' ? '' : reasonFor(status) }]
  })

// Which group a card sits in: the project folder that ships the server
// ("02 Projects/15 ArtCraft MCP Setup" -> "ArtCraft"), else a kind by name.
export const groupFor = (name: string, command: string) => {
  const project = /02 Projects\/\d+\s+([^/]+)\//.exec(command)?.[1]
  if (project) return project.replace(/\s+MCP Setup$/i, '').replace(/\s+MCP$/i, '').trim()
  if (/blender|unreal|unity|3d/i.test(name)) return '3D'
  if (/^claude\.ai /i.test(name) || /^https?:/.test(command.trim())) return 'Online'
  return 'Other'
}

// The error in a few plain words: what a card has room for.
export const reasonFor = (status: string) => {
  if (/ECONNREFUSED/i.test(status)) return 'Not running'
  if (/CONNECTION_CLOSED|connection closed/i.test(status)) return 'Closed on start'
  if (/timed? ?out|ETIMEDOUT/i.test(status)) return 'Timed out'
  if (/ENOENT|not found/i.test(status)) return 'App not found'
  if (/auth/i.test(status)) return 'Needs sign-in'
  return 'Down'
}

// Servers the Claude app hands the session itself never show in `mcp list`;
// their tools still do. Its own window controls (ccd_*) are left out.
const isAppInternal = (key: string) => /^ccd_/.test(key)
const isId = (key: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(key)

// A readable name for a server the app adds under an id, guessed from its tools.
const NAMES: [RegExp, string][] = [
  [/__notion-/, 'Notion'],
  [/__ads_/, 'Meta Ads'],
  [/__(get_my_tasks|create_project|get_portfolios)$/, 'Asana'],
  [/__(show_widget|read_me)$/, 'Visualize'],
  [/__(batch|guide|export)$/, 'Claude Docs'],
]
export const nameFor = (key: string, toolNames: string[]) => {
  if (!isId(key)) return key.replace(/_/g, ' ')
  return NAMES.find(([re]) => toolNames.some(t => re.test(t)))?.[1] ?? key
}

// Every MCP server the session has tools from, by its tool-name key.
export const fromTools = (tools: { name: string; mcp: boolean }[]) => {
  const byKey: Record<string, string[]> = {}
  for (const t of tools) {
    if (!t.mcp) continue
    const key = t.name.split('__')[1] ?? ''
    if (key) (byKey[key] ??= []).push(t.name)
  }
  return byKey
}

// The name a person knows a server by; the config key stays the one /mcp takes.
const LABELS: [RegExp, string][] = [
  [/^google[-_ ]?ads/i, 'Google Ads'],
  [/^reddit[-_ ]?ads/i, 'Reddit Ads'],
  [/^n8n/i, 'n8n'],
  [/docker/i, 'Docker'],
  [/^claude[-_ ]in[-_ ]chrome$/i, 'Chrome'],
  [/^claude[-_ ]browser$/i, 'Claude browser'],
  [/ios[-_ ]simulator/i, 'iPhone simulator'],
  [/^scheduled[-_ ]tasks$/i, 'Scheduled tasks'],
  [/^mcp[-_ ]registry$/i, 'Connector finder'],
]
export const labelFor = (name: string) => {
  const found = LABELS.find(([re]) => re.test(name))?.[1]
  if (found) return found
  const plain = name.replace(/^claude\.ai /i, '').replace(/[_-]+/g, ' ').trim()
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

// The shelf a server sits on, by what it is for. Order here is the order drawn.
export const KINDS: { name: string; match: RegExp }[] = [
  { name: 'Ads', match: /ads|meta|google|reddit|tiktok|linkedin/i },
  { name: 'Work tools', match: /notion|asana|docs|slack|drive|gmail|mail|calendar|sheets/i },
  { name: 'Automation', match: /n8n|schedul|docker|zapier|make/i },
  { name: 'Browser and screen', match: /browser|chrome|simulator|terminal|computer/i },
]
export const kindFor = (label: string) => KINDS.find(k => k.match.test(label))?.name ?? 'Helpers'

let cwd = ''

const set = ($: EngineInterface, change: Partial<Board>) => update($, boardAtom, b => ({ ...b, ...change }))

// Servers turned off for this folder, as `/mcp disable` records them in ~/.claude.json.
const offList = async ($: EngineInterface): Promise<string[]> => {
  try {
    const home = await $.env.get('HOME')
    const config = JSON.parse(await $.fs.read(`${home}/.claude.json`)) as { projects?: Record<string, { disabledMcpServers?: string[] }> }
    return config.projects?.[cwd]?.disabledMcpServers ?? []
  } catch {
    return []
  }
}

// Newest version first: "2.1.295" before "2.1.293".
const byVersionDesc = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d) return d
  }
  return 0
}

// Where the claude program is. The desktop app keeps its own copy and sets no
// PATH, so look in the usual install spots, then in the app's newest copy.
const findClaude = async ($: EngineInterface): Promise<string> => {
  const fromEnv = await $.env.get('CLAUDE_CODE_EXECPATH')
  if (fromEnv) return fromEnv
  const home = await $.env.get('HOME')
  for (const path of [`${home}/.local/bin/claude`, '/opt/homebrew/bin/claude', '/usr/local/bin/claude']) {
    if (await $.fs.exists(path)) return path
  }
  const base = `${home}/Library/Application Support/Claude/claude-code`
  try {
    const versions = (await $.fs.list(base)).filter(e => e.kind === 'dir').map(e => e.name).sort(byVersionDesc)
    for (const version of versions) {
      for (const build of (await $.fs.list(`${base}/${version}`)).filter(e => e.kind === 'dir')) {
        const path = `${base}/${version}/${build.name}/claude.app/Contents/MacOS/claude`
        if (await $.fs.exists(path)) return path
      }
    }
  } catch {
    // No desktop app copy; fall through.
  }
  return 'claude'
}

const check = async ($: EngineInterface) => {
  if ((await read($, boardAtom)).isChecking) return
  await set($, { isChecking: true, note: '' })
  try {
    const cli = await findClaude($)
    const [listed, tools, off] = await Promise.all([
      $.process.run([cli, 'mcp', 'list'], { timeoutMs: 90_000 }),
      $.tool.list(),
      offList($),
    ])
    const byKey = fromTools(tools)
    const configured: Server[] = parseList(listed.stdout).map(s => ({
      ...s,
      label: labelFor(s.name),
      tools: byKey[toolKey(s.name)]?.length ?? 0,
      isOff: off.includes(s.name),
    }))
    // Newest first: `mcp list` prints servers in the order they were added.
    configured.sort((a, b) => b.order - a.order)
    const known = new Set(configured.map(s => toolKey(s.name)))
    const fromApp: Server[] = Object.entries(byKey)
      .filter(([key]) => !known.has(key) && !isAppInternal(key))
      .map(([key, names], order) => ({ name: nameFor(key, names), label: labelFor(nameFor(key, names)), group: 'From the Claude app', order, health: 'ok' as const, detail: '', tools: names.length, isOff: false, fromApp: true }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const servers = [...configured, ...fromApp]
    await set($, {
      servers,
      checkedAt: await $.clock.now(),
      note: servers.length === 0 ? (listed.stderr.trim() || 'No MCP servers found.') : '',
    })
  } catch (error) {
    await set($, { note: `Couldn't check your servers: ${(error as Error).message}` })
  } finally {
    await set($, { isChecking: false })
  }
}

// Runs the built-in /mcp command for one server, then checks again.
const act = async ($: EngineInterface, verb: 'reconnect' | 'enable' | 'disable', name: string) => {
  await set($, { busy: name, note: '' })
  try {
    await $.command.run({ command: 'mcp', args: `${verb} ${name}` })
    if (verb !== 'reconnect') {
      await update($, boardAtom, b => ({ ...b, servers: b.servers.map(s => (s.name === name ? { ...s, isOff: verb === 'disable' } : s)) }))
    }
  } catch (error) {
    await set($, { note: `Couldn't ${verb} ${name}: ${(error as Error).message}` })
  } finally {
    await set($, { busy: '' })
  }
  await check($)
}

const open = async ($: EngineInterface) => {
  await $.ui.open({ id: PANE, title: 'MCP servers', focus: true })
  void check($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    const started = await next(e)
    await set($, { isChecking: false, busy: '' })
    await $.command.register({ name: 'mcp-panel', description: 'Show your MCP servers as cards, with retry and on/off' })

    return started
  })

  on('command.run', { command: 'mcp-panel' }, async $ => {
    await open($)

    return { text: 'MCP servers pane opened.' }
  })

  // An "MCP" button in the prompt footer, beside the model picker; the footer's own mode labels stay after it.
  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const board = await read($, boardAtom)
    const down = board.servers.filter(s => !s.isOff && (s.health !== 'ok' || (!s.fromApp && s.tools === 0))).length

    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Button key="footer-mcp" label={down ? `MCP · ${down} down` : 'MCP'} plain onPress={() => void open($)} />
        {e.props.modes.length ? <Text dimColor>{e.props.modes.join(' & ')}</Text> : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const board = await read($, boardAtom)
    const now = await $.clock.now()

    const live = board.servers.filter(s => !s.isOff && s.health === 'ok' && (s.fromApp || s.tools > 0)).length
    const down = board.servers.filter(s => !s.isOff && (s.health !== 'ok' || (!s.fromApp && s.tools === 0))).length
    const ago = board.checkedAt ? Math.max(0, Math.round((now - board.checkedAt) / 60_000)) : -1

    // Connected yet no tools in this chat counts as broken too: nothing here can use it.
    const isBad = (s: Server) => !s.isOff && (s.health !== 'ok' || (!s.fromApp && s.tools === 0))
    const why = (s: Server) => (s.health === 'auth' ? 'Sign in' : s.health !== 'ok' ? s.detail || 'Down' : 'Not working')

    const cols = (e.props.bodyColumns ?? 40) >= 60 ? 3 : 2
    const width = cols === 3 ? '31%' : '47%'

    // One small card per server: dot and name, plus what is wrong when something is.
    const card = (s: Server) => {
      const bad = isBad(s)
      const note = board.busy === s.name ? 'Working…' : s.isOff ? 'Off' : bad ? why(s) : ''

      return (
        <Box key={`card-${s.name}`} flexDirection="column" width={width} borderStyle="round" borderColor={bad ? 'error' : undefined} borderDimColor={!bad} paddingX={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={s.isOff ? 'inactive' : bad ? 'error' : 'success'}>●</Text>
            <Box flexShrink={1}>
              <Text dimColor={s.isOff} wrap="wrap">{`${s.label ?? labelFor(s.name)} MCP`}</Text>
            </Box>
          </Box>
          {note ? <Text color={bad ? 'error' : undefined} dimColor={!bad} wrap="truncate-end">{note}</Text> : null}
          {bad && !s.fromApp ? <Box marginTop={1}><Button key={`retry-${s.name}`} label="Retry" onPress={() => void act($, 'reconnect', s.name)} /></Box> : null}
          {s.isOff ? <Box marginTop={1}><Button key={`toggle-${s.name}`} label="Turn on" plain onPress={() => void act($, 'enable', s.name)} /></Box> : null}
        </Box>
      )
    }

    const list = (servers: Server[]) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
        {servers.map(card)}
      </Box>
    )

    // Broken ones first on their own shelf, then each kind in its set order, names A to Z.
    const broken = board.servers.filter(isBad)
    const healthy = board.servers.filter(s => !isBad(s))
    const byName = (a: Server, b: Server) => (a.label ?? labelFor(a.name)).localeCompare(b.label ?? labelFor(b.name))
    const shelves = [...KINDS.map(k => ({ name: k.name })), { name: 'Helpers' }]
      .map(k => ({ ...k, servers: healthy.filter(s => kindFor(s.label ?? labelFor(s.name)) === k.name).sort(byName) }))
      .filter(k => k.servers.length)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={2} alignItems="center">
          <Text color="success">{live} live</Text>
          <Text color={down ? 'error' : 'inactive'}>{down} down</Text>
          <Box flexGrow={1} />
          <Text dimColor>{board.isChecking ? 'Checking…' : ago < 0 ? '' : ago === 0 ? 'just now' : `${ago}m ago`}</Text>
          <Button key="refresh" label="Refresh" onPress={() => void check($)} />
        </Box>
        {board.note ? <Text color="warning">{board.note}</Text> : null}
        {board.servers.length === 0 && board.isChecking ? <Text dimColor>Checking your servers… this takes a few seconds.</Text> : null}
        {broken.length ? (
          <Box key="group-broken" flexDirection="column" gap={1} marginTop={1}>
            <Text bold color="error">Needs a look</Text>
            {list(broken)}
          </Box>
        ) : null}
        {shelves.map(k => (
          <Box key={`group-${k.name}`} flexDirection="column" gap={1} marginTop={1}>
            <Text bold dimColor>{k.name}</Text>
            {list(k.servers)}
          </Box>
        ))}
      </Box>
    )
  })
}
