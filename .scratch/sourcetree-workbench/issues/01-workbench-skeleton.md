# 01: 清场与工作台骨架

**What to build:** 运行 `gitview [路径]` 后，浏览器打开的是新的工作台外壳（标题栏 + 侧边栏 + 空的主区域），标题栏显示真实仓库名、侧边栏 WORKSPACE 显示文件状态/历史/搜索入口，当前分支来自真实仓库。旧的分析界面、旧 API 和旧分析模块全部移除。后端建立 ADR-0001 的执行层与 workspace，所有 API 受 token 与 Host/Origin 保护。参见 spec「后端模块」「HTTP API 契约」中的安全条目。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [ ] 旧的分析模块（overview、function、Tree-sitter 函数分析）、旧 API 路由和旧前端页面已删除，构建与测试通过
- [ ] git 执行层：Runner 接口与 argv builder；统一注入 `LC_ALL=C`、`GIT_TERMINAL_PROMPT=0`，读命令加 `GIT_OPTIONAL_LOCKS=0`；错误分类为可判别类型
- [ ] 启动时检测 git 版本，低于最低版本时以明确信息退出；路径不是仓库时给出明确错误与建议
- [ ] workspace 管理单个仓库实例，API 路径为 `/api/v1/repos/{repoId}/...`
- [ ] `GET /api/v1/repos/{repoId}` 返回名称、当前分支、HEAD、是否空仓库、进行中状态、提交身份
- [ ] 启动生成随机 token 并打印带 token 的 URL；缺失或错误 token、非本机 Host、跨站 Origin 的请求被拒绝（API 测试覆盖）
- [ ] 前端外壳按原型布局渲染标题栏（不含“终端”按钮）和侧边栏骨架，显示真实仓库名与当前分支
- [ ] 空仓库可以正常打开

## Comments

- 2026-11-12: Resolved on integration branch `sourcetree-workbench` (implemented test-first, merged, code-reviewed, browser E2E checked). See `git log e39e52e..sourcetree-workbench`.
