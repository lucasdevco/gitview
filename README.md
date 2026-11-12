# gitview

[English](./README.md) | [简体中文](./README.zh-CN.md)

A Sourcetree-style Git client that runs in your browser. gitview pairs a familiar desktop-class Git workbench—commit graph, staging area, branches, diffs, merges, and stashes—with Git plumbing modeled on [lazygit](https://github.com/jesseduffield/lazygit)'s battle-tested approach. One binary, no account, everything stays local.

> **Status:** early development. The workbench covers the everyday Git workflow for one repository: stage, commit, branch, merge, stash, fetch, pull, and push. See [ADR-0001](./docs/adr/0001-read-write-git-workbench.md) for the architecture.

## Why gitview?

- **Sourcetree's workflow, without the desktop install** — a visual Git client served from a single local binary and opened in any browser.
- **lazygit's Git engine** — every operation shells out to your system `git` with structured output, the same proven model lazygit uses, so behavior matches the command line, your config, hooks, and credentials.
- **Local-first** — listens on loopback only; your repository never leaves your machine.

## Features

- **Workbench** — Sourcetree-style title bar with badges (pending files, commits to pull and push), a sidebar with the branch tree (ahead/behind counts), tags, remotes, and stashes plus a name filter, resizable panels, light and dark themes that follow the system, and a Simplified Chinese UI. Empty repositories open too.
- **File status** — staged and unstaged files with status icons (added, modified, deleted, renamed, untracked, conflicted); stage or unstage files, whole groups, or single hunks, and discard hunks after a confirmation. Diffs show hunk headers and old/new line numbers, support text search, and flag binary or oversized files instead of rendering them.
- **Commit** — your commit identity, multi-line messages, amend (更正上一次提交), skip hooks (`--no-verify`), and push right after committing. A failing hook's output is shown.
- **History** — the full commit graph with colored lanes in a virtualized list that stays smooth on large repositories; branch, remote-branch, and tag labels; an 未提交的更改 row for working-tree changes; all branches or the current branch, with or without remote branches; jump to a branch; search commits by message, author, or hash prefix.
- **Commit details** — subject, body, hash, parents (click to follow), author, dates, refs, the changed files (renames shown as renames), and each file's diff.
- **Branches** — check out (double-click), create from the working copy or a given commit with live name validation, rename, delete one or several (force delete for unmerged branches), and set the tracked remote branch. The right-click menu offers checkout, merge, rebase, 拿来 (fast-forward a branch without checking it out), push, track remote branch, rename, delete, and copy the branch name.
- **Merge and rebase** — merge a branch into the current one (commit immediately or not, include merged commit messages, always create a merge commit) or rebase onto it. On conflicts the workbench shows 合并中 / 变基中 with the conflicted files and lets you mark them resolved, finish the merge commit, or abort.
- **Stash** — stash with an optional message and keep staged changes if you like; browse stashes with their files and diffs; apply or delete them.
- **Fetch, pull, and push** — fetch one or all remotes (prune, tags); pull a remote branch with merge options or rebase; push several branches at once, set up tracking, and push all tags. These run as background jobs with progress and cancel, and ask for credentials in the browser when a remote needs them. A rejected push is explained with advice to pull first.
- **Live refresh** — changes made outside gitview (terminal, editor, other tools) appear within seconds, without flicker while gitview's own writes run.
- **Traceable commands** — every dialog previews the git command it will run, and the command log bar at the bottom lists every git command gitview's writes ran. Failures show git's own output with advice.

### Not yet

- Multiple repositories in tabs, with bookmarks.
- Interactive rebase, cherry-pick, revert, line-by-line staging, reflog-based undo, and a conflict resolution editor (continue a stopped rebase on the command line for now).
- Creating or deleting tags; submodules and subtrees.
- Comparing branches, and the 显示远程服务器, 在 Finder 中显示, and 设置 buttons.

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

`gitview` is shorthand for `gitview serve` (alias `gitview s`). It prints a URL such as `http://127.0.0.1:8080/?token=…`; open that exact URL. The token is generated fresh on every run (see [Security](#security)). Pass `--port 0` to let the operating system choose an available port.

## How It Works

gitview runs your system `git` with structured output formats, parses the results in Go, and serves an embedded React application from the same binary.

- No account or external service is required; repository data stays on the local machine.
- Reads run concurrently. Writes to a repository run one at a time, and a brief `index.lock` conflict with another tool is retried automatically.
- Fetch, pull, and push run as background jobs that report git's progress and can be canceled.
- gitview watches the repository's git directory and polls the working tree while the page is visible, so the workbench follows changes made elsewhere.

## Security

gitview can change your repositories, so it treats every request as a potential attack from another web page or process.

- **Loopback only.** The server listens on `127.0.0.1` only and has no `--host` option.
- **Per-run token.** Every API request must carry the token from the printed URL. The page removes it from the address bar after loading, so it is not bookmarked or shared by accident.
- **Host and Origin checks.** Requests whose `Host` is not a loopback address (DNS rebinding) and cross-origin requests are rejected. Write operations accept only `POST` requests with a JSON body.
- **Hooks run.** Write operations behave like the `git` command line, including running repository hooks such as `pre-commit`, `commit-msg`, `post-checkout`, and `pre-push`. A failing hook's output is shown, and the commit options can skip hooks (`--no-verify`). Open only repositories you would trust running `git` in.
- **Credential prompts.** When a remote asks for a user name, password, SSH passphrase, or host-key confirmation, git and ssh run gitview itself as `GIT_ASKPASS` / `SSH_ASKPASS`. This helper sends the prompt to `POST /api/v1/askpass` on the loopback address with a secret that belongs to the running job and stops working when the job ends; the session token is never handed to git, ssh, or hooks. The browser shows the prompt (passwords are typed hidden), and the answer is passed back to git. gitview never writes credentials to disk, the command log, job records, or events; a prompt nobody answers is declined after five minutes. If you configured a git credential helper (`credential.helper`), git may store credentials there, as it does on the command line.
- Passwords written into remote URLs are redacted before they reach the browser.

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
cmd/gitview/        CLI entry point and server lifecycle; also runs as the credential helper
internal/git/       Execution layer: Runner, command builder, environment, error kinds, progress, version check
internal/repo/      Repository discovery; repo/query reads repository state, repo/ops writes it
internal/workspace/ Open repositories: write lock, command log, change detection, events, jobs, credential prompts
internal/askpass/   Credential helper that forwards git and ssh prompts to the browser
internal/server/    Local HTTP API and event stream, token and Host/Origin checks, SPA delivery
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
