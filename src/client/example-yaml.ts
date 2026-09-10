export const exampleYaml = `version: 1
site:
  id: home
  name: Home Lab
  description: A small example configuration. Do not put secrets in YAML.

groups:
  - id: home
    name: Home
    kind: location
  - id: office
    name: Office
    kind: room
    parent: home
  - id: office-rack
    name: Office rack
    kind: rack
    parent: office

networkDevices:
  - id: router
    name: Edge router
    kind: router
    group: office-rack
    hostname: router.home.example
    addresses: [{ address: 192.0.2.1 }]
  - id: switch
    name: Managed switch
    kind: switch
    group: office-rack
    upstream: router
    hostname: switch.home.example
    addresses: [{ address: 192.0.2.2 }]

hardware:
  - id: server-one
    name: Server One
    kind: compute
    group: office-rack
    capabilities: [virtualisation]
    hostname: server-one.home.example
    addresses: [{ address: 192.0.2.10, networkDevice: switch, vlanId: 2 }]
  - id: server-two
    name: Server Two
    kind: compute
    group: office-rack
    capabilities: [virtualisation]
    hostname: server-two.home.example
    addresses: [{ address: 192.0.2.11, networkDevice: switch, vlanId: 2 }]
  - id: nas
    name: NAS
    kind: storage
    group: office-rack
  - id: ups
    name: UPS
    kind: ups
    group: office-rack
    connections:
      - target: server-one
        kind: usb
        label: UPS monitoring
      - target: server-one
        kind: power
        label: UPS power
      - target: server-two
        kind: power
        label: UPS power

virtualMachines:
  - id: docker-01
    name: Docker 01
    runsOn: server-two
    hostname: docker-01.home.example
    addresses: [{ address: 192.0.2.20, networkDevice: switch, vlanId: 3 }]
  - id: plex-vm
    name: Plex VM
    runsOn: server-one
    hostname: plex-vm.home.example
    addresses: [{ address: 192.0.2.21, networkDevice: switch, vlanId: 3 }]
    application:
      name: Plex Media Server
      description: The VM is an appliance, so this application node is derived.
      domains: [plex.home.example]

applications:
  - id: homepage
    name: Homepage
    kind: container
    runsOn: docker-01
    endpoints:
      - label: Homepage
        url: https://homepage.example
  - id: adguard
    name: AdGuard Home
    kind: container
    runsOn: docker-01
    domains: [adguard.home.example]
  - id: monitoring
    name: Monitoring
    kind: service
    runsOn: docker-01
    dependsOn: [adguard]
  - id: beszel-agent
    name: Beszel agent
    kind: service
    runsOn: plex-vm
`
