import { expect, test } from "vitest"
import { describeChange, shortenPath } from "./file-path.ts"

test("short paths are shown whole", () => {
  expect(shortenPath("src/main.tsx")).toBe("src/main.tsx")
})

test("long paths lose their beginning so the file name stays visible", () => {
  expect(shortenPath("frontend/src/features/workbench/sidebar.tsx", 20)).toBe("…rkbench/sidebar.tsx")
  expect(shortenPath("frontend/src/features/workbench/sidebar.tsx", 20)).toHaveLength(20)
})

test("shortening counts characters, not UTF-16 units", () => {
  expect(shortenPath("目录/子目录/文件😀.txt", 8)).toBe("…文件😀.txt")
})

test("renames are described as old → new", () => {
  expect(describeChange({ path: "b.txt", oldPath: "a.txt" })).toBe("a.txt → b.txt")
  expect(describeChange({ path: "b.txt" })).toBe("b.txt")
})
