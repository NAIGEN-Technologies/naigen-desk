// Builds a small fake checkout for the rebrand and scan tests. Not a test itself.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadBrand } from './brand-lib.mjs'

const STRINGS = `export const strings = {
  en: {
    about: 'About GenOffice',
    aiBtn: 'Genspark AI',
    aiTitle: 'Genspark',
    font: "'GenOffice Sans KR', 'GenOffice Box Drawing', 'GenOffice Hiragino Sans'",
    ids: '_GenOfficeCoverPage GenOfficeStaticFormFills GenOfficeFormField GenOfficeOutlineColumnHeaderExtension GenOfficePath',
    dev: 'GenOffice-Dev',
    env: 'GENOFFICE_APP_BIN @genoffice/shell genoffice',
    link: 'https://github.com/genspark-ai/genoffice/releases/latest',
    credits: 'Top up at genspark.ai/pricing.',
    ua: \`GenOffice/\${version}\`,
  },
  vi: {
    aiBtn: 'Genspark AI',
    aiTitle: 'Genspark',
    about: 'Giới thiệu GenOffice',
  },
  de: {
    aiBtn: 'Genspark AI',
    skill: 'den GenOffice-Skill installieren',
    credits: 'Deine Genspark-Credits sind aufgebraucht, weiter unter genspark.ai/pricing, dann erneut.',
  },
  'zh-TW': {
    aiBtn: 'Genspark AI',
    credits: 'Gensparkクレジット genspark.ai/pricing的',
  },
}
`

const HELP_MD = `GenOffice is an office suite.

![The Settings window](img/settings-general.png)

Visit [Releases](https://github.com/genspark-ai/genoffice/releases/latest) now.
`

const BUILDER = `const updateUrl = process.env.GENOFFICE_UPDATE_URL
function assertExtraResourceSources() {
  for (const rel of [
    '../../node_modules/@genspark/cli',
    '../../node_modules/@genspark/cli/node_modules/commander',
    '../../node_modules/ws',
  ]) {
    void rel
  }
}
const config = {
  appId: 'com.genoffice.app',
  productName: 'GenOffice',
  extraResources: [
    {
      from: 'build/THIRD-PARTY-NOTICES.txt',
      to: 'THIRD-PARTY-NOTICES.txt',
    },
    {
      from: '../../packages/cli/dist/genoffice.cjs',
      to: 'cli/genoffice.cjs',
    },
    {
      from: '../../node_modules/@genspark/cli',
      to: 'gsk/node_modules/@genspark/cli',
    },
    {
      from: '../../node_modules/@genspark/cli/node_modules/commander',
      to: 'gsk/node_modules/commander',
    },
    {
      from: '../../node_modules/ws',
      to: 'gsk/node_modules/ws',
    },
  ],
}
if (updateUrl) {
  config.publish = [{ provider: 'generic', url: updateUrl }]
}

module.exports = config
`

/** Files of the fixture checkout, keyed by relative posix path. */
export function fixtureFiles() {
  return {
    'apps/shell/src/renderer/src/strings.ts': STRINGS,
    'apps/shell/src/renderer/src/i18n/help/topics/install.en.md': HELP_MD,
    'apps/shell/src/renderer/src/i18n/help/topics/img/settings-general.en.png': 'png-bytes',
    'apps/shell/src/renderer/src/i18n/help/help-titles.ts':
      "export const t = { en: { a: 'GenOffice Help' } }\n",
    'apps/docs/src/renderer/index.html': '<title>GenOffice Docs</title>\n',
    'apps/docs/src/renderer/components/Ribbon.tsx':
      '<span>Genspark AI</span>\n<div className="g">Genspark AI</div>\n// Genspark AI comment\n',
    'apps/pdf/src/renderer/ai/pdf-skill.ts':
      "const P = `You are GenOffice's PDF assistant, run genoffice open`\n",
    'apps/shell/package.json':
      '{\n  "name": "@genoffice/shell",\n  "productName": "GenOffice",\n  "version": "0.13.0",\n  "homepage": "https://github.com/genspark-ai/genoffice"\n}\n',
    'apps/shell/electron-builder.cjs': BUILDER,
    'apps/shell/build/icon.ico': 'upstream-ico',
    'apps/shell/build/icon.png': 'upstream-png',
    'naigen/assets/icon.ico': 'naigen-ico',
    'naigen/assets/icon.png': 'naigen-png',
    'packages/cli/bin/genoffice.cmd':
      '@echo off\n"%~dp0..\\..\\GenOffice.exe" "%~dp0genoffice.cjs" %*\n',
    'packages/cli/bin/genoffice':
      'if [ -x "$here/../../GenOffice.exe" ]; then app="$here/../../GenOffice.exe"; else app="$here/../../genoffice"; fi\n',
    'packages/cli/src/mcp-launch.ts':
      'command: `${dir}\\\\..\\\\..\\\\GenOffice.exe`,\nif (exists(`${dir}${sep}..${sep}..${sep}GenOffice.exe`))\n',
    'packages/cli/src/resources.ts':
      "join(env.LOCALAPPDATA, 'Programs', 'GenOffice', 'GenOffice.exe')\nenv.ProgramFiles ? join(env.ProgramFiles, 'GenOffice', 'GenOffice.exe') : ''\njoin(install, 'GenOffice.exe')\n",
  }
}

/** The real brand.json with every file list narrowed to the fixture's files. */
export function fixtureBrand() {
  const brand = loadBrand()
  return {
    ...brand,
    stringFiles: [
      'apps/shell/src/renderer/src/strings.ts',
      'apps/shell/src/renderer/src/i18n/help/**/*.ts',
      'apps/shell/src/renderer/src/i18n/help/**/*.md',
    ],
    titleFiles: ['apps/*/src/renderer/index.html'],
    promptFiles: ['apps/*/src/renderer/ai/**/*.ts'],
    jsxLabelFiles: ['apps/docs/src/renderer/components/Ribbon.tsx'],
  }
}

export function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'naigen-brand-'))
  for (const [rel, text] of Object.entries(fixtureFiles())) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  }
  return root
}
