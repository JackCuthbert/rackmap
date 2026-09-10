import { describe, expect, test } from 'vitest'
import { parseDocument } from 'yaml'

import type { SuccessfulLoadResult } from './load'
import { rootDocumentSchema } from './schema'
import { validateDocuments } from './validate'

function rootWith(root: object) {
  return { version: 1, site: { id: 'home', name: 'Home' }, ...root }
}

function loadWith(root: object): SuccessfulLoadResult {
  return {
    ok: true,
    rootPath: '/tmp/homelab.yaml',
    rootDirectory: '/tmp',
    documents: [
      {
        path: '/tmp/homelab.yaml',
        file: 'homelab.yaml',
        isRoot: true,
        data: rootDocumentSchema.parse(rootWith(root)),
        document: parseDocument(''),
      },
    ],
  }
}

function topology(overrides: object = {}) {
  return {
    groups: [{ id: 'rack', name: 'Rack', kind: 'rack' }],
    networkDevices: [
      { id: 'internet', name: 'Internet', kind: 'internet', group: 'rack' },
      {
        id: 'router',
        name: 'Router',
        kind: 'router',
        group: 'rack',
        upstream: 'internet',
      },
      {
        id: 'switch',
        name: 'Switch',
        kind: 'switch',
        group: 'rack',
        upstream: 'router',
      },
    ],
    hardware: [
      {
        id: 'server',
        name: 'Server',
        kind: 'compute',
        group: 'rack',
        capabilities: ['virtualisation'],
        addresses: [
          { address: '192.0.2.10', networkDevice: 'switch', vlanId: 20 },
        ],
      },
      { id: 'nas', name: 'NAS', kind: 'storage', group: 'rack' },
    ],
    virtualMachines: [
      {
        id: 'docker-vm',
        name: 'Docker VM',
        runsOn: 'server',
        addresses: [
          { address: '192.0.2.20', networkDevice: 'switch', vlanId: 20 },
        ],
        application: { name: 'Docker appliance' },
      },
    ],
    applications: [
      {
        id: 'adguard',
        name: 'AdGuard Home',
        kind: 'container',
        runsOn: 'docker-vm',
      },
    ],
    ...overrides,
  }
}

function diagnostics(root: object) {
  const result = validateDocuments(loadWith(root))
  expect(result.ok).toBe(false)
  return result.ok ? [] : result.diagnostics
}

