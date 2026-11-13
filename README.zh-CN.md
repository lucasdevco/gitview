# gitview

[English](./README.md) | [简体中文](./README.zh-CN.md)

在浏览器里运行的 Sourcetree 风格 Git 客户端。gitview 提供熟悉的桌面级 Git 工作台——提交图、暂存区、分支、diff、合并与贮藏——底层 Git 操作借鉴 [lazygit](https://github.com/jesseduffield/lazygit) 久经验证的实现方式。单个二进制，无需账号，数据全部留在本机。

> **状态：** 早期开发中。工作台已覆盖单个仓库的日常 Git 工作流：暂存、提交、分支、合并、贮藏、抓取、拉取与推送。架构见 [ADR-0001](./docs/adr/0001-read-write-git-workbench.md)。

## 为什么是 gitview？

- **Sourcetree 的工作流，无需安装桌面应用**——一个本地二进制提供服务，任意浏览器打开即用。
- **lazygit 的 Git 引擎思路**——所有操作都调用系统 `git` 并解析结构化输出，与 lazygit 相同的成熟模型，行为与命令行、你的配置、hooks 和凭据保持一致。
- **本地优先**——只监听回环地址，仓库数据不离开本机。

## 功能

- **工作台**——Sourcetree 风格的标题栏（待提交文件数、待拉取/待推送提交数角标）；侧边栏包含分支树（显示领先/落后数）、标签、远端、已贮藏与名称筛选；面板可拖动调整大小；浅色/深色主题跟随系统；中文界面。空仓库也可打开。
- **文件状态**——已暂存与未暂存文件及状态图标（新增、修改、删除、重命名、未跟踪、冲突）；按文件、整组或单个 hunk 暂存与取消暂存，确认后丢弃 hunk。diff 显示块头与新旧行号，支持文本搜索，二进制与超大文件给出提示而不渲染。
- **提交**——显示提交身份，多行提交信息，更正上一次提交（amend），跳过 hooks（`--no-verify`），提交后立即推送；hook 失败时显示其输出。
- **历史**——带彩色泳道的完整提交图，虚拟列表在大仓库中依然流畅；分支、远程分支与标签标记；工作区有改动时显示“未提交的更改”行；切换所有分支/当前分支、显示/隐藏远程分支；跳转到分支；按提交信息、作者或哈希前缀搜索提交。
- **提交右键菜单**——在历史中的任意提交上：检出（确认后进入分离 HEAD 状态）、合并至当前分支、变基当前分支到此提交、在此新建分支或标签（填写消息则为附注标签）、重置当前分支到此提交（软合并/混合合并/强行合并，强行合并以红色按钮确认）、反转提交、遴选、复制 SHA 到剪贴板。合并提交按第一个父提交反转和遴选。
- **提交详情**——主题、正文、哈希、父提交（可点击跳转）、作者、日期、引用、改动文件（重命名显示为重命名）以及每个文件的 diff。
- **分支**——检出（双击）；基于工作副本父节点或指定提交新建分支，实时校验分支名；重命名；删除一个或多个分支（未合并分支可强制删除）；设置跟踪的远程分支。右键菜单提供检出、合并、变基、拿来（不检出即快进该分支）、推送、跟踪远程分支、重命名、删除、复制分支名字。
- **合并、变基、遴选与反转**——把分支合并到当前分支（可选立即提交、包含被合并提交的信息、总是创建合并提交），或变基到该分支。出现冲突时工作台显示“合并中/变基中/遴选中/反转中”与冲突文件，可将其标记为已解决、提交以完成或中止。
- **贮藏**——可填写信息、可保留已暂存的变更；浏览贮藏的文件与 diff；应用或删除贮藏。
- **抓取、拉取与推送**——抓取一个或全部远端（修剪、标签）；按合并选项或变基拉取远程分支；一次推送多个分支、建立跟踪、推送全部标签。这些操作作为后台任务运行，显示进度、可取消；远端需要凭据时在浏览器中弹窗输入。推送被拒绝时说明原因并建议先拉取。
- **实时刷新**——在终端、编辑器或其他工具中对仓库的改动几秒内出现在工作台；gitview 自身写操作期间不会闪烁。
- **命令可追溯**——每个对话框预览将要执行的 git 命令，底部命令日志栏列出写操作实际执行的每条 git 命令。失败时显示 git 原始输出与建议。

### 尚未支持

- 多仓库标签页与书签。
- 交互式 rebase、按行暂存、基于 reflog 的撤销、冲突编辑界面（中断的变基暂时需在命令行继续）。
- 删除或单独推送标签；子模块与子树。
- 分支或提交对比，以及“显示远程服务器”“在 Finder 中显示”“设置”按钮。

## 快速开始

### 环境要求

- Go 1.26+
- Node.js 20.19+ 或 22.12+
- Git 2.32.0 或更新版本（启动时检测，版本过低会给出升级提示并退出）

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

`gitview` 是 `gitview serve`（别名 `gitview s`）的简写。启动后会打印要打开的链接，例如 `http://127.0.0.1:8080/`。传入 `--port 0` 可由操作系统选择可用端口。

## 工作方式

gitview 以结构化输出格式调用系统 `git`，在 Go 中解析结果，并由同一个二进制提供内嵌的 React 应用。

- 不需要账号或外部服务，仓库数据只保存在本机。
- 读操作可并发；同一仓库的写操作逐个执行，与其他工具短暂冲突的 `index.lock` 会自动重试。
- 抓取、拉取、推送作为后台任务运行，报告 git 的进度并可取消。
- gitview 监听仓库的 git 目录，并在页面可见时轮询工作区，因此工作台能跟上其他地方的改动。

## 安全

gitview 会修改你的仓库。它面向本机的单个用户，因此页面和 API 无需登录或 token；取而代之的是拒绝一切不是来自本机、不是来自 gitview 自身页面的请求。

- **只监听回环地址。** 服务只监听 `127.0.0.1`，不提供 `--host` 选项。
- **Host 与 Origin 校验。** 拒绝 `Host` 不是回环地址的请求（DNS rebinding）和跨站请求，其他网页无法操纵 API。写操作只接受带 JSON 请求体的 `POST`。
- **不防范本机程序。** 本机上的任何程序或用户账户都能调用 API，正如它们本就能直接运行 `git`。不要在多人共用的电脑上运行 gitview。
- **会执行 hooks。** 写操作的行为与 `git` 命令行一致，包括执行仓库的 hooks，如 `pre-commit`、`commit-msg`、`post-checkout`、`pre-push`。hook 失败时显示其输出，提交选项可跳过 hooks（`--no-verify`）。只打开你信任、愿意在其中运行 `git` 的仓库。
- **凭据弹窗。** 远端需要用户名、密码、SSH 密钥口令或主机密钥确认时，git 和 ssh 会把 gitview 自身作为 `GIT_ASKPASS` / `SSH_ASKPASS` 运行。这个 helper 带着属于当前任务的 secret，把提示发到回环地址上的 `POST /api/v1/askpass`；secret 在任务结束后即失效。浏览器显示提示（密码以隐藏方式输入），答案交还给 git。gitview 从不把凭据写入磁盘、命令日志、任务记录或事件；无人回答的提示在五分钟后自动拒绝。如果你配置了 git 凭据助手（`credential.helper`），git 可能像在命令行中一样把凭据保存在那里。
- 写在远程 URL 中的密码在发送到浏览器前会被隐去。

## 本地开发

本地开发时分别启动后端和前端：

```bash
# 终端 1：启动 Go API 服务
go run ./cmd/gitview serve /path/to/repository

# 终端 2：启动 Vite，并将 /api 代理到 127.0.0.1:8080
cd frontend
npm run dev
```

打开 Vite 页面 `http://localhost:4173/`。

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
cmd/gitview/        CLI 入口和服务生命周期；也作为凭据 helper 运行
internal/git/       执行层：Runner、命令构造、统一环境变量、错误分类、进度解析、版本检测
internal/repo/      仓库定位；repo/query 读取仓库状态，repo/ops 执行写操作
internal/workspace/ 已打开的仓库：写锁、命令日志、变更检测、事件、后台任务、凭据提示
internal/askpass/   把 git 与 ssh 的凭据提示转发到浏览器的 helper
internal/server/    本地 HTTP API 与事件流、Host/Origin 校验、SPA 交付
internal/gittest/   测试用的临时真实仓库
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
