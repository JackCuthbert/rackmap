# Configuration authoring

Configuration is a version-1 YAML root document with optional relative YAML
imports. It is strictly validated and sent to the browser as a normalized,
read-only model.

> **Never put secrets in configuration.** The browser receives this data. Do
> not include passwords, tokens, private keys, credentials, or secret URLs in
> YAML, including `notes`, `links`, `endpoints`, and `specs`.

The generated [JSON Schema](../schema/homelab.schema.json) defines the
structural shape.

## Root and imports

Only the root declares `version` and `site`; imports can contain any entity
collection. Imports are relative `.yaml` or `.yml` paths that must remain under
the root directory.

```yaml
version: 1
site:
  id: home
  name: Home Lab
imports:
  - hardware.yaml
  - network.yaml
  - compute.yaml
  - applications.yaml
```

IDs are globally unique lowercase hyphenated references matching
`^[a-z][a-z0-9-]*$`. Every entity can use `name`, `description`, `tags`,
`notes`, and labelled HTTP(S) `links`.

## Five map bands

The map has fixed top-to-bottom bands:

1. **Locations** — `groups` such as locations, rooms, and racks.
2. **Network** — `networkDevices` such as internet sources, routers,
   firewalls, and switches.
3. **Hardware** — `hardware` such as physical compute, storage, and UPSs.
4. **Virtualisation** — `virtualMachines` placed on virtualisation-capable
   compute hardware.
5. **Applications** — explicit containers/services and generated appliance
   workloads.

| Collection | Required fields | References and notable optional fields |
| --- | --- | --- |
| `groups` | `id`, `name`, `kind` (`room`, `rack`, `location`, `other`) | `parent` → group |
| `networkDevices` | `id`, `name`, `kind` (`internet`, `router`, `firewall`, `switch`, `other`) | `group` → group; optional `upstream`, `hostname`, and address objects |
| `hardware` | `id`, `name`, `kind` (`compute`, `storage`, `ups`, `personal-device`, `iot`, `other`) | `group` → group; optional `hostname`, address objects, and USB/power `connections`; compute may set `capabilities: [virtualisation]`; personal devices may set `deviceType` (`phone`, `tablet`, `laptop`, `desktop`, `wearable`, `other`) |
| `virtualMachines` | `id`, `name`, `runsOn` | `runsOn` → virtualisation-capable compute hardware; optional address objects, `hostname`, `resources`, and `application` |
| `applications` | `id`, `name`, `kind` (`container`, `service`), `runsOn` | `runsOn` → VM; optional `domains`, `dependsOn`, and labelled HTTP(S) `endpoints` |

Groups and network-device upstream references cannot cycle. VMs must run on
compute hardware with the `virtualisation` capability. Applications run on
VMs, never directly on hardware. Application dependencies cannot point at
themselves.

## Appliance VMs and explicit workloads

An appliance VM can define an `application` object. The browser derives one
application node from it, targeted at that VM; do not also author a duplicate
application in `applications`.

```yaml
virtualMachines:
  - id: plex-vm
    name: Plex VM
    runsOn: server-one
    application:
      name: Plex Media Server
      endpoints:
        - label: Open Plex
          url: https://plex.example
```

This remains optional. A multi-workload VM such as `docker-01` simply has
explicit application records:

```yaml
applications:
  - id: adguard
    name: AdGuard Home
    kind: container
    runsOn: docker-01
```

Explicit services can still run on appliance VMs, for example a monitoring
agent on `plex-vm`.

## Optional addressing metadata

Network devices, hardware, and VMs can set a DNS `hostname` and one or more IP
`addresses`. Applications, including a VM's derived `application`, can set
DNS `domains`:

```yaml
virtualMachines:
  - id: plex-vm
    name: Plex VM
    runsOn: server-one
    hostname: plex-vm.home.example
    addresses:
      - address: 192.0.2.21
        networkDevice: switch
        vlanId: 3
    application:
      name: Plex Media Server
      domains: [plex.home.example]
```

Hostnames and domains accept standard DNS labels and dotted names. Each address
object may omit `address` for a documented NIC with no assigned IP; otherwise
the IP must be valid. Hardware and VM address objects require `networkDevice`
and may set a `vlanId` from 1 through 4094. Address/domain lists cannot contain
duplicate assigned IPs.
When present, these values appear as compact, truncated node-card lines with
the full value available on hover; they are also retained in the inspector.

## Direct network relationships and VLANs

Network topology is modelled directly: a downstream network device uses
`upstream`, while each hardware or VM address declares its `networkDevice`.
These references are rendered as directed map edges; no ports, interface nodes,
network links, or VLAN nodes are authored.

```yaml
networkDevices:
  - id: router
    name: Edge router
    kind: router
    group: office-rack
  - id: switch
    name: Managed switch
    kind: switch
    group: office-rack
    upstream: router
hardware:
  - id: server-one
    name: Server One
    kind: compute
    addresses:
      - address: 192.0.2.10
        networkDevice: switch
        vlanId: 2
```

The map shows each declared VLAN as a compact, deterministic-colour label on
its hardware or VM node; it does not create a VLAN or port node. Hardware and
VMs do not require an address entry, so storage and UPS equipment can be
modelled without a network-device connection.

Hardware and network devices can declare `connections`. `usb` is an
undirected hardware-to-hardware link; `power` and `poe` are directional from
provider to consumer. Power may target hardware or network equipment; a PoE
provider must be a network device. Links cannot target the declaring item or
duplicate the same provider, consumer, and kind. They are hidden until either
endpoint is selected:

```yaml
hardware:
  - id: ups
    name: UPS
    kind: ups
    connections:
      - target: server-one
        kind: usb
        label: UPS monitoring
      - target: server-one
        kind: power
        label: UPS power
      - target: router
        kind: power
networkDevices:
  - id: switch
    name: Switch
    kind: switch
    connections:
      - target: access-point
        kind: poe
```

Directed arrows point from a dependent workload or connected item to its
target. Selecting an item keeps its full upstream directed path visible (for
example application → VM → hardware → switch → router → location). Dragged
positions are browser-only and auto-layout resets them.

## Validate and run

Run the development server against a root file for source-aware diagnostics:

```sh
mise install
bun install
bun run dev -- path/to/homelab.yaml
```

Mise automatically activates the repository's configured tool versions;
`mise exec --` is not required. Contributor checks and schema-generation
instructions are in [CONTRIBUTING.md](../CONTRIBUTING.md).
