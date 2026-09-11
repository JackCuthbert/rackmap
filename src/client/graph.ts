import type {
  EntityKind,
  HomelabEntity,
  HomelabModel,
  RelationshipEdge,
} from '../domain/types'

export const bands = [
  'Locations',
  'Network',
  'Hardware',
  'Virtualisation',
  'Applications',
] as const

export type GraphBand = (typeof bands)[number]

export type HandleSide = 'top' | 'bottom' | 'left' | 'right'

export type EdgeRoutePlan = {
  mode: 'vertical' | 'side' | 'gutter'
  sourceHandle: HandleSide
  targetHandle: HandleSide
  parallelOffset?: number
  gutterX?: number
}

export type GraphPoint = { x: number; y: number }

export type EdgeHandleRequest = {
  id: string
  source: string
  target: string
  sourceSide: HandleSide
  targetSide: HandleSide
  sourceOrder?: number
  targetOrder?: number
}

export type NodeHandle = {
  id: string
  type: 'source' | 'target'
  side: HandleSide
  offset: number
}

export type EdgeHandleAssignments = {
  byEdge: Map<string, { sourceHandle: string; targetHandle: string }>
  byNode: Map<string, NodeHandle[]>
}

export type NodeMetadata = {
  label: 'Hostname' | 'IP' | 'Domains'
  value: string
}

export type GroupHighlight = {
  id: string
  name: string
  color: string
}

export type UnifiedGraphNode = {
  id: string
  entity: HomelabEntity
  band: GraphBand
  metadata: NodeMetadata[]
  dimmed: boolean
  groupHighlight?: GroupHighlight
}

export type UnifiedGraphEdge = RelationshipEdge & {
  id: string
  dimmed: boolean
  showLabel: boolean
  groupColor?: string
}

export type UnifiedGraph = {
  nodes: UnifiedGraphNode[]
  edges: UnifiedGraphEdge[]
}

const bandsByEntityKind: Record<EntityKind, GraphBand> = {
  group: 'Locations',
  networkDevice: 'Network',
  hardware: 'Hardware',
  virtualMachine: 'Virtualisation',
  application: 'Applications',
}

const bandIndexes = new Map(bands.map((band, index) => [band, index]))

const graphRelationshipTypes = new Set<RelationshipEdge['type']>([
  'contains',
  'network-upstream',
  'connected-to',
  'physical-connection',
  'runs-on',
  'depends-on',
])

const vlanPalette = [
  '#4ca6a8',
  '#7598df',
  '#b787d8',
  '#d28b69',
  '#8eae69',
  '#c4a44d',
  '#5dadd5',
  '#d2759b',
]

const groupPalette = [
  '#b6d7e0',
  '#d0b8df',
  '#b6d6b0',
  '#e0b8a8',
  '#aebfd8',
  '#d8c58e',
]

export function vlanColor(vlan: number): string {
  return vlanPalette[(vlan - 1) % vlanPalette.length]!
}

export function groupColor(id: string): string {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return groupPalette[hash % groupPalette.length]!
}

export function bandFor(entityKind: EntityKind): GraphBand {
  return bandsByEntityKind[entityKind]
}

export function assignEdgeHandles(
  requests: readonly EdgeHandleRequest[],
): EdgeHandleAssignments {
  const byEdge = new Map<
    string,
    { sourceHandle: string; targetHandle: string }
  >()
  const byNode = new Map<string, NodeHandle[]>()
  const requestsByHandle = new Map<
    string,
    { request: EdgeHandleRequest; type: 'source' | 'target'; order: number }[]
  >()
  const handleDetails = new Map<
    string,
    { nodeId: string; type: 'source' | 'target'; side: HandleSide }
  >()

  for (const request of requests) {
    const sourceKey = `${request.source}\0source\0${request.sourceSide}`
    const targetKey = `${request.target}\0target\0${request.targetSide}`
    handleDetails.set(sourceKey, {
      nodeId: request.source,
      type: 'source',
      side: request.sourceSide,
    })
    handleDetails.set(targetKey, {
      nodeId: request.target,
      type: 'target',
      side: request.targetSide,
    })
    requestsByHandle.set(sourceKey, [
      ...(requestsByHandle.get(sourceKey) ?? []),
      { request, type: 'source', order: request.sourceOrder ?? 0 },
    ])
    requestsByHandle.set(targetKey, [
      ...(requestsByHandle.get(targetKey) ?? []),
      { request, type: 'target', order: request.targetOrder ?? 0 },
    ])
  }

  for (const [key, handleRequests] of requestsByHandle) {
    const { nodeId, type, side } = handleDetails.get(key)!
    for (const [offset, { request }] of handleRequests
      .toSorted(
        (left, right) =>
          left.order - right.order ||
          left.request.id.localeCompare(right.request.id),
      )
      .entries()) {
      const id = `${type}-${side}-${offset}`
      byEdge.set(request.id, {
        ...(byEdge.get(request.id) ?? {}),
        [`${type}Handle`]: id,
      } as { sourceHandle: string; targetHandle: string })
      byNode.set(nodeId, [
        ...(byNode.get(nodeId) ?? []),
        { id, type, side, offset },
      ])
    }
  }

  return { byEdge, byNode }
}

