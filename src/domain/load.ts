import { readFile } from 'node:fs/promises'
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path'

import { LineCounter, isNode, parseDocument, type Document } from 'yaml'
import type { z } from 'zod'

import {
  importDocumentSchema,
  rootDocumentSchema,
  type ImportDocument,
  type RootDocument,
} from './schema'
import type { Diagnostic } from './types'

type ParsedDocument = RootDocument | ImportDocument

const lineCounters = new WeakMap<object, LineCounter>()

export type LoadedDocument = {
  path: string
  file: string
  isRoot: boolean
  data: ParsedDocument
  document: Document.Parsed
}

export type SuccessfulLoadResult = {
  ok: true
  rootPath: string
  rootDirectory: string
  documents: LoadedDocument[]
}

export type FailedLoadResult = {
  ok: false
  diagnostics: Diagnostic[]
}

export type LoadResult = SuccessfulLoadResult | FailedLoadResult

function locationFor(document: Document.Parsed, path: (string | number)[]) {
  const node = document.getIn(path, true)
  const start = isNode(node) ? node.range?.[0] : undefined
  const lineCounter = lineCounters.get(document)

  return start === undefined || !lineCounter
    ? undefined
    : lineCounter.linePos(start)
}

function diagnostic(
  category: Diagnostic['category'],
  message: string,
  file: string,
  path: string,
  document?: Document.Parsed,
  yamlPath: (string | number)[] = [],
): Diagnostic {
  const location = document && locationFor(document, yamlPath)

  return {
    category,
    message,
    file,
    path,
    ...(location && { line: location.line, column: location.col }),
  }
}

function fileName(rootDirectory: string, path: string) {
  return relative(rootDirectory, path) || basename(path)
}

function isInside(rootDirectory: string, path: string) {
  const pathFromRoot = relative(rootDirectory, path)
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== '..' &&
      !isAbsolute(pathFromRoot))
  )
}

function zodDiagnostics(
  result: z.ZodSafeParseError<unknown>,
  file: string,
  document: Document.Parsed,
) {
  return result.error.issues.map((issue) => {
    const issuePath = issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    )
    const path = issuePath.map(String)
    return diagnostic(
      'structural-schema',
      issue.message,
      file,
      path.join('.') || '$',
      document,
      issuePath,
    )
  })
}

export async function loadDocuments(rootPath: string): Promise<LoadResult> {
  const absoluteRootPath = resolve(rootPath)
  const rootDirectory = resolve(absoluteRootPath, '..')
  const diagnostics: Diagnostic[] = []
  const documents: LoadedDocument[] = []
  const visited = new Set<string>()
  const stack = new Set<string>()

  async function visit(path: string, isRoot: boolean): Promise<void> {
    const file = fileName(rootDirectory, path)

    if (stack.has(path)) {
      diagnostics.push(
        diagnostic('cycle', `Import cycle includes '${file}'.`, file, '$'),
      )
      return
    }

    if (visited.has(path)) {
      diagnostics.push(
        diagnostic(
          'filesystem-import',
          `Duplicate import '${file}'.`,
          file,
          '$',
        ),
      )
      return
    }

    visited.add(path)
    stack.add(path)

    let source: string
    try {
      source = await readFile(path, 'utf8')
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'filesystem-import',
          `Could not read '${file}': ${error instanceof Error ? error.message : 'unknown error'}`,
          file,
          '$',
        ),
      )
      stack.delete(path)
      return
    }

    const lineCounter = new LineCounter()
    const document = parseDocument(source, {
      lineCounter,
      prettyErrors: false,
      uniqueKeys: true,
    })
    lineCounters.set(document, lineCounter)

    if (document.errors.length > 0) {
      for (const error of document.errors) {
        diagnostics.push(
          diagnostic('yaml-syntax', error.message, file, '$', document),
        )
      }
      stack.delete(path)
      return
    }

    let value: unknown
    try {
      value = document.toJS({ maxAliasCount: 100 })
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'yaml-syntax',
          error instanceof Error
            ? error.message
            : 'YAML could not be resolved.',
          file,
          '$',
          document,
        ),
      )
      stack.delete(path)
      return
    }

    const schema = isRoot ? rootDocumentSchema : importDocumentSchema
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      diagnostics.push(...zodDiagnostics(parsed, file, document))
      stack.delete(path)
      return
    }

    for (const [index, importedPath] of (parsed.data.imports ?? []).entries()) {
      if (isAbsolute(importedPath)) {
        diagnostics.push(
          diagnostic(
            'filesystem-import',
            `Import '${importedPath}' must be relative.`,
            file,
            `imports.${index}`,
            document,
            ['imports', index],
          ),
        )
        continue
      }

      const extension = extname(importedPath).toLowerCase()
      if (extension !== '.yaml' && extension !== '.yml') {
        diagnostics.push(
          diagnostic(
            'filesystem-import',
            `Import '${importedPath}' must use a .yaml or .yml extension.`,
            file,
            `imports.${index}`,
            document,
            ['imports', index],
          ),
        )
        continue
      }

      const importedAbsolutePath = resolve(path, '..', importedPath)
      if (!isInside(rootDirectory, importedAbsolutePath)) {
        diagnostics.push(
          diagnostic(
            'filesystem-import',
            `Import '${importedPath}' escapes the root configuration directory.`,
            file,
            `imports.${index}`,
            document,
            ['imports', index],
          ),
        )
        continue
      }

      await visit(importedAbsolutePath, false)
    }

    documents.push({
      path,
      file,
      isRoot,
      data: parsed.data,
      document,
    })
    stack.delete(path)
  }

  if (!['.yaml', '.yml'].includes(extname(absoluteRootPath).toLowerCase())) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'filesystem-import',
          'The root configuration must use a .yaml or .yml extension.',
          basename(absoluteRootPath),
          '$',
        ),
      ],
    }
  }

  await visit(absoluteRootPath, true)

  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : {
        ok: true,
        rootPath: absoluteRootPath,
        rootDirectory,
        documents,
      }
}
