import { watch } from 'node:fs'

import { loadHomelab } from '../domain'
import type { Diagnostic, HomelabModel } from '../domain'

export function createHomelabServer(rootPath: string, port = 3001) {
  let model: HomelabModel | undefined
  let diagnostics: Diagnostic[] = []
  let watchedFiles: string[] = []
  let watchers: ReturnType<typeof watch>[] = []
  const clients = new Set<ReadableStreamDefaultController<string>>()
  let timer: ReturnType<typeof setTimeout> | undefined

  function publish(type: 'model-updated' | 'validation-failed') {
    const message = `event: ${type}\ndata: ${JSON.stringify({ diagnostics })}\n\n`
    for (const client of clients) client.enqueue(message)
  }

  function replaceWatchers(files: string[]) {
    for (const watcher of watchers) watcher.close()
    watchedFiles = files
    watchers = files.map((file) =>
      watch(file, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => void reload(), 150)
      }),
    )
  }

  async function reload() {
    try {
      const result = await loadHomelab(rootPath)
      if (result.ok) {
        model = result.model
        diagnostics = []
        replaceWatchers(result.files)
        publish('model-updated')
      } else {
        diagnostics = result.diagnostics
        publish('validation-failed')
      }
    } catch (error) {
      console.error(error)
      diagnostics = [
        {
          category: 'unexpected',
          message: 'Unexpected reload failure.',
          file: '',
          path: '$',
        },
      ]
      publish('validation-failed')
    }
  }

  const server = Bun.serve({
    hostname: '0.0.0.0',
    port,
    async fetch(request) {
      const path = new URL(request.url).pathname
      if (path === '/api/model') return Response.json({ model, diagnostics })
      if (path === '/api/diagnostics') return Response.json({ diagnostics })
      if (path === '/events') {
        const stream = new ReadableStream<string>({
          start(controller) {
            clients.add(controller)
            controller.enqueue(': connected\n\n')
          },
          cancel() {},
        })
        return new Response(stream, {
          headers: {
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Content-Type': 'text/event-stream',
          },
        })
      }
      return new Response('Not found', { status: 404 })
    },
  })

  void reload()
  return {
    port: server.port,
    reload,
    stop: () => {
      for (const watcher of watchers) watcher.close()
      void server.stop()
    },
    watchedFiles,
  }
}
