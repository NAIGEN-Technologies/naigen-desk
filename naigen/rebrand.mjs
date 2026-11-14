#!/usr/bin/env node
// Rewrites the working tree in place from GenOffice to Naigen Desk. Runs only in
// the release workflow, on a clean checkout, after tests and before
// `npm run dist:win`. Nothing it produces is committed. Node built-ins only;
// a second run changes nothing.
//
// Usage: node naigen/rebrand.mjs --version 1.0.0 [--root <dir>] [--dry-run]
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  GENSPARK_RE,
  buildStandaloneRe,
  gensparkLabel,
  loadBrand,
  makeLocaleTracker,
  matchGlobs,
  walkFiles,
} from './brand-lib.mjs'

const IMG_LINE_RE = /^\s*!\[[^\]]*\]\(img\/[^)]*\)\s*$/
const IMG_INLINE_RE = /!\[[^\]]*\]\(img\/[^)]*\)/g
const PUBLISH_MARKER = 'naigen-desk:publish'

class Report {
  constructor() {
    this.files = new Map()
    this.deleted = []
  }
  add(file, rule, n = 1) {
    if (n <= 0) return
    const entry = this.files.get(file) ?? {}
    entry[rule] = (entry[rule] ?? 0) + n
    this.files.set(file, entry)
  }
}

function countMatches(text, re) {
  return (text.match(re) ?? []).length
}

/** Applies URL map, Genspark labels and the standalone name rule to one line. */
function rewriteLine(line, ctx) {
  const { brand, standaloneRe, hostRes } = ctx
  const counts = { urls: 0, labels: 0, names: 0 }
  let out = line
  if (ctx.withUrlsAndLabels) {
    for (const { from, to } of brand.urls.literals) {
      if (out.includes(from)) {
        counts.urls += out.split(from).length - 1
        out = out.split(from).join(to)
      }
    }
    for (const re of hostRes) {
      out = out.replace(re, (_m, scheme) => {
        counts.urls++
        return scheme ? `https://${brand.urls.hostTarget}` : brand.urls.hostTarget
      })
    }
    const label = gensparkLabel(brand, ctx.locale)
    out = out.replace(GENSPARK_RE, () => {
      counts.labels++
      return label
    })
  }
  out = out.replace(standaloneRe, () => {
    counts.names++
    return brand.displayName
  })
  return { out, counts }
}

/** Text rewrite for user-visible string files (`mode` 'strings') or name-only files ('names'). */
export function rewriteText(text, file, brand, mode = 'strings') {
  const standaloneRe = buildStandaloneRe(brand)
  const hostRes = brand.urls.hostPatterns.map((p) => new RegExp(`(?<![\\w.@])${p}`, 'g'))
  const tracker = makeLocaleTracker(file)
  const total = { urls: 0, labels: 0, names: 0 }
  const lines = text.split('\n').map((line) => {
    const locale = tracker(line)
    const { out, counts } = rewriteLine(line, {
      brand,
      standaloneRe,
      hostRes,
      locale,
      withUrlsAndLabels: mode === 'strings',
    })
    total.urls += counts.urls
    total.labels += counts.labels
    total.names += counts.names
    return out
  })
  return { text: lines.join('\n'), counts: total }
}

/** Hard-coded JSX labels ("Genspark AI", bare "Genspark" panel title) become the English label. */
export function rewriteJsxLabels(text, brand) {
  const label = gensparkLabel(brand, 'en')
  let out = text
  let n = 0
  for (const { pattern, replacement } of brand.jsxLabelPatterns) {
    const re = new RegExp(pattern, 'gm')
    out = out.replace(re, (...args) => {
      n++
      const groups = args.slice(1, -2)
      return replacement
        .replace('{LABEL}', label)
        .replace(/\$(\d)/g, (_m, i) => groups[Number(i) - 1] ?? '')
    })
  }
  return { text: out, count: n }
}

/** Removes markdown image syntax that points into the help img/ folder. */
export function stripHelpImages(text) {
  const lines = text.split('\n')
  const out = []
  let removed = 0
  for (const line of lines) {
    if (IMG_LINE_RE.test(line)) {
      removed++
      continue
    }
    const inline = countMatches(line, IMG_INLINE_RE)
    if (inline) {
      removed += inline
      out.push(line.replace(IMG_INLINE_RE, ''))
    } else out.push(line)
  }
  let result = out.join('\n')
  if (removed) result = result.replace(/\n{3,}/g, '\n\n')
  return { text: result, count: removed }
}

