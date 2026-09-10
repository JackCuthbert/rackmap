export * from './schema'
export * from './types'
export * from './load'
export * from './validate'

import { loadDocuments } from './load'
import type { Diagnostic, HomelabModel } from './types'
import { validateDocuments } from './validate'

export type HomelabLoadResult =
  | { ok: true; model: HomelabModel; files: string[] }
  | { ok: false; diagnostics: Diagnostic[] }

export async function loadHomelab(
  rootPath: string,
): Promise<HomelabLoadResult> {
  const loaded = await loadDocuments(rootPath)
  return loaded.ok ? validateDocuments(loaded) : loaded
}