describe('direct network topology', () => {
  test('rejects the removed interfaces and networkLinks collections', () => {
    expect(
      rootDocumentSchema.safeParse(
        rootWith({
          interfaces: [{ id: 'port', name: 'Port', owner: 'router' }],
        }),
      ).success,
    ).toBe(false)
    expect(
      rootDocumentSchema.safeParse(
        rootWith({ networkLinks: [{ from: 'router', to: 'switch' }] }),
      ).success,
    ).toBe(false)
  })

  test('derives direct router, switch, hardware, VM, and application paths', () => {
    const result = validateDocuments(loadWith(topology()))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.entityIdsByKind).toEqual({
      group: ['rack'],
      networkDevice: ['internet', 'router', 'switch'],
      hardware: ['server', 'nas'],
      virtualMachine: ['docker-vm'],
      application: ['adguard', 'docker-vm:application'],
    })
    expect(result.model.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'router',
          target: 'internet',
          type: 'network-upstream',
        }),
        expect.objectContaining({
          source: 'switch',
          target: 'router',
          type: 'network-upstream',
        }),
        expect.objectContaining({
          source: 'server',
          target: 'switch',
          type: 'connected-to',
        }),
        expect.objectContaining({
          source: 'docker-vm',
          target: 'server',
          type: 'runs-on',
        }),
        expect.objectContaining({
          source: 'adguard',
          target: 'docker-vm',
          type: 'runs-on',
        }),
      ]),
    )
  })

  test('accepts personal devices and IoT hardware', () => {
    expect(
      rootDocumentSchema.safeParse(
        rootWith(
          topology({
            hardware: [
              {
                id: 'phone',
                name: 'Phone',
                kind: 'personal-device',
                deviceType: 'phone',
                group: 'rack',
              },
              {
                id: 'sensor',
                name: 'Sensor',
                kind: 'iot',
                group: 'rack',
              },
            ],
          }),
        ),
      ).success,
    ).toBe(true)
  })

  test('accepts an addressed NIC without an IP assignment', () => {
    expect(
      rootDocumentSchema.safeParse(
        rootWith(
          topology({
            hardware: [
              {
                id: 'nas',
                name: 'NAS',
                kind: 'storage',
                group: 'rack',
                addresses: [{ networkDevice: 'switch', vlanId: 20 }],
              },
            ],
          }),
        ),
      ).success,
    ).toBe(true)
  })

  test.each([
    {
      hardware: [
        {
          id: 'server',
          name: 'Server',
          kind: 'compute',
          capabilities: ['virtualisation'],
          addresses: [
            { address: '192.0.2.10', networkDevice: 'switch', vlanId: 0 },
          ],
        },
      ],
    },
    {
      virtualMachines: [
        {
          id: 'docker-vm',
          name: 'Docker VM',
          runsOn: 'server',
          addresses: [
            { address: '192.0.2.20', networkDevice: 'switch', vlanId: 4095 },
          ],
        },
      ],
    },
  ])('rejects out-of-range hardware or VM VLAN IDs', (overrides) => {
    expect(
      rootDocumentSchema.safeParse(rootWith(topology(overrides))).success,
    ).toBe(false)
  })

  test('reports network upstream cycles', () => {
    expect(
      diagnostics(
        topology({
          networkDevices: [
            {
              id: 'router',
              name: 'Router',
              kind: 'router',
              upstream: 'switch',
            },
            {
              id: 'switch',
              name: 'Switch',
              kind: 'switch',
              upstream: 'router',
            },
          ],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        category: 'cycle',
        path: 'switch.upstream',
        message: expect.stringContaining('router -> switch -> router'),
      }),
    )
  })
})

describe('workload placement', () => {
  test('requires virtualisation-capable compute hardware for VMs', () => {
    expect(
      diagnostics(
        topology({
          hardware: [{ id: 'server', name: 'Server', kind: 'storage' }],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        category: 'invalid-reference',
        path: 'docker-vm.runsOn',
      }),
    )
  })

  test('requires explicit applications to run on VMs', () => {
    expect(
      diagnostics(
        topology({
          applications: [
            {
              id: 'adguard',
              name: 'AdGuard Home',
              kind: 'container',
              runsOn: 'server',
            },
          ],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        category: 'invalid-reference',
        path: 'adguard.runsOn',
      }),
    )
  })
})

describe('physical hardware connections', () => {
  test('derives a labelled USB connection between hardware entities', () => {
    const result = validateDocuments(
      loadWith(
        topology({
          hardware: [
            {
              id: 'server',
              name: 'Server',
              kind: 'compute',
              capabilities: ['virtualisation'],
              connections: [
                { target: 'ups', kind: 'usb', label: 'UPS monitoring' },
              ],
            },
            { id: 'ups', name: 'UPS', kind: 'ups' },
          ],
        }),
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.relationships).toContainEqual({
      source: 'server',
      target: 'ups',
      kind: 'usb',
      label: 'UPS monitoring',
      type: 'physical-connection',
      direction: 'undirected',
      origin: 'declared',
    })
  })

  test('allows USB and power connections for the same hardware pair', () => {
    const result = validateDocuments(
      loadWith(
        topology({
          hardware: [
            {
              id: 'server',
              name: 'Server',
              kind: 'compute',
              capabilities: ['virtualisation'],
              connections: [
                { target: 'ups', kind: 'usb', label: 'UPS monitoring' },
                { target: 'ups', kind: 'power', label: 'UPS power' },
              ],
            },
            { id: 'ups', name: 'UPS', kind: 'ups' },
          ],
        }),
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'usb', label: 'UPS monitoring' }),
        expect.objectContaining({ kind: 'power', label: 'UPS power' }),
      ]),
    )
  })

  test.each([
    {
      connections: [{ target: 'server', kind: 'usb' }],
      category: 'invalid-reference',
    },
    {
      connections: [{ target: 'missing', kind: 'usb' }],
      category: 'invalid-reference',
    },
    {
      connections: [
        { target: 'ups', kind: 'power' },
        { target: 'ups', kind: 'power' },
      ],
      category: 'duplicate-id',
    },
  ])(
    'rejects self, missing, and duplicate physical connections',
    ({ connections, category }) => {
      const errors = diagnostics(
        topology({
          hardware: [
            {
              id: 'server',
              name: 'Server',
              kind: 'compute',
              capabilities: ['virtualisation'],
              connections,
            },
            { id: 'ups', name: 'UPS', kind: 'ups' },
          ],
        }),
      )
      expect(errors).toContainEqual(expect.objectContaining({ category }))
    },
  )
})