/** Replace `from` with `to`; throw when neither is present (the expected line vanished). */
function replaceExpected(text, from, to, where) {
  if (text.includes(from))
    return { text: text.split(from).join(to), count: text.split(from).length - 1 }
  if (text.includes(to)) return { text, count: 0 }
  throw new Error(`${where}: expected "${from}" not found`)
}

export function removeGskPackaging(text) {
  let out = text
  let n = 0
  const drop = (re) => {
    out = out.replace(re, () => {
      n++
      return ''
    })
  }
  // assertExtraResourceSources() entries
  drop(/^[ \t]*'\.\.\/\.\.\/node_modules\/@genspark\/cli(?:\/node_modules\/commander)?',\r?\n/gm)
  // extraResources entries that copy the gsk CLI and its two runtime deps
  drop(
    /^[ \t]*\{\r?\n[ \t]*from: '\.\.\/\.\.\/node_modules\/(?:@genspark\/cli(?:\/node_modules\/commander)?|ws)',\r?\n[ \t]*to: 'gsk\/[^']*',\r?\n[ \t]*\},\r?\n/gm,
  )
  if (out.includes('@genspark/cli') || /to: 'gsk\//.test(out))
    throw new Error('electron-builder.cjs: gsk packaging entries remain after removal')
  return { text: out, count: n }
}

export function injectPublish(text, brand) {
  if (text.includes(PUBLISH_MARKER)) return { text, count: 0 }
  const { owner, repo, releaseType } = brand.release
  const block = [
    `// ${PUBLISH_MARKER} (added by naigen/rebrand.mjs): GitHub provider, so that`,
    '// electron-builder emits latest.yml and bakes app-update.yml into the app.',
    '// It is set in the working copy of this file rather than through `-c.` CLI',
    '// arguments: `npm run dist:win` gives the workflow no single place to pass',
    '// them, and an override from the command line cannot replace the generic',
    '// provider that the block above sets when GENOFFICE_UPDATE_URL is present.',
    'config.publish = [',
    `  { provider: 'github', owner: '${owner}', repo: '${repo}', releaseType: '${releaseType}' },`,
    ']',
    '',
  ].join('\n')
  const anchor = /^module\.exports = config\s*$/m
  if (!anchor.test(text))
    throw new Error('electron-builder.cjs: "module.exports = config" not found')
  return { text: text.replace(anchor, `${block}module.exports = config`), count: 1 }
}

export function rebrand({ root, version, brand = loadBrand(), dryRun = false }) {
  const report = new Report()
  const all = walkFiles(root)
  const edit = (rel, fn, rule) => {
    const full = join(root, rel)
    if (!existsSync(full)) throw new Error(`${rel}: expected file is missing`)
    const before = readFileSync(full, 'utf8')
    const { text, count } = fn(before, rel)
    if (text !== before) {
      if (!dryRun) writeFileSync(full, text)
      report.add(rel, rule, count || 1)
    }
  }
  const globbed = (globs, label) => {
    const { files, empty } = matchGlobs(all, globs)
    if (empty.length) throw new Error(`${label}: no file matches ${empty.join(', ')}`)
    return files
  }

  // 1-3. standalone name, Genspark labels, URL map in the user-visible string files
  for (const rel of globbed(brand.stringFiles, 'stringFiles')) {
    edit(
      rel,
      (t, f) => {
        const r = rewriteText(t, f, brand, 'strings')
        report.add(rel, 'urls', r.counts.urls)
        report.add(rel, 'labels', r.counts.labels)
        report.add(rel, 'names', r.counts.names)
        return { text: r.text, count: 0 }
      },
      'edited',
    )
  }
  for (const rel of globbed(
    [...brand.titleFiles, ...brand.promptFiles],
    'titleFiles+promptFiles',
  )) {
    edit(
      rel,
      (t, f) => {
        const r = rewriteText(t, f, brand, 'names')
        report.add(rel, 'names', r.counts.names)
        return { text: r.text, count: 0 }
      },
      'edited',
    )
  }
  for (const rel of globbed(brand.jsxLabelFiles, 'jsxLabelFiles')) {
    edit(
      rel,
      (t) => {
        const r = rewriteJsxLabels(t, brand)
        report.add(rel, 'labels', r.count)
        return { text: r.text, count: 0 }
      },
      'edited',
    )
  }

  // 4. productName, appId, version, and the exe name inside the CLI launchers
  const pkg = brand.shell.packageJson
  edit(
    pkg,
    (t) => {
      let out = t
      const prod = /^(\s*"productName":\s*)"[^"]*"/m
      if (!prod.test(out)) throw new Error(`${pkg}: productName not found`)
      out = out.replace(prod, `$1"${brand.displayName}"`)
      if (version) {
        const ver = /^( {2}"version":\s*)"[^"]*"/m
        if (!ver.test(out)) throw new Error(`${pkg}: version not found`)
        out = out.replace(ver, `$1"${version}"`)
      }
      out = out.split(brand.shell.homepageFrom).join(brand.repoUrl)
      return { text: out, count: 3 }
    },
    'package.json',
  )
  const builder = brand.shell.builderConfig
  edit(
    builder,
    (t) => {
      let out = t
      const set = (key, value) => {
        const re = new RegExp(`^(\\s*${key}:\\s*)'[^']*'`, 'gm')
        if (countMatches(out, re) !== 1) throw new Error(`${builder}: expected exactly one ${key}`)
        out = out.replace(re, `$1'${value}'`)
      }
      set('appId', brand.appId)
      set('productName', brand.displayName)
      return { text: out, count: 2 }
    },
    'appId+productName',
  )
  for (const { file, replacements } of brand.exeRewrites) {
    edit(
      file,
      (t) => {
        let out = t
        let n = 0
        for (const { from, to } of replacements) {
          const r = replaceExpected(out, from, to, file)
          out = r.text
          n += r.count
        }
        return { text: out, count: n }
      },
      'exe-name',
    )
  }

  // 5-6. publish config and removal of the gsk CLI from packaging (same file)
  edit(builder, (t) => removeGskPackaging(t), 'gsk-removed')
  edit(builder, (t) => injectPublish(t, brand), 'publish-config')

  // 7. help pages keep text only
  const topics = all.filter(
    (f) => f.startsWith(`${brand.help.topicsDir}/`) && f.endsWith('.md') && !f.includes('/img/'),
  )
  for (const rel of topics) edit(rel, (t) => stripHelpImages(t), 'help-images')
  for (const rel of all.filter((f) => f.startsWith(`${brand.help.imageDir}/`))) {
    if (!dryRun) rmSync(join(root, rel))
    report.deleted.push(rel)
  }

  // 8. Windows icons
  for (const name of brand.icons.files) {
    const src = join(root, brand.icons.sourceDir, name)
    const rel = `${brand.icons.targetDir}/${name}`
    const dst = join(root, rel)
    if (!existsSync(src)) throw new Error(`${brand.icons.sourceDir}/${name}: icon source missing`)
    const same = existsSync(dst) && readFileSync(src).equals(readFileSync(dst))
    if (!same) {
      if (!dryRun) copyFileSync(src, dst)
      report.add(rel, 'icon-copied')
    }
  }
  return report
}

export function printReport(report, log = console.log) {
  const rows = [...report.files.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [file, rules] of rows) {
    const parts = Object.entries(rules)
      .filter(([k]) => k !== 'edited')
      .map(([k, v]) => `${k}=${v}`)
    log(`${file}${parts.length ? `  ${parts.join(' ')}` : ''}`)
  }
  for (const f of report.deleted) log(`${f}  deleted`)
  log(`rebrand: ${rows.length} files changed, ${report.deleted.length} files deleted`)
}

function parseArgs(argv) {
  const args = { root: process.cwd(), version: undefined, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--version') args.version = argv[++i]
    else if (a === '--root') args.root = resolve(argv[++i])
    else if (a === '--dry-run') args.dryRun = true
    else throw new Error(`unknown argument ${a}`)
  }
  if (args.version !== undefined && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(args.version))
    throw new Error(`--version must look like 1.2.3, got "${args.version}"`)
  return args
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (!args.version) console.log('rebrand: no --version given, package version left unchanged')
    printReport(rebrand(args))
  } catch (err) {
    console.error(`rebrand: ${err.message}`)
    process.exit(1)
  }
}
