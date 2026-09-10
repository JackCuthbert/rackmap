# Client YAML loading

## Goal

Run the visualizer from a single YAML document in the browser, without requiring the local API. Users can paste YAML or load it from an HTTP(S) URL.

## Input flow

The client presents an editable YAML field, seeded with the bundled example configuration. Rendering occurs only after parsing, schema validation, and domain validation succeed. Diagnostics retain the existing file/path/message presentation and identify the in-memory source as `pasted.yaml` or the URL.

The URL field has a Load action. It uses browser `fetch`; a remote host must permit the request with CORS. HTTP, network, invalid-URL, and YAML errors are shown in the editor diagnostics. The fetched text replaces the editor contents only after a successful response, then follows the normal validation path.

## Validation boundary

The domain validation and Zod schemas are reused in the client. A browser-safe IP-address validator replaces the Node-only `node:net` dependency. A small browser loader parses exactly one YAML document and rejects `imports`, which are intentionally out of scope.

The existing filesystem loader/API remains available for local development, but the React application no longer depends on it or its event stream.

## Verification

Unit tests cover valid combined YAML, schema/YAML diagnostics, rejected imports, and client-side validation equivalence. Client typecheck and focused tests verify the UI loader path.
