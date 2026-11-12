# ADR-0001：从只读分析工具演进为读写 Git 工作台

**状态：** Proposed
**日期：** 2026-11-12
**决策者：** 项目维护者

## 背景

gitview 当前是只读的本地 Git 分析工具：`gitview serve` 启动时绑定一个仓库，Go 后端通过 `internal/gitrepo.Repository` 调用系统 `git` 并解析结构化输出，`overview`、`function` 两个 service 按 HEAD 缓存分析结果，经 `/api/v1/*` 只读 GET 接口交给 React 前端。

产品重新定位为：**Sourcetree 风格的网页版 Git 客户端**。界面对标 Sourcetree 的工作台（多仓库、提交图、文件状态、diff、冲突处理）；底层 Git 能力借鉴 lazygit 的实现，对齐其主要操作（暂存、提交、分支、merge/rebase、cherry-pick、stash、fetch/pull/push、交互式 rebase、按行暂存、撤销）。现有分析能力降为工作台中的“洞察”模块。

现有架构在以下方面无法直接承载该方向：

| 问题 | 现状 | 影响 |
| --- | --- | --- |
| Git 访问集中 | `gitrepo.Repository` 单类型承担所有 git 调用，`run()` 直接拼 argv 并整段读入内存 | 加入写操作后会膨胀为数千行；无统一环境变量、命令日志、进度解析、错误分类 |
| 只有单仓库 | 仓库在 `serve` 启动时固定，URL 不含仓库标识 | 无法支持多标签/书签；越晚改 URL 牵连越大 |
| 状态新鲜度 | 缓存只以 HEAD oid 为 key，前端靠请求拉取 | 工作区、index、refs 变化无法感知；工作台需要实时刷新 |
| 无写操作基础设施 | 无锁、无长任务、无凭据交互、无进行中状态模型 | 并发写会撞 `index.lock`；push/fetch 会卡在终端认证 |
| 安全模型 | 本机监听 + 只读，无鉴权 | 引入写操作后，任意网页可借 CSRF / DNS rebinding 改写本地仓库 |
| 与既有约束冲突 | 现有安全约定为“不执行仓库内 hooks、不 checkout” | commit、checkout、merge 天然触发 hooks 并改动工作区 |

参考：lazygit 同样调用系统 `git`，但分为 `oscommands`（命令对象、执行、日志、凭据、锁恢复）→ `GitCmdObjBuilder` → 按领域拆分的 `git_commands`（读用 `*Loader`、写用 `*Commands`）→ GUI 刷新层；提交图由客户端基于 parent hash 计算。

## 决策

保留“系统 git CLI + 结构化输出解析”的数据获取方式，将后端重构为**执行层 / 领域层 / 工作区层 / 分析层**四层，并在开放任何写操作前完成多仓库 URL 和本地鉴权。

### 1. 目标包结构

```
internal/
  git/          执行层：Runner 接口、argv builder、统一环境、错误分类、命令日志、流式输出、进度解析
  repo/
    query/      只读：log/graph、status、diff、refs、stash、blame、仓库进行中状态
    ops/        写：stage/unstage、commit、checkout、branch、merge、rebase、cherry-pick、stash、fetch/pull/push
  workspace/    多仓库管理、文件监听、仓库版本号、按仓库写锁、后台 Job
  analytics/    现有 overview、function，只读重缓存，独立演进
  server/       按领域分路由；写接口；SSE 事件流
```

依赖方向：`server → workspace → repo/{query,ops} → git`；`analytics` 只依赖 `repo/query` 暴露的小接口（延续现有“消费方定义接口”的做法）。

### 2. 执行层约定

- `git.Runner` 为接口；所有命令经 builder 生成独立 argv，禁止 shell 拼接。
- 统一注入环境：`LC_ALL=C`、`GIT_TERMINAL_PROMPT=0`；只读命令额外 `GIT_OPTIONAL_LOCKS=0`。
- 统一记录 argv、耗时、退出码，写命令进入用户可见的命令日志。
- 大输出（log、diff、patch）走流式读取或设上限；`cat-file --batch` 使用常驻进程复用。
- 错误分类为可判别类型（不是仓库、锁冲突、认证失败、冲突、ref 不存在等），供 API 返回可操作的提示。

