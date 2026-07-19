# agentsview 参考架构分析

状态：草案
分析基线：`agentsview` main 分支，commit `fcddf715`（2026-07-18）
本地参考路径：同级目录 `../agentsview`（仅作为开发期设计参考，不进入产品输出）

## 1. 结论

`gitview` 应将 `agentsview` 作为主要工程与 UI 参考，但复用的是架构模式、交互、配色语义、视觉密度和质量标准，不是完整复制依赖与功能范围。React 基础组件统一使用 shadcn/ui。

最值得采用的主线是：

```text
Cobra CLI
    │
    ├── direct transport ──┐
    │                      ├── 统一领域 Service
    └── HTTP transport ────┘          │
                                      ▼
增量分析 Engine ─────────────── SQLite 本地索引
                                      │
                                      ▼
                       Huma/OpenAPI HTTP Server
                                      │
                                      ▼
                    嵌入式 React + TanStack SPA
                                      │
                                      ▼
                           可选 Tauri 桌面外壳
```

这与 `gitview` 很匹配：`gitview serve` 负责本地启动与生命周期，贡献趋势、函数历史、ownership 与热点通过高密度 Web UI 探索。前期不复制 agentsview 的分析型 CLI 命令。

## 2. agentsview 的技术栈地图

| 领域 | agentsview 实现 | gitview 参考价值 |
| --- | --- | --- |
| 后端 | Go 1.26 | 高：单二进制、并发与跨平台适合本地分析 |
| CLI | Cobra + pflag，命令分组、自定义 exit code | 高：命令规模增长后仍可导航、可测试 |
| 配置 | TOML、环境变量和 flags 分层覆盖 | 高：团队可提交统一分析口径 |
| 主存储 | SQLite + WAL + FTS5 | 高：本地索引与增量查询；gitview 暂不需要 FTS |
| 同步 | 文件发现、增量解析、skip cache、周期与 watcher | 高：映射为 Git object/commit 增量分析 |
| 领域边界 | `SessionService` 同时有 direct 和 HTTP backend | 极高：保证 CLI 和 UI 指标一致 |
| HTTP | 标准库 server + Huma v2 | 高：类型化路由、OpenAPI 和错误契约 |
| 前端 | agentsview 使用 Svelte 5；gitview 不采用 | 高：参考交互、配色与密度，用 shadcn/ui 组合 React 等价行为 |
| 前端交付 | `go:embed` 内嵌构建产物 | 高：仍保持一个 Go 可执行文件 |
| 实时更新 | SSE broadcaster，慢消费者不阻塞生产者 | 高：适合长耗时分析的进度与结果刷新 |
| 桌面 | Tauri 2 启动 Go sidecar | 中：成熟后提升安装体验，首版不需要 |
| 可选存储 | PostgreSQL、DuckDB | 低：多机与分析仓库需求尚未成立 |
| 语义搜索 | 独立 vector index | 低：与 gitview 当前核心问题无关 |
| 测试 | Go 单元/集成/契约、golden、benchmark gate、Vitest、Playwright | 极高：函数 lineage 尤其需要 fixture 和回归门禁 |
| 构建发布 | Makefile、嵌入前端、跨平台 release、安装脚本 | 高：可逐步采用 |

## 3. 值得直接借鉴的实现模式

### 3.0 UI 设计系统与组件纪律

agentsview 的 `DESIGN.md`、`frontend/src/app.css`、layout、analytics 和 activity components 是 gitview 的 UI 主参考。需要继承：

- 语义 tokens 驱动的 light/dark 配色，不在 feature 页面散落颜色值。
- 紧凑 toolbar、summary cards、panel grid、sticky table header 与底部状态栏。
- 已加载内容在后台刷新期间保持可见，使用细进度条和局部 stale/querying 状态。
- empty/loading/error 在组件或 panel 边界处理，失败可局部重试。
- 新控件先寻找共享 primitive，避免 feature 私有的 select、按钮尺寸和下拉 chrome。

不能直接复用的边界：agentsview 的 UI 是 Svelte 5，基础组件主要来自 `@kenn-io/kit-ui`；gitview 是 React。gitview 使用 shadcn/ui primitives 组合窄而明确的 equivalents，不把 Svelte runtime 或 agentsview 的全量组件依赖带入产品。具体映射见 [ui-interaction.md](./ui-interaction.md)。

### 3.1 薄入口，厚 Service

