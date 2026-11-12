// The 抓取 dialog. Fetching runs as a background job: confirming starts it
// and closes the dialog, and the job strip shows its progress.
import { useState } from "react"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Check, OperationSheet } from "@/features/operations/operation-sheet"
import type { Refs } from "@/lib/api/history"
import type { FetchRequest } from "@/lib/api/jobs"
import { useStartJob } from "@/lib/api/use-job"
import { fetchCommand } from "@/lib/command-preview"
import { defaultRemote } from "./remotes"

export function FetchDialog({ repoId, refs, onClose }: { repoId: string; refs?: Refs; onClose: () => void }) {
  const start = useStartJob(repoId, "fetch")
  const [all, setAll] = useState(true)
  const [prune, setPrune] = useState(false)
  const [tags, setTags] = useState(false)
  const request: FetchRequest = { ...(all ? { all } : { remote: defaultRemote(refs) }), prune, tags }
  return (
    <OperationSheet
      title="抓取"
      width={480}
      command={fetchCommand(request)}
      onClose={onClose}
      disabled={start.isPending}
      onConfirm={() => start.mutate(request, { onSuccess: onClose })}
    >
      <Check label="抓取所有远端更新" checked={all} onChange={setAll} />
      <Check label="删掉在所有远端都已经不存在的跟踪（tracking）分支" checked={prune} onChange={setPrune} />
      <Check label="抓取并在本地存储所有标签" checked={tags} onChange={setTags} />
      {start.error && <OperationErrorNotice error={start.error} onDismiss={() => start.reset()} />}
    </OperationSheet>
  )
}
