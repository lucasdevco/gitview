# gitview 文档

这里是 gitview 的需求与设计事实来源。当前已确认以 `gitview serve` 启动本地 Web UI；其他分析型 CLI 子命令不进入前期实现。

## 文档地图

| 文档 | 说明 | 当前状态 |
| --- | --- | --- |
| [product-requirements.md](./product-requirements.md) | 用户、场景、功能需求、优先级和验收标准 | 草案 |
| [metrics.md](./metrics.md) | 所有统计指标的定义、公式、边界和误区 | 草案 |
| [technical-design.md](./technical-design.md) | 数据来源、架构、函数解析方案、性能和扩展性 | 草案 |
| [agentsview-reference.md](./agentsview-reference.md) | 对 agentsview 技术栈、实现模式及可复用边界的分析 | 草案 |
| [stella-web-reference.md](./stella-web-reference.md) | React 与 TanStack Router 前端架构参考 | 草案 |
| [ui-interaction.md](./ui-interaction.md) | 参考 agentsview 的页面结构、交互流程与状态规范 | 草案 |
| [roadmap.md](./roadmap.md) | 分阶段交付范围和退出条件 | 草案 |
| [open-questions.md](./open-questions.md) | 尚待讨论的问题及已确认决策 | 持续更新 |

## 文档原则

1. 每个展示指标必须先在 `metrics.md` 定义，避免“新增、修改、贡献者”等概念各说各话。
2. Git 能直接证明的事实与工具推导出的近似结论必须明确区分。
3. 第一阶段优先解决高频判断问题，不追求一次覆盖所有语言和代码平台。
4. 前期只维护 `gitview serve` 一个命令入口；查询和下钻交互统一放在 Web UI。
5. 涉及排名时避免把代码行数等同于个人价值；产品重点是项目理解、维护风险与协作改善。
