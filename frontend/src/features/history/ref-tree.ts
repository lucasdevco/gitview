/**
 * A node of a branch tree. Leaves are refs (`path` is the full name, e.g.
 * "feature/login"); folders group names sharing a `/` prefix (`path` is that
 * prefix, e.g. "feature").
 */
export type RefTreeNode = { name: string; path: string; leaf: boolean; children: RefTreeNode[] }

/**
 * Groups ref names into a tree by `/`. Within each level folders come first,
 * then refs, each sorted by name.
 */
export function buildRefTree(names: string[]): RefTreeNode[] {
  const root: RefTreeNode = { name: "", path: "", leaf: false, children: [] }
  for (const name of names) {
    let parent = root
    const parts = name.split("/")
    parts.forEach((part, index) => {
      const leaf = index === parts.length - 1
      let child = parent.children.find((item) => item.name === part && item.leaf === leaf)
      if (!child) {
        child = { name: part, path: parts.slice(0, index + 1).join("/"), leaf, children: [] }
        parent.children.push(child)
      }
      parent = child
    })
  }
  const sort = (nodes: RefTreeNode[]) => {
    nodes.sort((a, b) => Number(a.leaf) - Number(b.leaf) || a.name.localeCompare(b.name))
    for (const node of nodes) sort(node.children)
  }
  sort(root.children)
  return root.children
}
