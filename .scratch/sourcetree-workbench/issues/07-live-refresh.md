# 07: 实时刷新

**What to build:** 在终端或编辑器里改动仓库（编辑文件、提交、切分支），工作台在几秒内自动反映变化；gitview 自己执行写操作期间不出现中间状态闪烁，结束后统一刷新一次。

**Blocked by:** 03, 05

**Status:** resolved

- [ ] `.git` 目录（`HEAD`、`refs/`、`packed-refs`、`index`、进行中状态文件）用 fsnotify 监听
- [ ] 工作区不递归监听：页面可见时按间隔轮询 status，窗口获得焦点时立即刷新
- [ ] 低频 refs 快照轮询作为 fsnotify 失效时的兜底
- [ ] 仓库版本号 + `GET /api/v1/events`（SSE）推送 `{repoId, version, changed}`
- [ ] 前端按 `changed` 精确失效对应查询
- [ ] 写操作期间暂停检测，结束后刷新一次
- [ ] 测试：外部修改仓库后事件在限定时间内到达（Go 测试订阅 SSE）

## Comments

- 2026-11-12: Resolved on integration branch `sourcetree-workbench` (implemented test-first, merged, code-reviewed, browser E2E checked). See `git log e39e52e..sourcetree-workbench`.
