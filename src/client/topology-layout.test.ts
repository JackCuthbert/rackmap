import { describe, expect, test } from 'vitest'

import type { HomelabModel } from '../domain/types'
import { buildUnifiedGraph } from './graph'
import {
  categoryFrames,
  layoutPrimaryTopology,
  primaryTopology,
} from './topology-layout'

const model: HomelabModel = {
  version: 1,
  site: { id: 'home', name: 'Home' },
  entities: {
    home: { id: 'home', name: 'Home', kind: 'location', entityKind: 'group' },
    rack: {
      id: 'rack',
      name: 'Rack',
      kind: 'rack',
      parent: 'home',
      entityKind: 'group',
    },
    router: {
      id: 'router',
      name: 'Router',
      kind: 'router',
      group: 'home',
      entityKind: 'networkDevice',
    },
    switch: {
      id: 'switch',
      name: 'Switch',
      kind: 'switch',
      group: 'rack',
      upstream: 'router',
      entityKind: 'networkDevice',
    },
    'small-host': {
      id: 'small-host',
      name: 'Small host',
      kind: 'compute',
      group: 'rack',
      capabilities: ['virtualisation'],
      addresses: [{ networkDevice: 'switch' }],
      entityKind: 'hardware',
    },
    'large-host': {
      id: 'large-host',
      name: 'Large host',
      kind: 'compute',
      group: 'rack',
      capabilities: ['virtualisation'],
      addresses: [{ networkDevice: 'switch' }],
      entityKind: 'hardware',
    },
    'small-vm': {
      id: 'small-vm',
      name: 'Small VM',
      runsOn: 'small-host',
      entityKind: 'virtualMachine',
    },
    'large-vm-01': {
      id: 'large-vm-01',
      name: 'Large VM 01',
      runsOn: 'large-host',
      entityKind: 'virtualMachine',
    },
    'large-vm-02': {
      id: 'large-vm-02',
      name: 'Large VM 02',
      runsOn: 'large-host',
      entityKind: 'virtualMachine',
    },
    'large-vm-03': {
      id: 'large-vm-03',
      name: 'Large VM 03',
      runsOn: 'large-host',
      entityKind: 'virtualMachine',
    },
    'large-vm-04': {
      id: 'large-vm-04',
      name: 'Large VM 04',
      runsOn: 'large-host',
      entityKind: 'virtualMachine',
    },
    'large-vm-05': {
      id: 'large-vm-05',
      name: 'Large VM 05',
      runsOn: 'large-host',
      entityKind: 'virtualMachine',
    },
  },
  entityIdsByKind: {
    group: ['home', 'rack'],
    networkDevice: ['router', 'switch'],
    hardware: ['small-host', 'large-host'],
    virtualMachine: [
      'small-vm',
      'large-vm-01',
      'large-vm-02',
      'large-vm-03',
      'large-vm-04',
      'large-vm-05',
    ],
    application: [],
  },
  relationships: [
    {
      source: 'rack',
      target: 'home',
      type: 'contains',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'router',
      target: 'home',
      type: 'contains',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'switch',
      target: 'rack',
      type: 'contains',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'small-host',
      target: 'rack',
      type: 'contains',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'large-host',
      target: 'rack',
      type: 'contains',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'switch',
      target: 'router',
      type: 'network-upstream',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'small-host',
      target: 'switch',
      type: 'connected-to',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'large-host',
      target: 'switch',
      type: 'connected-to',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'small-vm',
      target: 'small-host',
      type: 'runs-on',
      direction: 'directed',
      origin: 'derived',
    },
    ...[1, 2, 3, 4, 5].map((number) => ({
      source: `large-vm-0${number}`,
      target: 'large-host',
      type: 'runs-on' as const,
      direction: 'directed' as const,
      origin: 'derived' as const,
    })),
  ],
}

const graph = buildUnifiedGraph(model)
const dimensions = { nodeWidth: 216, cardHeight: () => 100 }

