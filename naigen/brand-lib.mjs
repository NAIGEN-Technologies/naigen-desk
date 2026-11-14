// Shared helpers for rebrand.mjs and brand-scan.mjs. Node built-ins only.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NAIGEN_DIR = dirname(fileURLToPath(import.meta.url))

export function loadBrand(file = join(NAIGEN_DIR, 'brand.json')) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.worktrees', 'out', 'dist', 'release'])

/** Every file under `root` as a posix path relative to it, skipping build output and vendored dirs. */
export function walkFiles(root) {
  const out = []
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) visit(full)
      else if (st.isFile()) out.push(relative(root, full).split(sep).join(posix.sep))
    }
  }
  visit(root)
  return out.sort()
}

/** Glob to RegExp: `**` crosses directories, `*` stays inside one segment. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** Files (from `all`) matching any glob. Returns `{ files, empty }` where `empty` lists globs with no match. */
export function matchGlobs(all, globs) {
  const res = globs.map((g) => ({ g, re: globToRegExp(g), hits: 0 }))
  const files = []
  for (const f of all) {
    let hit = false
    for (const r of res) {
      if (r.re.test(f)) {
        r.hits++
        hit = true
      }
    }
    if (hit) files.push(f)
  }
  return { files, empty: res.filter((r) => r.hits === 0).map((r) => r.g) }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Standalone brand word: not part of an identifier (no word char, `@` or `/`
 * before it; no word char or `/` after it), not a protected font name, not a
 * protected literal. `GenOffice.` at the end of a sentence still matches.
 */
export function buildStandaloneRe(brand) {
  const up = brand.upstreamName
  const fontSuffixes = brand.keep.fontNames
    .map((n) => n.slice(up.length + 1))
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
  const literals = brand.keep.literals.map((l) => escapeRe(l.slice(up.length)))
  const keepFont = `(?! (?:${fontSuffixes.join('|')})(?![A-Za-z]))`
  const keepLit = literals.length ? `(?!(?:${literals.join('|')})(?![A-Za-z]))` : ''
  return new RegExp(`(?<![\\w@/])${escapeRe(up)}(?![\\w/])${keepFont}${keepLit}`, 'g')
}

/** `Genspark` (optionally followed by ` AI`) as a word, not part of an identifier or a path. */
export const GENSPARK_RE = /(?<![A-Za-z0-9_@/])Genspark(?: AI(?![A-Za-z]))?(?![A-Za-z0-9_])/g

const LOCALES = 'ar|cs|de|en|es|fr|he|hi|id|it|ja|ko|ms|nl|pl|pt|ru|th|tr|vi|zh-TW|zh'
const FILE_LOCALE_RE = new RegExp(`(?:^|[./])(${LOCALES})\\.(?:ts|md)$`)
const BLOCK_RE = new RegExp(`^ {0,2}['"]?(${LOCALES})['"]?\\s*:\\s*\\{`)
const RIBBON_RE =
  /\bribbonCommon(Zh|En|Ja|Ko|Fr|De|Es|Th|Id|Ru|Ar|Pt|It|Pl|Cs|Nl|Ms|He|Hi|zhTW|Vi|Tr)\b/

/**
 * Locale of each line. A file named `<locale>.ts` or `<topic>.<locale>.md` has
 * one locale; a multi-locale file switches at `xx: {` blocks and at
 * `ribbonCommon<Xx>` exports. Anything before the first block is `other`.
 */
export function makeLocaleTracker(file) {
  const m = FILE_LOCALE_RE.exec(file)
  if (m) return () => m[1]
  let current = 'other'
  return (line) => {
    const b = BLOCK_RE.exec(line)
    if (b) current = b[1]
    else {
      const r = RIBBON_RE.exec(line)
      if (r && /export const/.test(line)) current = r[1] === 'zhTW' ? 'zh-TW' : r[1].toLowerCase()
    }
    return current
  }
}

export function gensparkLabel(brand, locale) {
  return brand.gensparkLabels[locale] ?? brand.gensparkLabels.default
}
