import { describe, expect, it } from "vitest"
import { branchNameProblem } from "./branch-name"

// Cases follow git check-ref-format for refs/heads/<name>; the backend
// rejects the same names (internal/server/branches_test.go).
describe("branchNameProblem", () => {
  it("accepts ordinary and hierarchical names", () => {
    for (const name of ["main", "feature/login", "release-1.2", "fix_42", "用户/登录", "a@b", "v1.0/x.y"]) {
      expect(branchNameProblem(name, [])).toBeUndefined()
    }
  })

  it("asks for a name when empty", () => {
    expect(branchNameProblem("", [])).toBe("请输入分支名")
  })

  it("rejects names git refuses, saying why", () => {
    const cases: [string, string][] = [
      ["has space", "不能包含空格"],
      ["a..b", "不能包含“..”"],
      ["a~1", "不能包含 ~ ^ : ? * [ \\"],
      ["a^", "不能包含 ~ ^ : ? * [ \\"],
      ["a:b", "不能包含 ~ ^ : ? * [ \\"],
      ["a?", "不能包含 ~ ^ : ? * [ \\"],
      ["a*", "不能包含 ~ ^ : ? * [ \\"],
      ["a[1]", "不能包含 ~ ^ : ? * [ \\"],
      ["a\\b", "不能包含 ~ ^ : ? * [ \\"],
      ["tab\there", "不能包含控制字符"],
      ["a@{1}", "不能包含“@{”"],
      ["@", "不能是“@”"],
      ["-x", "不能以“-”开头"],
      ["/x", "不能以“/”开头或结尾"],
      ["x/", "不能以“/”开头或结尾"],
      ["a//b", "不能包含连续的“/”"],
      ["x.", "不能以“.”结尾"],
      [".hidden", "各级名称不能以“.”开头"],
      ["feature/.x", "各级名称不能以“.”开头"],
      ["x.lock", "各级名称不能以“.lock”结尾"],
      ["x.lock/y", "各级名称不能以“.lock”结尾"],
      ["HEAD", "不能是“HEAD”"],
    ]
    for (const [name, problem] of cases) {
      expect(branchNameProblem(name, []), name).toBe(problem)
    }
  })

  it("rejects a name a local branch already uses", () => {
    expect(branchNameProblem("main", ["main", "dev"])).toBe("已存在名为 main 的分支")
  })
})
