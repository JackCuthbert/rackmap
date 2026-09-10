import { z } from 'zod'

const id = z.string().regex(/^[a-z][a-z0-9-]*$/)
const optionalText = z.string().min(1).optional()

const labelledUrlSchema = z.strictObject({
  label: z.string().min(1),
  url: z.string().url(),
})

const commonMetadataShape = {
  name: z.string().min(1),
  description: optionalText,
  tags: z.array(z.string().min(1)).optional(),
  notes: optionalText,
  links: z.array(labelledUrlSchema).optional(),
}

const commonEntityShape = { id, ...commonMetadataShape }
const vlanId = z.number().int().min(1).max(4094)
const address = z.string().min(1)
const addressSchema = z.strictObject({
  address: address.optional(),
  vlanId: vlanId.optional(),
})
const connectedAddressSchema = addressSchema.extend({ networkDevice: id })
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const dnsName = z
  .string()
  .min(1)
  .max(253)
  .refine(
    (value) => value.split('.').every((label) => dnsLabel.test(label)),
    'Must be a valid DNS name.',
  )

export const siteSchema = z.strictObject({
  id,
  name: z.string().min(1),
  description: optionalText,
})

export const groupSchema = z.strictObject({
  ...commonEntityShape,
  kind: z.enum(['room', 'rack', 'location', 'other']),
  parent: id.optional(),
})

const equipmentShape = {
  ...commonEntityShape,
  group: id.optional(),
  manufacturer: optionalText,
  model: optionalText,
  specs: z.record(z.string(), z.string()).optional(),
  hostname: dnsName.optional(),
  addresses: z.array(addressSchema).optional(),
}

export const networkDeviceSchema = z.strictObject({
  ...equipmentShape,
  kind: z.enum(['internet', 'router', 'firewall', 'switch', 'other']),
  upstream: id.optional(),
})

export const hardwareConnectionSchema = z.strictObject({
  target: id,
  kind: z.enum(['usb', 'power']),
  label: optionalText,
})

export const hardwareSchema = z.strictObject({
  ...equipmentShape,
  addresses: z.array(connectedAddressSchema).optional(),
  kind: z.enum([
    'compute',
    'storage',
    'ups',
    'personal-device',
    'iot',
    'other',
  ]),
  deviceType: z
    .enum(['phone', 'tablet', 'laptop', 'desktop', 'wearable', 'other'])
    .optional(),
  capabilities: z.array(z.literal('virtualisation')).optional(),
  connections: z.array(hardwareConnectionSchema).optional(),
})

export const vmApplicationSchema = z.strictObject({
  ...commonMetadataShape,
  domains: z.array(dnsName).optional(),
  endpoints: z.array(labelledUrlSchema).optional(),
})

export const virtualMachineSchema = z.strictObject({
  ...commonEntityShape,
  runsOn: id,
  addresses: z.array(connectedAddressSchema).optional(),
  hostname: dnsName.optional(),
  application: vmApplicationSchema.optional(),
  resources: z
    .strictObject({
      cpu: z.string().min(1).optional(),
      memory: z.string().min(1).optional(),
      storage: z.string().min(1).optional(),
    })
    .optional(),
})

export const applicationSchema = z.strictObject({
  ...commonEntityShape,
  kind: z.enum(['container', 'service']),
  runsOn: id,
  dependsOn: z.array(id).optional(),
  domains: z.array(dnsName).optional(),
  endpoints: z.array(labelledUrlSchema).optional(),
})

const collectionShape = {
  imports: z.array(z.string().min(1)).optional(),
  groups: z.array(groupSchema).optional(),
  networkDevices: z.array(networkDeviceSchema).optional(),
  hardware: z.array(hardwareSchema).optional(),
  virtualMachines: z.array(virtualMachineSchema).optional(),
  applications: z.array(applicationSchema).optional(),
}

export const rootDocumentSchema = z.strictObject({
  version: z.literal(1),
  site: siteSchema,
  ...collectionShape,
})

export const importDocumentSchema = z.strictObject(collectionShape)

export type RootDocument = z.infer<typeof rootDocumentSchema>
export type ImportDocument = z.infer<typeof importDocumentSchema>
export type Group = z.infer<typeof groupSchema>
export type NetworkDevice = z.infer<typeof networkDeviceSchema>
export type Hardware = z.infer<typeof hardwareSchema>
export type VirtualMachine = z.infer<typeof virtualMachineSchema>
export type VmApplication = z.infer<typeof vmApplicationSchema>
export type Application = z.infer<typeof applicationSchema>

export const homelabJsonSchema = z.toJSONSchema(rootDocumentSchema, {
  target: 'draft-2020-12',
  unrepresentable: 'any',
})
