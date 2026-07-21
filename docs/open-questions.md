# 开放问题与决策记录

## 需要优先确认

1. 精确函数 lineage 何时从当前范围 hunk 归属升级为父子 blob 双解析？
2. SQLite 驱动选择 CGO 还是 pure Go？仅在有界内存缓存无法满足目标仓库后再实测。
3. 何时加入 Go 以外的首个语言分析器，以及选择 Tree-sitter 还是语言专用解析器？

## 第二批问题

- rename similarity 阈值和性能预算。
- 是否忽略 whitespace-only 变更。
- bot、generated、vendor 的默认识别规则。
- monorepo 中子项目边界如何声明。
- commit message 是否进入缓存和报告；涉及隐私与体积。
- shallow clone 是拒绝分析还是带警告继续。
- ownership 权重使用 commit、churn、函数变更次数还是组合模型。
- 函数拆分/合并是否在首版延续 lineage。

## 已确认决策

| 日期 | 决策 | 理由 |
| --- | --- | --- |
| 2026-07-19 | 项目先完成需求、指标与技术文档，再进入实现 | 函数级历史和 Git 指标存在较多语义与技术风险 |
| 2026-07-19 | 文档统一放在 `docs/` | 建立单一、可维护的设计入口 |
| 2026-07-19 | 贡献者分析与函数级代码分析均为核心方向 | 用户明确提出 |
| 2026-07-19 | 以 `agentsview` 作为主要技术架构参考 | 用户认可其技术栈和实现；复用成熟模式但不复制无关产品范围 |
| 2026-07-19 | 前端不使用 Svelte，改用 React 与 `@tanstack/react-router` | 用户明确指定，前端工程模式参考 `stella/web` |
| 2026-07-19 | 产品 UI 交互参考 agentsview | 用户明确指定；参考高密度数据布局、筛选、下钻和实时新鲜度交互，不复制 Svelte 实现 |
| 2026-07-19 | 前期 CLI 只实现 `gitview serve` | 命令行仅作为本地 Web 入口，删除 contributors/functions/hotspots/ownership/compare/explain 等命令计划 |
| 2026-07-19 | 首个实现范围压缩为单仓库 Overview | 先验证启动、Git 读取、HTTP 和 Web 交付闭环；函数、热点、ownership、对比、缓存和导出后置 |
| 2026-07-19 | UI 交互、配色与组件以本地 agentsview 为主参考 | 复用其高密度布局、语义色、状态反馈和共享组件纪律；gitview 使用 React，因此实现等价组件而不直接复用 Svelte 代码 |
| 2026-07-19 | React 基础组件使用 shadcn/ui | 组件源码按需进入项目并由 gitview 维护；初始化采用 `new-york`、`neutral`、CSS variables、TSX、关闭 RSC，使用主题 tokens 映射 agentsview 视觉语义 |
| 2026-07-19 | MVP contributor 按 author 的 `.mailmap` 规范身份统计 | 同一人的常见姓名与邮箱别名不会拆分；committer 维度后置 |
| 2026-07-19 | MVP 时间按 author time 和本机时区分月 | 保持单一、可解释口径；筛选和可切换 time field 后置 |
| 2026-07-19 | 展示 additions、deletions、churn，不提供伪精确 modified | Git numstat 无法稳定证明“修改行数” |
| 2026-07-19 | merge commit 计数但不累计 merge diff；root commit 与空树比较 | 保留真实提交轨迹，同时避免 merge 重复累计已进入历史的行变更 |
| 2026-07-19 | `serve` 固定监听 `127.0.0.1`，只开放 `--port` | 默认安全的本地工具边界，不引入远程暴露配置 |
| 2026-07-20 | 正式前端采用 TanStack Router file routing、TanStack Query 与手写 search validator | 多页下钻需要 URL 作为导航状态事实来源；当前参数简单，无需额外 schema 依赖 |
| 2026-07-20 | 文件 ownership 默认窗口为 180 天，权重使用 churn，bus factor 阈值为 80% | 口径透明并同时展示历史/近期 owner；二进制只给权重 1，不伪造 churn |
| 2026-07-20 | 函数分析首发 Go AST；历史归属先标记 `probable` | 在不建设完整 lineage 索引的前提下交付可下钻证据，同时明确移动和重命名误差 |
| 2026-07-21 | 函数解析迁移到 Tree-sitter，首批支持 Go、JavaScript/TypeScript、Python、Java、Rust | 用统一解析层扩展主流语言；未知语言保留文件级分析，历史归属继续标记 `probable` |
| 2026-07-20 | Compare 使用 `from..to` 可达提交语义；Explain 使用公历月、author time、本机时区 | 与 Git revision range 和现有时间口径保持一致且可复现 |

## 决策记录模板

```text
日期：
问题：
决策：
备选方案：
理由：
影响：
复审条件：
```
