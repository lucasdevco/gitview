# 11: 合并

**What to build:** “合并”对话框选择要合并到当前分支的分支（选项：立即提交、包含被合并提交信息、总是创建合并提交、用变基代替合并）；分支右键菜单“合并 X 至当前分支”“将当前变更变基到 X”可用。合并出现冲突时，工作台明确显示“合并中”状态，冲突文件在文件状态中标出，并提供“中止合并”。

**Blocked by:** 08

**Status:** resolved

- [ ] merge（`--no-ff`、`--log`、`--no-commit`）、rebase、merge --abort 写操作
- [ ] 进行中状态检测（读取 `MERGE_HEAD`、`rebase-merge`、`rebase-apply`、`CHERRY_PICK_HEAD` 等，含 rebase 期间 `CHERRY_PICK_HEAD` 的歧义处理）
- [ ] 冲突时界面显示进行中状态横幅、冲突文件标记与“中止合并”
- [ ] API 测试覆盖快进合并、合并提交、冲突合并与中止

## Comments

- 2026-11-12: Resolved on integration branch `sourcetree-workbench` (implemented test-first, merged, code-reviewed, browser E2E checked). See `git log e39e52e..sourcetree-workbench`.