### 3. 写操作模型

- **串行化**：每个仓库一把写锁/队列；读可并发。写操作执行期间暂停后台刷新，结束后统一刷新一次。
- **锁冲突重试**：所有命令默认 `GIT_OPTIONAL_LOCKS=0`；遇到 `index.lock` 错误按退避重试；rebase 类命令需先比对 rebase 状态再决定重试或 `--continue`，无法安全恢复时交还用户。
- **Job**：fetch/pull/push/clone 等长任务以 Job 运行，解析 `--progress` 输出推送进度，支持取消。API 形态为 `POST` 返回 `jobId`，进度经 SSE 推送。
- **凭据**：设置 `GIT_ASKPASS` / `SSH_ASKPASS` 指向 gitview 自带 helper 子命令，helper 回调本地 server，由前端弹窗收集；凭据不落盘、不进日志。
- **进行中状态**：读取 `.git/rebase-merge`、`rebase-apply`、`MERGE_HEAD`、`CHERRY_PICK_HEAD`、`REVERT_HEAD`、`sequencer/todo`，归一为仓库状态（clean / merging / rebasing / cherry-picking / reverting / bisecting），驱动冲突界面与“继续 / 跳过 / 中止”。
- **交互式 rebase**：`GIT_SEQUENCE_EDITOR` 指向 gitview 子命令，写入前端编辑好的 todo。
- **按行 / hunk 暂存**：服务端构造 patch，执行 `git apply --cached`。
- **冲突解决**：服务端解析冲突标记为结构化 hunk（ours / theirs / base），前端逐块选择后写回并 `git add`。
- **撤销**：基于 reflog 提供有限撤销，所有写操作可在命令日志中追溯。
- **hooks**：写操作默认执行仓库 hooks（与命令行 git 行为一致）；提交时提供“跳过 hooks”选项及可配置的跳过前缀（如 `WIP`），对应 `--no-verify`；分析路径继续不执行任何仓库代码。
- **Git 版本**：启动时检测 git 版本，低于最低版本直接报错并给出升级提示；执行层提供按版本增减参数的能力。最低版本在实现首批写操作时确定。

### 4. 多仓库与 API

- URL 改为 `/api/v1/repos/{repoId}/...`；`workspace.Manager` 维护仓库实例、书签与打开状态。
- 读：`GET` 资源接口；写：`POST /api/v1/repos/{repoId}/operations/{op}`，请求体为 JSON。
- 事件：`GET /api/v1/events`（SSE），推送 `{repoId, version, changed: ["refs","index","worktree","state"]}` 与 Job 进度。

### 5. 实时性

- `.git` 目录（`HEAD`、`refs/`、`packed-refs`、`index`、进行中状态文件）用 fsnotify 监听；工作区不做递归监听（大仓库会触及系统 watch 上限），改为前端可见时按间隔轮询 `git status` 并在窗口获得焦点时立即刷新。
- 保留低频 refs 快照轮询（`for-each-ref` + HEAD）作为 fsnotify 失效时的兜底。
- 任一来源检测到变化即递增仓库版本号并推送事件；gitview 自身写操作期间暂停检测，避免把中间状态当成外部变化。
- 前端按 `changed` 精确调用 React Query `invalidateQueries`。
- `analytics` 缓存继续按 HEAD 失效；工作台查询不缓存或短缓存。

### 6. 提交图

- 后端一次返回全部提交的 oid、parents、refs 与计算好的泳道（10 万提交量级约数 MB）；提交详情、文件列表、diff 按选中懒加载。
- 前端虚拟列表渲染图与行；不以 limit 分页绘图，避免泳道截断。

### 7. 本地安全

写操作上线前必须完成：

- 启动时生成随机 token，打开的 URL 携带 token，前端每个请求附带；
- 校验 `Host` 与 `Origin`，拒绝非本机来源；
- 写接口仅接受 `POST` + `application/json`；
- 继续只监听回环地址。

