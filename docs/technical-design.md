# 技术分析与架构设计

状态：Web MVP 方案草案。Go 后端与本地应用形态参考 `agentsview`，React 前端参考 `stella/web`；前期避免引入尚未被需求证明的基础设施。

## 1. 设计约束

- 使用 Go 构建单二进制；CLI 前期只提供 `gitview serve`。
- 本地优先，默认不上传源码或 Git 历史。
- 结果可复现、可解释，允许降级但不能静默伪造精度。
- 保留未来增量缓存边界，但首个 MVP 先测量无缓存实现。
- Git 数据层、语言解析层、指标层和展示层解耦。

## 2. 建议架构

```text
gitview serve
    │
    ▼
Analysis Planner ─── filters, revision, time, exclusions
    │
    ├── Git Adapter ─── commits, diffs, rename, blame, mailmap
    ├── Source Analyzer ─── language, symbols, complexity
    ├── Lineage Engine ─── file/function identity across revisions
    └── future Cache / Index ─── commit facts, entities, associations
            │
            ▼
Metric Engine ─── MVP totals/trends；后续 ownership/hotspots/risk
    │
    ▼
HTTP API + embedded Web UI
```

架构演进时参考 `agentsview` 的领域服务边界，但不再建设分析型 CLI transport：

```text
gitview serve ── HTTP + embedded SPA ── AnalysisService ── Git Adapter
                                              │
                                              └── future Index / Analyzer
```

过滤校验、日期边界、指标计算和错误语义只能存在于 `AnalysisService` 及其下层。命令入口只管理 server 生命周期，HTTP handler 只负责传输。详细依据见 [agentsview-reference.md](./agentsview-reference.md)。

### 2.1 推荐技术栈基线

| 层次 | 推荐方案 | 采用阶段 |
| --- | --- | --- |
| 语言与运行时 | Go 1.26，单二进制 | Phase 1 起 |
| 命令入口 | `gitview serve`；先用最小依赖实现 | Phase 1 |
| 配置 | 前期不用配置文件；稳定需求出现后再选 TOML | 后续 |
| Git | 系统 Git + 内部 adapter | Phase 1 起 |
| 本地索引 | 首个 MVP 不使用；性能数据证明需要后再评估 SQLite | 后续 |
| 服务边界 | transport-neutral `AnalysisService` | Phase 1 起 |
| HTTP API | Go `net/http` + 明确的 JSON DTO；复杂度增长后再评估 Huma/OpenAPI | Phase 1–2 |
| Web UI | React 19 + TypeScript；单页 MVP 不强制完整路由体系 | Phase 1 起 |
| 服务端状态 | TanStack Query；查询键包含页面、筛选和实体 ID | Phase 4 已采用 |
| UI 与样式 | shadcn/ui + Tailwind CSS；用 CSS variables 映射 agentsview 的交互、密度与配色语义 | Phase 1 起 |
| API client | 集中在 `frontend/src/lib/api.ts` 的窄类型 client；OpenAPI 生成后置 | Phase 2–4 |
| 前端工具链 | Vite | Phase 1 起 |
| 前端交付 | `go:embed` 嵌入静态 SPA | Phase 1 起 |
| 实时进度 | 首版普通请求状态；长分析被证明需要后再加 SSE | 后续 |
| 桌面外壳 | Tauri 2 sidecar | 产品验证后 |
| Go 测试 | 标准库 testing；fixture/golden/benchmark 按需分层 | Phase 1 起 |
| 前端测试 | 首版 TypeScript/production build；交互增加后补 Vitest/Playwright | Phase 1 起 |
| 构建入口 | Makefile 统一 frontend/build/test/check；e2e/release 随需求加入 | Phase 1 起 |

SQLite 驱动暂不直接照搬。`agentsview` 使用带 FTS5 的 CGO SQLite，同时依赖复杂的跨平台构建；`gitview` 先测量无缓存实现，确有需要时再比较纯 Go 与 CGO 驱动。

shadcn/ui 初始化契约在生成首个组件前固定为：

```json
{
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks",
    "utils": "@/lib/utils"
  }
}
```

采用 `new-york` 是为了接近 agentsview 的紧凑控件密度；`neutral` 只生成基础中性色，品牌、状态和图表颜色由 gitview tokens 覆盖。Tailwind CSS v4 的 config 路径保持为空。

### 2.2 前端演进约束