export function planEdgeRoute({
  sourceBand,
  targetBand,
  sourceX,
  targetX,
  sourceY,
  targetY,
  minX,
  maxX,
  parallelOffset = 0,
  sameBandVertical = false,
}: {
  sourceBand: GraphBand
  targetBand: GraphBand
  sourceX: number
  targetX: number
  sourceY?: number
  targetY?: number
  minX: number
  maxX: number
  parallelOffset?: number
  sameBandVertical?: boolean
}): EdgeRoutePlan {
  const sourceIndex = bandIndexes.get(sourceBand)!
  const targetIndex = bandIndexes.get(targetBand)!
  const distance = Math.abs(sourceIndex - targetIndex)

  if (distance === 1)
    return sourceIndex > targetIndex
      ? { mode: 'vertical', sourceHandle: 'top', targetHandle: 'bottom' }
      : { mode: 'vertical', sourceHandle: 'bottom', targetHandle: 'top' }

  if (distance === 0 && sameBandVertical)
    return (sourceY ?? 0) <= (targetY ?? 0)
      ? { mode: 'vertical', sourceHandle: 'bottom', targetHandle: 'top' }
      : { mode: 'vertical', sourceHandle: 'top', targetHandle: 'bottom' }

  if (distance === 0)
    return sourceX <= targetX
      ? {
          mode: 'side',
          sourceHandle: 'right',
          targetHandle: 'left',
          parallelOffset,
        }
      : {
          mode: 'side',
          sourceHandle: 'left',
          targetHandle: 'right',
          parallelOffset,
        }

  const useLeftGutter = sourceX + targetX <= minX + maxX
  const gutterX = useLeftGutter
    ? minX - 64 - parallelOffset
    : maxX + 64 + parallelOffset
  const handle = useLeftGutter ? 'left' : 'right'
  return { mode: 'gutter', sourceHandle: handle, targetHandle: handle, gutterX }
}

export function edgeRoutePath(
  plan: EdgeRoutePlan,
  source: GraphPoint,
  target: GraphPoint,
) {
  if (plan.mode === 'vertical') {
    const controlY = (source.y + target.y) / 2

    return {
      path: `M ${source.x} ${source.y} C ${source.x} ${controlY}, ${target.x} ${controlY}, ${target.x} ${target.y}`,
      labelX: (source.x + target.x) / 2,
      labelY: (source.y + target.y) / 2,
    }
  }

  const middleX = plan.gutterX ?? (source.x + target.x) / 2
  const middleY = (source.y + target.y) / 2 + (plan.parallelOffset ?? 0)
  if (plan.mode === 'side' && plan.parallelOffset) {
    return {
      path: `M ${source.x} ${source.y} L ${middleX} ${source.y} L ${middleX} ${middleY} L ${target.x} ${middleY} L ${target.x} ${target.y}`,
      labelX: middleX,
      labelY: middleY,
    }
  }
  return {
    path: `M ${source.x} ${source.y} L ${middleX} ${source.y} L ${middleX} ${target.y} L ${target.x} ${target.y}`,
    labelX: middleX,
    labelY: (source.y + target.y) / 2,
  }
}