`agentsview` 的 CLI command 负责 flags、选择 transport 和格式化输出；日期校验、查询语义与数据访问落在 service / db 层。`gitview` 只复用“领域逻辑不进入入口或 handler”这一原则，不在前期实现 direct transport 或分析结果 formatter。

`gitview` 应建立 `AnalysisService`，首批接口可围绕：

```text
Contributors(context, ContributorQuery) -> ContributorReport
Functions(context, FunctionQuery) -> FunctionPage
FunctionHistory(context, FunctionHistoryQuery) -> FunctionHistory
Hotspots(context, HotspotQuery) -> HotspotReport
Ownership(context, OwnershipQuery) -> OwnershipReport
Compare(context, CompareQuery) -> ComparisonReport
```

HTTP handler 和 React/未来桌面外壳调用这些接口。禁止在 `serve` 命令或 React 组件中重复实现日期、ownership 和热点算法。

### 3.2 原始事实与派生索引分离

`agentsview` 把原始 session 文件视为事实源，把 SQLite 视为可重建的本地 archive/index，同时非常重视非破坏性迁移和原子重建。

对应到 `gitview`：

- Git object database 是事实源，不由 gitview 修改。
- SQLite 保存 commit facts、identity、symbol snapshot、lineage 和 metric snapshot。
- 解析器或指标改变时重建派生层，不改写 Git。
- schema version 与 analysis data version 分离。
- 重建完成并校验后原子替换旧索引，处理中断后仍保留可用数据。

### 3.3 有界增量工作

`agentsview` 的同步引擎强调后台工作量随“变化批次”增长，而不是每个事件都扫描全部 archive，并针对小/大数据量建立性能回归。

`gitview` 的等价约束：

- 已分析 commit OID 不重复处理。
- 已解析 blob OID 不重复解析。
- 一次新增 commit 只读取相关 tree、parent diff 和涉及的 blob。
- watcher 或 refresh 不能重新遍历完整历史。
- 并发 worker、队列、内存和 Git 子进程数必须有上限。

### 3.4 版本化契约与生成客户端

`agentsview` 使用 Huma 描述 API、暴露 OpenAPI，并从契约生成 TypeScript client。CLI JSON 同样带 schema version。

`gitview` 应区分：

- `analysis_data_version`：索引中的解析/指标语义。
- `api_version`：HTTP 客户端兼容边界。
- `report_schema_version`：CLI JSON/导出兼容边界。

三个版本用途不同，不能只用应用版本号代替。

### 3.5 可观测进度与安全取消

函数级全历史分析可能耗时数分钟。参考 `agentsview`：

- 全链路传递 `context.Context`。
- CLI 响应 Ctrl-C。
- UI 通过 SSE 接收有界、可合并的进度事件。
- 慢订阅者不阻塞分析 engine。
- 进度以阶段和已完成/总量表示，不只打印“正在处理”。
- 数据库批次在取消时保持事务一致。

### 3.6 测试金字塔与性能门禁

建议复用其分层思想：

1. 纯函数单元测试：日期、身份、指标公式、CLI rendering。
2. Git fixture：程序化构造 commit、merge、rename、mailmap、空仓库和异常路径。
3. Parser golden：固定源码与期望 symbol snapshot。
4. Lineage integration：函数新增、移动、重命名、拆分和合并。
5. Store contract：SQLite 直接查询与 HTTP transport 结果一致。
6. CLI golden：table/JSON schema 稳定。
7. 前端测试 + Playwright：筛选、下钻、进度、错误和空状态。
8. Benchmark gate：冷分析、热缓存、追加 commit、热点查询和内存分配。

## 4. 建议的 gitview 模块地图

目录名先用于架构讨论，不代表现在开始创建代码：

```text
cmd/gitview/              Cobra 入口和命令 wiring
internal/config/          TOML、默认值、flags 覆盖和配置摘要
internal/git/             系统 Git adapter、revision、diff、mailmap
internal/identity/        Identity -> Person 归一化
internal/language/        语言识别和 analyzer registry
internal/symbol/          统一函数/类型模型与语言解析器
internal/lineage/         跨 revision 的函数匹配与 confidence
internal/index/           SQLite schema、迁移、缓存与查询
internal/analysis/        增量 planner / engine
internal/metric/          贡献、ownership、热点与风险算法
internal/service/         transport-neutral AnalysisService
internal/server/          Huma HTTP、SSE 与嵌入 SPA
internal/web/             go:embed 前端产物
frontend/                 React 19 + TanStack Router + TypeScript
desktop/                  后期可选 Tauri sidecar
testdata/                 Git、parser、lineage 和报告 fixtures
```

