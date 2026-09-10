import { z } from 'zod'

import type { SuccessfulLoadResult } from './load'
import type {
  Diagnostic,
  EntityKind,
  HomelabEntity,
  HomelabModel,
  RelationshipEdge,
} from './types'

export type DomainResult =
  | { ok: true; model: HomelabModel; files: string[] }
  | { ok: false; diagnostics: Diagnostic[] }

type RegistryEntry = {
  entity: HomelabEntity
  file: string
}

function diagnostic(
  category: Diagnostic['category'],
  message: string,
  file: string,
  path: string,
): Diagnostic {
  return { category, message, file, path }
}

function isHttpUrl(value: string) {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function isIpAddress(value: string) {
  return z.ipv4().safeParse(value).success || z.ipv6().safeParse(value).success
}

function entityKinds(): Record<EntityKind, string[]> {
  return {
    group: [],
    hardware: [],
    networkDevice: [],
    virtualMachine: [],
    application: [],
  }
}

function validateCycles(
  entries: Iterable<RegistryEntry>,
  parents: ReadonlyMap<string, string>,
  label: string,
  referenceField: string,
  diagnostics: Diagnostic[],
) {
  const entriesById = new Map(
    [...entries].map((entry) => [entry.entity.id, entry]),
  )
  const state = new Map<string, 'visiting' | 'visited'>()

  function visit(entry: RegistryEntry, trail: string[]): void {
    const id = entry.entity.id
    if (state.get(id) === 'visited') return
    if (state.get(id) === 'visiting') {
      const closingId = trail.at(-1) ?? id
      const closingEntry = entriesById.get(closingId) ?? entry
      diagnostics.push(
        diagnostic(
          'cycle',
          `${label} cycle: ${[...trail, id].join(' -> ')}.`,
          closingEntry.file,
          `${closingId}.${referenceField}`,
        ),
      )
      return
    }

    state.set(id, 'visiting')
    const parent = parents.get(id)
    const parentEntry = parent ? entriesById.get(parent) : undefined
    if (parentEntry) visit(parentEntry, [...trail, id])
    state.set(id, 'visited')
  }

  for (const entry of entriesById.values()) visit(entry, [])
}

export function validateDocuments(load: SuccessfulLoadResult): DomainResult {
  const diagnostics: Diagnostic[] = []
  const registry = new Map<string, RegistryEntry>()
  const idsByKind = entityKinds()
  const root = load.documents.find((document) => document.isRoot)

  if (!root || !('version' in root.data)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic('unexpected', 'The root document was not loaded.', '', '$'),
      ],
    }
  }

  for (const document of load.documents) {
    const collections: Array<[EntityKind, HomelabEntity[]]> = [
      [
        'group',
        (document.data.groups ?? []).map((entity) => ({
          ...entity,
          entityKind: 'group' as const,
        })),
      ],
      [
        'hardware',
        (document.data.hardware ?? []).map((entity) => ({
          ...entity,
          entityKind: 'hardware' as const,
        })),
      ],
      [
        'networkDevice',
        (document.data.networkDevices ?? []).map((entity) => ({
          ...entity,
          entityKind: 'networkDevice' as const,
        })),
      ],
      [
        'virtualMachine',
        (document.data.virtualMachines ?? []).map((entity) => ({
          ...entity,
          entityKind: 'virtualMachine' as const,
        })),
      ],
      [
        'application',
        (document.data.applications ?? []).map((entity) => ({
          ...entity,
          entityKind: 'application' as const,
        })),
      ],
    ]

    for (const [kind, entities] of collections) {
      for (const entity of entities) {
        const existing = registry.get(entity.id)
        if (existing) {
          diagnostics.push(
            diagnostic(
              'duplicate-id',
              `Duplicate ID '${entity.id}'; first defined in ${existing.file}.`,
              document.file,
              entity.id,
            ),
          )
          continue
        }
        registry.set(entity.id, { entity, file: document.file })
        idsByKind[kind].push(entity.id)
      }
    }
  }

  for (const { entity, file } of registry.values()) {
    if (entity.entityKind !== 'virtualMachine' || !entity.application) continue
    const applicationId = `${entity.id}:application`
    if (registry.has(applicationId)) {
      diagnostics.push(
        diagnostic(
          'duplicate-id',
          `Generated application ID '${applicationId}' is already defined.`,
          file,
          `${entity.id}.application`,
        ),
      )
      continue
    }
    registry.set(applicationId, {
      entity: {
        ...entity.application,
        id: applicationId,
        entityKind: 'application',
        kind: 'service',
        runsOn: entity.id,
        derivedFrom: entity.id,
      },
      file,
    })
    idsByKind.application.push(applicationId)
  }

  function reference(
    file: string,
    path: string,
    id: string | undefined,
    expected: EntityKind | EntityKind[],
  ) {
    if (!id) return undefined
    const entry = registry.get(id)
    const expectedKinds = Array.isArray(expected) ? expected : [expected]
    if (!entry || !expectedKinds.includes(entry.entity.entityKind)) {
      diagnostics.push(
        diagnostic(
          'invalid-reference',
          `'${id}' must reference ${expectedKinds.join(' or ')}.`,
          file,
          path,
        ),
      )
      return undefined
    }
    return entry.entity
  }

  const relationships: RelationshipEdge[] = []
  const groupParents = new Map<string, string>()
  const networkUpstreams = new Map<string, string>()
  const physicalConnectionPairs = new Set<string>()
  for (const { entity, file } of registry.values()) {
    const linksToCheck = [
      ...(entity.links ?? []),
      ...(entity.entityKind === 'application' ? (entity.endpoints ?? []) : []),
    ]
    for (const link of linksToCheck) {
      if (!isHttpUrl(link.url)) {
        diagnostics.push(
          diagnostic(
            'invalid-format',
            `'${link.url}' must be an HTTP(S) URL.`,
            file,
            entity.entityKind === 'application' && entity.derivedFrom
              ? `${entity.derivedFrom}.application`
              : entity.id,
          ),
        )
      }
    }

    if (
      entity.entityKind === 'networkDevice' ||
      entity.entityKind === 'hardware' ||
      entity.entityKind === 'virtualMachine'
    ) {
      const addresses = entity.addresses ?? []
      const assignedAddresses = addresses.flatMap(({ address }) =>
        address ? [address] : [],
      )
      if (new Set(assignedAddresses).size !== assignedAddresses.length) {
        diagnostics.push(
          diagnostic(
            'invalid-format',
            'Addresses must be unique.',
            file,
            `${entity.id}.addresses`,
          ),
        )
      }
      for (const address of addresses) {
        if (address.address && !isIpAddress(address.address))
          diagnostics.push(
            diagnostic(
              'invalid-format',
              `'${address.address}' must be an IP address.`,
              file,
              `${entity.id}.addresses`,
            ),
          )
      }
    }

    if (entity.entityKind === 'application') {
      const domains = entity.domains ?? []
      if (new Set(domains).size !== domains.length)
        diagnostics.push(
          diagnostic(
            'invalid-format',
            'Domains must be unique.',
            file,
            entity.derivedFrom
              ? `${entity.derivedFrom}.application.domains`
              : `${entity.id}.domains`,
          ),
        )
    }

    if (entity.entityKind === 'group' && entity.parent) {
      if (reference(file, `${entity.id}.parent`, entity.parent, 'group')) {
        groupParents.set(entity.id, entity.parent)
        relationships.push({
          source: entity.id,
          target: entity.parent,
          type: 'contains',
          direction: 'directed',
          origin: 'derived',
        })
      }
    }
    if (
      (entity.entityKind === 'hardware' ||
        entity.entityKind === 'networkDevice') &&
      entity.group
    ) {
      if (reference(file, `${entity.id}.group`, entity.group, 'group')) {
        relationships.push({
          source: entity.id,
          target: entity.group,
          type: 'contains',
          direction: 'directed',
          origin: 'derived',
        })
      }
    }
    if (entity.entityKind === 'networkDevice' && entity.upstream) {
      if (
        reference(
          file,
          `${entity.id}.upstream`,
          entity.upstream,
          'networkDevice',
        )
      ) {
        networkUpstreams.set(entity.id, entity.upstream)
        relationships.push({
          source: entity.id,
          target: entity.upstream,
          type: 'network-upstream',
          direction: 'directed',
          origin: 'derived',
        })
      }
    }
    if (entity.entityKind === 'hardware') {
      const connectedDevices = new Set<string>()
      for (const [index, address] of (entity.addresses ?? []).entries()) {
        if (
          !reference(
            file,
            `${entity.id}.addresses.${index}.networkDevice`,
            address.networkDevice,
            'networkDevice',
          ) ||
          connectedDevices.has(address.networkDevice)
        )
          continue
        connectedDevices.add(address.networkDevice)
        relationships.push({
          source: entity.id,
          target: address.networkDevice,
          type: 'connected-to',
          direction: 'directed',
          origin: 'derived',
        })
      }
    }
    if (
      entity.entityKind === 'hardware' ||
      entity.entityKind === 'networkDevice'
    ) {
      for (const [index, connection] of (entity.connections ?? []).entries()) {
        const path = `${entity.id}.connections.${index}`
        if (connection.target === entity.id) {
          diagnostics.push(
            diagnostic(
              'invalid-reference',
              'A connection cannot target itself.',
              file,
              path,
            ),
          )
          continue
        }
        if (
          !reference(file, `${path}.target`, connection.target, [
            'hardware',
            'networkDevice',
          ])
        )
          continue

        if (
          connection.kind === 'usb' &&
          (entity.entityKind !== 'hardware' ||
            registry.get(connection.target)?.entity.entityKind !== 'hardware')
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-reference',
              'USB connections must join two hardware entities.',
              file,
              path,
            ),
          )
          continue
        }
        if (
          connection.kind === 'poe' &&
          entity.entityKind !== 'networkDevice'
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-reference',
              'A PoE provider must be a network device.',
              file,
              path,
            ),
          )
          continue
        }

        const pair =
          connection.kind === 'usb'
            ? [entity.id, connection.target].toSorted().join(':')
            : `${entity.id}:${connection.target}`
        const connectionKey = `${pair}:${connection.kind}`
        if (physicalConnectionPairs.has(connectionKey)) {
          diagnostics.push(
            diagnostic(
              'duplicate-id',
              `Duplicate ${connection.kind} connection '${pair}'.`,
              file,
              path,
            ),
          )
          continue
        }
        physicalConnectionPairs.add(connectionKey)
        relationships.push({
          source: entity.id,
          target: connection.target,
          type: 'physical-connection',
          kind: connection.kind,
          ...(connection.label && { label: connection.label }),
          direction: connection.kind === 'usb' ? 'undirected' : 'directed',
          origin: 'declared',
        })
      }
    }
    if (entity.entityKind === 'virtualMachine') {
      const parent = reference(
        file,
        `${entity.id}.runsOn`,
        entity.runsOn,
        'hardware',
      )
      if (parent?.entityKind === 'hardware') {
        if (
          parent.kind !== 'compute' ||
          !parent.capabilities?.includes('virtualisation')
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-reference',
              `VM '${entity.id}' must run on compute hardware with the virtualisation capability.`,
              file,
              `${entity.id}.runsOn`,
            ),
          )
        } else {
          relationships.push({
            source: entity.id,
            target: entity.runsOn,
            type: 'runs-on',
            direction: 'directed',
            origin: 'derived',
          })
        }
      }
    }
    if (entity.entityKind === 'application') {
      if (
        reference(file, `${entity.id}.runsOn`, entity.runsOn, 'virtualMachine')
      )
        relationships.push({
          source: entity.id,
          target: entity.runsOn,
          type: 'runs-on',
          direction: 'directed',
          origin: 'derived',
        })
      for (const dependency of entity.dependsOn ?? []) {
        if (dependency === entity.id)
          diagnostics.push(
            diagnostic(
              'invalid-reference',
              'An application cannot depend on itself.',
              file,
              `${entity.id}.dependsOn`,
            ),
          )
        else if (
          reference(file, `${entity.id}.dependsOn`, dependency, 'application')
        )
          relationships.push({
            source: entity.id,
            target: dependency,
            type: 'depends-on',
            direction: 'directed',
            origin: 'declared',
          })
      }
    }
  }

  validateCycles(
    registry.values(),
    groupParents,
    'Location',
    'parent',
    diagnostics,
  )
  validateCycles(
    registry.values(),
    networkUpstreams,
    'Network upstream',
    'upstream',
    diagnostics,
  )

  if (diagnostics.length > 0) return { ok: false, diagnostics }

  return {
    ok: true,
    files: load.documents.map((document) => document.path),
    model: {
      version: 1,
      site: {
        id: root.data.site.id,
        name: root.data.site.name,
        ...(root.data.site.description && {
          description: root.data.site.description,
        }),
      },
      entities: Object.fromEntries(
        [...registry.entries()].map(([id, entry]) => [id, entry.entity]),
      ),
      entityIdsByKind: idsByKind,
      relationships,
    },
  }
}