UI 交互、配色和密度以本地 agentsview 为主参考；React components 使用 [shadcn/ui](https://ui.shadcn.com/docs/components)，工程组织以 [stella-web-reference.md](./stella-web-reference.md) 为参考。首个单页 MVP 只执行以下约束：

- API 调用集中在 `lib/api`，页面组件不散落 `fetch()`。
- loading、empty、error 和 ready 状态必须显式建模。
- 日期统一使用带时区 RFC3339；展示时转换为用户时区。
- 使用 shadcn/ui 推荐的 CSS variables 和 `components.json` 管理主题与组件路径，不硬编码散落的颜色、阴影和圆角。
- Svelte 和 `@kenn-io/kit-ui` 不进入 React 依赖树；基础 primitives 从 shadcn/ui 按需加入 `frontend/src/components/ui/`。
- 首版组件范围固定为 `Button`、`Card`、`Table`、`Badge`、`Tooltip`、`Progress`、`Skeleton`、`Separator`、`ScrollArea` 和 `Alert`；应用层只组合少量 shell/overview components。
- shadcn 标准 `background`、`foreground`、`card`、`muted`、`border`、`primary`、`destructive` tokens 映射 agentsview 视觉语义；额外 tokens 限于 `success`、`warning` 和 `chart-*`。
- dark mode 通过 `.dark` 覆盖同名 tokens；首版跟随系统主题，不建设主题设置页。

下列约束在增加第二个正式页面时启用：

- 使用 TanStack Router 的 file-based routing 与生成的 route tree。
- route 文件保持轻量，只处理 params、search validation、loader 和 guard；完整页面放入 `features/`。
- 非视觉 route 文件负责 loader；`.lazy.tsx` 文件负责页面组件和代码分割。
- Router context 注入共享 `QueryClient`，loader 使用 `ensureQueryData` 预热页面数据。
- API 查询统一在 `lib/queries/` 定义 `queryOptions` / `infiniteQueryOptions`。
- OpenAPI 自动生成 client 和 TanStack Query bindings，禁止业务组件手写 `fetch()`。
- 可导航状态以 URL 为唯一事实来源：repository、revision、since、until、period、path、language、group、sort、page 和 compare window 都进入 params/search。
- 状态优先级为 URL → TanStack Query cache → React Context → `useState`；`useState` 仅用于临时 UI 状态。
- `components/ui/` 放共享 primitive，`components/` 放跨功能组件，`features/` 放功能页，`layouts/` 放应用骨架。
- 使用语义化 design tokens，页面不硬编码颜色、阴影和圆角。
- 前端展示日期时转换为用户时区，API 始终使用带时区 RFC3339。

## 3. Git 数据获取

### 3.1 候选方式

1. 调用系统 `git`：语义成熟，支持 mailmap、rename、复杂 revision；依赖本机 Git。
2. 纯 Go Git 库：部署统一，但对部分 Git 行为、性能和新特性可能有差异。
3. 混合方案：首版调用系统 Git，内部定义 adapter，未来按需替换。

建议首版采用混合架构中的系统 Git adapter。关键命令应使用结构化分隔符，禁止解析面向人的默认输出。

### 3.2 必须验证的 Git 边界

- root commit 的 diff。
- merge commit 使用 first-parent、combined diff 或排除的影响。
- rename/copy detection 的性能与阈值。
- `.mailmap` 对 author/committer 的映射。
- shallow clone、replace refs、submodule、LFS、worktree。
- 非 UTF-8 文件名、带换行文件名和超大 commit。
- `--all` 造成同一 commit 重复遍历及不可达历史的范围。

## 4. 函数级分析：最大技术难点

### 4.1 当前快照解析

需要把源文件解析为统一符号模型：

```text
Symbol {
  language, kind, qualified_name, signature,
  file_path, start_line, end_line,
  structural_fingerprint, complexity
}
```

候选技术：

- Tree-sitter：多语言、增量解析、统一查询机制，适合广覆盖。
- Go 原生 `go/parser` / `go/ast`：Go 语言精度和维护体验更好。
- 各语言专用解析器或 LSP：语义更强，但部署、性能和兼容成本高。

建议首个技术验证同时比较“Go 原生 AST”和“Tree-sitter Go grammar”，再决定首版是 Go-only 做深，还是少量语言做广。

首轮实现已选择 Go 原生 `go/parser` / `go/ast`，不执行被分析仓库代码。HEAD 下的 `.go` blob 通过 Git object 读取；vendor 默认排除并产生 warning。

### 4.2 将 diff 归属到函数

对 commit 的父与子版本分别解析符号范围，将 patch hunk 的旧行映射到父符号、新行映射到子符号。文件级改动可分成：

- 函数内部修改。
- 新增/删除整个函数。
- 签名或函数边界修改。
- 函数外修改（imports、全局变量、注释等）。

不能只用当前文件行号套用历史 diff，否则函数移动后会错误归属。

当前版本为刻意简化的第一阶段：`git log -p --unified=0` 流式读取历史，将 hunk 与 HEAD 函数范围重叠归属，并对全部结果标记 `probable`。这适合发现候选热点和查看证据，但不宣称跨移动/重命名精确；父子 blob 双解析与 lineage engine 仍是升级到 `exact` 的前置条件。

### 4.3 函数 lineage

按以下证据由强到弱匹配父子 revision 中的函数：

1. 同路径 + 同限定名 + 同签名。
2. Git 文件 rename + 同限定名或结构指纹。
3. 语法树结构指纹 / token similarity。
4. 内容相似度 + 邻域上下文。

匹配结果记录置信度。函数拆分/合并属于多对多 lineage，首版可以标记断点而不强行连接。

### 4.4 复杂度

首版优先 cyclomatic complexity，并保留按语言扩展的接口。不同语言的复杂度值不应直接进行无归一化横向排名。

## 5. 数据模型草案

建议用内容寻址和 schema version 支持缓存失效：

- Repository：仓库标识、object format、配置摘要。
- Commit：OID、parents、author、committer、时间、message 摘要。
- Person / Identity：归一化人员和原始身份。
- FileChange：old/new path、status、additions、deletions、binary。
- SymbolSnapshot：某 blob 中的函数/类型及结构信息。
- SymbolLineage：跨 commit 的实体关系与置信度。
- EntityChange：commit、entity、change type、line stats。
- MetricSnapshot：指标版本、窗口、过滤器、构成项。

缓存候选为 SQLite：单文件、支持索引与事务，适合增量查询。是否引入 CGO 必须在选型时明确；可评估纯 Go SQLite 实现。

参考 `agentsview`，需要把两类版本分开：

- Schema migration version：表和索引的非破坏性迁移。
- Analysis data version：解析器、lineage 或指标语义改变，需要重建派生数据。

原始 Git 对象不可被缓存迁移破坏。重建策略应创建新索引、完成同步和校验后原子替换，而不是删除用户唯一缓存后原地重跑。

## 6. 性能策略

- 一次遍历输出 commit metadata 与 numstat，减少进程启动。
- 按 blob OID 缓存解析结果；相同内容不重复解析。
- 仅解析 patch 涉及的父/子 blob，不为每个 commit checkout 工作树。
- 新 commit 增量入库；配置、解析器或 schema 改变时精确失效。
- worker pool 并行解析 blob，但 Git 对象读取和内存设置上限。
- 大结果流式输出，支持 context cancel。
- 先做 benchmark fixture，再承诺性能目标。

建议建立三档样本：小型（<1k commits）、中型（10k–100k）、大型 monorepo（>100k），分别记录冷启动、热缓存、内存峰值和数据库大小。

## 7. 配置草案

仓库配置建议使用 `.gitview.yaml` 或 `.gitview.toml`，待评估标准库负担后决定。核心配置包括：

- 默认时区和使用 author/committer time。
- include/exclude path 与语言。
- generated/vendor/bot 规则。
- 身份 aliases 与 `.mailmap` 开关。
- merge、rename、whitespace 策略。
- ownership 窗口和热点权重。

每次报告计算配置摘要，保证缓存正确性与结果可复现。

## 8. HTTP 输出与兼容性

- 当前 API 提供 health、Overview、Contributor、文件 Hotspots/Ownership、Go Functions、Compare 和 Explain 所需 JSON，不承诺通用导出格式。
- JSON 顶层包含 `schema_version`、`analysis_context`、`warnings`、`data`，为页面演进保留兼容边界。
- `serve` 启动失败使用非零 exit code；页面查询错误通过 HTTP status 与稳定 error code 表达。
- 部分语言失败时返回带 warnings 的可用报告；核心 Git 读取失败才整体失败。
- HTTP handler 与 service 的契约测试必须证明错误和 warnings 不被展示层改写。
- API 扩大到多个页面后，再评估由 OpenAPI 生成 TypeScript client，避免首个切片先承担生成链维护成本。

## 9. 安全与隐私

- 默认离线，不执行仓库内代码和 hooks。
- 不 checkout 或构建被分析项目。
- 外部 Git 参数必须作为独立 argv 传递，禁止 shell 拼接。
- 缓存可能包含姓名、邮箱、commit message，应允许禁用、清理和指定位置。
- 未来远程平台集成必须显式授权并最小化 token 权限。

## 10. 分阶段技术验证

1. 先验证 `serve` 生命周期、静态资源嵌入和 SPA fallback。
2. 用真实仓库验证 Git 基础总计、按月统计和 `.mailmap` 身份归一化。
3. 用 fixture 固化 merge、root commit、rename、二进制文件和空仓库行为。
4. 对 10k+ commit 仓库测量无缓存分析，再决定是否需要 SQLite。
5. 函数页进入实现前，再比较 Tree-sitter 与 Go AST，并验证 lineage fixture。
