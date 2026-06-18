<div align="center">

# okfview

**A desktop viewer for [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundles, with live sync, graph navigation, full-text search, and MCP access for coding agents.**

[![CI](https://github.com/ryansann/okfview/actions/workflows/ci.yml/badge.svg)](https://github.com/ryansann/okfview/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ryansann/okfview?sort=semver)](https://github.com/ryansann/okfview/releases)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![OKF](https://img.shields.io/badge/OKF-v0.1-2ea44f)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
[![MCP](https://img.shields.io/badge/MCP-enabled-5f43b2)](docs/okf/reference/mcp-tools.md)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)
![Built with: Electron + TypeScript](https://img.shields.io/badge/built%20with-Electron%20%2B%20TypeScript-2ea44f)

</div>

<!-- Demo video: add a GitHub asset URL or committed media here once curated. -->

## What is okfview?

[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) is
Google Cloud's open standard for representing knowledge as a directory of Markdown files
with YAML frontmatter. **okfview** is the developer tool for working with it: open any
bundle, read it through a polished UI, watch it update live as files change, and let your
coding agents browse it over the Model Context Protocol.

## Features

- **Document view** - rendered Markdown with frontmatter, schema tables, citations, outgoing links, and backlinks.
- **Graph view** - an interactive concept graph, colored by type, with click-to-navigate links.
- **Command palette** - full-text search (`Cmd+K` / `Ctrl+K`) across every open bundle, including body text.
- **Local and remote sources** - open a folder, git repo (`...repo.git#subpath`), or `.tar.gz` URL.
- **Live sync** - file edits appear instantly without losing your place; remote sources poll for updates.
- **MCP server** - expose scoped bundles to coding agents so they can browse, search, and validate OKF.
- **Diagnostics** - OKF v0.1 conformance issues are surfaced, never enforced.
- **Persistence** - open bundles auto-restore; recent bundles and aliases are remembered.

## Install (macOS)

Download the latest `.dmg` (arm64 or x64) from the
[**Releases**](https://github.com/ryansann/okfview/releases) page and drag okfview to
Applications.

Current public builds are ad-hoc signed but not notarized. If macOS blocks the first
launch, right-click okfview and choose **Open**. See [Security](SECURITY.md#packaging-and-macos-signing)
for details.

Other platforms can [build from source](CONTRIBUTING.md).

## Quick start

1. **Open a bundle** - click **Open folder...** and pick an OKF directory (try this repo's own [`docs/okf/`](docs/okf/index.md)).
2. **Explore** - read in the document view, switch to the graph, press `Cmd+K` / `Ctrl+K` to search.
3. **Connect an agent** - in **Settings > Agents (MCP)**, enable the server and share a bundle, then:

   ```bash
   claude mcp add --transport http okfview http://127.0.0.1:7331/mcp
   ```

## Documentation

okfview documents itself **in the format it views**: the docs are a native, conformant OKF
bundle at [**`docs/okf/`**](docs/okf/index.md); open it in the app to browse the
architecture, features, reference, and design decisions as a graph.

- [Architecture](docs/okf/architecture/index.md)
- [Features](docs/okf/features/index.md)
- [Reference](docs/okf/reference/index.md)
- [Decisions](docs/okf/decisions/index.md)
- [MCP tools reference](docs/okf/reference/mcp-tools.md)
- [DESIGN.md](DESIGN.md)

## Contributing

okfview is open source and contributions are welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, the repo layout, and the PR flow. Please
also review the [Code of Conduct](CODE_OF_CONDUCT.md), [Security Policy](SECURITY.md), and
[Support guide](SUPPORT.md).

## License

[Apache-2.0](LICENSE), matching the OKF ecosystem.
