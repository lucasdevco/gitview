# gitview

[English](./README.md) | [简体中文](./README.zh-CN.md)

在浏览器里运行的 Sourcetree 风格 Git 客户端。gitview 提供熟悉的桌面级 Git 工作台——提交图、暂存区、分支、diff 与冲突处理——底层 Git 操作借鉴 [lazygit](https://github.com/jesseduffield/lazygit) 久经验证的实现方式。单个二进制，无需账号，数据全部留在本机。

> **状态：** 早期开发中。下文“已可用”的只读视图现在即可使用；写操作（暂存、提交、分支、merge、rebase、push）正在开发。架构见 [ADR-0001](./docs/adr/0001-read-write-git-workbench.md)。

## 为什么是 gitview？

- **Sourcetree 的工作流，无需安装桌面应用**——一个本地二进制提供服务，任意浏览器打开即用。
- **lazygit 的 Git 引擎思路**——所有操作都调用系统 `git` 并解析结构化输出，与 lazygit 相同的成熟模型，行为与命令行、你的配置、hooks 和凭据保持一致。
- **本地优先**——只监听回环地址，仓库数据不离开本机。

## 功能

### 已可用

- **分支与提交**——本地与远程分支及上游 ahead/behind、提交历史、提交元数据与 diff。
- **工作区**——已修改与未跟踪文件及其 diff。
- **仓库洞察**——贡献者、文件热点、代码所有权、函数历史（Go、JavaScript/TypeScript、Python、Java、Rust）、版本对比与按月活动解释。
- **中英文界面**。

### 开发中

- 包含全部分支的提交图，详情按需加载。
- 多仓库标签页与书签。
- 按文件、hunk 或行暂存与取消暂存；提交与 amend。
- 检出、创建、重命名、删除分支；tag；stash。
- 带进度与凭据弹窗的 fetch、pull、push。
- merge、rebase、cherry-pick、revert 及冲突解决视图。
- 交互式 rebase 与基于 reflog 的撤销。
- 仓库在 gitview 之外发生变化时自动刷新。

## 快速开始

### 环境要求

- Go 1.26+
- Node.js 20.19+ 或 22.12+
- Git
- C 编译器（Tree-sitter Go bindings 需要）

### 从源码构建

```bash
git clone https://github.com/lucasdevco/gitview.git
cd gitview
cd frontend && npm ci && cd ..
make build
```

`make build` 会构建 React 前端、嵌入 Go 二进制并生成 `./gitview`。

### 打开仓库

```bash
# 打开当前仓库
./gitview

# 打开其他本地仓库
./gitview /path/to/repository

# 使用其他端口
./gitview --port 9090 /path/to/repository
```

`gitview` 是 `gitview serve`（别名 `gitview s`）的简写。打开 [http://127.0.0.1:8080](http://127.0.0.1:8080)。传入 `--port 0` 可由操作系统选择可用端口。

gitview 有意只监听回环地址，不提供 `--host` 选项。

## 工作方式

gitview 以结构化输出格式调用系统 `git`，在 Go 中解析结果，并由同一个二进制提供内嵌的 React 应用。

- 不需要账号或外部服务，仓库数据只保存在本机。
- 当前版本只读，不执行仓库内的 hooks 或构建脚本。
- 写操作上线后，行为将与 `git` 命令行一致（包括执行 hooks），本地服务将要求每次会话的 token 并校验 Host/Origin。

## 本地开发

本地开发时分别启动后端和前端：

```bash
# 终端 1：启动 Go API 服务
go run ./cmd/gitview serve /path/to/repository

# 终端 2：启动 Vite，并将 /api 代理到 127.0.0.1:8080
cd frontend
npm run dev
```

源码变化后自动重建：

```bash
make watch
```

常用检查：

```bash
make test
make check
```

## 项目结构

```text
cmd/gitview/        CLI 入口和服务生命周期
internal/gitrepo/   系统 Git 适配层
internal/overview/  仓库、贡献者、文件、所有权和版本对比洞察
internal/function/  Tree-sitter 函数解析和历史分析
internal/server/    本地 HTTP API 和 SPA 交付
internal/web/       内嵌前端资源和纯后端 fallback
frontend/           React、TypeScript、Vite、Tailwind CSS 和 shadcn/ui 应用
docs/adr/           架构决策记录
```

## 文档

- [ADR-0001：从只读分析工具演进为读写 Git 工作台](./docs/adr/0001-read-write-git-workbench.md)

## 致谢

- [lazygit](https://github.com/jesseduffield/lazygit)——gitview 驱动 Git 方式的参考：命令构造、状态检测、交互式 rebase、补丁暂存与撤销。
- [Sourcetree](https://www.sourcetreeapp.com/)——工作台布局与交互模型的灵感来源。gitview 是独立项目，与 Atlassian 无关联，也未获其认可。
- [agentsview](https://github.com/kenn-io/agentsview)——本地优先呈现方式的灵感来源。