> **2026-11-12 更新：** 应用户要求（单用户、本机使用）取消启动 token，直接打开 `http://127.0.0.1:<port>/`。保留回环监听、`Host`/`Origin` 校验和写接口的 `POST` + JSON 约束，它们仍能阻止其他网页和 DNS rebinding 操纵 API；本机其他程序可直接调用 API，与它们能直接运行 `git` 等价。凭据 helper 回调仍要求回环来源与任务 secret。

## lazygit 对照

以下基于本地 lazygit 源码（`/Users/nan-mac/Code/lazygit`）。lazygit 是单用户 TUI，gitview 是可被并发请求的本地 HTTP 服务，差异主要来自这一点。

| 决策点 | lazygit 做法 | 源码位置 | gitview 取舍 |
| --- | --- | --- | --- |
| 数据来源 | 系统 `git` CLI，结构化 `--pretty=format` 解析；不依赖 go-git | `pkg/commands/git_commands/*_loader.go` | 相同 |
| 执行层 | `oscommands.CmdObj` + `cmdObjRunner`：日志、流式、PTY、凭据、锁恢复；`GitCmdObjBuilder` 统一注入环境 | `pkg/commands/oscommands/`、`pkg/commands/git_cmd_obj_builder.go` | 采纳分层思路，去掉 PTY 部分 |
| 读写拆分 | 读用 `*Loader`（`CommitLoader`、`BranchLoader`…），写用 `*Commands`，聚合到 `GitCommand` 结构体 | `pkg/commands/git.go` | 采纳，拆为 `repo/query` 与 `repo/ops` |
| 命令构造 | `NewGitCmd("log").Arg().ArgIf().ToArgv()` | `git_commands/git_command_builder.go` | 采纳 |
| 环境变量 | 默认 `GIT_OPTIONAL_LOCKS=0`；凭据/rebase 命令加 `LC_ALL=C`；部分命令 `GIT_TERMINAL_PROMPT=0` | `git_cmd_obj_builder.go`、`rebase.go`、`commit.go` | 采纳并统一化：所有命令均设 `LC_ALL=C`、`GIT_TERMINAL_PROMPT=0` |
| 锁冲突 | 命中 `index.lock` 错误按退避重试；rebase 命令先比对 rebase 状态再决定重跑或 `--continue` | `git_cmd_obj_runner.go`、`git_commands/lock_error_recovery.go` | 采纳 |
| 写串行化 | 无通用仓库写锁；靠 UI 顺序操作 + 操作期间暂停后台刷新 + 锁重试 | `pkg/gui/background.go` | **不同**：HTTP 天然并发，必须显式按仓库加写锁；暂停刷新采纳 |
| 凭据 | PTY 中运行，逐字节匹配 `Password:`、`Username for`、`Enter passphrase for key` 等正则，弹窗后写回 stdin | `oscommands/cmd_obj_runner.go` | **不同**：用 `GIT_ASKPASS`/`SSH_ASKPASS` helper。Web 服务无终端、Windows PTY 复杂，正则对 locale 与 git 版本敏感 |
| 长任务进度 | 不解析 `--progress`；显示等待状态，输出流入命令日志面板 | `pkg/gui/command_log_panel.go` | **扩展**：解析进度并经 SSE 推送；无法解析时退化为流式日志 |
| 后台刷新 | 不用 fsnotify。文件列表每 10s 刷新；每 2s 取 refs 快照（`for-each-ref refs/heads` + HEAD）比对；每 60s 自动 fetch；可配置 | `pkg/gui/background.go`、`git_commands/status.go`、`pkg/config/user_config.go` | **混合**：`.git` 用 fsnotify，工作区轮询，refs 快照兜底；自动 fetch 作为可选 Job |
| 进行中状态 | 直接检查 `.git` 下 `rebase-merge`、`rebase-apply`、`MERGE_HEAD`、`CHERRY_PICK_HEAD` 等文件，并处理 rebase 期间 `CHERRY_PICK_HEAD` 的歧义 | `git_commands/status.go` | 采纳，含该歧义处理 |
| 交互式 rebase | 自身作为 `GIT_SEQUENCE_EDITOR`/`GIT_EDITOR`，通过 `LAZYGIT_DAEMON_KIND`/`LAZYGIT_DAEMON_INSTRUCTION` 环境变量传递指令 | `pkg/app/daemon/` | 采纳，gitview 提供对应子命令 |
| 按行/hunk 暂存 | `patch` 包解析 diff、构造部分 patch，`git apply --cached` | `pkg/commands/patch/`、`git_commands/patch.go` | 采纳 |
| 冲突解决 | 解析冲突标记为结构，逐块选择 ours/theirs | `pkg/gui/mergeconflicts/` | 采纳，解析放服务端 |
| 撤销/重做 | 从 reflog 顶部回溯最近的用户操作并反向执行，新 reflog 条目标记 undo/redo 以便跳过 | `pkg/gui/controllers/undo_controller.go` | 采纳 |
| hooks | 正常执行；提交信息以 `skipHookPrefix`（默认 `WIP`）开头或强制跳过时加 `--no-verify` | `git_commands/commit.go` | 采纳 |
| Git 版本 | 启动校验最低 2.32.0；`version.go` 提供 `IsOlderThan`，按版本切换参数 | `pkg/app/app.go`、`git_commands/version.go` | 采纳，最低版本另定 |
| 分支 ahead/behind | 一次 `for-each-ref` 取 `%(upstream:track)` | `git_commands/branch_loader.go` | 采纳，替换现有逐分支 `rev-list` |
| 多仓库 | 同时只开一个仓库；切换时重建 `GitCommand` 并重置 GUI 状态（`onNewRepo`/`resetState`），提供最近仓库列表 | `pkg/gui/gui.go` | **不同**：Sourcetree 式多标签需要多个仓库实例并存，由 `workspace.Manager` 管理 |
| 提交图 | 客户端根据 `%P` 自行计算泳道，按（首提交 hash，提交数）缓存；默认只加载 300 条，滚到底再全量 | `pkg/gui/presentation/graph/`、`presentation/commits.go` | **不同**：后端返回全量拓扑与泳道，详情懒加载，避免截断 |
| 测试 | 命令层 `FakeCmdObjRunner` 断言 argv；`pkg/integration/tests` 按领域在临时真实仓库中跑端到端用例 | `oscommands/fake_cmd_obj_runner.go`、`pkg/integration/` | 采纳两层测试 |
| 本地安全 | 不适用（无网络接口） | — | gitview 特有：token + Host/Origin 校验 |