describe('optional addressing metadata', () => {
  test('accepts addressing metadata and carries appliance domains into the derived application', () => {
    const result = validateDocuments(
      loadWith(
        topology({
          networkDevices: [
            {
              id: 'router',
              name: 'Router',
              kind: 'router',
              hostname: 'router.home.example',
              addresses: [{ address: '192.0.2.1' }, { address: '2001:db8::1' }],
            },
          ],
          hardware: [
            {
              id: 'server',
              name: 'Server',
              kind: 'compute',
              capabilities: ['virtualisation'],
              hostname: 'server-01',
              addresses: [{ address: '192.0.2.10', networkDevice: 'router' }],
            },
          ],
          virtualMachines: [
            {
              id: 'docker-vm',
              name: 'Docker VM',
              runsOn: 'server',
              hostname: 'docker-01.home.example',
              addresses: [{ address: '192.0.2.20', networkDevice: 'router' }],
              application: {
                name: 'Docker appliance',
                domains: ['docker.home.example', 'docker.example.net'],
              },
            },
          ],
        }),
      ),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.model.entities['docker-vm:application']).toMatchObject({
      domains: ['docker.home.example', 'docker.example.net'],
    })
  })

  test.each(['bad_name', '-bad.example', 'bad-.example', 'bad..example'])(
    'rejects invalid hostname or domain label %s',
    (value) => {
      expect(
        rootDocumentSchema.safeParse(
          rootWith({
            networkDevices: [
              { id: 'router', name: 'Router', kind: 'router', hostname: value },
            ],
            applications: [
              {
                id: 'app',
                name: 'App',
                kind: 'service',
                runsOn: 'vm',
                domains: [value],
              },
            ],
          }),
        ).success,
      ).toBe(false)
    },
  )

  test('rejects invalid IP addresses and duplicate address/domain values', () => {
    expect(
      diagnostics(
        topology({
          hardware: [
            {
              id: 'server',
              name: 'Server',
              kind: 'compute',
              capabilities: ['virtualisation'],
              addresses: [
                { address: 'not-an-ip', networkDevice: 'switch' },
                { address: '192.0.2.10', networkDevice: 'switch' },
                { address: '192.0.2.10', networkDevice: 'switch' },
              ],
            },
          ],
          applications: [
            {
              id: 'adguard',
              name: 'AdGuard Home',
              kind: 'container',
              runsOn: 'docker-vm',
              domains: ['adguard.example', 'adguard.example'],
            },
          ],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'invalid-format',
          path: 'server.addresses',
        }),
        expect.objectContaining({
          category: 'invalid-format',
          path: 'adguard.domains',
        }),
      ]),
    )
  })
})
