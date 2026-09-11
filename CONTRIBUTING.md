# Contributing to Rackmap

## Set up

Install [mise](https://mise.jdx.dev/), then install the repository toolchain and
dependencies:

```sh
mise install
bun install
```

Mise automatically activates the configured tools in this repository. The
commands below do not require a `mise exec --` prefix.

Start the development server with the bundled configuration:

```sh
bun run dev -- examples/homelab.yaml
```

In a second terminal, start Vite with `bunx vite` and open
`http://localhost:5173`.

## Verify changes

```sh
bun run schema:generate
bun run fmt:check
bun run lint
bun run typecheck
bun test
bun run build
```

Only regenerate `schema/homelab.schema.json` when the configuration schema
changes.

## Manual acceptance

With the development server running, verify that:

- The map shows Locations, Network, Hardware, Virtualisation, and Applications
  in a useful automatic layout.
- Search finds IDs, names, and tags in every band; selecting a result focuses
  it and opens its details.
- Selecting entities highlights upstream relationships and reveals relevant
  USB, power, and PoE connections.
- Hostnames, addresses, VLANs, domains, links, metadata, and VM resources appear
  in the appropriate cards or details.
- Dragging changes only the current browser position and automatic layout
  resets it.
- Valid file edits reload while invalid edits show diagnostics and preserve the
  previous valid map.

## Deployment

Pushes to `main` deploy the static client to GitHub Pages. The repository's
**Settings → Pages** build source must be set to **GitHub Actions**.
