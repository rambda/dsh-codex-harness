// Generate DSH 0.2 `@deepseek-ai/dsh-agent-preset` rows from the shipped
// agent.cordis.yml compositions. DSH 0.2 registers presets as ordinary Cordis
// rows with an inline `plugins:` array; it no longer scans $DSH_HOME/.agent-presets.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? '.'
const INDENT = ' '.repeat(10)

function parsePresetMeta(dir) {
  const text = readFileSync(join(root, 'agent-presets', dir, 'preset.yml'), 'utf8')
  const field = name => {
    const m = text.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))
    return m?.[1].trim()
  }
  return { name: field('name'), description: field('description'), order: Number(field('order')) }
}

function compositionRows(dir) {
  const text = readFileSync(join(root, 'agent-presets', dir, 'agent.cordis.yml'), 'utf8')
  const start = text.search(/^- id:/m)
  if (start < 0) throw new Error(`no rows in ${dir}`)
  const rows = text.slice(start).replace(/\s+$/, '')
  return rows.split('\n').map(line => (line.trim() === '' ? '' : INDENT + line)).join('\n')
}

function presetRow(dir, id, order) {
  const meta = parsePresetMeta(dir)
  const quote = value => `'${String(value).replace(/'/g, "''")}'`
  return [
    `    # ── ${meta.name} ── 0.2 declares presets as ordinary rows; the shipped`,
    `    # agent-presets/ directories are the 0.1 delivery shape.`,
    `    - id: ${id}-preset`,
    `      name: '@deepseek-ai/dsh-agent-preset'`,
    `      config:`,
    `        id: ${id}`,
    `        name: ${quote(meta.name)}`,
    `        description: ${quote(meta.description)}`,
    `        order: ${order ?? meta.order}`,
    `        plugins:`,
    compositionRows(dir),
  ].join('\n')
}

const block = [
  '',
  '# ── Agent presets (DSH 0.2 native declaration) ─────────────────────────────',
  '#',
  '# 0.1 discovered presets by scanning $DSH_HOME/.agent-presets for real',
  '# directories, which is why `codex-preset-publisher` copies them there. 0.2',
  '# dropped that scan: the registry only takes presets registered by an',
  '# `@deepseek-ai/dsh-agent-preset` row, so the same compositions are declared',
  '# here as rows while the publisher copy stays for 0.1 hosts.',
  '- insert:',
  presetRow('codex', 'codex', 5),
  '',
  presetRow('codex-creative', 'codex-creative', 6),
].join('\n')

process.stdout.write(block + '\n')