## 备选方案

### 方案 A：在现有 `gitrepo.Repository` 上逐个追加方法

| 维度 | 评估 |
| --- | --- |
| 复杂度 | 低（短期） |
| 成本 | 初期最少，后期重构成本高 |
| 可扩展性 | 差：单类型膨胀，横切关注点（锁、日志、凭据、进度）散落各处 |
| 团队熟悉度 | 高 |

**优点：** 改动最小，可立即开始做功能。
**缺点：** 无统一执行层；难以测试 argv；写操作并发与认证问题会在各方法里重复处理。

### 方案 B：分层重构，读写分离，引入 workspace（采纳）

| 维度 | 评估 |
| --- | --- |
| 复杂度 | 中 |
| 成本 | 需先投入一轮重构与 URL 迁移 |
| 可扩展性 | 好：新增操作只需在 `repo/ops` 加实现，横切能力集中在 `git` 与 `workspace` |
| 团队熟悉度 | 中：结构接近 lazygit，有现成参考 |

**优点：** 读写职责清晰；fake Runner 可断言 argv；锁、Job、凭据、事件一处实现。
**缺点：** 前期无用户可见产出；需要迁移现有 analytics 依赖与前端 API 路径。

### 方案 C：改用纯 Go Git 库（go-git）

| 维度 | 评估 |
| --- | --- |
| 复杂度 | 高 |
| 成本 | 重写数据层，补齐行为差异 |
| 可扩展性 | 受库能力限制（rebase、hooks、部分协议与新特性支持不完整） |
| 团队熟悉度 | 低 |

**优点：** 无外部 git 依赖，可进程内访问对象。
**缺点：** 与用户本机 git 配置、hooks、凭据、mailmap 等行为不一致；lazygit 与 Sourcetree 都依赖系统 git 完成写操作。

