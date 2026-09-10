import type {
  Application,
  VirtualMachine,
  Hardware,
  Group,
  NetworkDevice,
} from './schema'

export type DiagnosticCategory =
  | 'filesystem-import'
  | 'yaml-syntax'
  | 'structural-schema'
  | 'duplicate-id'
  | 'invalid-reference'
  | 'invalid-format'
  | 'cycle'
  | 'unexpected'

export type Diagnostic = {
  category: DiagnosticCategory
  message: string
  file: string
  path: string
  line?: number
  column?: number
}

export type EntityKind =
  | 'group'
  | 'hardware'
  | 'networkDevice'
  | 'virtualMachine'
  | 'application'

export type HomelabEntity =
  | (Group & { entityKind: 'group' })
  | (Hardware & { entityKind: 'hardware' })
  | (NetworkDevice & { entityKind: 'networkDevice' })
  | (VirtualMachine & { entityKind: 'virtualMachine' })
  | (Application & { entityKind: 'application'; derivedFrom?: string })

export type RelationshipType =
  | 'contains'
  | 'network-upstream'
  | 'connected-to'
  | 'physical-connection'
  | 'runs-on'
  | 'depends-on'

export type RelationshipEdge = {
  source: string
  target: string
  type: RelationshipType
  kind?: 'usb' | 'power'
  label?: string
  direction: 'directed' | 'undirected'
  origin: 'declared' | 'derived'
}

export type Site = {
  id: string
  name: string
  description?: string
}

export type HomelabModel = {
  version: 1
  site: Site
  entities: Record<string, HomelabEntity>
  entityIdsByKind: Record<EntityKind, string[]>
  relationships: RelationshipEdge[]
}

export type ApiModelResponse =
  | { model: HomelabModel; diagnostics: Diagnostic[] }
  | { model: undefined; diagnostics: Diagnostic[] }
