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

test('a still-used Genspark logo component is reported on its own check', () => {
  const root = makeFixture()
  const brand = fixtureBrand()
  rebrand({ root, version: '1.0.0', brand })
  writeFileSync(
    join(root, 'apps/docs/src/renderer/components/icons.tsx'),
    'export function GensparkMark() { return null }\n',
  )
  const hits = scan({ root, brand })
  assert.deepEqual([...checks(hits)], ['genspark-logo'])
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
