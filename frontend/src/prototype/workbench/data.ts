// PROTOTYPE — throwaway mock data for the Sourcetree-style workbench prototype.
// Nothing here talks to the backend; everything lives in memory.

export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "untracked"

export type ChangedFile = {
  path: string
  status: FileStatus
  additions: number
  deletions: number
  diff: string
}

export type Commit = {
  oid: string
  parents: string[]
  subject: string
  body?: string
  author: string
  email: string
  date: Date
  files: ChangedFile[]
}

export type Stash = { name: string; message: string; files: ChangedFile[] }

export type RepoState = {
  name: string
  path: string
  remoteUrl: string
  currentBranch: string
  commits: Commit[]
  branches: Record<string, string>
  remoteBranches: Record<string, string>
  upstream: Record<string, string>
  tags: Record<string, string>
  stashes: Stash[]
  staged: ChangedFile[]
  unstaged: ChangedFile[]
  commandLog: string[]
}

let hashCounter = 0
export function fakeHash(seed: string): string {
  hashCounter += 1
  let h = 2166136261
  const input = `${seed}:${hashCounter}`
  let out = ""
  while (out.length < 40) {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i) + out.length
      h = Math.imul(h, 16777619) >>> 0
    }
    out += h.toString(16).padStart(8, "0")
  }
  return out.slice(0, 40)
}

function makeDiff(path: string, status: FileStatus, added: string[], removed: string[], context: string[]): string {
  const oldPath = status === "added" || status === "untracked" ? "/dev/null" : `a/${path}`
  const newPath = status === "deleted" ? "/dev/null" : `b/${path}`
  const oldCount = removed.length + context.length
  const newCount = added.length + context.length
  const lines = [
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    `@@ -${oldCount ? 12 : 0},${oldCount} +${newCount ? (oldCount ? 12 : 1) : 0},${newCount} @@`,
  ]
  const head = context.slice(0, 2)
  const tail = context.slice(2)
  for (const line of head) lines.push(` ${line}`)
  for (const line of removed) lines.push(`-${line}`)
  for (const line of added) lines.push(`+${line}`)
  for (const line of tail) lines.push(` ${line}`)
  return lines.join("\n")
}

function file(path: string, status: FileStatus, added: string[], removed: string[] = [], context: string[] = []) {
  return {
    path,
    status,
    additions: added.length,
    deletions: removed.length,
    diff: makeDiff(path, status, added, removed, context),
  }
}

const goContext = ["func (s *Server) routes() {", "\tmux := http.NewServeMux()", "\treturn mux", "}"]
const tsContext = ['import { cn } from "@/lib/utils"', "", "export function render() {", "}"]

function genericFiles(seed: number, subject: string): ChangedFile[] {
  const pool = [
    () =>
      file(
        "internal/server/server.go",
        "modified",
        [
          '\tmux.HandleFunc("GET /api/v1/repos/{id}/log", s.log)',
          '\tmux.HandleFunc("GET /api/v1/repos/{id}/status", s.status)',
        ],
        ['\tmux.HandleFunc("GET /api/v1/overview", s.overview)'],
        goContext,
      ),
    () =>
      file(
        "frontend/src/workbench/history.tsx",
        "modified",
        [
          "  const rows = useMemo(() => layoutGraph(commits), [commits])",
          '  return <CommitTable rows={rows} density="compact" />',
        ],
        ["  return <CommitTable rows={commits} />"],
        tsContext,
      ),
    () =>
      file("internal/git/runner.go", "added", [
        "package git",
        "",
        "// Runner executes git with a fixed environment.",
        "type Runner interface {",
        "\tRun(ctx context.Context, args ...string) ([]byte, error)",
        "}",
      ]),
    () => file("README.md", "modified", [`- ${subject}`], ["- TODO"], ["## Features", "", "## Quick Start", ""]),
    () =>
      file(
        "internal/repo/query/log.go",
        "modified",
        ['\t\t"--format=%H%x00%P%x00%aN%x00%aE%x00%at%x00%D%x00%s",'],
        ['\t\t"--format=%H%x1f%aN%x1f%s",'],
        ["\targs := []string{", '\t\t"log",', '\t\t"--topo-order",', "\t}"],
      ),
    () =>
      file(
        "internal/legacy/overview.go",
        "deleted",
        [],
        ["package legacy", "", "// Deprecated: replaced by workbench."],
      ),
  ]
  const count = 1 + (seed % 3)
  return Array.from({ length: count }, (_, i) => {
    const make = pool[(seed + i * 2) % pool.length]
    return make ? make() : file("unknown", "modified", [])
  })
}

