# 06: 按块暂存、取消暂存、丢弃

**What to build:** 在文件状态视图的 diff 中，每个块头提供按钮：未暂存文件为“暂存区块”“丢弃区块”，已暂存文件为“取消暂存区块”。同一文件可以只提交部分改动；丢弃前需要确认。

**Blocked by:** 05

**Status:** resolved

- [ ] 服务端根据所选块构造 patch，暂存用 `git apply --cached`，取消暂存用 `git apply --cached -R`，丢弃用 `git apply -R`
- [ ] 丢弃区块弹出确认，取消则不改动
- [ ] 操作后文件列表与 diff 立即反映新状态
- [ ] API 测试覆盖多块文件中只暂存/取消/丢弃其中一块，并用 git 读出的结果断言

## Comments

- 2026-11-12: Resolved on integration branch `sourcetree-workbench` (implemented test-first, merged, code-reviewed, browser E2E checked). See `git log e39e52e..sourcetree-workbench`.
