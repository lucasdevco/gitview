# 实现路线图

路线图采用短垂直切片。前期唯一命令行入口是 `gitview serve`，所有分析交互都进入本地 Web UI。

## Phase 0：冻结最小契约（已完成）

在编码前只确认会影响入口兼容性的事项：

- 命令保持 `gitview serve [repository]`。
- 默认监听 `127.0.0.1:8080`；只支持 `--port`，前期不自动打开浏览器。
- 首个页面只支持一个本地仓库和当前 `HEAD` 可达历史。
- 固化 additions、deletions、churn、commit、contributor 的最小统计口径。
- 首个页面采用单列 Overview；交互、密度和配色以本地 agentsview 为主参考，React 组件使用 shadcn/ui；一次性原型不进入正式源码。

退出条件：命令帮助文本、启动行为和 Overview 线框可直接写成验收测试。

## Phase 1：可启动的 Web 外壳（已完成）

目标：先打通安装后的访问闭环，不接真实分析。

- 建立 Go module 和 `cmd/gitview`。
- 实现 `gitview serve [repository]`、loopback HTTP server、端口占用错误和优雅退出。
- 提供 `/api/v1/health` 与 SPA fallback。
- 建立 React + TypeScript + Vite 前端，生产产物通过 `go:embed` 放入单二进制。
- 初始化 Tailwind CSS v4 与 shadcn/ui：`new-york`、`neutral`、CSS variables、TSX、关闭 RSC；只加入 Overview 实际使用的 primitives。
- 通过 shadcn CSS variables 映射 agentsview 的语义色和紧凑密度，不直接依赖其 Svelte 组件。
- 开发模式允许 Vite 单独运行并代理 `/api`。
- 页面显示已识别的仓库路径和占位 Overview 状态。

退出条件：从干净 checkout 构建一个二进制，运行后终端打印 URL，浏览器可打开页面，Ctrl-C 正常退出。

## Phase 2：真实仓库 Overview（已完成）

目标：交付第一条有用户价值的垂直路径。

- 使用系统 Git 发现仓库根目录、当前分支和 HEAD。
- 一次读取 `HEAD` 可达历史的 commit metadata 与 numstat。
- 使用 `.mailmap` 可获得的规范身份统计 contributor。
- 提供一个最小 Overview API，返回仓库摘要、总计、按月趋势、贡献者和最近提交。
- UI 展示基础统计、趋势、贡献者表、最近提交，以及 loading/empty/error 状态。
- 添加 Git fixture、解析单测、HTTP 测试和一次前端生产构建检查。

退出条件：在小型真实仓库上与 Git 命令抽样核对一致；刷新页面可以恢复相同视图。

## Phase 3：让 MVP 可日常使用（已完成）

只根据 Phase 2 的实测问题补齐必要能力：

- 日期范围和路径筛选，并把状态写入 URL。
- 分析取消、超时、二进制文件和 merge 策略提示。
- 大仓库的流式读取、进度反馈和性能基线。
- 当前使用 HEAD + 筛选条件的有界内存缓存；尚无证据需要 SQLite。
- 增加集成测试、错误状态和跨平台构建。

退出条件：目标样本仓库上的响应时间和内存达到实测后确定的预算。

## Phase 4：按证据扩展页面（已完成首轮）

不预先并行铺开。按用户价值逐个增加垂直切片，每个切片包含指标、API、Web 页面和证据下钻：

1. Contributors 详情。
2. 文件级 Hotspots 与 Ownership。
3. 基于 Tree-sitter 的多语言函数解析、函数变更归属与历史。
4. 函数级 Hotspots、Ownership 与 lineage confidence。
5. Compare 与解释能力。

当前已交付以上五个切片。函数历史首批支持 Go、JavaScript/TypeScript、Python、Java 和 Rust：当前快照由 Tree-sitter 解析，历史 hunk 按当前函数范围归属并明确标记 `probable`；精确跨 revision lineage 仍属于后续深化。

这些能力不增加同名 CLI 子命令。

## 明确后置

- JSON/CSV/静态报告导出。
- 多仓库、GitHub/GitLab、CI 基线和插件系统。
- OpenAPI client 自动生成、SSE、后台 watcher 和 daemon。
- Tauri 桌面外壳、自动更新和安装器。
- 在真实瓶颈出现前引入 SQLite、Tree-sitter 或复杂图表基础设施。

## 首个里程碑的建议任务顺序

1. 写 `serve` 命令和 HTTP 生命周期测试。
2. 建最小 React 页面并完成嵌入式静态资源交付。
3. 写 Git fixture，先固定 Overview 聚合结果。
4. 实现 Git adapter 与 Overview service。
5. 接入 `/api/v1/overview` 和 Web 页面。
6. 在当前仓库及一个包含 merge、rename、二进制文件的 fixture 上核对。
7. 记录性能数据，再决定下一项能力。