type Seed = { id: string; parents: string[]; subject: string; author: number; hoursAgo: number; files?: ChangedFile[] }

const authors = [
  { name: "Neil", email: "neil@example.com" },
  { name: "Lin Wei", email: "lin.wei@example.com" },
  { name: "Mia Chen", email: "mia@example.com" },
]

const seeds: Seed[] = [
  { id: "c21", parents: ["c19"], subject: "fix(server): 远程仓库上的热修复", author: 1, hoursAgo: 1 },
  { id: "c20", parents: ["c19"], subject: "feat(toolbar): 顶部操作栏原型", author: 0, hoursAgo: 2 },
  { id: "c19", parents: ["c17"], subject: "fix(graph): 合并节点颜色与父泳道一致", author: 0, hoursAgo: 5 },
  { id: "c18", parents: ["c16"], subject: "wip: 泳道计算结果缓存", author: 1, hoursAgo: 9 },
  {
    id: "c17",
    parents: ["c15", "c14"],
    subject: "Merge branch 'neil/fix/diff-viewer'",
    author: 0,
    hoursAgo: 20,
    files: [],
  },
  { id: "c16", parents: ["c13"], subject: "feat(graph): 泳道布局算法", author: 1, hoursAgo: 26 },
  { id: "c15", parents: ["c12"], subject: "docs: 更新 README 项目定位", author: 0, hoursAgo: 30 },
  { id: "c14", parents: ["c11"], subject: "feat(diff): 行号与 hunk 头渲染", author: 2, hoursAgo: 34 },
  { id: "c13", parents: ["c12"], subject: "feat(graph): 提交图数据结构", author: 1, hoursAgo: 48 },
  { id: "c12", parents: ["c10"], subject: "chore: 升级前端依赖", author: 0, hoursAgo: 60 },
  { id: "c11", parents: ["c10"], subject: "feat(diff): 统一 diff 解析器", author: 2, hoursAgo: 70 },
  { id: "c10", parents: ["c09"], subject: "release: v0.1.0", author: 0, hoursAgo: 96 },
  {
    id: "c09",
    parents: ["c08", "c07"],
    subject: "Merge branch 'hotfix/port-in-use'",
    author: 0,
    hoursAgo: 100,
    files: [],
  },
  { id: "c08", parents: ["c06"], subject: "feat(server): 本地 HTTP 服务", author: 0, hoursAgo: 120 },
  { id: "c07", parents: ["c06"], subject: "fix: 端口被占用时给出明确提示", author: 2, hoursAgo: 124 },
  { id: "c06", parents: ["c05"], subject: "feat(cli): serve 子命令", author: 0, hoursAgo: 150 },
  { id: "c05", parents: ["c04"], subject: "feat: 分支列表", author: 1, hoursAgo: 180 },
  { id: "c04", parents: ["c03"], subject: "feat: 工作区状态", author: 1, hoursAgo: 200 },
  { id: "c03", parents: ["c02"], subject: "build: 前端资源嵌入二进制", author: 0, hoursAgo: 240 },
  { id: "c02", parents: ["c01"], subject: "feat: React 前端骨架", author: 2, hoursAgo: 300 },
  { id: "c01", parents: [], subject: "Initial commit", author: 0, hoursAgo: 360 },
]

