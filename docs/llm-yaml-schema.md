# Rackmap YAML schema for LLMs

Use this document to generate a valid Rackmap configuration. Return **only one
YAML document**: do not use `imports`, Markdown fences, comments containing
secrets, or fields not listed here.

## Global rules

- `version` must be exactly `1`.
- Every `id` must match `^[a-z][a-z0-9-]*$` and be unique across all
  collections. Use lowercase letters, numbers, and hyphens only.
- All objects are strict: do not invent additional keys.
- `name` values and non-empty text values must not be blank.
- IDs referenced by another field must exist and have the stated kind.
- HTTP links/endpoints must be valid `http://` or `https://` URLs.
- Hostnames and domains must be valid DNS names.

## Root object

```yaml
version: 1
site:
  id: home
  name: Home Lab
  description: Optional text

groups: []
networkDevices: []
hardware: []
virtualMachines: []
applications: []
```

`site.id` follows the normal ID rule. `site.description` and every collection
are optional, but a useful map normally provides all applicable collections.

## Common metadata

Every group, network device, hardware item, VM, and application supports the
following optional fields where relevant:

```yaml
description: Optional text
tags: [tag-one, tag-two]
notes: Optional text
links:
  - label: Documentation
    url: https://example.com/docs
```

## Groups

Groups model locations, rooms, and racks.

```yaml
groups:
  - id: home
    name: Home
    kind: location # room | rack | location | other
    parent: another-group-id # optional; must reference a group
```

Group parent relationships cannot form a cycle.

## Address objects and VLANs

Addresses are objects, never bare strings.

```yaml
addresses:
  - address: 192.0.2.10 # optional; valid IPv4 or IPv6 when present
    vlanId: 20          # optional integer from 1 through 4094
```

For **hardware and VMs**, every address object must also include its connected
network device:

```yaml
addresses:
  - address: 192.0.2.10 # optional; renders as <unset> when omitted
    networkDevice: switch-main # required; must reference a network device
    vlanId: 20                 # optional
```

Use one address object per NIC/IP assignment. A device may have multiple
entries, including multiple switches and VLANs. The same assigned IP cannot
appear twice on one entity. `networkDevice` and `vlanId` are **not** valid
top-level hardware or VM fields.

## Network devices

```yaml
networkDevices:
  - id: router
    name: Edge router
    kind: router # internet | router | firewall | switch | other
    group: rack-main # optional; must reference a group
    upstream: internet-source # optional; must reference a network device
    hostname: router.home.example # optional
    addresses:
      - address: 192.0.2.1
        vlanId: 10 # optional
```

`upstream` describes the network tree from a downstream device to its upstream
device. Network upstream relationships cannot form a cycle.

## Hardware

```yaml
hardware:
  - id: pve01
    name: pve01
    kind: compute # compute | storage | ups | personal-device | iot | other
    group: rack-main # optional; must reference a group
    capabilities: [virtualisation] # optional; only valid capability
    hostname: pve01.home.example # optional
    addresses:
      - address: 192.0.2.10
        networkDevice: switch-main
        vlanId: 20
    manufacturer: Example Systems # optional
    model: Rack 1U # optional
    specs: # optional string-to-string map
      cpu: 8 cores
      memory: 32 GiB
    connections: # optional physical links to other hardware
      - target: ups
        kind: usb # usb | power
        label: UPS monitoring # optional
```

For `kind: personal-device`, `deviceType` is optional and may be `phone`,
`tablet`, `laptop`, `desktop`, `wearable`, or `other`.

Only `kind: compute` with `capabilities: [virtualisation]` may host VMs.
Hardware need not have addresses or a group. A physical connection cannot
target itself or duplicate the same `kind` for the same pair.

## Virtual machines

```yaml
virtualMachines:
  - id: docker-01
    name: Docker 01
    runsOn: pve01 # required; virtualisation-capable compute hardware
    hostname: docker-01.home.example # optional
    addresses:
      - address: 192.0.2.20
        networkDevice: switch-main
        vlanId: 30
    resources: # optional
      cpu: 4 cores
      memory: 8 GiB
      storage: 80 GiB
    application: # optional appliance application; creates an application node
      name: Plex Media Server
      description: Optional text
      tags: [media]
      notes: Optional text
      links:
        - label: Dashboard
          url: https://plex.example
      domains: [plex.home.example]
      endpoints:
        - label: Open Plex
          url: https://plex.example
```

`application` represents the VM's primary appliance workload. Do not provide
an `id`, `kind`, or `runsOn` inside it; Rackmap derives those values.

## Applications

```yaml
applications:
  - id: adguard
    name: AdGuard Home
    kind: container # container | service
    runsOn: docker-01 # required; must reference a VM
    dependsOn: [another-application] # optional application IDs
    domains: [adguard.home.example] # optional
    endpoints: # optional labelled HTTP(S) URLs
      - label: DNS dashboard
        url: https://dns.example
```

Application dependencies must reference applications and cannot point to the
application itself.

## Complete minimal example

```yaml
version: 1
site:
  id: home
  name: Home Lab

groups:
  - id: home
    name: Home
    kind: location
  - id: rack-main
    name: Main rack
    kind: rack
    parent: home

networkDevices:
  - id: router
    name: Router
    kind: router
    group: rack-main
  - id: switch-main
    name: Main switch
    kind: switch
    group: rack-main
    upstream: router

hardware:
  - id: pve01
    name: pve01
    kind: compute
    group: rack-main
    capabilities: [virtualisation]
    addresses:
      - address: 192.0.2.10
        networkDevice: switch-main
        vlanId: 20

virtualMachines:
  - id: docker-01
    name: Docker 01
    runsOn: pve01
    addresses:
      - address: 192.0.2.20
        networkDevice: switch-main
        vlanId: 30

applications:
  - id: adguard
    name: AdGuard Home
    kind: container
    runsOn: docker-01
```
