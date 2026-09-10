# Homelab Visualizer

A local, read-only browser map for a YAML-described homelab. YAML is the
source of truth: the app does not edit configuration, discover infrastructure,
monitor services, or store node positions.

> **Never put secrets in configuration.** The validated configuration model is
> sent to the browser. Do not include passwords, tokens, private keys, or
> credentials in YAML, notes, links, endpoints, or specs.

## Run it

Prerequisites: [mise](https://mise.jdx.dev/) and Bun (installed by mise from
this repository's `mise.toml`). Install dependencies, then start the bundled
example:

```sh
mise install
mise exec -- bun install
mise exec -- bun run dev -- examples/homelab.yaml
```

Build and run the production server with:

```sh
mise exec -- bun run build
mise exec -- bun run start -- examples/homelab.yaml
```

Generate the committed JSON Schema and run repository checks with:

```sh
mise exec -- bun run schema:generate
mise exec -- bun run fmt:check
mise exec -- bun run lint
mise exec -- bun run typecheck
mise exec -- bun run build
mise exec -- bun test
```

See [configuration authoring](docs/configuration.md) for the YAML contract and
[`examples/homelab.yaml`](examples/homelab.yaml) for a split configuration.

## Manual acceptance

With `mise exec -- bun run dev -- examples/homelab.yaml` running, check the
following in a browser:

- One map shows the top-to-bottom Locations, Network, Hardware,
  Virtualisation, and Applications bands. The Plex VM has a generated Plex
  application node; Docker 01 hosts the explicit AdGuard and Homepage nodes.
- Default solid arrows show containment, placement, and dependency relationships
  from a dependent item to what it relies on, including switch-to-router
  upstream and hardware-to-switch connections. VLAN labels belong to hardware
  and VMs; hostnames, IP addresses, and application domains appear as compact
  card metadata. Ports and VLANs are not map nodes. Select an entity to
  highlight its complete upstream placement path and dim unrelated items;
  selected hardware also reveals its labelled USB and power connections.
- Search finds IDs, names, and tags across every band. Selecting a result opens
  its details and focuses it; details show fields, links, and direct upstream,
  downstream relationships.
- Dragging a node changes only its current browser position. Use automatic
  layout to reset it; no coordinates are written to YAML.
- Make a valid edit to an imported YAML file and confirm it reloads while a
  still-present selection remains selected. Introduce an invalid value and
  confirm diagnostics appear while the prior valid map remains. Restore the
  value and confirm diagnostics clear and the map updates.
