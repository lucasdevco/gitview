# 开放问题与决策记录

## 需要优先确认

1. 首批函数级语言是什么？建议 Go 做深度首发，再依据目标仓库加入 TypeScript/Java/Python。
2. ownership 的近期窗口是 90、180 还是 365 天？建议默认 180 天并允许配置。
3. SQLite 驱动选择 CGO 还是 pure Go？仅在无缓存性能不达标后再实测。
4. 路由 search 参数是否使用手写 validator，还是增加 schema 库？增加第二个正式页面时再决定。

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
