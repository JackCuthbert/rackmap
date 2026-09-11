import { expect, test } from 'vitest'

import { exampleYaml } from './example-yaml'
import { groupColor } from './graph'
import { loadYaml } from './load-yaml'

test('the bundled example exercises the complete configuration feature set', () => {
  const result = loadYaml(exampleYaml, 'example.yaml')

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.model.site.name).toBe('Sample Site')

  const entities = Object.values(result.model.entities)
  const kindsFor = (entityKind: string) =>
    new Set(
      entities.flatMap((entity) =>
        entity.entityKind === entityKind && 'kind' in entity
          ? [entity.kind]
          : [],
      ),
    )

  expect(kindsFor('group')).toEqual(new Set(['room', 'rack', 'other']))
  expect(kindsFor('networkDevice')).toEqual(
    new Set(['internet', 'router', 'firewall', 'switch', 'other']),
  )
  expect(kindsFor('hardware')).toEqual(
    new Set(['compute', 'storage', 'ups', 'personal-device', 'iot', 'other']),
  )
  expect(kindsFor('application')).toEqual(new Set(['container', 'service']))
  expect(
    new Set(
      entities.flatMap((entity) =>
        entity.entityKind === 'hardware' && entity.deviceType
          ? [entity.deviceType]
          : [],
      ),
    ),
  ).toEqual(new Set(['phone', 'laptop']))
  expect(entities).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'site' })]),
  )
  expect(entities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityKind: 'networkDevice',
        name: 'Wi-Fi Access Point',
      }),
    ]),
  )
  expect(
    result.model.relationships.filter(
      ({ type, target }) =>
        type === 'connected-to' && target === 'wifi-access-point',
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: 'phone' }),
      expect.objectContaining({ source: 'laptop' }),
    ]),
  )
  expect(result.model.entities['sensor']).toEqual(
    expect.objectContaining({
      addresses: [{ networkDevice: 'wifi-access-point', vlanId: 30 }],
    }),
  )
  expect(result.model.entities['server']).toEqual(
    expect.objectContaining({
      addresses: [
        { address: '192.0.2.10', networkDevice: 'switch', vlanId: 10 },
        { address: '192.0.2.12', networkDevice: 'switch', vlanId: 11 },
        { address: '192.0.2.13', networkDevice: 'switch', vlanId: 12 },
        { address: '192.0.2.14', networkDevice: 'switch', vlanId: 13 },
        { address: '192.0.2.15', networkDevice: 'switch', vlanId: 14 },
      ],
    }),
  )
  expect(groupColor('area')).not.toBe('#d6ad63')
  expect(entities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: expect.any(String),
        tags: expect.any(Array),
        notes: expect.any(String),
        links: expect.any(Array),
      }),
      expect.objectContaining({
        manufacturer: expect.any(String),
        model: expect.any(String),
        specs: expect.any(Object),
        capabilities: ['virtualisation'],
      }),
      expect.objectContaining({
        hostname: expect.any(String),
        addresses: expect.arrayContaining([
          {
            address: expect.any(String),
            networkDevice: expect.any(String),
            vlanId: expect.any(Number),
          },
        ]),
      }),
      expect.objectContaining({
        addresses: expect.arrayContaining([
          { networkDevice: expect.any(String) },
        ]),
      }),
      expect.objectContaining({
        resources: {
          cpu: expect.any(String),
          memory: expect.any(String),
          storage: expect.any(String),
        },
        application: expect.objectContaining({
          domains: expect.any(Array),
          endpoints: expect.any(Array),
        }),
      }),
      expect.objectContaining({
        domains: expect.any(Array),
        endpoints: expect.any(Array),
      }),
      expect.objectContaining({ dependsOn: expect.any(Array) }),
    ]),
  )
  expect(
    new Set(
      result.model.relationships.flatMap((relationship) =>
        relationship.kind ? [relationship.kind] : [],
      ),
    ),
  ).toEqual(new Set(['usb', 'power', 'poe']))
  expect(new Set(result.model.relationships.map(({ type }) => type))).toEqual(
    new Set([
      'contains',
      'network-upstream',
      'connected-to',
      'physical-connection',
      'runs-on',
      'depends-on',
    ]),
  )
})
