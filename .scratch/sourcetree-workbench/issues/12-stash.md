# 12: 贮藏

**What to build:** “贮藏”对话框（说明文字、可选信息、保留缓存的变更）把工作区恢复干净；无改动时不可确认。侧边栏“已贮藏”列出贮藏，选中可查看其文件与 diff，并可应用或删除。

**Blocked by:** 04, 05

**Status:** resolved

- [ ] stash push（`-m`、`--keep-index`，含未跟踪文件策略按 Sourcetree 默认）、stash apply、stash drop
- [ ] `GET .../stashes` 与 `GET .../stashes/{index}`（文件与 diff）
- [ ] 贮藏对话框与原型/截图一致
- [ ] 侧边栏贮藏列表、查看、应用、删除（删除前确认）
- [ ] API 测试覆盖贮藏、保留暂存、应用冲突、删除

## Comments

- 2026-11-12: Resolved on integration branch `sourcetree-workbench` (implemented test-first, merged, code-reviewed, browser E2E checked). See `git log e39e52e..sourcetree-workbench`.
