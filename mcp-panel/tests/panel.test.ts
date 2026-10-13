import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fromTools, iconFor, kindFor, labelFor, nameFor, parseList } from '../hooks/register'

const LIST = [
  'Checking MCP server health…',
  '',
  'blender: uv run blender-mcp - ✔ Connected',
  'pdfcraft: /Users/s/Documents/02 Projects/15 ArtCraft MCP Setup/bin/pdfcraft-cli mcp - ✔ Connected',
  'unreal: http://127.0.0.1:8000/mcp (HTTP) - ✘ Failed to connect — ECONNREFUSED: Unable to connect.',
].join('\n')

// Stands in for the engine: three servers, pdfcraft turned off for this folder.
const machine = (on: On, opened: string[] = [], execPath: string | null = '/bin/claude', runs: string[] = []) => {
  const ran: string[] = []
  on('session.start', (_$, e) => e as any)
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/h' : execPath ?? undefined }))
  on('clock.now', () => ({ value: 1_000 }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('process.run', (_$, e) => {
    runs.push(e.argv[0])
    return { value: { exitCode: 0, stdout: LIST, stderr: '' } }
  })
  on('tool.list', () => ({ value: [{ name: 'mcp__blender__render', description: '', mcp: true }, { name: 'mcp__blender__scene', description: '', mcp: true }, { name: 'Read', description: '', mcp: false }] }))
  on('fs.read', () => ({ value: JSON.stringify({ projects: { '/w': { disabledMcpServers: ['pdfcraft'] } } }) }))
  on('command.run', { command: 'mcp' }, (_$, e) => {
    ran.push(e.args)
    return { text: 'ok' }
  })
  return ran
}

const pane = ($: any) => $.ui.mount({ plugin: 'mcp-panel', surface: 'desktop', component: 'Pane', requestId: 'mcp-panel', props: { title: 'MCP servers', isFocused: false, bodyColumns: 70, placement: 'dock' as const } })

test('reads each line of mcp list', () => {
  const rows = parseList(LIST)
  expect(rows.map(r => r.name)).toEqual(['blender', 'pdfcraft', 'unreal'])
  expect(rows[2].health).toBe('down')
  expect(rows[2].detail).toBe('Not running')
  expect(rows[2].group).toBe('3D')
  expect(rows[1].group).toBe('ArtCraft')
  expect(iconFor('blender')).toBe('🧊')
})

test('shows grouped rows, retries a broken server and turns one on', async ($, on) => {
  const ran = machine(on)
  await $.session.start({ cwd: '/w' } as any)
  await $.command.run({ command: 'mcp-panel', args: '' })
  const ui = await pane($)

  expect(await ui.find({ type: 'Text', text: 'Blender MCP' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 down' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Off' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Needs a look' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Helpers' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Not running' })).toBeDefined()

  await ui.press({ key: 'retry-unreal' })
  await ui.press({ key: 'toggle-pdfcraft' })
  await ui.press({ key: 'refresh' })
  expect(ran).toEqual(['reconnect unreal', 'enable pdfcraft'])
})

test('finds the desktop app copy of claude when nothing is on PATH', async ($, on) => {
  const app = '/h/Library/Application Support/Claude/claude-code'
  const runs: string[] = []
  machine(on, [], null, runs)
  on('fs.list', (_$, e) => ({
    value: e.path === app ? [{ name: '2.1.293', kind: 'dir' }, { name: '2.1.295', kind: 'dir' }] : [{ name: 'abc', kind: 'dir' }],
  }) as any)
  on('fs.exists', (_$, e) => ({ value: e.path === `${app}/2.1.295/abc/claude.app/Contents/MacOS/claude` }) as any)
  await $.session.start({ cwd: '/w' } as any)
  await $.command.run({ command: 'mcp-panel', args: '' })
  const ui = await pane($)
  expect(await ui.find({ type: 'Text', text: 'Blender MCP' })).toBeDefined()
  expect(runs[0]).toBe(`${app}/2.1.295/abc/claude.app/Contents/MacOS/claude`)
})

test('the footer MCP button opens the pane', async ($, on) => {
  const opened: string[] = []
  machine(on, opened)
  const footer = await $.ui.mount({ plugin: 'mcp-panel', surface: 'desktop', component: 'SessionMode', props: { modes: [] } } as any)
  await footer.press({ key: 'footer-mcp' })
  expect(opened).toEqual(['mcp-panel'])
})

test('names app servers from their tools', () => {
  const byKey = fromTools([
    { name: 'mcp__bc58dfc4-761f-40aa-a3ca-df44e8da788c__notion-search', mcp: true },
    { name: 'mcp__reddit-ads__reddit_list_ads', mcp: true },
    { name: 'Read', mcp: false },
  ])
  expect(Object.keys(byKey).length).toBe(2)
  expect(nameFor('bc58dfc4-761f-40aa-a3ca-df44e8da788c', byKey['bc58dfc4-761f-40aa-a3ca-df44e8da788c'])).toBe('Notion')
  expect(nameFor('google-ads-mcp', [])).toBe('google-ads-mcp')
})

test('friendly names land on the right shelf', () => {
  expect(labelFor('google-ads-mcp')).toBe('Google Ads')
  expect(labelFor('MCP_DOCKER')).toBe('Docker')
  expect(kindFor('Google Ads')).toBe('Ads')
  expect(kindFor('Notion')).toBe('Work tools')
  expect(kindFor('n8n')).toBe('Automation')
  expect(kindFor('Chrome')).toBe('Browser and screen')
  expect(kindFor('Visualize')).toBe('Helpers')
})

