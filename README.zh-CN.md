# gitview

[English](./README.md) | [简体中文](./README.zh-CN.md)

从任意本地 Git 仓库中探索贡献历史、代码热点、所有权和函数演变。一个二进制文件，无需账号，所有数据都留在本地。

> **项目状态：** gitview 目前处于 Web MVP 阶段，正在持续开发中。

## 为什么使用 gitview？

Git 中不只有提交列表，它还可以帮助回答实际的项目维护问题：

- 谁最了解这部分代码？
- 哪些文件修改频繁，并存在所有权过度集中的风险？
- 某个月的活跃度为什么突然上升？
- 一个函数经历了怎样的演变，哪些提交塑造了它？
- 维护者或新成员应该从哪里开始阅读代码？

gitview 将本地 Git 历史转换为聚焦项目分析的 Web 界面。它用于帮助理解和维护项目，而不是评价或排名开发者绩效。

## 功能

- **仓库概览**：查看提交数、贡献者、新增、删除、churn、月度趋势和近期活动。
- **贡献者详情**：查看活动时间线、主要修改路径，以及构成个人历史的具体提交。
- **文件热点**：使用基于修改频率和 churn 的透明评分查找高频变更文件。
- **代码所有权**：查看历史主要作者、近期维护者、贡献份额和估算的 bus factor。
- **函数历史**：浏览 Go、JavaScript/TypeScript、Python、Java 和 Rust 函数的复杂度、热点、贡献者及可能的变更历史。
- **分支与提交**：查看分支状态、工作区变更、提交元数据和 diff。
- **版本对比**：从汇总指标、贡献者、文件和提交等维度对比两个 Git revision。
- **月度解释**：通过主要贡献者、路径和提交解释某个月的代码活动变化。
- **聚焦筛选**：按作者日期和仓库路径缩小分析范围，筛选状态会保存在 URL 中。
- **中英文界面**。

## 快速开始

### 环境要求

- Go 1.26+
- Node.js 20.19+ 或 22.12+
- Git
- 用于 Tree-sitter Go 绑定的 C 编译器

### 从源码构建

```bash
git clone https://github.com/lucasdevco/gitview.git
cd gitview
cd frontend && npm ci && cd ..
make build
```

`make build` 会编译 React 前端，将产物嵌入 Go 二进制文件，并生成 `./gitview`。

### 分析仓库

```bash
# 分析当前仓库
./gitview serve

# 分析另一个本地仓库
./gitview serve /path/to/repository

# 使用其他端口
./gitview serve --port 9090 /path/to/repository
```

打开 [http://127.0.0.1:8080](http://127.0.0.1:8080)。传入 `--port 0` 可以让操作系统自动选择可用端口。

gitview 只监听本机 loopback 地址，并且有意不提供 `--host` 参数。

## 工作原理

gitview 通过系统 Git 程序读取仓库元数据和历史，在内存中计算分析结果，并通过同一个二进制文件提供内嵌的 React 应用。

- 不执行仓库中的代码、hooks 或构建脚本。
- 不需要账号或外部服务。
- 仓库数据始终保留在本机。
- 分析结果会区分 Git 直接事实与派生或近似指标。

## 当前限制

- 函数级分析支持 Go、JavaScript/TypeScript、Python、Java 和 Rust；其他语言自动降级到文件级分析。
- 函数历史标记为 `probable`，函数移动、重命名和边界变化可能无法被精确追踪。
- 分析范围主要是所选分支或 revision 可达的历史。
- 暂无持久化索引、后台监听、多仓库模式和 GitHub/GitLab 集成。
- 暂不支持 JSON/CSV 导出和静态报告。

后续计划请查看[路线图](./docs/roadmap.md)。

## 本地开发

开发时可以分别运行后端和前端：

```bash
# 终端 1：启动 Go API 服务
go run ./cmd/gitview serve /path/to/repository

# 终端 2：启动 Vite，/api 会代理到 127.0.0.1:8080
cd frontend
npm run dev
```

监听源码变化并自动重新构建：

```bash
make watch
```

常用检查命令：

```bash
make test
make check
```

## 项目结构

```text
cmd/gitview/        CLI 入口和服务生命周期
internal/gitrepo/   系统 Git 适配层
internal/overview/  仓库、贡献者、文件、所有权和版本对比分析
internal/function/  Tree-sitter 函数解析和历史分析
internal/server/    本地 HTTP API 和 SPA 交付
internal/web/       内嵌前端资源和纯后端 fallback
frontend/           React、TypeScript、Vite、Tailwind CSS 和 shadcn/ui 应用
docs/               产品需求、指标定义、架构和路线图
```

## 文档

- [文档索引](./docs/README.md)
- [产品需求](./docs/product-requirements.md)
- [指标定义](./docs/metrics.md)
- [技术设计](./docs/technical-design.md)
- [UI 交互](./docs/ui-interaction.md)
- [路线图](./docs/roadmap.md)
- [开放问题与决策](./docs/open-questions.md)

## 致谢

产品结构和本地优先的呈现方式受到 [agentsview](https://github.com/kenn-io/agentsview) 启发。
