# Rackmap

Rackmap turns a YAML description of your homelab into an interactive,
read-only map. It shows locations, network devices, physical hardware,
virtual machines, applications, and the relationships between them.

Try the hosted version at
[jackcuthbert.github.io/rackmap](https://jackcuthbert.github.io/rackmap/).
It opens with a complete sample configuration that you can edit or replace in
the browser.

> **Never put secrets in configuration.** Rackmap sends the validated
> configuration to the browser. Do not include passwords, tokens, private
> keys, credentials, or secret URLs in YAML fields.

## Run locally

Install [mise](https://mise.jdx.dev/), then run:

```sh
mise install
bun install
bun run dev -- examples/homelab.yaml
```

In a second terminal, start the browser client:

```sh
bunx vite
```

Open `http://localhost:5173`. Mise activates the repository's configured tool
versions automatically, so `mise exec --` is not needed.

To build the static client:

```sh
bun run build
```

## Use Rackmap

- Edit the YAML in the source panel and select **Render YAML**.
- Load a YAML file from an HTTP(S) URL when its server permits browser access
  with CORS.
- Search for an ID, name, or tag to focus an item and open its details.
- Select an item to highlight its upstream path and reveal relevant physical
  connections.
- Drag items temporarily, or use automatic layout to reset their positions.

Rackmap does not edit source files, discover infrastructure, monitor services,
or persist node positions.

See the [configuration guide](docs/configuration.md) for the YAML format. The
single [bundled example](examples/homelab.yaml) demonstrates every supported
field and is also the configuration shown on first load.

Development and verification instructions are in
[CONTRIBUTING.md](CONTRIBUTING.md).