export function createInitialState(): RepoState {
  const now = Date.now()
  const ids = new Map(seeds.map((seed) => [seed.id, fakeHash(seed.id)]))
  const oid = (id: string) => ids.get(id) ?? id
  const commits: Commit[] = seeds.map((seed, index) => {
    const author = authors[seed.author] ?? { name: "Unknown", email: "" }
    return {
      oid: oid(seed.id),
      parents: seed.parents.map(oid),
      subject: seed.subject,
      body: seed.parents.length > 1 ? undefined : "原型数据：提交说明正文。\n\n第二段用于展示多行消息。",
      author: author.name,
      email: author.email,
      date: new Date(now - seed.hoursAgo * 3600_000),
      files: seed.files ?? genericFiles(index, seed.subject),
    }
  })

  return {
    name: "gitview",
    path: "~/Code/opensource/gitview",
    remoteUrl: "git@example.com:team/gitview.git",
    currentBranch: "main",
    commits,
    branches: {
      main: oid("c20"),
      "neil/feat/commit-graph": oid("c18"),
      "neil/feat/workbench-toolbar": oid("c16"),
      "neil/fix/diff-viewer": oid("c14"),
      "mia/fix/port-in-use": oid("c07"),
    },
    remoteBranches: {
      "origin/HEAD": oid("c21"),
      "origin/main": oid("c21"),
      "origin/neil/fix/diff-viewer": oid("c14"),
      "origin/neil/feat/commit-graph": oid("c16"),
      "origin/lin/feat/graph-cache": oid("c13"),
    },
    upstream: {
      main: "origin/main",
      "neil/feat/commit-graph": "origin/neil/feat/commit-graph",
      "neil/fix/diff-viewer": "origin/neil/fix/diff-viewer",
    },
    tags: { "v0.1.0": oid("c10") },
    stashes: [
      {
        name: "stash@{0}",
        message: "WIP on main: 实验暗色主题",
        files: [
          file(
            "frontend/src/index.css",
            "modified",
            ["  --background: oklch(0.14 0.01 255);"],
            ["  --background: oklch(0.16 0.012 255);"],
            ["", ".dark {", "}", ""],
          ),
        ],
      },
    ],
    staged: [
      file("frontend/src/workbench/toolbar.tsx", "added", [
        'import { ArrowDown, ArrowUp } from "lucide-react"',
        "",
        "export function Toolbar() {",
        '  return <nav aria-label="仓库操作" />',
        "}",
      ]),
    ],
    unstaged: [
      file(
        "internal/server/server.go",
        "modified",
        ['\tmux.HandleFunc("POST /api/v1/repos/{id}/operations/commit", s.commit)'],
        [],
        goContext,
      ),
      file(
        "frontend/src/workbench/sidebar.tsx",
        "modified",
        ['      <SidebarSection title="贮藏" items={stashes} />', '      <SidebarSection title="子模块" items={[]} />'],
        ['      <SidebarSection title="Stashes" items={stashes} />'],
        tsContext,
      ),
      file("docs/notes.md", "untracked", ["# 原型笔记", "", "- 工具栏按钮顺序参考 Sourcetree"]),
    ],
    commandLog: [],
  }
}

export function lookupCommit(state: RepoState, oid: string): Commit | undefined {
  return state.commits.find((commit) => commit.oid === oid)
}

export function aheadBehind(state: RepoState, branch: string): { ahead: number; behind: number } {
  const local = state.branches[branch]
  const upstreamName = state.upstream[branch]
  const remote = upstreamName ? state.remoteBranches[upstreamName] : undefined
  if (!local || !remote) return { ahead: 0, behind: 0 }
  const reach = (start: string) => {
    const seen = new Set<string>()
    const stack = [start]
    while (stack.length) {
      const next = stack.pop()
      if (!next || seen.has(next)) continue
      seen.add(next)
      for (const parent of lookupCommit(state, next)?.parents ?? []) stack.push(parent)
    }
    return seen
  }
  const localSet = reach(local)
  const remoteSet = reach(remote)
  let ahead = 0
  let behind = 0
  for (const oid of localSet) if (!remoteSet.has(oid)) ahead++
  for (const oid of remoteSet) if (!localSet.has(oid)) behind++
  return { ahead, behind }
}
