// The 推送 dialog: pick a remote, the local branches to push (each to its
// remote branch, optionally tracking it), and whether to push all tags.
// Pushing runs as a background job; a rejected push is explained in the job
// strip with the advice to pull first.
import { useState } from "react"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Check, Group, OperationSheet } from "@/features/operations/operation-sheet"
import type { Refs } from "@/lib/api/history"
import type { PushRequest } from "@/lib/api/jobs"
import { useStartJob } from "@/lib/api/use-job"
import { pushCommands } from "@/lib/command-preview"
import { defaultRemote, pushRows } from "./remotes"

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
  const remotes = refs?.remotes ?? []
  const locals = refs?.branches ?? []
  const [remote, setRemote] = useState(() => initial?.remote ?? defaultRemote(refs) ?? "")
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(initial?.branches ?? locals.filter((branch) => branch.current).map((branch) => branch.name)),
  )
  // 跟踪？ changes the user made, for the chosen remote.
  const [track, setTrack] = useState<Record<string, boolean>>({})
  const [tags, setTags] = useState(false)

  const rows = pushRows(locals, remotes, remote)
  const chosen = rows.filter((row) => selected.has(row.local))
  const request: PushRequest = {
    remote,
    branches: chosen.map((row) => ({
      local: row.local,
      remote: row.remote,
      // -u only where it changes something: a branch already tracking there keeps tracking.
      track: (track[row.local] ?? row.track) && !row.track,
    })),
    tags,
  }
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
      disabled={!remote || (chosen.length === 0 && !tags) || start.isPending}
      onConfirm={() => start.mutate(request, { onSuccess: onClose })}
    >
      <div className="flex items-center gap-2">
        <span>推送到仓库：</span>
        <select
          className="h-6 w-32 rounded-md border bg-background px-2"
          value={remote}
          onChange={(event) => {
            setRemote(event.target.value)
            setTrack({})
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
                <span className="truncate pr-2">{row.remote}</span>
                <input
                  type="checkbox"
                  aria-label={`跟踪 ${row.local}`}
                  checked={track[row.local] ?? row.track}
                  onChange={(event) => setTrack({ ...track, [row.local]: event.target.checked })}
                />
              </div>
            ))}
          </div>
        </div>
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
