import { bands, type GraphBand, type UnifiedGraph } from './graph'

export type TopologyLayoutDimensions = {
  nodeWidth: number
  cardHeight: (node: UnifiedGraph['nodes'][number]) => number
}

export type LayoutChild = {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export type TopologyBandFrame = {
  id: string
  band: GraphBand
  x: number
  y: number
  width: number
  height: number
}

export type PrimaryTopologyLayout = {
  nodes: LayoutChild[]
  frames: TopologyBandFrame[]
}

const primaryEdgeTypes = new Set([
  'network-upstream',
  'connected-to',
  'runs-on',
])
const workloadColumns = 3

export function primaryTopology(graph: UnifiedGraph): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>()
  const parentByChild = new Set<string>()

  for (const edge of graph.edges) {
    if (!primaryEdgeTypes.has(edge.type) || parentByChild.has(edge.source))
      continue
    parentByChild.add(edge.source)
    childrenByParent.set(edge.target, [
      ...(childrenByParent.get(edge.target) ?? []),
      edge.source,
    ])
  }

  return childrenByParent
}

export function layoutPrimaryTopology(
  graph: UnifiedGraph,
  dimensions: TopologyLayoutDimensions,
): PrimaryTopologyLayout {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const childrenByParent = primaryTopology(graph)
  const primaryChildren = new Set([...childrenByParent.values()].flat())
  const heights = new Map(
    graph.nodes.map((node) => [node.id, dimensions.cardHeight(node)]),
  )
  const widths = new Map<string, number>()

  const measure = (id: string): number => {
    const known = widths.get(id)
    if (known !== undefined) return known
    const children = childrenByParent.get(id) ?? []
    const applications = children.filter(
      (child) => nodeById.get(child)?.band === 'Applications',
    )
    const regularChildren = children.filter(
      (child) => nodeById.get(child)?.band !== 'Applications',
    )
    const regularWidth = regularChildren.reduce(
      (total, child, index) => total + measure(child) + (index > 0 ? 72 : 0),
      0,
    )
    const applicationWidth = applications.length
      ? Math.min(workloadColumns, applications.length) * dimensions.nodeWidth +
        (Math.min(workloadColumns, applications.length) - 1) * 72
      : 0
    const width = Math.max(dimensions.nodeWidth, regularWidth, applicationWidth)
    widths.set(id, width)
    return width
  }

  const mainNodes = graph.nodes.filter((node) => node.band !== 'Locations')
  const roots = mainNodes
    .map((node) => node.id)
    .filter((id) => !primaryChildren.has(id))
  for (const id of roots) measure(id)

  const groups = graph.nodes.filter((node) => node.band === 'Locations')
  const groupHeight = Math.max(
    0,
    ...groups.map((group) => heights.get(group.id) ?? 0),
  )
  const networkHeight = Math.max(
    dimensions.nodeWidth / 2,
    ...graph.nodes
      .filter((node) => node.band === 'Network')
      .map((node) => heights.get(node.id) ?? 0),
  )
  const networkDepth = new Map<string, number>()
  const depthFor = (id: string): number => {
    const known = networkDepth.get(id)
    if (known !== undefined) return known
    const parent = [...childrenByParent.entries()].find(([, children]) =>
      children.includes(id),
    )?.[0]
    const depth =
      parent && nodeById.get(parent)?.band === 'Network'
        ? depthFor(parent) + 1
        : 0
    networkDepth.set(id, depth)
    return depth
  }
  const maxNetworkDepth = Math.max(
    0,
    ...graph.nodes
      .filter((node) => node.band === 'Network')
      .map((node) => depthFor(node.id)),
  )
  const networkTop = groupHeight + 128
  const hardwareTop =
    networkTop + (maxNetworkDepth + 1) * (networkHeight + 64) + 96
  const hardwareHeight = Math.max(
    0,
    ...graph.nodes
      .filter((node) => node.band === 'Hardware')
      .map((node) => heights.get(node.id) ?? 0),
  )
  const virtualisationTop = hardwareTop + hardwareHeight + 96
  const virtualisationHeight = Math.max(
    0,
    ...graph.nodes
      .filter((node) => node.band === 'Virtualisation')
      .map((node) => heights.get(node.id) ?? 0),
  )
  const applicationsTop = virtualisationTop + virtualisationHeight + 96
  const positions = new Map<string, LayoutChild>()

  const yFor = (id: string) => {
    const node = nodeById.get(id)!
    if (node.band === 'Network')
      return networkTop + depthFor(id) * (networkHeight + 64)
    if (node.band === 'Hardware') return hardwareTop
    if (node.band === 'Virtualisation') return virtualisationTop
    return applicationsTop
  }
  const assign = (id: string, left: number) => {
    const width = widths.get(id)!
    const height = heights.get(id)!
    positions.set(id, {
      id,
      x: left + (width - dimensions.nodeWidth) / 2,
      y: yFor(id),
      width: dimensions.nodeWidth,
      height,
    })
    const children = childrenByParent.get(id) ?? []
    const applications = children.filter(
      (child) => nodeById.get(child)?.band === 'Applications',
    )
    const regularChildren = children.filter(
      (child) => nodeById.get(child)?.band !== 'Applications',
    )
    const regularWidth = regularChildren.reduce(
      (total, child, index) =>
        total +
        (widths.get(child) ?? dimensions.nodeWidth) +
        (index > 0 ? 72 : 0),
      0,
    )
    let childLeft =
      left +
      (width -
        Math.max(
          regularWidth,
          applications.length
            ? Math.min(workloadColumns, applications.length) *
                dimensions.nodeWidth +
                (Math.min(workloadColumns, applications.length) - 1) * 72
            : 0,
        )) /
        2
    for (const child of regularChildren) {
      assign(child, childLeft)
      childLeft += (widths.get(child) ?? dimensions.nodeWidth) + 72
    }
    for (const [index, child] of applications.entries()) {
      const row = Math.floor(index / workloadColumns)
      const column = index % workloadColumns
      const childHeight = heights.get(child)!
      positions.set(child, {
        id: child,
        x:
          left +
          (width -
            (Math.min(workloadColumns, applications.length) *
              dimensions.nodeWidth +
              (Math.min(workloadColumns, applications.length) - 1) * 72)) /
            2 +
          column * (dimensions.nodeWidth + 72),
        y: applicationsTop + row * (childHeight + 32),
        width: dimensions.nodeWidth,
        height: childHeight,
      })
    }
  }

  let left = 64
  for (const id of roots) {
    assign(id, left)
    left += (widths.get(id) ?? dimensions.nodeWidth) + 72
  }
  const groupWidth =
    groups.length * dimensions.nodeWidth + Math.max(0, groups.length - 1) * 72
  const contentWidth = Math.max(720, left - 8, groupWidth + 128)
  let groupLeft = (contentWidth - groupWidth) / 2
  for (const group of groups) {
    const height = heights.get(group.id)!
    positions.set(group.id, {
      id: group.id,
      x: groupLeft,
      y: 0,
      width: dimensions.nodeWidth,
      height,
    })
    groupLeft += dimensions.nodeWidth + 72
  }

  const nodes = graph.nodes.flatMap((node) => positions.get(node.id) ?? [])
  const width = Math.max(
    contentWidth,
    ...nodes.map((node) => (node.x ?? 0) + (node.width ?? 0) + 64),
  )
  return { nodes, frames: categoryFrames(nodes, width, graph) }
}

export function categoryFrames(
  children: readonly LayoutChild[],
  width: number,
  graph: UnifiedGraph,
): TopologyBandFrame[] {
  const bandById = new Map(graph.nodes.map((node) => [node.id, node.band]))
  const bounds = new Map<GraphBand, { top: number; bottom: number }>()

  for (const child of children) {
    const band = bandById.get(child.id)
    if (!band) continue
    const top = child.y ?? 0
    const bottom = top + (child.height ?? 0)
    const current = bounds.get(band)
    bounds.set(band, {
      top: Math.min(current?.top ?? top, top),
      bottom: Math.max(current?.bottom ?? bottom, bottom),
    })
  }

  const frames: TopologyBandFrame[] = []
  let previousBottom = Number.NEGATIVE_INFINITY
  for (const band of bands) {
    const bound = bounds.get(band)
    if (!bound) continue
    const y = Math.max(bound.top - 44, previousBottom)
    const height = bound.bottom + 32 - y
    frames.push({
      id: `band:${band}`,
      band,
      x: 0,
      y,
      width: Math.max(720, width + 64),
      height,
    })
    previousBottom = y + height
  }
  return frames
}
