import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { scan } from './brand-scan.mjs'
import { fixtureBrand, makeFixture } from './fixture.mjs'
import { rebrand } from './rebrand.mjs'

const checks = (hits) => new Set(hits.map((h) => h.check))

test('an untransformed tree is reported by every check', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  const hits = scan({ root, brand })
  const found = checks(hits)
  for (const c of [
    'upstream-name',
    'genspark-name',
    'jsx-label',
    'upstream-url',
    'help-image',
    'packaging',
    'shell-meta',
  ])
    assert.ok(found.has(c), `missing ${c}`)
  rmSync(root, { recursive: true, force: true })
})

test('a transformed tree is clean', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  assert.deepEqual(scan({ root, brand }), [])
  rmSync(root, { recursive: true, force: true })
})

test('kept identifiers and font names are not reported', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  const hits = scan({ root, brand })
  assert.ok(!hits.some((h) => h.check === 'upstream-name'))
  rmSync(root, { recursive: true, force: true })
})

test('the upstream icon hash is caught', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  const rel = 'apps/shell/build/icon.ico'
  // put back bytes whose hash is the configured "upstream" hash
  writeFileSync(join(root, rel), 'upstream-ico')
  const prefix = createHash('sha256')
    .update(readFileSync(join(root, rel)))
    .digest('hex')
    .slice(0, 16)
  const custom = { ...brand, scan: { ...brand.scan, upstreamIconHashPrefixes: { [rel]: prefix } } }
  assert.ok(scan({ root, brand: custom }).some((h) => h.check === 'upstream-icon'))
  rmSync(root, { recursive: true, force: true })
})

test('the upstream Genspark logo drawing is reported on its own check', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  writeFileSync(
    join(root, 'apps/docs/src/renderer/components/icons.tsx'),
    'export const GensparkMark = () => <svg viewBox="0 0 130 130.025"><path d="M105.115 1z" /></svg>\n',
  )
  const hits = scan({ root, brand })
  assert.deepEqual([...checks(hits)], ['genspark-logo'])
  rmSync(root, { recursive: true, force: true })
})

test('a component that keeps the upstream name but draws a neutral icon passes', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  writeFileSync(
    join(root, 'apps/docs/src/renderer/components/icons.tsx'),
    'export const GensparkMark = () => <svg viewBox="0 0 24 24"><path d="M12 2z" /></svg>\n',
  )
  const hits = scan({ root, brand })
  assert.deepEqual([...checks(hits)], [])
  rmSync(root, { recursive: true, force: true })
})

test('the allowlist keeps an attribution line out of the report', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  const line = 'Naigen Desk is based on GenOffice by its authors.\n'
  writeFileSync(
    join(root, 'apps/docs/src/renderer/index.html'),
    `<title>Naigen Desk</title>\n${line}`,
  )
  assert.deepEqual(scan({ root, brand }), [])
  writeFileSync(join(root, 'apps/docs/src/renderer/index.html'), '<title>GenOffice</title>\n')
  assert.ok(scan({ root, brand }).some((h) => h.check === 'upstream-name'))
  rmSync(root, { recursive: true, force: true })
})

test('the shell package.json metadata is scanned', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  const file = join(root, 'apps/shell/package.json')
  const good = readFileSync(file, 'utf8')
  for (const [field, bad] of [
    ['productName', 'GenOffice'],
    ['author', 'GenOffice'],
    ['description', 'Unified Genspark shell'],
    ['homepage', 'https://github.com/genspark-ai/genoffice'],
    ['homepage', 'https://genoffice.ai/'],
  ]) {
    const pkg = JSON.parse(good)
    pkg[field] = bad
    writeFileSync(file, JSON.stringify(pkg, null, 2))
    const hits = scan({ root, brand })
    assert.deepEqual(
      hits.map((h) => h.check),
      ['shell-meta'],
      `${field}=${bad}`,
    )
    assert.match(hits[0].text, new RegExp(`^${field}:`))
  }
  const pkg = JSON.parse(good)
  delete pkg.author
  writeFileSync(file, JSON.stringify(pkg, null, 2))
  assert.ok(scan({ root, brand }).some((h) => h.check === 'shell-meta'))
  writeFileSync(file, good)
  assert.deepEqual(scan({ root, brand }), [])
  rmSync(root, { recursive: true, force: true })
})

test('the installer metadata block is required in the packaging config', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  const file = join(root, 'apps/shell/electron-builder.cjs')
  const text = readFileSync(file, 'utf8')
  writeFileSync(file, text.split('naigen-desk:installer').join('removed'))
  const hits = scan({ root, brand })
  assert.ok(hits.some((h) => h.check === 'packaging' && h.found === 'naigen-desk:installer'))
  rmSync(root, { recursive: true, force: true })
})
