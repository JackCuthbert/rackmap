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
const baseNodeHeight = 100

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

  return (
    <>
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
      {groupHighlight && (
        <span
          className="group-badge"
          style={{ color: groupHighlight.color }}
          title={`Group: ${groupHighlight.name}`}
        >
          {groupHighlight.name}
        </span>
      )}
    </>
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

function VlanLabel({ entity }: { entity: HomelabEntity }) {
  if (
    entity.entityKind !== 'hardware' &&
    entity.entityKind !== 'virtualMachine'
  )
    return null
  const vlans = [
    ...new Set(
      entity.addresses?.flatMap(({ vlanId }) => (vlanId ? [vlanId] : [])),
    ),
  ]
  if (!vlans.length) return null

  return (
    <>
      {vlans.map((vlanId) => (
        <span
          className="vlan-label"
          key={vlanId}
          style={{ color: vlanColor(vlanId), borderColor: vlanColor(vlanId) }}
        >
          VLAN {vlanId}
        </span>
      ))}
    </>
  )
}

function NodeMetadataRows({ metadata }: { metadata: NodeMetadata[] }) {
  if (!metadata.length) return null

  return (
    <div className="node-metadata">
      {metadata.map(({ label, value }) => (
        <span key={label} title={`${label}: ${value}`}>
          <small>{label}</small>
          <code>{value}</code>
        </span>
      ))}
    </div>
  )
}

function cardHeight(entity: HomelabEntity, metadata: NodeMetadata[]) {
  const hasVlan =
    (entity.entityKind === 'hardware' ||
      entity.entityKind === 'virtualMachine') &&
    entity.addresses?.some((address) => address.vlanId !== undefined)
  return baseNodeHeight + metadata.length * 18 + (hasVlan ? 18 : 0)
}

function facts(entity: HomelabEntity) {
  return Object.entries(entity).filter(
    ([key, value]) =>
      value !== undefined &&
      key !== 'addresses' &&
      key !== 'specs' &&
      ![
        'id',
        'name',
        'entityKind',
        'description',
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

function AddressList({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return <dd>{factValue(value)}</dd>

  return (
    <div className="address-list">
      {value.map((item, index) => {
        const address = isRecord(item) ? item : {}
        return (
          <div className="address-card" key={index}>
            <strong>Address {index + 1}</strong>
            <div className="address-card-row">
              <span>IP address</span>
              <code>{String(address['address'] ?? 'Unassigned')}</code>
            </div>
            <div className="address-card-row">
              <span>Network device</span>
              <code>{String(address['networkDevice'] ?? 'Not specified')}</code>
            </div>
            <div className="address-card-row">
              <span>VLAN</span>
              <code>{String(address['vlanId'] ?? 'Untagged')}</code>
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

function SpecList({ value }: { value: unknown }) {
  if (!isRecord(value)) return <dd>{factValue(value)}</dd>

  return (
    <div className="spec-list">
      {Object.entries(value).map(([key, item]) => (
        <div className="spec-row" key={key}>
          <span>{key}</span>
          <code>{String(item)}</code>
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
  const [model, setModel] = useState<HomelabModel>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [layoutError, setLayoutError] = useState('')
  const [yaml, setYaml] = useState(exampleYaml)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceOpen, setSourceOpen] = useState(false)
  const [query, setQuery] = useState('')
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
      renderYaml(source, url.toString())
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
        for (const { id, entity, metadata } of baseGraph.nodes) {
          const position = positions.get(id)
          nextNodes.push({
            id,
            type: 'entity',
            ariaLabel: `${entity.name}, ${entityType(entity)}`,
            data: {
              label: (
                <div className="entity-label">
                  <span className="entity-type">{entityType(entity)}</span>
                  <strong title={entity.name}>{entity.name}</strong>
                  <VlanLabel entity={entity} />
                  <NodeMetadataRows metadata={metadata} />
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
    <main className="app">
      <header className="app-header">
        <button
          className="quiet-button"
          onClick={() => setSourceOpen((open) => !open)}
          aria-expanded={sourceOpen}
          aria-controls="yaml-source"
        >
          {sourceOpen ? 'Hide source' : 'Source'}
        </button>
        <div className="site-heading">
          <span className="eyebrow">Rackmap</span>
          <h1>{model?.site.name ?? 'Rackmap'}</h1>
        </div>
        <div className="search-container">
          <input
            type="search"
            aria-label="Search entities"
            aria-controls={query ? 'search-results' : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
              if (event.key === 'Enter' && matches[0])
                selectEntity(matches[0].id)
            }}
            placeholder="Search names, IDs, tags…"
          />
          {query && (
            <section
              id="search-results"
              className="search-results"
              aria-label="Search results"
            >
              <p className="eyebrow">{matches.length} matching entities</p>
              {matches.map((entity) => (
                <button key={entity.id} onClick={() => selectEntity(entity.id)}>
                  <span>
                    {entity.name}
                    <small>{entity.id}</small>
                  </span>
                  <span className="entity-type">{entityType(entity)}</span>
                </button>
              ))}
              {!matches.length && (
                <p className="muted">Try another name, ID, or tag.</p>
              )}
            </section>
          )}
        </div>
        <div className="toolbar-actions">
          {selected && (
            <button onClick={() => setSelectedId(undefined)}>
              Clear selection
            </button>
          )}
          <button
            onClick={() => setLayoutRevision((value) => value + 1)}
            disabled={!model}
          >
            Auto-layout
          </button>
          <button
            onClick={() => void flow?.fitView({ padding: 0.08 })}
            disabled={!model}
          >
            Fit map
          </button>
        </div>
      </header>
      {(error || layoutError) && (
        <div className="diagnostics" role="alert">
          <strong>
            {model
              ? 'Map retained · configuration needs attention'
              : 'Unable to display configuration'}
          </strong>
          <p>{error || layoutError}</p>
        </div>
      )}
      <div
        className={`content${sourceOpen ? ' source-open' : ''}${selected ? ' inspector-open' : ''}`}
      >
        {sourceOpen && (
          <aside
            id="yaml-source"
            className="source-drawer"
            aria-label="YAML source"
          >
            <div className="source-panel-heading">
              <div>
                <span className="eyebrow">Configuration source</span>
                <h2>Paste a combined YAML file</h2>
              </div>
              <button
                className="drawer-close"
                onClick={() => setSourceOpen(false)}
                aria-label="Close source editor"
              >
                ×
              </button>
            </div>
            <div className="url-loader">
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void loadUrl()
                }}
                placeholder="https://example.com/homelab.yaml"
                aria-label="YAML URL"
              />
              <button
                onClick={() => void loadUrl()}
                disabled={loading || !sourceUrl}
              >
                Load URL
              </button>
              <span className="muted">
                Single file · URL host must allow CORS
              </span>
            </div>
            <textarea
              value={yaml}
              onChange={(event) => setYaml(event.target.value)}
              spellCheck={false}
              aria-label="Rackmap YAML"
            />
            <button
              className="render-source"
              onClick={() => renderYaml(yaml, 'pasted.yaml')}
              disabled={loading}
            >
              {loading ? 'Rendering…' : 'Render map'}
            </button>
          </aside>
        )}
        <section className="canvas" aria-label="Unified infrastructure map">
          <div className="map-frame">
            <div className="topology-summary">
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
              <Background color="#313940" gap={24} size={1} />
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
          <aside className="details" aria-label="Entity details">
            <div className="panel-heading">
              <h2>Inspector</h2>
              <span className="eyebrow">{entityType(selected)}</span>
              <button
                className="inspector-close"
                onClick={() => setSelectedId(undefined)}
                aria-label="Close inspector"
              >
                ×
              </button>
            </div>
            <>
              <section className="detail-section entity-heading">
                <h3>{selected.name}</h3>
                <code>{selected.id}</code>
                {selected.description && <p>{selected.description}</p>}
                {!!selected.tags?.length && (
                  <div className="tags">
                    {selected.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
                <button
                  className="focus-button"
                  onClick={() => selectEntity(selected.id)}
                >
                  Focus entity
                </button>
              </section>
              <section className="detail-section">
                <h4>Properties</h4>
                <dl>
                  {facts(selected).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{factValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              {!!addresses(selected)?.length && (
                <section className="detail-section">
                  <h4>Addresses</h4>
                  <AddressList value={addresses(selected)} />
                </section>
              )}
              {!!specs(selected) && (
                <section className="detail-section">
                  <h4>Specifications</h4>
                  <SpecList value={specs(selected)} />
                </section>
              )}
              {!!links.length && (
                <section className="detail-section">
                  <h4>Links & endpoints</h4>
                  {links.map((link, index) => (
                    <a
                      className="external-link"
                      key={`${link.url}:${index}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                      <span aria-hidden="true">↗</span>
                    </a>
                  ))}
                </section>
              )}
              {selected.notes && (
                <section className="detail-section">
                  <h4>Notes</h4>
                  <p className="notes">{selected.notes}</p>
                </section>
              )}
              <section className="detail-section">
                <h4>
                  Relationships <span className="count">{related.length}</span>
                </h4>
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
                        <div className="relationship-group" key={group}>
                          <h5>{group}</h5>
                          {relationships.map((edge, index) => {
                            const id =
                              edge.source === selected.id
                                ? edge.target
                                : edge.source
                            return (
                              <button
                                key={`${id}:${edge.type}:${index}`}
                                onClick={() => selectEntity(id)}
                              >
                                <span>
                                  {model?.entities[id]?.name ?? id}
                                  <small>{id}</small>
                                </span>
                                <span className="relationship-type">
                                  {relationshipLabel(edge)}
                                </span>
                              </button>
                            )
                          })}
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
      <div className="app-status" role="status">
        <span className={`status-dot${error ? ' has-error' : ''}`} />
        {loading
          ? 'Loading configuration'
          : error
            ? 'Configuration requires attention'
            : 'Configuration loaded'}
        <span className="status-note">
          Read-only · YAML changes reload automatically
        </span>
      </div>
    </main>
  )
}
