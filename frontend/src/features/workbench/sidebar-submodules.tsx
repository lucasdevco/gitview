// Sidebar sections 子模块 and 子树, both read-only.
import { useQuery } from "@tanstack/react-query"
import { FolderGit2, Network } from "lucide-react"
import { useApi } from "@/lib/api/context"
import { submodulesQuery } from "@/lib/api/submodules"
import { Section } from "./sidebar-parts"

/** Each submodule's path and the commit this repository pins it at. */
export function SubmodulesSection({ repoId }: { repoId: string }) {
  const api = useApi()
  const submodules = useQuery(submodulesQuery(api, repoId))
  return (
    <Section icon={FolderGit2} title="子模块">
      {submodules.error && (
        <p role="alert" className="px-9 py-0.5 text-destructive" title={submodules.error.message}>
          无法加载子模块
        </p>
      )}
      {submodules.data?.map((submodule) => (
        <div
          key={submodule.path}
          title={`${submodule.path}：记录的提交 ${submodule.oid}（只读）`}
          className="mx-2 flex items-center gap-1.5 py-[3px] pr-2 pl-[30px]"
        >
          <span className="min-w-0 flex-1 truncate">{submodule.path}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{submodule.oid.slice(0, 7)}</span>
        </div>
      ))}
    </Section>
  )
}

/**
 * Subtrees are not detected: git records them only as git-subtree-dir
 * trailers in commit messages, which would mean scanning the whole history
 * on every refresh. The section stays as Sourcetree shows it, empty.
 */
export function SubtreesSection() {
  return <Section icon={Network} title="子树" />
}
