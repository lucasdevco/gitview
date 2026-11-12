// The 推送 dialog: pick a remote, the local branches to push (each to a
// remote branch — its upstream there or the same name, editable — and
// optionally tracking it), and whether to push all tags.
// Pushing runs as a background job; a rejected push is explained in the job
// strip with the advice to pull first.
import { useState } from "react"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Check, Group, OperationSheet } from "@/features/operations/operation-sheet"
import type { Refs } from "@/lib/api/history"
import type { PushRequest } from "@/lib/api/jobs"
import { useStartJob } from "@/lib/api/use-job"
import { pushCommands } from "@/lib/command-preview"
import { defaultRemote, type PushRowEdit, pushBranch, pushRows, remoteBranchProblem } from "./remotes"

export type PushDialogOptions = {
  /** The remote to push to; by default the current branch's, else origin. */
  remote?: string
  /** The local branches ticked at first; by default the current branch. */
  branches?: string[]
}

export function PushDialog({
  repoId,
  refs,
  initial,
  onClose,
}: {
  repoId: string
  refs?: Refs
  initial?: PushDialogOptions
  onClose: () => void
}) {
  const start = useStartJob(repoId, "push")
  const queuesBehind = useWritesBlocked(repoId)
  const remotes = refs?.remotes ?? []
  const locals = refs?.branches ?? []
  const [remote, setRemote] = useState(() => initial?.remote ?? defaultRemote(refs) ?? "")
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(initial?.branches ?? locals.filter((branch) => branch.current).map((branch) => branch.name)),
  )
  // Remote branch names typed and 跟踪？ toggled, for the chosen remote.
  const [edits, setEdits] = useState<Record<string, PushRowEdit>>({})
  const [tags, setTags] = useState(false)

  const rows = pushRows(locals, remotes, remote)
  const chosen = rows.filter((row) => selected.has(row.local))
  const request: PushRequest = {
    remote,
    branches: chosen.map((row) => pushBranch(row, edits[row.local] ?? {})),
    tags,
  }
  const problems = chosen.flatMap((row) => {
    const problem = remoteBranchProblem(edits[row.local]?.remote ?? row.remote)
    return problem ? [`${row.local}：${problem}`] : []
  })
  const edit = (local: string, change: PushRowEdit) =>
    setEdits((previous) => ({ ...previous, [local]: { ...previous[local], ...change } }))
  const allChecked = rows.length > 0 && chosen.length === rows.length
  const url = remotes.find((candidate) => candidate.name === remote)?.url
  const toggle = (name: string, on: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous)
      if (on) next.add(name)
      else next.delete(name)
      return next
    })
  return (
    <OperationSheet
      title="推送"
      width={680}
      command={pushCommands(request).join(" && ") || "git push"}
      onClose={onClose}
      disabled={!remote || (chosen.length === 0 && !tags) || problems.length > 0 || start.isPending}
      queuesBehind={queuesBehind}
      onConfirm={() => start.mutate(request, { onSuccess: onClose })}
    >
      <div className="flex items-center gap-2">
        <span>推送到仓库：</span>
        <select
          className="h-6 w-32 rounded-md border bg-background px-2"
          value={remote}
          onChange={(event) => {
            setRemote(event.target.value)
            setEdits({})
          }}
        >
          {remotes.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.name}
            </option>
          ))}
        </select>
        <span className="min-w-0 truncate text-muted-foreground">{url}</span>
      </div>
      <Group title="要推送的分支">
        <div className="overflow-hidden rounded border bg-background">
          <div className="grid grid-cols-[3rem_1fr_1fr_3rem] border-b px-2 py-1 text-[11px]">
            <span>推送？</span>
            <span>本地分支</span>
            <span>远程分支</span>
            <span>跟踪？</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.local}
                className="grid grid-cols-[3rem_1fr_1fr_3rem] items-center px-2 py-0.5 odd:bg-muted/40"
              >
                <input
                  type="checkbox"
                  aria-label={`推送 ${row.local}`}
                  checked={selected.has(row.local)}
                  onChange={(event) => toggle(row.local, event.target.checked)}
                />
                <span className="truncate pr-2">{row.local}</span>
                <input
                  aria-label={`${row.local} 推送到的远程分支`}
                  value={edits[row.local]?.remote ?? row.remote}
                  onChange={(event) => edit(row.local, { remote: event.target.value })}
                  aria-invalid={
                    selected.has(row.local) && !!remoteBranchProblem(edits[row.local]?.remote ?? row.remote)
                  }
                  className="mr-2 h-5 min-w-0 rounded border border-transparent bg-transparent px-1 hover:border-border focus:border-ring focus:bg-background focus:outline-none aria-[invalid=true]:border-destructive"
                />
                <input
                  type="checkbox"
                  aria-label={`跟踪 ${row.local}`}
                  checked={edits[row.local]?.track ?? row.track}
                  onChange={(event) => edit(row.local, { track: event.target.checked })}
                />
              </div>
            ))}
          </div>
        </div>
        {problems.length > 0 && (
          <p role="alert" className="text-destructive">
            {problems[0]}
          </p>
        )}
        <Check
          label="全选"
          checked={allChecked}
          onChange={(value) => setSelected(new Set(value ? rows.map((row) => row.local) : []))}
        />
      </Group>
      <Check label="推送所有标签" checked={tags} onChange={setTags} />
      {start.error && <OperationErrorNotice error={start.error} onDismiss={() => start.reset()} />}
    </OperationSheet>
  )
}