### 方案 D：直接引入 lazygit 的 Go 包作为依赖

| 维度 | 评估 |
| --- | --- |
| 复杂度 | 中（初期）→ 高（长期维护） |
| 成本 | 初期少写代码，后续跟随上游升级成本不可控 |
| 可扩展性 | 受限：`pkg/commands` 与 lazygit 的 `UserConfig`、i18n、GUI 任务模型耦合，并非稳定对外 API |
| 团队熟悉度 | 中 |

**优点：** 直接获得成熟的 rebase、patch、状态检测与锁恢复实现。
**缺点：** 需要构造 lazygit 的配置与运行时依赖；凭据流程绑定 PTY；上游内部重构会直接破坏 gitview；难以按 HTTP 并发模型改造。

## 取舍分析

- 方案 A 与 B 的分歧在于“横切关注点何时集中”。写操作必然需要锁、凭据、进度、错误分类，越晚抽象，迁移面越大，因此在第一个写操作之前完成分层。
- 方案 D 看似最省力，但依赖的是 lazygit 的内部包而非公开 API，且其执行模型围绕单用户 TUI 设计。决定只借鉴其实现思路与关键细节（见“lazygit 对照”），在 gitview 中独立实现。
- 方案 C 解决的是部署依赖问题，但 gitview 的用户本就安装 git，且写操作的正确性依赖与命令行 git 完全一致的行为，收益不足以覆盖重写成本。
- 多仓库 URL 和本地鉴权不直接产生功能，但两者分别影响全部路由与全部写接口，放在功能开发前做成本最低。
- 提交图选择“全量拓扑 + 懒加载详情”而非分页，是用少量带宽换取泳道正确性与实现简单。

## 影响

**变得更容易：**
- 新增 Git 操作：实现一个 `repo/ops` 函数，复用执行层与锁。
- 测试：执行层可用 fake Runner 断言 argv；集成测试用脚本在临时目录构建仓库。
- 前端实时刷新：事件驱动失效，不再轮询。

**变得更难：**
- 后端需要管理长生命周期资源（watcher、常驻 `cat-file`、Job、SSE 连接）及其关闭。
- 本地安全模型从“只读无鉴权”升级为 token + Origin 校验，开发与调试流程需适配。
- “不执行 hooks、不 checkout”的约束仅保留给分析路径，README 中的安全说明需随写操作上线同步更新。

**需要后续复审：**
- 是否以 Wails / Tauri 打包为桌面应用（本 ADR 保持 HTTP API 作为核心，不阻塞该选择）。
- 超大仓库（百万提交）下提交图全量返回是否需要改为分段拓扑。
- Git 最低版本要求及按版本切换参数的策略。

## 行动项

1. [ ] 新建 `internal/git`：Runner 接口、argv builder、统一环境变量、错误分类、命令日志；将 `gitrepo` 迁移到其上。
2. [ ] 将 `gitrepo` 拆为 `repo/query`，`overview`、`function` 迁入 `analytics` 并改为依赖 `repo/query` 小接口。
3. [ ] 本地鉴权：启动 token、`Host`/`Origin` 校验、写接口约束。
4. [ ] 引入 `workspace.Manager`，API 迁移到 `/api/v1/repos/{repoId}/...`，前端同步改造。
5. [ ] fsnotify 监听 + 仓库版本号 + SSE 事件流，前端接入精确失效。
6. [ ] 提交图接口与前端虚拟列表渲染。
7. [ ] 首批写操作：stage/unstage、commit、checkout、branch 增删改；按仓库写锁。
8. [ ] Job 框架 + 凭据 helper，接入 fetch/pull/push。
9. [ ] 进行中状态模型，merge/rebase/cherry-pick 与冲突处理界面。
10. [ ] 交互式 rebase（`GIT_SEQUENCE_EDITOR` helper）与按行/hunk 暂存。
11. [ ] 小优化：`Branches` 改用 `for-each-ref` 的 `%(upstream:track)`；大 diff 流式化。
12. [ ] 写操作上线时更新 README 的安全说明，并补充路线图文档。