export function nodeMetadata(entity: HomelabEntity): NodeMetadata[] {
  if (entity.entityKind === 'application')
    return entity.domains?.length
      ? [{ label: 'Domains', value: entity.domains.join(', ') }]
      : []

  if (
    entity.entityKind === 'networkDevice' ||
    entity.entityKind === 'hardware' ||
    entity.entityKind === 'virtualMachine'
  ) {
    return [
      ...(entity.hostname
        ? [{ label: 'Hostname' as const, value: entity.hostname }]
        : []),
      ...(entity.addresses?.length
        ? [
            {
              label: 'IP' as const,
              value: entity.addresses
                .map(({ address }) => address ?? '<unset>')
                .join(', '),
            },
          ]
        : []),
    ]
  }

  return []
}

function groupHighlightFor(
  entity: HomelabEntity,
  entities: HomelabModel['entities'],
): GroupHighlight | undefined {
  const visited = new Set<string>()
  let current: HomelabEntity | undefined = entity

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.entityKind === 'group')
      return {
        id: current.id,
        name: current.name,
        color: groupColor(current.id),
      }

    if (
      current.entityKind === 'hardware' ||
      current.entityKind === 'networkDevice'
    ) {
      const group = current.group ? entities[current.group] : undefined
      return group?.entityKind === 'group'
        ? { id: group.id, name: group.name, color: groupColor(group.id) }
        : undefined
    }

    current = entities[current.runsOn]
  }

  return undefined
}

function isEntityLocationMembership(
  relationship: RelationshipEdge,
  entities: HomelabModel['entities'],
) {
  return (
    relationship.type === 'contains' &&
    entities[relationship.source]?.entityKind !== 'group' &&
    entities[relationship.target]?.entityKind === 'group'
  )
}

export function buildUnifiedGraph(
  model: HomelabModel,
  selectedId?: string,
): UnifiedGraph {
  const selected =
    selectedId && model.entities[selectedId] ? selectedId : undefined
  const selectedEntity = selected ? model.entities[selected] : undefined
  const activeGroup =
    selectedEntity?.entityKind === 'group'
      ? {
          id: selectedEntity.id,
          name: selectedEntity.name,
          color: groupColor(selectedEntity.id),
        }
      : undefined
  const relationships = model.relationships.filter(
    (relationship) =>
      graphRelationshipTypes.has(relationship.type) &&
      (relationship.type !== 'physical-connection' ||
        (selected !== undefined &&
          (relationship.source === selected ||
            relationship.target === selected))) &&
      (!isEntityLocationMembership(relationship, model.entities) ||
        selected !== undefined),
  )
  const connectedIds = new Set<string>(selected ? [selected] : [])
  const highlightedRelationships = new Set<RelationshipEdge>()

  if (selected) {
    for (const relationship of relationships) {
      if (
        (relationship.type !== 'physical-connection' &&
          relationship.type !== 'contains') ||
        (relationship.source !== selected && relationship.target !== selected)
      )
        continue
      highlightedRelationships.add(relationship)
      connectedIds.add(relationship.source)
      connectedIds.add(relationship.target)
    }

    const pending = [selected]
    while (pending.length > 0) {
      const current = pending.pop()!
      for (const relationship of relationships) {
        if (
          relationship.direction !== 'directed' ||
          relationship.source !== current
        )
          continue
        highlightedRelationships.add(relationship)
        if (!connectedIds.has(relationship.target)) {
          connectedIds.add(relationship.target)
          pending.push(relationship.target)
        }
      }
    }
  }

  return {
    nodes: Object.values(model.entities).map((entity) => {
      const groupHighlight = groupHighlightFor(entity, model.entities)
      return {
        id: entity.id,
        entity,
        band: bandFor(entity.entityKind),
        metadata: nodeMetadata(entity),
        dimmed: selected !== undefined && !connectedIds.has(entity.id),
        ...(groupHighlight && { groupHighlight }),
      }
    }),
    edges: relationships.map((relationship, index) => ({
      ...relationship,
      id: `${relationship.source}:${relationship.target}:${relationship.type}:${index}`,
      dimmed:
        selected !== undefined && !highlightedRelationships.has(relationship),
      showLabel: highlightedRelationships.has(relationship),
      ...(activeGroup &&
        relationship.type === 'contains' &&
        relationship.target === activeGroup.id && {
          groupColor: activeGroup.color,
        }),
    })),
  }
}
