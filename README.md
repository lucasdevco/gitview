# gitview

[English](./README.md) | [简体中文](./README.zh-CN.md)

A Sourcetree-style Git client that runs in your browser. gitview pairs a familiar desktop-class Git workbench—commit graph, staging area, branches, diffs, and conflict resolution—with Git plumbing modeled on [lazygit](https://github.com/jesseduffield/lazygit)'s battle-tested approach. One binary, no account, everything stays local.

> **Status:** early development, mid-rewrite. The workbench shell (title bar, sidebar, current branch) works today; the views and write operations (stage, commit, branch, merge, rebase, push) are being built. See [ADR-0001](./docs/adr/0001-read-write-git-workbench.md) for the architecture.

## Why gitview?

- **Sourcetree's workflow, without the desktop install** — a visual Git client served from a single local binary and opened in any browser.
- **lazygit's Git engine** — every operation shells out to your system `git` with structured output, the same proven model lazygit uses, so behavior matches the command line, your config, hooks, and credentials.
- **Local-first** — listens on loopback only; your repository never leaves your machine.

## Features

### Available now

- **Workbench shell** — Sourcetree-style title bar and sidebar for a real repository, showing its name and current branch; empty repositories open too.
- **Local security** — loopback only, a per-run access token, and Host/Origin checks on every API request.
- **Simplified Chinese UI**.

### In progress

- Commit graph with all branches and lazy-loaded details.
- Multiple repositories in tabs, with bookmarks.
- Staging and unstaging by file, hunk, or line; commit and amend.
- Checkout, create, rename, and delete branches; tags; stash.
- Fetch, pull, and push with progress and credential prompts.
- Merge, rebase, cherry-pick, and revert with a conflict resolution view.
- Interactive rebase and reflog-based undo.
- Live refresh when the repository changes outside gitview.

## Quick Start

### Requirements

- Go 1.26+
- Node.js 20.19+ or 22.12+
- Git 2.32.0 or newer (gitview checks at startup and exits with upgrade advice if it is older)

### Build from source

```bash
git clone https://github.com/lucasdevco/gitview.git
cd gitview
cd frontend && npm ci && cd ..
make build
```

`make build` compiles the React frontend, embeds it into the Go binary, and creates `./gitview`.

### Open a repository

```bash
# Open the current repository
./gitview

# Open another local repository
./gitview /path/to/repository

# Use a different port
./gitview --port 9090 /path/to/repository
```

`gitview` is shorthand for `gitview serve` (alias `gitview s`). It prints a URL such as `http://127.0.0.1:8080/?token=…`; open that exact URL. The token is generated fresh on every run and every API request must carry it, so other web pages cannot use your browser to reach the workbench. Pass `--port 0` to let the operating system choose an available port.

gitview intentionally listens on loopback only. It does not expose a `--host` option.

## How It Works

gitview runs your system `git` with structured output formats, parses the results in Go, and serves an embedded React application from the same binary.

- No account or external service is required; repository data stays on the local machine.
- Write operations (stage, unstage, commit) behave like the `git` command line, including running repository hooks such as `pre-commit` and `commit-msg`; a failing hook's output is shown, and the commit options can skip hooks (`--no-verify`).
- Writes to a repository run one at a time, and every git command they run is listed in the command log bar at the bottom of the workbench.
- The local server requires the per-run token and rejects non-loopback `Host` headers (DNS rebinding) and cross-origin requests. Write operations accept only `POST` requests with a JSON body.

## Development

Run the backend and frontend separately for local development:

```bash
# Terminal 1: start the Go API server
go run ./cmd/gitview serve /path/to/repository

# Terminal 2: start Vite with /api proxied to 127.0.0.1:8080
cd frontend
npm run dev
```

Open the Vite page with the token from terminal 1, for example `http://127.0.0.1:4173/?token=…`.

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
internal/git/       Execution layer: Runner, command builder, environment, error kinds, version check
internal/repo/      Repository discovery; repo/query reads repository state
internal/workspace/ Open repositories and their IDs (/api/v1/repos/{repoId})
internal/server/    Local HTTP API, token and Host/Origin checks, SPA delivery
internal/gittest/   Real temporary repositories for tests
internal/web/       Embedded frontend assets and backend-only fallback
frontend/           React, TypeScript, Vite, Tailwind CSS, and shadcn/ui application
docs/adr/           Architecture decision records
```

## Documentation

- [ADR-0001: Evolving into a read-write Git workbench](./docs/adr/0001-read-write-git-workbench.md)

## Acknowledgements

- [lazygit](https://github.com/jesseduffield/lazygit) — the reference for how gitview drives Git: command building, state detection, interactive rebase, patch staging, and undo.
- [Sourcetree](https://www.sourcetreeapp.com/) — the inspiration for the workbench layout and interaction model. gitview is an independent project and is not affiliated with or endorsed by Atlassian.
- [agentsview](https://github.com/kenn-io/agentsview) — inspiration for the local-first presentation.
