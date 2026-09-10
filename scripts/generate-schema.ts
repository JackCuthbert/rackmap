import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { homelabJsonSchema } from '../src/domain/schema'

const schemaPath = resolve(import.meta.dirname, '../schema/homelab.schema.json')
const schema = {
  $id: 'https://example.invalid/homelab.schema.json',
  ...homelabJsonSchema,
}

await mkdir(dirname(schemaPath), { recursive: true })
await Bun.write(schemaPath, `${JSON.stringify(schema, undefined, 2)}\n`)
