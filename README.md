# gitview

面向 Git 项目的本地 Web 分析工具。

首个命令行入口只提供 `gitview serve`：在本机启动服务，并通过浏览器查看当前 Git 仓库。贡献者、热点、函数历史等分析不再分别提供命令行子命令。

项目已进入简化 Web MVP 实现阶段。产品需求、指标口径、技术方案和路线图统一维护在 [`docs/`](./docs/README.md)。

正式界面使用 React、Tailwind CSS v4 与 [shadcn/ui](https://ui.shadcn.com/docs/components)，交互密度和配色参考本地 agentsview。

## 本地运行

需要 Go 1.26、Node.js 和系统 Git：

```text
make build
./gitview serve /path/to/repository
```

默认地址是 `http://127.0.0.1:8080`，可用 `--port` 指定端口；传入 `--port 0` 时由系统选择空闲端口。服务只监听 loopback，不提供 `--host`。

开发时可以分别运行 Go 服务和 `frontend/` 中的 Vite dev server；Vite 会把 `/api` 代理到 `127.0.0.1:8080`。

## 目录结构

目录职责参考 agentsview，并按当前 MVP 范围精简：

```text
cmd/gitview/        CLI 入口、命令定义与 serve 生命周期
internal/gitrepo/   系统 Git adapter
internal/overview/  Overview 领域模型与聚合服务
internal/server/    HTTP API、middleware 与 SPA 交付
internal/web/       嵌入式前端产物及 backend-only fallback
frontend/           React SPA；生产构建先输出到 frontend/dist
docs/               产品、指标和技术决策
```

`make frontend` 将 `frontend/dist` 复制到 `internal/web/dist`，供 Go `embed` 打入二进制。`internal/web/fallback` 保证没有生成前端时仍可执行 backend-only 测试与构建。

## 文档入口

- [产品需求文档](./docs/product-requirements.md)
- [指标与统计口径](./docs/metrics.md)
- [技术分析与架构设计](./docs/technical-design.md)
- [agentsview 参考架构分析](./docs/agentsview-reference.md)
- [stella/web 前端参考架构](./docs/stella-web-reference.md)
- [产品 UI 交互图](./docs/ui-interaction.md)
- [路线图](./docs/roadmap.md)
- [开放问题与决策记录](./docs/open-questions.md)
