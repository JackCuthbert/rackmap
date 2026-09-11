import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  useUpdateNodeInternals,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import {
  IconCrosshair,
  IconExternalLink,
  IconFileCode,
  IconMoon,
  IconServer,
  IconSparkles,
  IconSun,
} from '@tabler/icons-react'
import '@xyflow/react/dist/style.css'

import type {
  HomelabEntity,
  HomelabModel,
  RelationshipEdge,
} from '../domain/types'
import { exampleYaml } from './example-yaml'
import {
  assignEdgeHandles,
  buildUnifiedGraph,
  edgeRoutePath,
  planEdgeRoute,
  vlanColor,
  type EdgeRoutePlan,
  type NodeHandle,
  type NodeMetadata,
} from './graph'
import { loadYaml } from './load-yaml'
import { layoutPrimaryTopology } from './topology-layout'

const nodeWidth = 216
const baseNodeHeight = 68

function relationshipLabel(
  edge: Pick<RelationshipEdge, 'type' | 'kind' | 'label'>,
) {
  if (edge.kind === 'poe') return 'PoE'
  if (edge.label) return edge.label
  return (
    {
      'runs-on': 'Runs On',
      'connected-to': 'Connected To',
      'network-upstream': 'Upstream',
      contains: 'Contains',
      'physical-connection': edge.kind === 'power' ? 'Power' : 'USB',
      'depends-on': 'Depends On',
    } satisfies Record<RelationshipEdge['type'], string>
  )[edge.type]
}

function BandNode({ data }: NodeProps) {
  return <div className="band-label">{String(data['label'])}</div>
}

const handlePositions = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
} as const

function EntityNode({ data }: NodeProps) {
  const handles = (data['handles'] as NodeHandle[] | undefined) ?? []
  const groupHighlight = data['groupHighlight'] as
    | { name: string; color: string }
    | undefined
  const planned = data['planned'] === true

  return (
    <div className="vlan-labels">
      {handles.map((handle) => {
        const sameSide = handles
          .filter(
            (candidate) =>
              candidate.side === handle.side && candidate.type === handle.type,
          )
          .toSorted((left, right) => left.offset - right.offset)
        const offset = `${((handle.offset + 1) / (sameSide.length + 1)) * 100}%`
        const style =
          handle.side === 'top' || handle.side === 'bottom'
            ? { left: offset }
            : { top: offset }

        return (
          <Handle
            id={handle.id}
            key={handle.id}
            type={handle.type}
            position={handlePositions[handle.side]}
            style={style}
          />
        )
      })}
      {data['label'] as ReactNode}
      {(groupHighlight || planned) && (
        <span className="node-badges">
          {groupHighlight && (
            <span
              className="group-badge"
              style={{ color: groupHighlight.color }}
              title={`Group: ${groupHighlight.name}`}
            >
              {groupHighlight.name}
            </span>
          )}
          {planned && (
            <span className="planned-badge" title="Planned addition">
              Planned
            </span>
          )}
        </span>
      )}
    </div>
  )
}

type RoutedEdgeData = { plan: EdgeRoutePlan }

function RoutedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  style,
  data,
}: EdgeProps) {
  const route = edgeRoutePath(
    (data as RoutedEdgeData).plan,
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  )

  return (
    <>
      <BaseEdge id={id} path={route.path} {...(style && { style })} />
      {typeof label === 'string' && (
        <EdgeLabelRenderer>
          <div
            className="routed-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${route.labelX}px, ${route.labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { band: BandNode, entity: EntityNode }
const edgeTypes = { routed: RoutedEdge }

function HandleUpdater({ nodeIds }: { nodeIds: readonly string[] }) {
  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => {
    for (const nodeId of nodeIds) updateNodeInternals(nodeId)
  }, [nodeIds, updateNodeInternals])

  return null
}

function entityType(entity: HomelabEntity) {
  return 'kind' in entity ? entity.kind : entity.entityKind
}

function nodeAddresses(entity: HomelabEntity) {
  return 'addresses' in entity
    ? (entity.addresses ?? []).filter(
        ({ address, vlanId }) => address || vlanId,
      )
    : []
}

function NodeMetadataRows({
  entity,
  metadata,
}: {
  entity: HomelabEntity
  metadata: NodeMetadata[]
}) {
  if (!metadata.length) return null

  return (
    <div className="node-metadata">
      {metadata.map(({ label, value }) => {
        if (label !== 'IP')
          return (
            <span key={label} title={`${label}: ${value}`}>
              {value.split('\n').map((line, index) => (
                <span className="node-metadata-line" key={`${line}:${index}`}>
                  {line}
                </span>
              ))}
            </span>
          )

        const nodeAddressEntries = nodeAddresses(entity)
        const visibleAddresses = nodeAddressEntries.slice(0, 3)
        const remaining = nodeAddressEntries.length - visibleAddresses.length
        return (
          <div
            className="node-addresses"
            key={label}
            title={`${label}: ${value}`}
          >
            {visibleAddresses.map(({ address, vlanId }) => (
              <div className="node-address" key={`${address}:${vlanId}`}>
                {vlanId && (
                  <span
                    className="vlan-label"
                    style={{
                      color: vlanColor(vlanId),
                      borderColor: vlanColor(vlanId),
                    }}
                  >
                    VLAN {vlanId}
                  </span>
                )}
                {address && (
                  <span className="node-metadata-line">{address}</span>
                )}
              </div>
            ))}
            {remaining > 0 && (
              <span className="node-address-overflow">+{remaining}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function cardHeight(entity: HomelabEntity, metadata: NodeMetadata[]) {
  const addressCount = nodeAddresses(entity).length
  return (
    baseNodeHeight +
    metadata.reduce(
      (height, { label, value }) =>
        height +
        (label === 'IP'
          ? Math.min(addressCount, 3) + (addressCount > 3 ? 1 : 0)
          : value.split('\n').length) *
          16 +
        (label === 'IP' && addressCount > 3 ? 4 : 0),
      0,
    )
  )
}

function facts(entity: HomelabEntity) {
  return Object.entries(entity).filter(
    ([key, value]) =>
      value !== undefined &&
      key !== 'addresses' &&
      key !== 'application' &&
      key !== 'resources' &&
      key !== 'specs' &&
      ![
        'id',
        'name',
        'entityKind',
        'description',
        'connections',
        'dependsOn',
        'group',
        'parent',
        'runsOn',
        'upstream',
        'tags',
        'notes',
        'links',
        'endpoints',
      ].includes(key),
  )
}

function factValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(factValue).join(', ')
  if (value !== null && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${factValue(item)}`)
      .join(' · ')
  }
  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function AddressList({
  entity,
  value,
}: {
  entity: HomelabEntity
  value: unknown
}) {
  if (!Array.isArray(value)) return <span>{factValue(value)}</span>

  return (
    <div className="d-grid gap-1">
      {value.map((item, index) => {
        const address = isRecord(item) ? item : {}
        const fields: readonly (readonly [string, unknown])[] = [
          ['IP address', address['address'] ?? 'Unassigned'],
          ...(entity.entityKind === 'virtualMachine'
            ? []
            : ([
                ['Network device', address['networkDevice'] ?? 'Not specified'],
              ] as const)),
          ['VLAN', address['vlanId'] ?? 'Untagged'],
        ]
        return (
          <div className="card card-sm" key={index}>
            <div className="card-body p-2">
              <div className="row g-1 small">
                {fields.map(([label, itemValue]) => (
                  <div className="col-12" key={label}>
                    <div className="d-flex align-items-baseline justify-content-between gap-2">
                      <span className="text-secondary">{label}</span>
                      {label === 'VLAN' &&
                      typeof address['vlanId'] === 'number' ? (
                        <span
                          className="vlan-label"
                          style={{
                            color: vlanColor(address['vlanId']),
                            borderColor: vlanColor(address['vlanId']),
                          }}
                        >
                          VLAN {address['vlanId']}
                        </span>
                      ) : (
                        <code className="font-monospace text-end">
                          {factValue(itemValue)}
                        </code>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function addresses(entity: HomelabEntity) {
  return 'addresses' in entity ? entity.addresses : undefined
}

function specs(entity: HomelabEntity) {
  return 'specs' in entity ? entity.specs : undefined
}

function resources(entity: HomelabEntity) {
  return 'resources' in entity ? entity.resources : undefined
}

function SpecList({ value }: { value: unknown }) {
  if (!isRecord(value)) return <span>{factValue(value)}</span>

  return (
    <div className="datagrid">
      {Object.entries(value).map(([key, item]) => (
        <div className="datagrid-item" key={key}>
          <div className="datagrid-title">{key}</div>
          <div className="datagrid-content">
            <code className="font-monospace">{factValue(item)}</code>
          </div>
        </div>
      ))}
    </div>
  )
}

function diagnosticText(
  diagnostics: { file: string; line?: number; path: string; message: string }[],
) {
  return diagnostics
    .map((item) =>
      [
        `${item.file}${item.line ? `:${item.line}` : ''}`,
        item.path,
        item.message,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join('\n')
}

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  )
  const [model, setModel] = useState<HomelabModel>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [layoutError, setLayoutError] = useState('')
  const [yaml, setYaml] = useState(exampleYaml)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceOpen, setSourceOpen] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateTheme = () => setTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', updateTheme)
    return () => media.removeEventListener('change', updateTheme)
  }, [])

  useEffect(() => {
    document.documentElement.dataset['bsTheme'] = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    if (!sourceOpen) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSourceOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [sourceOpen])
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [selectedId, setSelectedId] = useState<string>()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [layoutReady, setLayoutReady] = useState(0)

  const renderYaml = useCallback((source: string, file: string) => {
    setLoading(true)
    const result = loadYaml(source, file)
    if (result.ok) {
      setModel(result.model)
      setSelectedId((id) => (id && result.model?.entities[id] ? id : undefined))
      setError('')
    } else {
      setError(diagnosticText(result.diagnostics))
    }
    setLoading(false)
    return result.ok
  }, [])

  useEffect(() => {
    renderYaml(exampleYaml, 'example.yaml')
  }, [renderYaml])

  const loadUrl = useCallback(async () => {
    setLoading(true)
    try {
      const url = new URL(sourceUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new Error('Enter an HTTP(S) URL.')
      const response = await fetch(url)
      if (!response.ok)
        throw new Error(
          `Could not load YAML: ${response.status} ${response.statusText}.`,
        )
      const source = await response.text()
      setYaml(source)
      if (renderYaml(source, url.toString())) setSourceOpen(false)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? `${reason.message} The remote host must permit browser access with CORS.`
          : 'Could not load YAML from that URL.',
      )
      setLoading(false)
    }
  }, [renderYaml, sourceUrl])

  const entities = useMemo(() => Object.values(model?.entities ?? {}), [model])
  const graph = useMemo(
    () => (model ? buildUnifiedGraph(model, selectedId) : undefined),
    [model, selectedId],
  )
  const matches = entities.filter((entity) =>
    `${entity.id} ${entity.name} ${(entity.tags ?? []).join(' ')}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const selected = selectedId ? model?.entities[selectedId] : undefined
  const routed = useMemo(() => {
    const graphNodes = new Map(graph?.nodes.map((node) => [node.id, node]))
    const entityNodes = nodes.filter((node) => node.type !== 'band')
    const minX = Math.min(0, ...entityNodes.map((node) => node.position.x))
    const maxX = Math.max(
      nodeWidth,
      ...entityNodes.map((node) => node.position.x + nodeWidth),
    )
    const gutterOffsets = { left: 0, right: 0 }
    const sameBandCounts = new Map<string, number>()
    const sameBandIndexes = new Map<string, number>()
    for (const edge of graph?.edges ?? []) {
      const source = graphNodes.get(edge.source)
      const target = graphNodes.get(edge.target)
      if (source?.band !== target?.band) continue
      const key = [edge.source, edge.target].sort().join('\0')
      sameBandCounts.set(key, (sameBandCounts.get(key) ?? 0) + 1)
    }

    const plannedEdges = (graph?.edges ?? []).flatMap((edge) => {
      const source = graphNodes.get(edge.source)
      const target = graphNodes.get(edge.target)
      const sourceNode = entityNodes.find((node) => node.id === edge.source)
      const targetNode = entityNodes.find((node) => node.id === edge.target)
      if (!source || !target || !sourceNode || !targetNode) return []

      const sourceX = sourceNode.position.x + nodeWidth / 2
      const targetX = targetNode.position.x + nodeWidth / 2
      const sourceY = sourceNode.position.y
      const targetY = targetNode.position.y
      const sameBand = source.band === target.band
      const sameBandVertical = edge.type === 'network-upstream'
      const isLocationMembership =
        edge.type === 'contains' &&
        source.entity.entityKind !== 'group' &&
        target.entity.entityKind === 'group'
      const pairKey = [edge.source, edge.target].sort().join('\0')
      const pairIndex = sameBandIndexes.get(pairKey) ?? 0
      sameBandIndexes.set(pairKey, pairIndex + 1)
      const pairCount = sameBandCounts.get(pairKey) ?? 1
      const sameBandOffset = (pairIndex - (pairCount - 1) / 2) * 18
      let plan = isLocationMembership
        ? {
            mode: 'vertical' as const,
            sourceHandle: 'top' as const,
            targetHandle: 'bottom' as const,
          }
        : planEdgeRoute({
            sourceBand: source.band,
            targetBand: target.band,
            sourceX,
            targetX,
            sourceY,
            targetY,
            minX,
            maxX,
            ...(sameBand && { parallelOffset: sameBandOffset }),
            ...(sameBandVertical && { sameBandVertical }),
          })
      if (plan.mode === 'gutter') {
        const gutterSide = plan.sourceHandle === 'left' ? 'left' : 'right'
        const parallelOffset = gutterOffsets[gutterSide]
        gutterOffsets[gutterSide] += 18
        plan = planEdgeRoute({
          sourceBand: source.band,
          targetBand: target.band,
          sourceX,
          targetX,
          sourceY,
          targetY,
          minX,
          maxX,
          parallelOffset,
        })
      }

      return [{ edge, plan, sourceX, targetX, isLocationMembership, target }]
    })
    const handles = assignEdgeHandles(
      plannedEdges.map(({ edge, plan, sourceX, targetX }) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceSide: plan.sourceHandle,
        targetSide: plan.targetHandle,
        sourceOrder: targetX,
        targetOrder: sourceX,
      })),
    )
    const edges = plannedEdges.map(
      ({ edge, plan, isLocationMembership, target }) => {
        const assignment = handles.byEdge.get(edge.id)!
        const rendered: Edge = {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: assignment.sourceHandle,
          targetHandle: assignment.targetHandle,
          type: 'routed',
          data: { plan },
          label: edge.showLabel ? relationshipLabel(edge) : undefined,
          className: `${edge.dimmed ? 'dimmed ' : ''}${
            isLocationMembership
              ? 'location-membership'
              : selectedId
                ? 'highlighted'
                : ''
          }`,
        }
        if (isLocationMembership) {
          rendered.style = {
            stroke:
              edge.groupColor ?? target.groupHighlight?.color ?? '#91a4b2',
            strokeDasharray: '5 5',
            strokeWidth: 2,
          }
        } else if (edge.type === 'physical-connection') {
          rendered.style =
            edge.kind === 'power' || edge.kind === 'poe'
              ? { stroke: '#d6ad63', strokeDasharray: '8 3', strokeWidth: 2 }
              : { stroke: '#71818e', strokeDasharray: '3 4' }
        } else {
          if (edge.groupColor)
            rendered.style = { stroke: edge.groupColor, strokeWidth: 3 }
        }
        return rendered
      },
    )
    return { edges, handles }
  }, [graph, nodes, selectedId])
  const displayedNodes = useMemo(() => {
    const byId = new Map(graph?.nodes.map((node) => [node.id, node]))
    return nodes.map((node) =>
      node.type === 'band'
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              handles: routed.handles.byNode.get(node.id) ?? [],
              groupHighlight: byId.get(node.id)?.groupHighlight,
              planned: byId.get(node.id)?.planned,
            },
            selected: node.id === selectedId,
            className: `entity-node entity-${byId.get(node.id)?.band.toLowerCase()}${
              byId.get(node.id)?.dimmed ? ' dimmed' : ''
            }`,
          },
    )
  }, [graph, nodes, routed.handles, selectedId])
  const edges = routed.edges
  const routedNodeIds = useMemo(
    () => [...routed.handles.byNode.keys()],
    [routed.handles],
  )

  useEffect(() => {
    if (!model) return undefined
    let cancelled = false
    const baseGraph = buildUnifiedGraph(model)
    setLayoutError('')
    try {
      const layout = layoutPrimaryTopology(baseGraph, {
        nodeWidth,
        cardHeight: (node) => cardHeight(node.entity, node.metadata),
      })
      if (!cancelled) {
        const positions = new Map(layout.nodes.map((node) => [node.id, node]))
        const nextNodes: Node[] = []
        for (const frame of layout.frames) {
          nextNodes.push({
            id: frame.id,
            type: 'band',
            data: {
              label: `${frame.band} / ${
                baseGraph.nodes.filter((node) => node.band === frame.band)
                  .length
              }`,
            },
            position: { x: frame.x, y: frame.y },
            style: {
              width: frame.width,
              height: frame.height,
            },
            className: `layer-band band-${frame.band.toLowerCase()}`,
            draggable: false,
            selectable: false,
            focusable: false,
            connectable: false,
            zIndex: -1,
          })
        }
        for (const { id, entity, metadata, planned } of baseGraph.nodes) {
          const position = positions.get(id)
          nextNodes.push({
            id,
            type: 'entity',
            ariaLabel: `${entity.name}, ${entityType(entity)}`,
            data: {
              planned,
              label: (
                <div className="entity-label">
                  <span className="entity-type d-inline-flex align-items-center gap-1">
                    {'derivedFrom' in entity && entity.derivedFrom && (
                      <IconSparkles
                        size={11}
                        stroke={1.75}
                        aria-hidden="true"
                      />
                    )}
                    {entityType(entity)}
                  </span>
                  <strong title={entity.name}>{entity.name}</strong>
                  <NodeMetadataRows entity={entity} metadata={metadata} />
                </div>
              ),
            },
            position: { x: position?.x ?? 0, y: position?.y ?? 0 },
            style: { width: nodeWidth, height: cardHeight(entity, metadata) },
          })
        }
        setNodes(nextNodes)
        setLayoutReady((value) => value + 1)
      }
    } catch {
      if (!cancelled)
        setLayoutError('Could not arrange the map. Try Auto-layout again.')
    }
    return () => {
      cancelled = true
    }
  }, [model, layoutRevision, setNodes])

  useEffect(() => {
    if (!layoutReady || !flow) return undefined
    const frame = requestAnimationFrame(
      () => void flow.fitView({ padding: 0.08 }),
    )
    return () => cancelAnimationFrame(frame)
  }, [flow, layoutReady])

  const selectEntity = (id: string) => {
    setSelectedId(id)
    setQuery('')
    void flow?.fitView({ nodes: [{ id }], padding: 0.8, maxZoom: 1 })
  }
  const related =
    model?.relationships.filter(
      (edge) => edge.source === selectedId || edge.target === selectedId,
    ) ?? []
  const links = selected
    ? [
        ...(selected.links ?? []),
        ...('endpoints' in selected ? (selected.endpoints ?? []) : []),
      ]
    : []

  return (
    <main className="d-flex flex-column vh-100" data-bs-theme={theme}>
      <header className="navbar">
        <div className="container-fluid d-flex align-items-center gap-3 px-3">
          <div className="navbar-brand">
            <span className="avatar avatar-sm bg-primary-lt" aria-hidden="true">
              <IconServer size={16} stroke={1.75} />
            </span>
            <span>Rackmap</span>
          </div>
          <div
            className="position-relative ms-auto"
            style={{ width: 'min(360px, 34vw)' }}
          >
            <input
              className="form-control form-control-sm"
              type="search"
              aria-label="Search entities"
              aria-controls={
                query && searchFocused ? 'search-results' : undefined
              }
              aria-expanded={Boolean(query && searchFocused)}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('')
                if (event.key === 'Enter' && matches[0])
                  selectEntity(matches[0].id)
              }}
              placeholder="Search names, IDs, tags…"
            />
            {query && searchFocused && (
              <section
                id="search-results"
                className="dropdown-menu dropdown-menu-card show mt-2 w-100 d-flex flex-column"
                aria-label="Search results"
                style={{ maxHeight: 'calc(100dvh - 4rem)' }}
              >
                <div className="dropdown-header">
                  {matches.length} matching entities
                </div>
                {matches.length ? (
                  <div className="list-group list-group-flush overflow-auto">
                    {matches.map((entity) => (
                      <button
                        className="list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-3"
                        key={entity.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectEntity(entity.id)}
                      >
                        <span className="text-truncate">
                          <span className="d-block text-body">
                            {entity.name}
                          </span>
                          <span className="d-block text-secondary font-monospace small text-truncate">
                            {entity.id}
                          </span>
                        </span>
                        <span className="badge bg-secondary-lt text-secondary">
                          {entityType(entity)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty py-4">
                    <div className="empty-title">No matching entities</div>
                    <p className="empty-subtitle text-secondary">
                      Try another name, ID, or tag.
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              className="btn btn-sm btn-icon"
              onClick={() =>
                setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
              }
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <IconSun size={16} stroke={1.75} />
              ) : (
                <IconMoon size={16} stroke={1.75} />
              )}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setSourceOpen(true)}
              aria-expanded={sourceOpen}
              aria-controls="yaml-source"
            >
              <IconFileCode size={16} stroke={1.75} aria-hidden="true" /> Edit
              YAML
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setLayoutRevision((value) => value + 1)}
              disabled={!model}
            >
              Auto-layout
            </button>
            <button
              className="btn btn-sm"
              onClick={() => void flow?.fitView({ padding: 0.08 })}
              disabled={!model}
            >
              Fit map
            </button>
          </div>
        </div>
      </header>
      {(error || layoutError) && (
        <div className="alert alert-warning rounded-0 mb-0" role="alert">
          <strong>
            {model
              ? 'Map retained · configuration needs attention'
              : 'Unable to display configuration'}
          </strong>
          <p>{error || layoutError}</p>
        </div>
      )}
      <div className="graph-shell d-flex flex-fill position-relative overflow-hidden">
        {sourceOpen && (
          <>
            <div
              className="modal modal-blur fade show"
              role="dialog"
              aria-modal="true"
              aria-labelledby="yaml-source-title"
              style={{ display: 'block' }}
              onClick={() => setSourceOpen(false)}
            >
              <div
                className="modal-dialog modal-lg my-3"
                style={{ height: 'calc(100dvh - 2rem)' }}
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  id="yaml-source"
                  className="modal-content h-100"
                  aria-label="YAML source"
                >
                  <form
                    className="d-flex flex-column h-100"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (renderYaml(yaml, 'pasted.yaml')) setSourceOpen(false)
                    }}
                  >
                    <div className="modal-header">
                      <h2 className="modal-title" id="yaml-source-title">
                        Edit YAML
                      </h2>
                      <button
                        className="btn-close"
                        type="button"
                        onClick={() => setSourceOpen(false)}
                        aria-label="Close source editor"
                      />
                    </div>
                    <div className="modal-body d-flex flex-column flex-fill overflow-hidden">
                      <div className="mb-3">
                        <label className="form-label" htmlFor="yaml-url">
                          YAML URL
                        </label>
                        <div className="input-group mb-2">
                          <input
                            className="form-control"
                            id="yaml-url"
                            type="url"
                            value={sourceUrl}
                            onChange={(event) =>
                              setSourceUrl(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void loadUrl()
                            }}
                            placeholder="https://example.com/homelab.yaml"
                          />
                          <button
                            className="btn"
                            type="button"
                            onClick={() => void loadUrl()}
                            disabled={loading || !sourceUrl}
                          >
                            Load URL
                          </button>
                        </div>
                        <div className="form-hint">
                          Single file · URL host must allow CORS
                        </div>
                      </div>
                      <div className="mb-0 d-flex flex-column flex-fill">
                        <label className="form-label" htmlFor="yaml-editor">
                          Configuration
                        </label>
                        <textarea
                          className="form-control flex-fill font-monospace"
                          id="yaml-editor"
                          value={yaml}
                          onChange={(event) => setYaml(event.target.value)}
                          spellCheck={false}
                        />
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button
                        className="btn me-auto"
                        type="button"
                        onClick={() => setSourceOpen(false)}
                      >
                        Close
                      </button>
                      <button
                        className="btn btn-primary"
                        type="submit"
                        disabled={loading}
                      >
                        {loading ? 'Rendering…' : 'Render map'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
            <div
              className="modal-backdrop fade show"
              onClick={() => setSourceOpen(false)}
            />
          </>
        )}
        <section
          className="flex-fill position-relative overflow-hidden"
          aria-label="Unified infrastructure map"
        >
          <div className="position-relative h-100 w-100">
            <div className="position-absolute top-0 start-50 translate-middle-x mt-3 badge bg-secondary-lt text-secondary z-1">
              Topology {entities.length} entities · {graph?.edges.length ?? 0}{' '}
              connections
            </div>
            <ReactFlow
              className="flow"
              nodes={displayedNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={setFlow}
              onNodesChange={(changes) => {
                onNodesChange(changes)
                const selection = changes.find(
                  (change) => change.type === 'select' && change.selected,
                )
                if (selection && 'id' in selection) setSelectedId(selection.id)
              }}
              minZoom={0.1}
              maxZoom={1.5}
              fitView
              deleteKeyCode={null}
              nodesConnectable={false}
              onNodeClick={(_, node) => {
                if (node.type !== 'band') setSelectedId(node.id)
              }}
              onPaneClick={() => setSelectedId(undefined)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSelectedId(undefined)
              }}
            >
              <HandleUpdater nodeIds={routedNodeIds} />
              <Background color="var(--tblr-border-color)" gap={24} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
            {!model && (
              <div className="map-empty">
                {loading
                  ? 'Loading your infrastructure…'
                  : 'Resolve the configuration errors to view your map.'}
              </div>
            )}
          </div>
        </section>
        {selected && (
          <aside
            className="card card-sm position-absolute top-0 bottom-0 end-0 m-3 overflow-auto"
            style={{ width: 360 }}
            aria-label="Entity details"
          >
            <div
              className="card-header sticky-top z-1 d-flex align-items-center gap-2 p-3"
              style={{ backgroundColor: 'var(--tblr-card-bg)' }}
            >
              <button
                className="btn btn-sm btn-icon"
                type="button"
                onClick={() => selectEntity(selected.id)}
                aria-label={`Focus ${selected.name}`}
                title="Focus entity"
              >
                <IconCrosshair size={16} stroke={1.75} />
              </button>
              <h2
                className="card-title text-truncate mb-0"
                title={selected.name}
              >
                {selected.name}
              </h2>
              <button
                className="btn-close ms-auto"
                onClick={() => setSelectedId(undefined)}
                aria-label="Close inspector"
              />
            </div>
            <>
              {(selected.description || selected.tags?.length) && (
                <section className="card-body flex-grow-0 p-3">
                  {selected.description && <p>{selected.description}</p>}
                  {!!selected.tags?.length && (
                    <>
                      <h2 className="h3 mb-2">Tags</h2>
                      <div className="tags">
                        {selected.tags.map((tag) => (
                          <span
                            className="badge bg-secondary-lt text-secondary"
                            key={tag}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}
              <section className="card-body flex-grow-0 p-3">
                <h2 className="h3 mb-2">Properties</h2>
                <div className="datagrid small">
                  <div className="datagrid-item">
                    <div className="datagrid-title">ID</div>
                    <div className="datagrid-content">
                      <code className="font-monospace">{selected.id}</code>
                    </div>
                  </div>
                  {selected.entityKind === 'virtualMachine' && (
                    <div className="datagrid-item">
                      <div className="datagrid-title">Kind</div>
                      <div className="datagrid-content">
                        <code className="font-monospace">
                          {selected.entityKind}
                        </code>
                      </div>
                    </div>
                  )}
                  {facts(selected).map(([key, value]) => (
                    <div className="datagrid-item" key={key}>
                      <div className="datagrid-title">{key}</div>
                      <div className="datagrid-content">
                        <code className="font-monospace">
                          {factValue(value)}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              {!!resources(selected) && (
                <section className="card-body flex-grow-0 p-3">
                  <h2 className="h3 mb-2">Resources</h2>
                  <div className="small">
                    <SpecList value={resources(selected)} />
                  </div>
                </section>
              )}
              {!!addresses(selected)?.length && (
                <section className="card-body flex-grow-0 p-3">
                  <h2 className="h3 mb-3 d-flex align-items-center justify-content-between">
                    <span>Addresses</span>
                    {(addresses(selected)?.length ?? 0) > 1 && (
                      <span className="badge bg-secondary-lt text-secondary">
                        {addresses(selected)?.length}
                      </span>
                    )}
                  </h2>
                  <AddressList entity={selected} value={addresses(selected)} />
                </section>
              )}
              {!!specs(selected) && (
                <section className="card-body flex-grow-0 p-3">
                  <h2 className="h3 mb-2">Specifications</h2>
                  <div className="small">
                    <SpecList value={specs(selected)} />
                  </div>
                </section>
              )}
              {!!links.length && (
                <section className="card-body flex-grow-0 p-3">
                  <h2 className="h3 mb-2 d-flex align-items-center justify-content-between">
                    <span>Links &amp; endpoints</span>
                    <span className="badge bg-secondary-lt text-secondary">
                      {links.length}
                    </span>
                  </h2>
                  <div className="list-group">
                    {links.map((link, index) => (
                      <a
                        className="list-group-item list-group-item-action d-flex align-items-center gap-1 px-2 py-1 small"
                        key={`${link.url}:${index}`}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className="d-block flex-fill text-truncate">
                          {link.label}
                        </span>
                        <IconExternalLink
                          className="text-secondary flex-shrink-0"
                          size={14}
                          stroke={1.75}
                          aria-hidden="true"
                        />
                      </a>
                    ))}
                  </div>
                </section>
              )}
              {selected.notes && (
                <section className="card-body flex-grow-0 p-3">
                  <h4>Notes</h4>
                  <p className="notes">{selected.notes}</p>
                </section>
              )}
              <section className="card-body flex-grow-0 p-3">
                <h2 className="h3 mb-3 d-flex align-items-center justify-content-between">
                  <span>Relationships</span>
                  <span className="badge bg-secondary-lt text-secondary">
                    {related.length}
                  </span>
                </h2>
                {(['Depends on', 'Used by', 'Physical'] as const).map(
                  (group) => {
                    const relationships = related.filter((edge) =>
                      group === 'Physical'
                        ? edge.type === 'physical-connection'
                        : edge.direction === 'directed' &&
                          (group === 'Depends on'
                            ? edge.source === selected.id
                            : edge.target === selected.id),
                    )
                    return (
                      relationships.length > 0 && (
                        <div className="card card-sm small mb-2" key={group}>
                          <div className="card-header px-2 py-1">
                            <small>{group}</small>
                          </div>
                          <div className="list-group list-group-flush">
                            {relationships.map((edge, index) => {
                              const id =
                                edge.source === selected.id
                                  ? edge.target
                                  : edge.source
                              return (
                                <button
                                  className="list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-2 px-2 py-1"
                                  key={`${id}:${edge.type}:${index}`}
                                  onClick={() => selectEntity(id)}
                                >
                                  <span className="text-truncate">
                                    <span className="d-block text-body">
                                      {model?.entities[id]?.name ?? id}
                                    </span>
                                    <span className="d-block small text-secondary font-monospace text-truncate">
                                      {id}
                                    </span>
                                  </span>
                                  <span>
                                    <span className="badge bg-secondary-lt text-secondary">
                                      {relationshipLabel(edge)}
                                    </span>
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    )
                  },
                )}
                {!related.length && (
                  <p className="muted">No relationships declared.</p>
                )}
              </section>
            </>
          </aside>
        )}
      </div>
    </main>
  )
}
