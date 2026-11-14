#!/usr/bin/env node
// Scans a tree that naigen/rebrand.mjs has already transformed and exits non-zero
// when upstream branding is left. Everything it needs, including the
// allowlist, comes from naigen/brand.json. Node built-ins only.
//
// Usage: node naigen/brand-scan.mjs [--root <dir>] [--allow <check>]...
//   --allow  do not fail on that check (it is still listed); used only while a
//            check depends on a task that has not landed yet
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GENSPARK_RE, buildStandaloneRe, loadBrand, matchGlobs, walkFiles } from './brand-lib.mjs'

export const CHECKS = [
  'upstream-name',
  'genspark-name',
  'jsx-label',
  'upstream-url',
  'upstream-icon',
  'genspark-logo',
  'help-image',
  'packaging',
]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const readText = (root, rel) => readFileSync(join(root, rel), 'utf8')

function lineHits(root, rel, check, test, allow) {
  const hits = []
  readText(root, rel)
    .split('\n')
    .forEach((line, i) => {
      if (allow.lineSubstrings.some((s) => line.includes(s))) return
      const found = test(line)
      if (found)
        hits.push({ check, file: rel, line: i + 1, text: line.trim().slice(0, 140), found })
    })
  return hits
}

/** Returns every hit; an empty array means the tree is clean. */
export function scan({ root, brand = loadBrand() }) {
  const all = walkFiles(root)
  const sc = brand.scan
  const allow = sc.allowlist
  const hits = []
  const stringFiles = matchGlobs(all, brand.stringFiles).files
  const titleFiles = matchGlobs(all, [...brand.titleFiles, ...brand.promptFiles]).files
  const jsxFiles = matchGlobs(all, brand.jsxLabelFiles).files

  // AC-2: the upstream name and Genspark in user-visible strings
  const nameRe = buildStandaloneRe(brand)
  const gensparkRe = new RegExp(GENSPARK_RE.source)
  for (const rel of [...stringFiles, ...titleFiles]) {
    hits.push(
      ...lineHits(root, rel, 'upstream-name', (l) => (l.match(nameRe) ? 'GenOffice' : null), allow),
    )
  }
  for (const rel of stringFiles) {
    hits.push(
      ...lineHits(
        root,
        rel,
        'genspark-name',
        (l) => (gensparkRe.test(l) ? 'Genspark' : null),
        allow,
      ),
    )
  }
  const jsxRes = brand.jsxLabelPatterns.map((p) => new RegExp(p.pattern))
  for (const rel of jsxFiles) {
    hits.push(
      ...lineHits(
        root,
        rel,
        'jsx-label',
        (l) => (jsxRes.some((re) => re.test(l)) ? 'Genspark' : null),
        allow,
      ),
    )
  }

  // AC-11: links to upstream services in the user-visible strings
  for (const rel of stringFiles) {
    hits.push(
      ...lineHits(
        root,
        rel,
        'upstream-url',
        (l) => {
          let line = l.toLowerCase()
          for (const ok of allow.upstreamLinks) line = line.split(ok.toLowerCase()).join('')
          return sc.forbiddenUrls.find((u) => line.includes(u)) ?? null
        },
        allow,
      ),
    )
  }

  // AC-3: Windows icons must differ from the upstream files
  for (const [rel, prefix] of Object.entries(sc.upstreamIconHashPrefixes)) {
    const full = join(root, rel)
    if (!existsSync(full)) {
      hits.push({
        check: 'upstream-icon',
        file: rel,
        line: 0,
        text: 'icon file is missing',
        found: rel,
      })
    } else if (sha256(readFileSync(full)).startsWith(prefix)) {
      hits.push({
        check: 'upstream-icon',
        file: rel,
        line: 0,
        text: `sha256 ${prefix}... is the upstream icon`,
        found: rel,
      })
    }
  }

  // AC-3: the Genspark logo drawing (path data and viewBox of the upstream mark).
  // The component may keep its upstream name once it draws a neutral icon.
  for (const rel of matchGlobs(all, sc.logoGlobs).files) {
    const text = readText(root, rel)
    for (const sym of sc.logoSignatures) {
      if (!text.includes(sym)) continue
      const line = text.split('\n').findIndex((l) => l.includes(sym)) + 1
      hits.push({
        check: 'genspark-logo',
        file: rel,
        line,
        text: `Genspark logo drawing (${sym}) is still present`,
        found: sym,
      })
      break
    }
  }

  // help pages: screenshots must be gone from topics and from the img folder
  for (const rel of all.filter((f) => f.startsWith(`${brand.help.topicsDir}/`))) {
    if (rel.startsWith(`${brand.help.imageDir}/`)) {
      hits.push({
        check: 'help-image',
        file: rel,
        line: 0,
        text: 'screenshot file is still shipped',
        found: rel,
      })
    } else if (rel.endsWith('.md')) {
      hits.push(
        ...lineHits(
          root,
          rel,
          'help-image',
          (l) => (/!\[[^\]]*\]\(img\//.test(l) ? 'img' : null),
          allow,
        ),
      )
    }
  }

  // packaging: @genspark/cli must not be packed
  if (existsSync(join(root, sc.packagingFile))) {
    for (const bad of sc.packagingForbidden) {
      hits.push(
        ...lineHits(
          root,
          sc.packagingFile,
          'packaging',
          (l) => (l.includes(bad) ? bad : null),
          allow,
        ),
      )
    }
    // AC-4: the license files must be packaged next to the third-party notices
    const builderText = readText(root, sc.packagingFile)
    for (const need of sc.packagingRequired ?? []) {
      if (!builderText.includes(need)) {
        hits.push({
          check: 'packaging',
          file: sc.packagingFile,
          line: 0,
          text: `missing extraResources entry ${need}`,
          found: need,
        })
      }
    }
  } else {
    hits.push({
      check: 'packaging',
      file: sc.packagingFile,
      line: 0,
      text: 'file is missing',
      found: sc.packagingFile,
    })
  }
  return hits
}

export function printHits(hits, allowed, log = console.log) {
  const by = new Map()
  for (const h of hits) by.set(h.check, [...(by.get(h.check) ?? []), h])
  for (const check of CHECKS) {
    const list = by.get(check) ?? []
    const mark = allowed.has(check) ? ' (allowed, not failing)' : ''
    log(`${check}: ${list.length} hit(s)${mark}`)
    for (const h of list.slice(0, 25)) log(`  ${h.file}${h.line ? `:${h.line}` : ''}  ${h.text}`)
    if (list.length > 25) log(`  ... ${list.length - 25} more`)
  }
}

function parseArgs(argv) {
  const args = { root: process.cwd(), allow: new Set() }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = resolve(argv[++i])
    else if (argv[i] === '--allow') {
      const c = argv[++i]
      if (!CHECKS.includes(c)) throw new Error(`unknown check ${c}; known: ${CHECKS.join(', ')}`)
      args.allow.add(c)
    } else throw new Error(`unknown argument ${argv[i]}`)
  }
  return args
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { root, allow } = parseArgs(process.argv.slice(2))
    const hits = scan({ root })
    printHits(hits, allow)
    const failing = hits.filter((h) => !allow.has(h.check))
    console.log(
      failing.length ? `brand-scan: FAILED, ${failing.length} hit(s)` : 'brand-scan: clean',
    )
    process.exit(failing.length ? 1 : 0)
  } catch (err) {
    console.error(`brand-scan: ${err.message}`)
    process.exit(2)
  }
}
