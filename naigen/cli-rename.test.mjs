import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { scan } from './brand-scan.mjs'
import { loadBrand } from './brand-lib.mjs'
import { fixtureBrand, makeFixture } from './fixture.mjs'
import { rebrand, rewriteCliTokens } from './rebrand.mjs'

const brand = loadBrand()
const cli = (text) => rewriteCliTokens(text, 'packages/cli/src/x.ts', brand).text

test('the command token is renamed where users and agents read it', () => {
  const cases = [
    ['Usage: genoffice <command>', 'Usage: naigen-desk <command>'],
    ['`genoffice slides check a.json`', '`naigen-desk slides check a.json`'],
    ["new Set(['genoffice', 'genoffice.cmd'])", "new Set(['naigen-desk', 'naigen-desk.cmd'])"],
    ['exec node "$here/genoffice.cjs" "$@"', 'exec node "$here/naigen-desk.cjs" "$@"'],
    ['"%~dp0genoffice.cjs" %*', '"%~dp0naigen-desk.cjs" %*'],
    ["id === 'mcp-genoffice'", "id === 'mcp-naigen-desk'"],
    ["uri: 'genoffice://guide/docs'", "uri: 'naigen-desk://guide/docs'"],
    ['genoffice: failed', 'naigen-desk: failed'],
    ['/usr/local/bin/genoffice', '/usr/local/bin/naigen-desk'],
    [
      "join(dir, 'skills', 'genoffice', 'SKILL.md')",
      "join(dir, 'skills', 'naigen-desk', 'SKILL.md')",
    ],
    ['name: genoffice\n---', 'name: naigen-desk\n---'],
    ['(?:"genoffice"|genoffice)', '(?:"naigen-desk"|naigen-desk)'],
  ]
  for (const [from, to] of cases) assert.equal(cli(from), to, from)
})

test('package scope, data paths, env names, internal names and upstream links keep', () => {
  const keep = [
    "import x from '@genoffice/docx-engine'",
    'GENOFFICE_APP_BIN and GENOFFICE_NODE',
    '~/.genoffice/launcher',
    '%USERPROFILE%/.genoffice/launcher',
    'join(tmpdir(), `genoffice-mcp-${pid}`)',
    "'genoffice-docx-media://x'",
    "event = 'genoffice:doc-css'",
    'see genoffice#1879 and genoffice.ai',
    'https://github.com/genspark-ai/genoffice/issues',
    'run_genoffice runs the CLI',
    'genofficeUserDataDir(env)',
    "if (JSON.parse(readFileSync(pkg, 'utf-8')).name === 'genoffice') {",
    'genoffice-skill-1.zip',
  ]
  for (const line of keep) assert.equal(cli(line), line, line)
})

test('the product name is rewritten in the same files, identifiers stay', () => {
  assert.equal(cli('GenOffice did not answer'), 'Naigen Desk did not answer')
  assert.equal(cli("join(base, 'GenOfficePath')"), "join(base, 'GenOfficePath')")
})