describe('topologyLayoutGraph', () => {
  test('builds one primary topology parent for each child', () => {
    expect(primaryTopology(graph)).toEqual(
      new Map([
        ['router', ['switch']],
        ['switch', ['small-host', 'large-host']],
        ['small-host', ['small-vm']],
        [
          'large-host',
          [
            'large-vm-01',
            'large-vm-02',
            'large-vm-03',
            'large-vm-04',
            'large-vm-05',
          ],
        ],
      ]),
    )
  })

  test('allocates non-overlapping primary subtrees', () => {
    const layout = layoutPrimaryTopology(graph, dimensions)
    const positions = new Map(layout.nodes.map((node) => [node.id, node]))
    const smallHost = positions.get('small-host')!
    const largeHost = positions.get('large-host')!

    expect(smallHost.x!).toBeLessThan(largeHost.x!)
    expect(positions.get('small-vm')?.x).toBe(smallHost.x)
    expect(
      layout.nodes.some((node, index) =>
        layout.nodes
          .slice(index + 1)
          .some(
            (other) =>
              (node.x ?? 0) < (other.x ?? 0) + (other.width ?? 0) &&
              (node.x ?? 0) + (node.width ?? 0) > (other.x ?? 0) &&
              (node.y ?? 0) < (other.y ?? 0) + (other.height ?? 0) &&
              (node.y ?? 0) + (node.height ?? 0) > (other.y ?? 0),
          ),
      ),
    ).toBe(false)
  })

  test('keeps groups compact and wraps applications below their VM', () => {
    const applicationIds = Array.from(
      { length: 10 },
      (_, index) => `app-${index}`,
    )
    const applicationGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        ...applicationIds.map((id) => ({
          ...graph.nodes[0]!,
          id,
          band: 'Applications' as const,
        })),
        { ...graph.nodes[4]!, id: 'ups', band: 'Hardware' as const },
      ],
      edges: [
        ...graph.edges,
        ...applicationIds.map((id) => ({
          ...graph.edges[0]!,
          id: `runs-on-${id}`,
          source: id,
          target: 'small-vm',
          type: 'runs-on' as const,
          direction: 'directed' as const,
          origin: 'derived' as const,
          dimmed: false,
          showLabel: false,
        })),
      ],
    }
    const positions = new Map(
      layoutPrimaryTopology(applicationGraph, dimensions).nodes.map((node) => [
        node.id,
        node,
      ]),
    )
    const applications = applicationIds.map((id) => positions.get(id)!)
    const smallVm = positions.get('small-vm')!
    const ups = positions.get('ups')!

    expect(new Set(applications.map((node) => node.y)).size).toBe(4)
    expect(new Set(applications.slice(0, 3).map((node) => node.x)).size).toBe(3)
    expect(smallVm.x! + 108).toBe(
      ((applications[0]!.x ?? 0) + (applications[2]!.x ?? 0) + 216) / 2,
    )
    expect(ups.y).toBe(positions.get('small-host')?.y)
    expect(ups.x!).toBeGreaterThan(positions.get('large-host')!.x!)
  })

  test('builds a frame for each occupied category', () => {
    const frames = categoryFrames(
      [
        { id: 'home', x: 64, y: 0, width: 216, height: 100 },
        { id: 'router', x: 64, y: 180, width: 216, height: 100 },
      ],
      720,
      graph,
    )

    expect(frames).toEqual([
      expect.objectContaining({ band: 'Locations', y: -32 }),
      expect.objectContaining({ band: 'Network', y: 148 }),
    ])
  })

  test('keeps padded category frames separate', () => {
    const frames = categoryFrames(
      [
        { id: 'home', x: 64, y: 0, width: 216, height: 100 },
        { id: 'router', x: 64, y: 120, width: 216, height: 100 },
      ],
      720,
      graph,
    )

    expect(frames[0]!.y + frames[0]!.height).toBeLessThanOrEqual(frames[1]!.y)
  })
})
