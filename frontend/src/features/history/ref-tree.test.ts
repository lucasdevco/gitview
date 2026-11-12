import { expect, test } from "vitest"
import { buildRefTree, type RefTreeNode } from "./ref-tree.ts"

const leaf = (name: string, path: string): RefTreeNode => ({ name, path, leaf: true, children: [] })
const folder = (name: string, path: string, children: RefTreeNode[]): RefTreeNode => ({
  name,
  path,
  leaf: false,
  children,
})

test("flat names become sorted leaves", () => {
  expect(buildRefTree(["main", "develop"])).toEqual([leaf("develop", "develop"), leaf("main", "main")])
})

test("names split on / into nested folders, folders listed before branches", () => {
  expect(buildRefTree(["main", "feature/login", "feature/ui/menu", "bugfix/crash", "feature/api"])).toEqual([
    folder("bugfix", "bugfix", [leaf("crash", "bugfix/crash")]),
    folder("feature", "feature", [
      folder("ui", "feature/ui", [leaf("menu", "feature/ui/menu")]),
      leaf("api", "feature/api"),
      leaf("login", "feature/login"),
    ]),
    leaf("main", "main"),
  ])
})

test("a folder and a branch with the same name stay separate", () => {
  // e.g. a remote can have both "release" and "release/1.0" when listed from different sources
  expect(buildRefTree(["release/1.0", "release"])).toEqual([
    folder("release", "release", [leaf("1.0", "release/1.0")]),
    leaf("release", "release"),
  ])
})

test("no names, no nodes", () => {
  expect(buildRefTree([])).toEqual([])
})