与 `agentsview` 一样，包按领域和数据流组织，不创建笼统的 `utils`、`models` 或 `helpers` 大杂烩。

## 5. 建议采用的具体选择

### 立即纳入设计

- Go 1.26。
- `gitview serve` 的最小命令入口；是否需要 Cobra 由 flags 复杂度决定。
- 首个 MVP 不引入配置文件。
- 系统 Git 通过内部 adapter 调用。
- transport-neutral `AnalysisService`，由 HTTP handler 调用。
- `net/http`、React + TypeScript + Vite 和 `go:embed`。
- shadcn/ui + Tailwind CSS，组件源码按需纳入项目。
- testify、fixture、golden 和 benchmark gate。
- Makefile 作为统一开发入口。
- 隐私优先、默认离线、不执行被分析仓库代码或 hooks。

### 页面数量与 API 复杂度增长后采用

- Huma v2 + OpenAPI。
- `@tanstack/react-router`、TanStack Query。
- OpenAPI 生成 TypeScript client 与 Query bindings。
- SSE 进度和刷新。
- SQLite 增量索引与 TOML 配置。
- JSON/CSV 导出。

前端框架与目录组织不参考 agentsview 的 Svelte 实现，统一参考 [stella-web-reference.md](./stella-web-reference.md)；UI 交互、配色、密度和组件行为仍以 agentsview 为主参考。

### 产品成熟后再采用

- Tauri 2 桌面壳。
- 后台 daemon / watcher。
- 自动更新和跨平台安装器。

## 6. 不应在首版照搬的部分

- PostgreSQL/Cockroach 多机后端：会显著增加 schema parity 和运维成本。
- DuckDB mirror：当前没有独立 OLAP 用户需求。
- FTS5 和向量检索：贡献与函数分析无需全文/语义搜索起步。
- 远程同步、S3、SSH：违背首版“单仓库、本地分析”的聚焦。
- 遥测、自动更新、复杂 daemon 生命周期：应在用户价值验证后加入。
- Tauri sidecar：浏览器本地 UI 足以先验证交互，不要同时承担 Rust 与平台打包成本。
- `agentsview` 当前庞大的 Store interface：`gitview` 应按较小的查询能力拆分接口，避免早期形成巨型抽象。
- CGO SQLite 构建链：除非性能或特性数据证明必须采用。

## 7. agentsview 中与 Git 分析直接相关的经验

`agentsview/internal/db/git` 已实现了一组较小的 Git 聚合能力，提供了可验证的先例：

- 用系统 Git 的 `log --numstat` 统计 commits、additions、deletions 和 files changed。
- 二进制文件计入 changed files，但不计行数。
- 空仓库作为零结果而不是致命错误。
- `--author` 的邮箱作为正则使用，因此必须 `regexp.QuoteMeta` 并限定 `<email>`。
- repo discovery 使用 `git rev-parse --show-toplevel`，兼容 worktree 和 submodule。
- Git 调用设置超时，错误包含 repo 上下文与 stderr。
- cache key 使用结构化字段 JSON 后 SHA-256，避免分隔符碰撞。
- secret token 只用摘要参与 cache partition，不落盘明文。

这些细节可以作为 `gitview` Git adapter 的最低质量基线，但其 TTL 聚合缓存不足以承担函数级 lineage；`gitview` 需要以 commit/blob OID 为键的持久增量索引。

## 8. 法律与工程边界

`agentsview` 使用 MIT License，可以依法参考和复用代码，但若复制实质性代码或文档，应保留其版权与许可声明。更推荐复用设计思想并为 `gitview` 按领域重新实现，避免继承无关耦合。

参考基线会变化。正式复用某段实现前，应记录来源 commit、文件路径、修改内容与许可证处理，保证后续可追溯。

## 9. 仍需 Spike 的问题

1. CGO SQLite 与 pure Go SQLite 在 macOS/Linux/Windows、100k commit 索引上的耗时、内存和分发体积。
2. Huma schema 是否能自然表达函数 lineage、confidence 和下钻分页。
3. React 图表方案是否需要第三方库，还是 SVG/Canvas 足够。
4. direct 和 HTTP transport 契约测试应覆盖哪些错误与 warnings。
5. `go:embed` 后的二进制体积预算。
6. Tauri 是否真的比浏览器模式带来足够价值。
