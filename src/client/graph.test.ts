import { describe, expect, test } from 'vitest'

import type { HomelabModel } from '../domain/types'
import {
  assignEdgeHandles,
  bandFor,
  buildUnifiedGraph,
  edgeRoutePath,
  planEdgeRoute,
  vlanColor,
} from './graph'

const model: HomelabModel = {
  version: 1,
  site: { id: 'home', name: 'Home' },
  entities: {
    rack: { id: 'rack', name: 'Rack', kind: 'rack', entityKind: 'group' },
    router: {
      id: 'router',
      name: 'Router',
      kind: 'router',
      group: 'rack',
      hostname: 'router.home.example',
      addresses: [{ address: '192.0.2.1' }],
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
    server: {
      id: 'server',
      name: 'Server',
      kind: 'compute',
      group: 'rack',
      capabilities: ['virtualisation'],
      hostname: 'server-01',
      addresses: [
        { address: '192.0.2.10', networkDevice: 'switch', vlanId: 20 },
      ],
      entityKind: 'hardware',
    },
    nas: {
      id: 'nas',
      name: 'NAS',
      kind: 'storage',
      group: 'rack',
      entityKind: 'hardware',
    },
    'docker-vm': {
      id: 'docker-vm',
      name: 'Docker VM',
      runsOn: 'server',
      hostname: 'docker-01',
      addresses: [
        { address: '192.0.2.20', networkDevice: 'switch', vlanId: 20 },
      ],
      entityKind: 'virtualMachine',
    },
    adguard: {
      id: 'adguard',
      name: 'AdGuard Home',
      kind: 'container',
      runsOn: 'docker-vm',
      domains: ['adguard.home.example'],
      derivedFrom: 'docker-vm',
      entityKind: 'application',
    },
    monitoring: {
      id: 'monitoring',
      name: 'Monitoring',
      kind: 'service',
      runsOn: 'docker-vm',
      dependsOn: ['adguard'],
      entityKind: 'application',
    },
  },
  entityIdsByKind: {
    group: ['rack'],
    networkDevice: ['router', 'switch'],
    hardware: ['server', 'nas'],
    virtualMachine: ['docker-vm'],
    application: ['adguard', 'monitoring'],
  },
  relationships: [
    {
      source: 'router',
      target: 'rack',
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
      source: 'server',
      target: 'rack',
      type: 'contains',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'nas',
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
      source: 'server',
      target: 'switch',
      type: 'connected-to',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'server',
      target: 'nas',
      type: 'physical-connection',
      kind: 'usb',
      label: 'UPS USB',
      direction: 'undirected',
      origin: 'declared',
    },
    {
      source: 'server',
      target: 'nas',
      type: 'physical-connection',
      kind: 'power',
      label: 'UPS power',
      direction: 'undirected',
      origin: 'declared',
    },
    {
      source: 'docker-vm',
      target: 'server',
      type: 'runs-on',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'adguard',
      target: 'docker-vm',
      type: 'runs-on',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'monitoring',
      target: 'docker-vm',
      type: 'runs-on',
      direction: 'directed',
      origin: 'derived',
    },
    {
      source: 'monitoring',
      target: 'adguard',
      type: 'depends-on',
      direction: 'directed',
      origin: 'declared',
    },
  ],
}

describe('buildUnifiedGraph', () => {
  test('plans vertical, same-band, and outer-gutter edge routes', () => {
    expect(
      planEdgeRoute({
        sourceBand: 'Applications',
        targetBand: 'Virtualisation',
        sourceX: 300,
        targetX: 300,
        minX: 100,
        maxX: 700,
      }),
    ).toMatchObject({
      mode: 'vertical',
      sourceHandle: 'top',
      targetHandle: 'bottom',
    })
    expect(
      planEdgeRoute({
        sourceBand: 'Hardware',
        targetBand: 'Hardware',
        sourceX: 200,
        targetX: 500,
        minX: 100,
        maxX: 700,
        parallelOffset: 18,
      }),
    ).toMatchObject({
      mode: 'side',
      sourceHandle: 'right',
      targetHandle: 'left',
      parallelOffset: 18,
    })
    expect(
      planEdgeRoute({
        sourceBand: 'Hardware',
        targetBand: 'Locations',
        sourceX: 220,
        targetX: 260,
        minX: 100,
        maxX: 700,
        parallelOffset: 18,
      }),
    ).toMatchObject({
      mode: 'gutter',
      sourceHandle: 'left',
      targetHandle: 'left',
      gutterX: 18,
    })
  })

  test('routes skipped-band paths through the outer gutter', () => {
    const plan = planEdgeRoute({
      sourceBand: 'Hardware',
      targetBand: 'Locations',
      sourceX: 600,
      targetX: 560,
      minX: 100,
      maxX: 700,
    })

    expect(
      edgeRoutePath(plan, { x: 600, y: 400 }, { x: 560, y: 100 }),
    ).toMatchObject({
      path: 'M 600 400 L 764 400 L 764 100 L 560 100',
      labelX: 764,
      labelY: 250,
    })
  })

  test('assigns distinct matching handles for parallel physical connections', () => {
    const handles = assignEdgeHandles([
      {
        id: 'ups:server:power',
        source: 'ups',
        target: 'server',
        sourceSide: 'right',
        targetSide: 'left',
      },
      {
        id: 'ups:server:usb',
        source: 'ups',
        target: 'server',
        sourceSide: 'right',
        targetSide: 'left',
      },
    ])

    expect(handles.byEdge.get('ups:server:power')).toEqual({
      sourceHandle: 'source-right-0',
      targetHandle: 'target-left-0',
    })
    expect(handles.byEdge.get('ups:server:usb')).toEqual({
      sourceHandle: 'source-right-1',
      targetHandle: 'target-left-1',
    })
    expect(handles.byNode.get('ups')).toHaveLength(2)
    expect(handles.byNode.get('server')).toHaveLength(2)
  })

  test('renders adjacent-band paths as vertical Bezier curves', () => {
    const plan = planEdgeRoute({
      sourceBand: 'Applications',
      targetBand: 'Virtualisation',
      sourceX: 300,
      targetX: 340,
      minX: 100,
      maxX: 700,
    })

    expect(
      edgeRoutePath(plan, { x: 300, y: 400 }, { x: 340, y: 200 }).path,
    ).toBe('M 300 400 C 300 300, 340 300, 340 200')
  })

  test('routes same-band network upstream links through top and bottom handles', () => {
    expect(
      planEdgeRoute({
        sourceBand: 'Network',
        targetBand: 'Network',
        sourceX: 300,
        targetX: 300,
        sourceY: 220,
        targetY: 100,
        minX: 100,
        maxX: 700,
        sameBandVertical: true,
      }),
    ).toMatchObject({
      mode: 'vertical',
      sourceHandle: 'top',
      targetHandle: 'bottom',
    })
  })

  test('places direct topology entities in the five fixed bands', () => {
    expect(
      buildUnifiedGraph(model).nodes.map((node) => [node.id, node.band]),
    ).toEqual([
      ['rack', 'Locations'],
      ['router', 'Network'],
      ['switch', 'Network'],
      ['server', 'Hardware'],
      ['nas', 'Hardware'],
      ['docker-vm', 'Virtualisation'],
      ['adguard', 'Applications'],
      ['monitoring', 'Applications'],
    ])
  })

  test('shows structural containment with the primary topology', () => {
    expect(buildUnifiedGraph(model).edges.map((edge) => edge.type)).toEqual([
      'network-upstream',
      'connected-to',
      'runs-on',
      'runs-on',
      'runs-on',
      'depends-on',
    ])
  })

  test('shows entity location membership only when an endpoint is selected', () => {
    expect(
      buildUnifiedGraph(model).edges.some(
        (edge) => edge.source === 'router' && edge.target === 'rack',
      ),
    ).toBe(false)
  })

  test('reveals group membership when the device or its group is selected', () => {
    for (const selectedId of ['router', 'rack']) {
      expect(
        buildUnifiedGraph(model, selectedId).edges.find(
          (edge) => edge.source === 'router' && edge.target === 'rack',
        ),
      ).toMatchObject({ type: 'contains', dimmed: false, showLabel: true })
    }
  })

  test('marks a selected group, its members, and membership edges with one colour', () => {
    const graph = buildUnifiedGraph(model, 'rack')
    const color = graph.nodes.find((node) => node.id === 'rack')?.groupHighlight

    expect(color).toEqual(
      expect.objectContaining({
        id: 'rack',
        name: 'Rack',
        color: expect.any(String),
      }),
    )
    expect(
      graph.nodes.find((node) => node.id === 'router')?.groupHighlight,
    ).toEqual(color)
    expect(
      graph.edges.find(
        (edge) => edge.source === 'router' && edge.target === 'rack',
      )?.groupColor,
    ).toBe(color?.color)
  })

  test('shows inherited placement badges from hardware through applications', () => {
    const graph = buildUnifiedGraph(model)
    const rack = expect.objectContaining({ id: 'rack', name: 'Rack' })

    expect(
      graph.nodes.find((node) => node.id === 'rack')?.groupHighlight,
    ).toEqual(rack)
    expect(
      graph.nodes.find((node) => node.id === 'server')?.groupHighlight,
    ).toEqual(rack)
    expect(
      graph.nodes.find((node) => node.id === 'docker-vm')?.groupHighlight,
    ).toEqual(rack)
    expect(
      graph.nodes.find((node) => node.id === 'adguard')?.groupHighlight,
    ).toEqual(rack)
  })

  test('marks only provisioned false entities as planned', () => {
    const plannedModel = structuredClone(model)
    const server = plannedModel.entities['server']
    if (!server) throw new Error('Missing server')
    server.provisioned = false

    const graph = buildUnifiedGraph(plannedModel)

    expect(graph.nodes.find((node) => node.id === 'server')).toMatchObject({
      planned: true,
    })
    expect(graph.nodes.find((node) => node.id === 'router')).toMatchObject({
      planned: false,
    })
  })

  test('shows network containment when an endpoint is selected', () => {
    for (const selectedId of ['router', 'rack']) {
      const edge = buildUnifiedGraph(model, selectedId).edges.find(
        (candidate) =>
          candidate.source === 'router' && candidate.target === 'rack',
      )
      expect(edge).toMatchObject({ dimmed: false })
    }
  })

  test('reveals a physical connection only when one endpoint is selected', () => {
    expect(
      buildUnifiedGraph(model).edges.some(
        (edge) => edge.type === 'physical-connection',
      ),
    ).toBe(false)

    expect(
      buildUnifiedGraph(model, 'server').edges.filter(
        (edge) => edge.type === 'physical-connection',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'usb',
          label: 'UPS USB',
          dimmed: false,
        }),
        expect.objectContaining({
          kind: 'power',
          label: 'UPS power',
          dimmed: false,
        }),
      ]),
    )
  })

  test('highlights direct incident relationships when their node is selected', () => {
    const graph = buildUnifiedGraph(model, 'switch')
    expect(
      graph.edges.find(
        (edge) =>
          edge.type === 'network-upstream' &&
          edge.source === 'switch' &&
          edge.target === 'router',
      ),
    ).toMatchObject({ dimmed: false, showLabel: true })
  })

  test('shows edge labels only for highlighted selected paths', () => {
    expect(
      buildUnifiedGraph(model).edges.every((edge) => !edge.showLabel),
    ).toBe(true)
    expect(
      buildUnifiedGraph(model, 'adguard').edges.find(
        (edge) => edge.type === 'runs-on',
      ),
    ).toMatchObject({ showLabel: true })
    expect(
      buildUnifiedGraph(model, 'server').edges.filter(
        (edge) => edge.type === 'physical-connection',
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ showLabel: true })]),
    )
  })

  test('keeps an application and its complete upstream network path undimmed', () => {
    const graph = buildUnifiedGraph(model, 'adguard')

    expect(
      graph.nodes.filter((node) => !node.dimmed).map((node) => node.id),
    ).toEqual(['rack', 'router', 'switch', 'server', 'docker-vm', 'adguard'])
    expect(
      graph.edges.filter((edge) => !edge.dimmed).map((edge) => edge.type),
    ).toEqual([
      'contains',
      'contains',
      'contains',
      'network-upstream',
      'connected-to',
      'runs-on',
      'runs-on',
    ])
    expect(graph.nodes.find((node) => node.id === 'nas')?.dimmed).toBe(true)
    expect(graph.nodes.find((node) => node.id === 'monitoring')?.dimmed).toBe(
      true,
    )
  })

  test('maps every entity kind to its intended band', () => {
    expect(bandFor('group')).toBe('Locations')
    expect(bandFor('networkDevice')).toBe('Network')
    expect(bandFor('hardware')).toBe('Hardware')
    expect(bandFor('virtualMachine')).toBe('Virtualisation')
    expect(bandFor('application')).toBe('Applications')
  })

  test('uses stable, distinct colours for hardware and VM VLAN labels', () => {
    expect(vlanColor(20)).toBe(vlanColor(20))
    expect(vlanColor(20)).not.toBe(vlanColor(30))
  })

  test('adds only provided addressing metadata to node card data', () => {
    const graph = buildUnifiedGraph(model)

    expect(graph.nodes.find((node) => node.id === 'router')?.metadata).toEqual([
      { label: 'IP', value: '192.0.2.1' },
    ])
    expect(
      graph.nodes.find((node) => node.id === 'docker-vm')?.metadata,
    ).toEqual([{ label: 'IP', value: '192.0.2.20' }])
    expect(graph.nodes.find((node) => node.id === 'adguard')?.metadata).toEqual(
      [],
    )
    expect(graph.nodes.find((node) => node.id === 'nas')?.metadata).toEqual([])
  })

  test('retains VLAN-only addressing metadata', () => {
    const withUnassignedNic = structuredClone(model)
    const server = withUnassignedNic.entities['server']
    if (!server || server.entityKind !== 'hardware')
      throw new Error('Missing server')
    server.addresses = [{ networkDevice: 'switch', vlanId: 20 }]

    expect(
      buildUnifiedGraph(withUnassignedNic).nodes.find(
        (node) => node.id === 'server',
      )?.metadata,
    ).toEqual([{ label: 'IP', value: '' }])
  })
})
