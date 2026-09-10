import { LineCounter, isNode, parseDocument, type Document } from 'yaml'
import type { z } from 'zod'

import { rootDocumentSchema } from '../domain/schema'
import { validateDocuments, type DomainResult } from '../domain/validate'
import type { Diagnostic } from '../domain/types'

function diagnostic(
  category: Diagnostic['category'],
  message: string,
  file: string,
  path: string,
  document?: Document.Parsed,
  yamlPath: (string | number)[] = [],
  lineCounter?: LineCounter,
): Diagnostic {
  const node = document?.getIn(yamlPath, true)
  const start = isNode(node) ? node.range?.[0] : undefined
  const location =
    start === undefined || !lineCounter ? undefined : lineCounter.linePos(start)

  return {
    category,
    message,
    file,
    path,
    ...(location && { line: location.line, column: location.col }),
  }
}

function zodDiagnostics(
  result: z.ZodSafeParseError<unknown>,
  file: string,
  document: Document.Parsed,
  lineCounter: LineCounter,
) {
  return result.error.issues.map((issue) => {
    const yamlPath = issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    )
    return diagnostic(
      'structural-schema',
      issue.message,
      file,
      yamlPath.map(String).join('.') || '$',
      document,
      yamlPath,
      lineCounter,
    )
  })
}

export function loadYaml(source: string, file: string): DomainResult {
  const lineCounter = new LineCounter()
  const document = parseDocument(source, {
    lineCounter,
    prettyErrors: false,
    uniqueKeys: true,
  })
  if (document.errors.length) {
    return {
      ok: false,
      diagnostics: document.errors.map((error) =>
        diagnostic('yaml-syntax', error.message, file, '$'),
      ),
    }
  }

  let value: unknown
  try {
    value = document.toJS({ maxAliasCount: 100 })
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'yaml-syntax',
          error instanceof Error
            ? error.message
            : 'YAML could not be resolved.',
          file,
          '$',
        ),
      ],
    }
  }

  const parsed = rootDocumentSchema.safeParse(value)
  if (!parsed.success)
    return {
      ok: false,
      diagnostics: zodDiagnostics(parsed, file, document, lineCounter),
    }

  if (parsed.data.imports?.length) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'filesystem-import',
          'Imports are not supported for browser-loaded YAML. Combine the documents into one file.',
          file,
          'imports',
          document,
          ['imports'],
          lineCounter,
        ),
      ],
    }
  }

  return validateDocuments({
    ok: true,
    rootPath: file,
    rootDirectory: '',
    documents: [
      { path: file, file, isRoot: true, data: parsed.data, document },
    ],
  })
}