test('a fixture run renames launchers and skill folder and rewrites their users', () => {
  const root = makeFixture()
  const fb = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand: fb })
  const read = (rel) => readFileSync(join(root, rel), 'utf8')
  for (const old of [
    'packages/cli/bin/genoffice',
    'packages/cli/bin/genoffice.cmd',
    'skills/genoffice',
  ])
    assert.ok(!existsSync(join(root, old)), old)
  for (const now of [
    'packages/cli/bin/naigen-desk',
    'packages/cli/bin/naigen-desk.cmd',
    'skills/naigen-desk/SKILL.md',
  ])
    assert.ok(existsSync(join(root, now)), now)

  const mcp = read('packages/cli/src/agent-mcp.ts')
  assert.match(mcp, /MCP_SERVER_NAME = 'naigen-desk'/)
  assert.match(mcp, /new Set\(\['naigen-desk', 'naigen-desk\.cmd', 'naigen-desk\.exe'\]\)/)
  assert.match(mcp, /id === 'mcp-naigen-desk'/)
  assert.match(mcp, /x === 'naigen-desk\.cjs'/)
  assert.match(mcp, /\(\?:"naigen-desk"\|naigen-desk\)/)

  const server = read('packages/cli/src/mcp/server.ts')
  assert.match(server, /uri: 'naigen-desk:\/\/guide\/docs'/)
  assert.match(server, /name: 'naigen-desk', version/)
  assert.match(server, /log\('naigen-desk: failed'\)/)
  for (const kept of [
    /genoffice-mcp-\$\{pid\}/,
    /@genoffice\/docx-engine/,
    /GENOFFICE_APP_BIN/,
    /~\/\.genoffice\/launcher/,
    /genoffice#1879/,
    /github\.com\/genspark-ai\/genoffice/,
  ])
    assert.match(server, kept)

  const res = read('packages/cli/src/resources.ts')
  assert.match(res, /\.name === 'genoffice'/)
  assert.match(res, /join\(install, 'naigen-desk'\)/)
  assert.equal(read('packages/cli/src/gui.ts'), "return join(base, 'Naigen Desk')\n")

  const ipc = read('apps/shell/src/main/integrations-ipc.ts')
  assert.match(ipc, /'naigen-desk\.cmd' : 'naigen-desk'/)
  assert.match(ipc, /`naigen-desk-skill-\$\{v\}\.zip`/)

  const skill = read('skills/naigen-desk/SKILL.md')
  assert.match(skill, /^---\nname: naigen-desk\n---\n# Naigen Desk\n/)
  assert.match(skill, /`naigen-desk convert a\.docx`/)
  assert.match(skill, /~\/\.genoffice\/launcher/)

  const builder = read('apps/shell/electron-builder.cjs')
  for (const want of [
    "from: '../../packages/cli/dist/naigen-desk.cjs'",
    "to: 'cli/naigen-desk.cjs'",
    "from: '../../packages/cli/bin/naigen-desk'",
    "to: 'cli/naigen-desk'",
    "from: '../../packages/cli/bin/naigen-desk.cmd'",
    "to: 'cli/naigen-desk.cmd'",
    "from: '../../skills/naigen-desk/SKILL.md'",
    "to: 'cli/skills/naigen-desk/SKILL.md'",
  ])
    assert.ok(builder.includes(want), want)
  assert.ok(
    !/genoffice\.cjs|genoffice\.cmd|bin\/genoffice|cli\/genoffice|skills\/genoffice/.test(builder),
  )

  assert.deepEqual(scan({ root, brand: fb }), [])
  const again = rebrand({ root, version: '1.0.0', brand: fb })
  assert.equal(again.files.size, 0)
  rmSync(root, { recursive: true, force: true })
})

test('a missing file, folder or expected line in the CLI rename fails loudly', () => {
  for (const gone of [
    'skills/genoffice',
    'packages/cli/src/gui.ts',
    'apps/shell/src/main/integrations-ipc.ts',
  ]) {
    const root = makeFixture()
    rmSync(join(root, gone), { recursive: true })
    assert.throws(() => rebrand({ root, brand: fixtureBrand() }), /missing|no file matches/, gone)
    rmSync(root, { recursive: true, force: true })
  }
  const root = makeFixture()
  const file = join(root, 'apps/shell/electron-builder.cjs')
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll('skills/genoffice/SKILL.md', 'x'))
  assert.throws(() => rebrand({ root, brand: fixtureBrand() }), /skills\/genoffice\/SKILL\.md/)
  rmSync(root, { recursive: true, force: true })
})

test('a dry run reports the rename without touching the tree', () => {
  const root = makeFixture()
  const report = rebrand({ root, version: '1.0.0', brand: fixtureBrand(), dryRun: true })
  assert.ok(existsSync(join(root, 'skills/genoffice/SKILL.md')))
  assert.ok(!existsSync(join(root, 'skills/naigen-desk')))
  assert.ok(report.files.get('skills/naigen-desk/SKILL.md')['cli-tokens'] >= 1)
  rmSync(root, { recursive: true, force: true })
})

test('the scan reports an untransformed tree and a leftover token', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  const before = scan({ root, brand }).filter((h) => h.check === 'cli-name')
  assert.ok(before.some((h) => h.text === 'old path still exists'))
  assert.ok(before.some((h) => h.found === 'genoffice'))
  rebrand({ root, version: '1.0.0', brand })
  assert.deepEqual(scan({ root, brand }), [])
  const file = join(root, 'packages/cli/src/gui.ts')
  writeFileSync(file, 'run `genoffice open a.docx` first\n')
  const hits = scan({ root, brand })
  assert.deepEqual(
    hits.map((h) => [h.check, h.found]),
    [['cli-name', 'genoffice']],
  )
  writeFileSync(file, "name === 'genoffice'\n")
  assert.deepEqual(scan({ root, brand }), [])
  rmSync(root, { recursive: true, force: true })
})

test('the packaging scan requires the renamed launcher and skill entries', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  const file = join(root, 'apps/shell/electron-builder.cjs')
  const text = readFileSync(file, 'utf8')
  writeFileSync(file, text.replaceAll("to: 'cli/naigen-desk.cmd'", "to: 'cli/other.cmd'"))
  assert.ok(scan({ root, brand }).some((h) => h.found === "to: 'cli/naigen-desk.cmd'"))
  writeFileSync(file, `${text}\nconst old = '../../packages/cli/dist/genoffice.cjs'\n`)
  assert.ok(
    scan({ root, brand }).some((h) => h.check === 'packaging' && h.found === 'genoffice.cjs'),
  )
  rmSync(root, { recursive: true, force: true })
})
