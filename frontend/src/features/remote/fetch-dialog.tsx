// The 抓取 dialog. Fetching runs as a background job: confirming starts it
// and keeps the dialog open with its progress until it finishes.
import { useState } from "react"
import { JobRunStatus } from "@/features/jobs/job-run-status"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Check, OperationSheet } from "@/features/operations/operation-sheet"
import type { Refs } from "@/lib/api/history"
import type { FetchRequest } from "@/lib/api/jobs"
import { useJobRun } from "@/lib/api/use-job"
import { fetchCommand } from "@/lib/command-preview"
import { defaultRemote } from "./remotes"

export function FetchDialog({ repoId, refs, onClose }: { repoId: string; refs?: Refs; onClose: () => void }) {
  const job = useJobRun(repoId, "fetch", { onSucceeded: onClose })
  const queuesBehind = useWritesBlocked(repoId)
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
      pending={job.pending}
      closeLabel={job.pending ? "在后台运行" : "取消"}
      queuesBehind={job.pending ? undefined : queuesBehind}
      onConfirm={() => job.run(request)}
    >
      <Check label="抓取所有远端更新" checked={all} onChange={setAll} />
      <Check label="删掉在所有远端都已经不存在的跟踪（tracking）分支" checked={prune} onChange={setPrune} />
      <Check label="抓取并在本地存储所有标签" checked={tags} onChange={setTags} />
      <JobRunStatus {...job} />
      {job.error && <OperationErrorNotice error={job.error} onDismiss={job.reset} />}
    </OperationSheet>
  )
}
