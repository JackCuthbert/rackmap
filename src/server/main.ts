import { createHomelabServer } from './app'

const rootPath = process.argv.filter((argument) => argument !== '--dev').at(-1)

if (!rootPath || rootPath.startsWith('--')) {
  console.error('Usage: bun run dev -- path/to/homelab.yaml')
  process.exit(1)
}

const server = createHomelabServer(rootPath)
console.log(`Homelab API listening on http://0.0.0.0:${server.port}`)
