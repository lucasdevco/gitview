# gitview

[English](./README.md) | [简体中文](./README.zh-CN.md)

Explore contribution history, code hotspots, ownership, and function evolution in any local Git repository. One binary, no account, everything stays local.

> **Status:** gitview is currently a Web MVP under active development.

## Why gitview?

Git contains more than a commit list. It can help answer practical maintenance questions:

- Who understands this area of the codebase?
- Which files change often and carry concentrated ownership risk?
- What caused a spike in activity during a particular month?
- How has a function evolved, and which commits shaped it?
- Where should a maintainer or new contributor start reading?

gitview turns local Git history into a focused web interface. It is designed for understanding and maintaining projects—not for ranking individual developer performance.

## Features

- **Repository overview** — commits, contributors, additions, deletions, churn, monthly trends, and recent activity.
- **Contributor details** — activity timeline, primary paths, and the commits behind each contributor's history.
- **File hotspots** — find frequently changed files using an explicit score based on change frequency and churn.
- **Code ownership** — inspect historical owners, recent maintainers, contribution share, and estimated bus factor.
- **Function history** — browse functions, complexity, hotspots, contributors, and probable change history across Go, JavaScript/TypeScript, Python, Java, and Rust.
- **Branches and commits** — inspect branch state, working-tree changes, commit metadata, and diffs.
- **Revision comparison** — compare two Git revisions across totals, contributors, files, and commits.
- **Monthly explanation** — explain activity changes through the contributors, paths, and commits that drove them.
- **Focused filtering** — narrow analysis by author date and repository path; filters are preserved in the URL.
- **English and Simplified Chinese UI**.

## Quick Start

### Requirements

- Go 1.26+
- Node.js 20.19+ or 22.12+
- Git
- A C compiler for the Tree-sitter Go bindings

### Build from source

```bash
git clone https://github.com/lucasdevco/gitview.git
cd gitview
cd frontend && npm ci && cd ..
make build
```

`make build` compiles the React frontend, embeds it into the Go binary, and creates `./gitview`.

### Analyze a repository

```bash
# Analyze the current repository
./gitview

# Analyze another local repository
./gitview /path/to/repository

# Use a different port
./gitview --port 9090 /path/to/repository
```

`gitview` is shorthand for `gitview serve` (alias `gitview s`). Open [http://127.0.0.1:8080](http://127.0.0.1:8080). Pass `--port 0` to let the operating system choose an available port.

gitview intentionally listens on loopback only. It does not expose a `--host` option.

## How It Works

gitview reads repository metadata and history through the system Git executable, calculates analysis results in memory, and serves an embedded React application from the same binary.

- Repository code, hooks, and build scripts are not executed.
- No account or external service is required.
- Repository data stays on the local machine.
- Analysis results distinguish direct Git facts from derived or approximate metrics.

## Current Limitations

- Function-level analysis supports Go, JavaScript/TypeScript, Python, Java, and Rust; other languages fall back to file-level analysis.
- Function history is marked `probable`; moves, renames, and boundary changes may not be tracked precisely.
- Analysis focuses on history reachable from the selected branch or revision.
- There is no persistent index, background watcher, multi-repository mode, or GitHub/GitLab integration yet.
- JSON/CSV export and static reports are not yet available.

See the [roadmap](./docs/roadmap.md) for planned work.

## Development

Run the backend and frontend separately for local development:

```bash
# Terminal 1: start the Go API server
go run ./cmd/gitview serve /path/to/repository

# Terminal 2: start Vite with /api proxied to 127.0.0.1:8080
cd frontend
npm run dev
```

For automatic rebuilds after source changes:

```bash
make watch
```

Useful checks:

```bash
make test
make check
```

## Project Layout

```text
cmd/gitview/        CLI entry point and server lifecycle
internal/gitrepo/   System Git adapter
internal/overview/  Repository, contributor, file, ownership, and comparison analysis
internal/function/  Tree-sitter function parsing and history analysis
internal/server/    Local HTTP API and SPA delivery
internal/web/       Embedded frontend assets and backend-only fallback
frontend/           React, TypeScript, Vite, Tailwind CSS, and shadcn/ui application
docs/               Product requirements, metric definitions, architecture, and roadmap
```

## Documentation

- [Documentation index](./docs/README.md)
- [Product requirements](./docs/product-requirements.md)
- [Metric definitions](./docs/metrics.md)
- [Technical design](./docs/technical-design.md)
- [UI interactions](./docs/ui-interaction.md)
- [Roadmap](./docs/roadmap.md)
- [Open questions and decisions](./docs/open-questions.md)

## Acknowledgements

The product structure and local-first presentation were inspired by [agentsview](https://github.com/kenn-io/agentsview).
