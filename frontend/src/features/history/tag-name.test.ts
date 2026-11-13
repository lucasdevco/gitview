import { describe, expect, it } from "vitest"
import { tagNameProblem } from "./tag-name"

// Cases follow git check-ref-format for refs/tags/<name>; the backend
// rejects the same names (internal/server/commit_ops_test.go).
describe("tagNameProblem", () => {
  it("accepts version-like and hierarchical names", () => {
    for (const name of ["v1.0", "release/v1", "v2.0.0-rc.1", "发布-1"]) {
      expect(tagNameProblem(name, [])).toBeUndefined()
    }
  })

  it("asks for a name when empty", () => {
    expect(tagNameProblem("", [])).toBe("请输入标签名")
  })

  it("rejects names git refuses, saying why", () => {
    expect(tagNameProblem("bad..name", [])).toBe("不能包含“..”")
    expect(tagNameProblem("with space", [])).toBe("不能包含空格")
    expect(tagNameProblem("-v2", [])).toBe("不能以“-”开头")
    expect(tagNameProblem("v1.lock", [])).toBe("各级名称不能以“.lock”结尾")
  })

  it("rejects a name an existing tag has", () => {
    expect(tagNameProblem("v1", ["v1", "v2"])).toBe("已存在名为 v1 的标签")
  })
})
