# 指标与统计口径

本文件先定义语义，后续实现和输出字段必须引用这些定义。标记为“推导”的指标不是 Git 直接事实。

## 1. 身份

| 概念 | 定义 | 数据来源 |
| --- | --- | --- |
| Author | 原始 commit author，通常是最初写改动的人 | commit metadata |
| Committer | 将 commit 写入当前历史的人；rebase、代提交后可能不同于 author | commit metadata |
| Person | 归一化身份，将多个姓名/邮箱映射为同一自然人 | `.mailmap` + 配置 |
| Contributor | 产品层泛称，默认按 Person 去重；输出中不能与 Committer 混用 | 推导 |
| Active contributor | 在指定范围内至少有一个纳入统计的 commit 的 Person | 推导 |

人数默认按唯一 Person 计数。身份未归一化时必须在输出元数据中提示。

## 2. 时间

- 首个 Web MVP 固定使用 author time；完整产品加入时间筛选时再评估是否开放 committer time。
- 日/月分桶必须按用户指定时区，默认本机时区。
- `since` 与 `until` 均包含边界日期。
- 结果必须记录 timezone、time field 和实际 revision。
- 月指公历月，不等同于最近 30 天。

## 3. 代码行指标

Git diff 原生可稳定给出每个文件的 additions 和 deletions，但无法判断“被删除的一行”和“新增的一行”是否是同一行的修改。

| 指标 | 公式 / 定义 | 类型 |
| --- | --- | --- |
| Additions | diff 中新增行 | Git 事实 |
| Deletions | diff 中删除行 | Git 事实 |
| Net change | additions - deletions | 推导 |
| Churn | additions + deletions | 推导 |
| Modified lines | 不作为默认精确指标；若启用近似，必须注明算法 | 近似 |

建议产品默认展示 additions、deletions、net change、churn，不直接把 `min(additions, deletions)` 命名为“修改行数”。如果业务必须显示“修改”，应命名为 `estimated_modified_lines` 并展示口径。

首个 Web MVP 中，二进制文件不计行数；merge commit 计入 commit 数但不累计 merge diff；root commit 与空树比较。submodule、空白变更、重命名、复制、生成文件和 vendor 的细化策略在后续筛选能力中确定。

## 4. Commit 指标

- Commit count：过滤后纳入的非重复 commit 数。
- Active days：范围内至少存在一个 commit 的日期数。
- Commit frequency：commit count / 时间窗口长度；仅用于趋势，不用于个人绩效。
- Large commit：churn 超过可配置阈值或当前仓库分位数的 commit。
- Revert：通过 message 与 patch 相似性识别，属于推导结果，需要置信度。

## 5. 文件与函数实体

- Code entity：目录、文件、类型、函数或方法。
- Function identity：当前 revision 下由语言、路径、限定名和签名组成。
- Function lineage：多个 revision 间被认为是同一函数的实体链。
- Function change：一个 commit 的 patch 与函数在父/子 revision 的范围发生重叠。
- Function churn：归属于函数的 additions + deletions。
- Last changed：最后一个改变实体内容的 commit 时间，不等同于文件 mtime。

函数边界变化、重命名、移动、拆分会产生歧义。每条 lineage 结果应携带 `exact`、`probable` 或 `unknown` 置信度。

## 6. Ownership 与知识指标

建议同时提供历史和近期两个窗口，防止十年前的作者一直被误认为当前维护者。

- Historical owner：全部选定历史中贡献权重最高的 Person。
- Recent maintainer：最近 N 天贡献权重最高且仍活跃的 Person。
- Last toucher：最后修改实体的人。
- Major contributor share：贡献最多的人占该实体总贡献权重的比例。
- Ownership concentration：各贡献者份额的集中程度；具体公式实现前选定。
- Bus factor estimate：累计覆盖某阈值（例如 50% 或 80%）贡献权重所需的最少人数。该指标只表达知识集中风险，不表示人员可替代性。

贡献权重不能仅按 commit 数。候选模型：

```text
weight = recency_decay × (function_changes or churn) × change_type_weight
```

模型参数必须可解释、可配置，并在输出中展示版本。

当前文件级实现固定采用以下可解释口径：

- 贡献权重为文件 churn；二进制变更因没有行数而使用权重 1，但 API 中仍报告实际 churn 0。
- historical owner 使用选定历史的最高权重贡献者；recent owner 使用最近 180 天。
- `bus_factor_80` 为累计覆盖 80% 权重所需的最少贡献者数。
- `ownership_risk = max(historical_share, recent_share) × 100`；构成份额同时返回。

## 7. 热点与风险指标

- Change frequency：实体在窗口内被不同 commit 修改的次数。
- Hotspot base：标准化后的 change frequency × 当前代码规模。
- Risk hotspot：标准化后的 change frequency × complexity × ownership risk。
- Rework：实体在短窗口内重复被修改的程度；需排除纯格式化和生成变更。
- Staleness：距离最后实质修改的时间；“旧”本身不是风险，需与依赖/热点/复杂度结合。
- Complexity growth：两个 revision 间复杂度变化。

所有综合分数必须同时输出构成项，禁止只给一个不透明的 0–100 分。

当前文件和函数热点采用同一透明基线：

```text
hotspot_score = sqrt(normalized_change_frequency × normalized_churn) × 100
```

文件 change frequency 为文件涉及的 commit 数；函数 change frequency 为有 hunk 归属的不同 commit 数。API 同时返回 commits/changes、churn、复杂度和所有权份额，不把综合分数单独解释为风险结论。

函数复杂度从 1 开始，按各语言 Tree-sitter 语法树中的条件、循环、非 default case、异常分支、条件表达式以及 `&&` / `||`（Python 为 `and` / `or`）递增。当前函数位置、签名和复杂度来自 HEAD 的 Tree-sitter 语法树；首批支持 Go、JavaScript/TypeScript、Python、Java 和 Rust。历史 patch 使用零上下文 hunk 与当前范围重叠进行归属，因此 lineage confidence 固定为 `probable`，移动、重命名和边界变化可能不完整。

## 8. 数据质量标记

报告至少应包含以下警告：

- 身份疑似重复但未归一化。
- shallow clone 导致历史不完整。
- 只分析了当前分支或部分 refs。
- 函数解析器不支持某些语言或文件。
- 二进制、生成代码、vendor 被排除的数量。
- rename 检测、merge 策略或 diff 算法改变。
- 缓存使用了不同的配置或指标 schema。
