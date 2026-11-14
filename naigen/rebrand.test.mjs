import assert from 'node:assert/strict'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadBrand } from './brand-lib.mjs'
import { fixtureBrand, makeFixture } from './fixture.mjs'
import {
  injectPublish,
  rebrand,
  removeGskPackaging,
  rewriteJsxLabels,
  rewriteText,
  stripHelpImages,
} from './rebrand.mjs'

const brand = loadBrand()
const strings = (text, file = 'apps/shell/src/renderer/src/strings.ts') =>
  rewriteText(text, file, brand, 'strings').text

test('standalone GenOffice becomes Naigen Desk in prose, in several languages', () => {
  assert.equal(strings("about: 'About GenOffice'"), "about: 'About Naigen Desk'")
  assert.equal(strings("about: 'GenOffice은 편집합니다'"), "about: 'Naigen Desk은 편집합니다'")
  assert.equal(strings('GenOffice. Next.'), 'Naigen Desk. Next.')
  assert.equal(strings('den GenOffice-Skill installieren'), 'den Naigen Desk-Skill installieren')
  assert.equal(strings("'GenOffice Docs'"), "'Naigen Desk Docs'")
})

test('identifiers survive', () => {
  for (const id of brand.keep.identifiers) {
    const line = `x = '${id}' + ${id}`
    assert.equal(strings(line), line, id)
  }
  assert.equal(strings("path = 'GenOffice-Dev'"), "path = 'GenOffice-Dev'")
  assert.equal(strings("old = 'GenOffice Dev'"), "old = 'GenOffice Dev'")
})

test('font names survive', () => {
  for (const font of brand.keep.fontNames) {
    const line = `font-family: '${font}', serif`
    assert.equal(strings(line), line, font)
  }
  assert.equal(
    strings("'GenOffice Sans KR', 'GenOffice Box Drawing', 'GenOffice Hiragino Sans'"),
    "'GenOffice Sans KR', 'GenOffice Box Drawing', 'GenOffice Hiragino Sans'",
  )
})

test('package scope, env prefix, lowercase CLI name and path-like uses survive', () => {
  const keep = [
    '@genoffice/shell',
    'GENOFFICE_APP_BIN',
    'run genoffice open file.docx',
    'GenOffice/${version}',
    '<Documents>/GenOffice/draft.pptx',
  ]
  for (const line of keep) assert.equal(strings(line), line, line)
})

test('Genspark labels follow the locale', () => {
  const text = [
    'export const strings = {',
    "  en: { a: 'Genspark AI', b: 'Genspark' },",
    "  vi: { a: 'Genspark AI', b: 'Genspark' },",
    "  de: { a: 'Genspark AI', b: 'Genspark-Credits' },",
    "  'zh-TW': { a: 'Genspark AI' },",
    '}',
  ].join('\n')
  const out = strings(text)
  assert.match(out, /en: \{ a: 'AI Assistant', b: 'AI Assistant' \}/)
  assert.match(out, /vi: \{ a: 'Trợ lý AI', b: 'Trợ lý AI' \}/)
  assert.match(out, /de: \{ a: 'AI', b: 'AI-Credits' \}/)
  assert.match(out, /'zh-TW': \{ a: 'AI' \}/)
  assert.ok(!out.includes('Genspark'))
})

test('locale comes from the file name for per-language files', () => {
  assert.equal(
    strings("a: 'Genspark AI'", 'apps/docs/src/renderer/i18n/ai/vi.ts'),
    "a: 'Trợ lý AI'",
  )
  assert.equal(
    strings("a: 'Genspark AI'", 'apps/docs/src/renderer/i18n/ai/en.ts'),
    "a: 'AI Assistant'",
  )
  assert.equal(strings("a: 'Genspark AI'", 'apps/docs/src/renderer/i18n/ai/ja.ts'), "a: 'AI'")
})

test('Genspark inside identifiers is untouched', () => {
  assert.equal(strings('appGensparkAccount: 1'), 'appGensparkAccount: 1')
  assert.equal(strings('<GensparkMark size={22} />'), '<GensparkMark size={22} />')
})

test('URL map points links at the Naigen repo', () => {
  assert.equal(
    strings('https://github.com/genspark-ai/genoffice/releases/latest'),
    'https://github.com/NAIGEN-Technologies/naigen-desk/releases',
  )
  assert.equal(
    strings('https://github.com/genspark-ai/genoffice'),
    'https://github.com/NAIGEN-Technologies/naigen-desk',
  )
  assert.equal(
    strings('see genspark.ai/pricing, then'),
    'see github.com/NAIGEN-Technologies/naigen-desk, then',
  )
  assert.equal(
    strings('genspark.ai/pricing에서 충전'),
    'github.com/NAIGEN-Technologies/naigen-desk에서 충전',
  )
  assert.equal(
    strings("resolveProxy('https://www.genspark.ai/')"),
    "resolveProxy('https://github.com/NAIGEN-Technologies/naigen-desk/')",
  )
  assert.equal(
    strings('https://genoffice.ai/join'),
    'https://github.com/NAIGEN-Technologies/naigen-desk',
  )
  assert.equal(strings('sspark.genspark.ai/x'), 'sspark.genspark.ai/x')
})

