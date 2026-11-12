# 02: 文件状态视图（只读）与工作区 diff

**What to build:** 点击侧边栏“文件状态”，看到真实仓库的已暂存文件和未暂存文件（含未跟踪），每个文件带 Sourcetree 风格状态图标；选中文件在右侧看到 diff（已暂存为暂存区对 HEAD，未暂存为工作区对暂存区，未跟踪显示完整新增内容），块头显示“块 N： 行 a-b”和旧/新行号。此工单建立前端 diff 解析与渲染组件，后续工单复用。

**Blocked by:** 01

**Status:** resolved

- [ ] `GET .../status` 基于 `status --porcelain=v2 -z` 返回已暂存、未暂存、未跟踪、冲突文件，正确处理重命名与含空格/中文/特殊字符的路径
- [ ] `GET .../diff` 支持 staged / unstaged / untracked 三种来源，开启重命名检测；二进制和超大 diff 返回标记而不是全文
- [ ] 文件状态视图按原型布局：两组文件列表、过长路径省略前缀并可悬停看全名、diff 区与块头
- [ ] diff 区支持文本搜索
- [ ] 二进制/超大文件在界面上有明确提示
- [ ] vitest 覆盖 diff 解析（块头、行号、新增/删除文件、无换行结尾）
- [ ] API 测试在临时真实仓库上覆盖各类文件状态与三种 diff

## Comments

- 2026-11-12: Resolved on integration branch `sourcetree-workbench` (implemented test-first, merged, code-reviewed, browser E2E checked). See `git log e39e52e..sourcetree-workbench`.
