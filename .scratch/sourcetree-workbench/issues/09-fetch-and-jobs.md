# 09: 抓取与后台任务框架

**What to build:** 点击“抓取”打开对话框（抓取所有远端更新、删掉已不存在的跟踪分支、抓取并存储所有标签），确认后以后台任务运行，界面显示进度并可取消，完成后远程分支与领先/落后数更新。

**Blocked by:** 05, 07

**Status:** resolved

- [ ] Job 框架：写操作可作为 Job 启动，返回 `jobId`；解析 `--progress` 输出并经 SSE 推送；支持取消
- [ ] fetch 操作支持 `--all`、`--prune`、`--tags`
- [ ] 抓取对话框与原型一致，显示命令预览
- [ ] 界面显示进度与取消入口
- [ ] API 测试用本地 bare 仓库作为 origin，覆盖抓取新提交、修剪、取消

## Comments

- 2026-11-12: Resolved on integration branch `sourcetree-workbench` (implemented test-first, merged, code-reviewed, browser E2E checked). See `git log e39e52e..sourcetree-workbench`.