test('JSX labels are replaced in markup only', () => {
  const src =
    '<span>Genspark AI</span>\n<Group label="Genspark AI">\n  Genspark\n// Genspark AI note\n<GensparkMark />'
  const out = rewriteJsxLabels(src, brand).text
  assert.equal(
    out,
    '<span>AI Assistant</span>\n<Group label="AI Assistant">\n  AI Assistant\n// Genspark AI note\n<GensparkMark />',
  )
})

test('help images are removed and text stays', () => {
  const src = 'Intro\n\n![The Settings window](img/settings-general.png)\n\nBody text\n'
  assert.equal(stripHelpImages(src).text, 'Intro\n\nBody text\n')
  assert.equal(stripHelpImages('See ![x](img/a.png) here').text, 'See  here')
  assert.equal(stripHelpImages('![ok](https://example.com/a.png)').count, 0)
})

test('the gsk CLI is removed from packaging, other entries stay', () => {
  const src = readFileSync(join(makeFixture(), 'apps/shell/electron-builder.cjs'), 'utf8')
  const { text } = removeGskPackaging(src)
  assert.ok(!text.includes('@genspark/cli'))
  assert.ok(!text.includes('gsk/'))
  assert.ok(text.includes("to: 'cli/genoffice.cjs'"))
})

test('publish config injects the GitHub provider once', () => {
  const src = 'const config = {}\n\nmodule.exports = config\n'
  const once = injectPublish(src, brand).text
  assert.match(
    once,
    /provider: 'github', owner: 'NAIGEN-Technologies', repo: 'naigen-desk', releaseType: 'prerelease'/,
  )
  assert.ok(once.indexOf('config.publish') < once.indexOf('module.exports'))
  assert.equal(injectPublish(once, brand).text, once)
  assert.throws(() => injectPublish('no export here', brand), /module\.exports/)
})

test('full run on a fixture tree: expected edits, then no further change', () => {
  const root = makeFixture()
  const fb = fixtureBrand()
  const first = rebrand({ root, version: '2.0.0', brand: fb })
  const read = (rel) => readFileSync(join(root, rel), 'utf8')

  const pkg = read('apps/shell/package.json')
  assert.match(pkg, /"productName": "Naigen Desk"/)
  assert.match(pkg, /"version": "2\.0\.0"/)
  assert.match(pkg, /"name": "@genoffice\/shell"/)
  assert.match(pkg, /"homepage": "https:\/\/github\.com\/NAIGEN-Technologies\/naigen-desk"/)

  const builder = read('apps/shell/electron-builder.cjs')
  assert.match(builder, /appId: 'io\.github\.naigen-technologies\.desk'/)
  assert.match(builder, /productName: 'Naigen Desk'/)
  assert.match(builder, /provider: 'github'/)
  assert.ok(!builder.includes('@genspark/cli'))

  assert.equal(
    read('packages/cli/bin/genoffice.cmd'),
    '@echo off\n"%~dp0..\\..\\Naigen Desk.exe" "%~dp0genoffice.cjs" %*\n',
  )
  assert.match(
    read('packages/cli/bin/genoffice'),
    /if \[ -x "\$here\/\.\.\/\.\.\/Naigen Desk\.exe" \]; then app="\$here\/\.\.\/\.\.\/Naigen Desk\.exe"/,
  )
  assert.match(read('packages/cli/src/mcp-launch.ts'), /\.\.\\\\Naigen Desk\.exe`/)
  assert.match(read('packages/cli/src/resources.ts'), /join\(install, 'Naigen Desk\.exe'\)/)

  const strs = read('apps/shell/src/renderer/src/strings.ts')
  assert.match(strs, /about: 'About Naigen Desk'/)
  assert.match(strs, /'GenOffice Sans KR', 'GenOffice Box Drawing', 'GenOffice Hiragino Sans'/)
  assert.match(
    strs,
    /_GenOfficeCoverPage GenOfficeStaticFormFills GenOfficeFormField GenOfficeOutlineColumnHeaderExtension GenOfficePath/,
  )
  assert.match(strs, /dev: 'GenOffice-Dev'/)
  assert.match(strs, /GENOFFICE_APP_BIN @genoffice\/shell genoffice/)
  assert.match(strs, /vi: \{\n {4}aiBtn: 'Trợ lý AI'/)
  assert.match(read('apps/docs/src/renderer/index.html'), /<title>Naigen Desk Docs<\/title>/)
  assert.ok(
    !read('apps/docs/src/renderer/components/Ribbon.tsx').includes('<span>Genspark AI</span>'),
  )

  assert.ok(!read('apps/shell/src/renderer/src/i18n/help/topics/install.en.md').includes('!['))
  assert.ok(
    !existsSync(
      join(root, 'apps/shell/src/renderer/src/i18n/help/topics/img/settings-general.en.png'),
    ),
  )
  assert.equal(read('apps/shell/build/icon.ico'), 'naigen-ico')
  assert.equal(read('apps/shell/build/icon.png'), 'naigen-png')
  assert.ok(first.files.size > 8)

  const second = rebrand({ root, version: '2.0.0', brand: fb })
  assert.equal(second.files.size, 0)
  assert.equal(second.deleted.length, 0)
  rmSync(root, { recursive: true, force: true })
})

test('a missing expected file or line fails loudly', () => {
  const root = makeFixture()
  rmSync(join(root, 'packages/cli/bin/genoffice.cmd'))
  assert.throws(() => rebrand({ root, brand: fixtureBrand() }), /genoffice\.cmd/)
  rmSync(root, { recursive: true, force: true })
})
