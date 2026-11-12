# 05: 提交与写操作基础设施

**What to build:** 在文件状态视图勾选文件即可暂存或取消暂存（分组标题勾选框全选），在底部提交区看到提交身份、输入多行信息并提交；支持“更正上一次提交”、提交选项中的“跳过 hooks”、“立即推送变更到 origin/<分支>”（推送部分在工单 10 前可先禁用）。hook 失败时显示其输出。所有写操作经过按仓库的写锁，`index.lock` 冲突自动重试，执行的命令进入底部命令日志栏。标题栏“提交”按钮带待提交文件数角标并跳到文件状态视图。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `POST .../operations/{op}` 写接口框架：JSON 请求体，仅 POST + `application/json`，响应带实际执行的 git 命令与分类错误
- [ ] 按仓库写锁：并发写请求串行执行（API 测试验证），读请求不受影响
- [ ] `index.lock` 错误按退避重试（API 测试用人为加锁验证）
- [ ] stage / unstage（文件级）、commit（含 amend、`--no-verify`）
- [ ] 无已暂存文件或信息为空时提交按钮不可用；空仓库可完成首次提交
- [ ] hook 失败时界面显示 hook 输出（API 测试用失败的 pre-commit hook 验证）
- [ ] 命令日志栏显示最近执行的命令；命令预览生成逻辑有 vitest 覆盖
