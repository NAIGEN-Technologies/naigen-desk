// Modified for Naigen Desk: attribution line and license files for the About
// dialog. Kept in its own module, outside the files naigen/rebrand.mjs rewrites,
// because the attribution must keep naming the upstream project.
import { join } from 'node:path'

export type AboutFile = 'LICENSE' | 'NOTICE' | 'THIRD-PARTY-NOTICES.txt'

export interface AboutTexts {
  attribution: string
  buttons: Record<AboutFile, string>
}

const EN: AboutTexts = {
  attribution: 'Based on GenOffice by Mainfunc, Inc., licensed under Apache-2.0',
  buttons: {
    LICENSE: 'License',
    NOTICE: 'Notice',
    'THIRD-PARTY-NOTICES.txt': 'Third-party notices',
  },
}

const VI: AboutTexts = {
  attribution: 'Dựa trên GenOffice của Mainfunc, Inc., giấy phép Apache-2.0',
  buttons: { LICENSE: 'Giấy phép', NOTICE: 'Ghi công', 'THIRD-PARTY-NOTICES.txt': 'Bên thứ ba' },
}

/** Vietnamese gets its own text; every other language shows the English line. */
export function aboutTexts(vietnamese: boolean): AboutTexts {
  return vietnamese ? VI : EN
}

/** The three files the About dialog can open, in button order. */
export const ABOUT_FILES: readonly AboutFile[] = ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt']

/**
 * Where a file lives. Packaged: next to each other in the resources folder.
 * Development: LICENSE and NOTICE sit at the repository root, the generated
 * notices in apps/shell/build.
 */
export function aboutFilePath(
  file: AboutFile,
  env: { isPackaged: boolean; appPath: string; resourcesPath: string },
): string {
  if (env.isPackaged) return join(env.resourcesPath, file)
  if (file === 'THIRD-PARTY-NOTICES.txt') return join(env.appPath, 'build', file)
  return join(env.appPath, '..', '..', file)
}
