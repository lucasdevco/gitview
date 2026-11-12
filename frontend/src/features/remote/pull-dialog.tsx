// The 拉取 dialog. Pulling runs as a background job: confirming starts it and
// closes the dialog, and the job strip shows its progress and outcome.
import { RefreshCw } from "lucide-react"
import { useState } from "react"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Check, Field, Group, OperationSheet, selectClass } from "@/features/operations/operation-sheet"
import type { Refs } from "@/lib/api/history"
import type { PullRequest } from "@/lib/api/jobs"
import type { RepoSummary } from "@/lib/api/repos"
import { useStartJob } from "@/lib/api/use-job"
import { pullCommand } from "@/lib/command-preview"
import { defaultPullBranch, defaultRemote } from "./remotes"

export function PullDialog({ summary, refs, onClose }: { summary: RepoSummary; refs?: Refs; onClose: () => void }) {
  const start = useStartJob(summary.id, "pull")
  const refresh = useStartJob(summary.id, "fetch")
  const remotes = refs?.remotes ?? []
  const [remote, setRemote] = useState(() => defaultRemote(refs) ?? "")
  const [chosenBranch, setBranch] = useState<string>()
  // 立即提交合并的改动 starts off, as in Sourcetree: a merge stops for review.
  const [commitMerged, setCommitMerged] = useState(false)
  const [log, setLog] = useState(false)
  const [noFastForward, setNoFastForward] = useState(false)
  const [rebase, setRebase] = useState(false)

  const branches = remotes.find((candidate) => candidate.name === remote)?.branches ?? []
  const branch = chosenBranch ?? defaultPullBranch(refs, remote) ?? ""
  const request: PullRequest = rebase
    ? { remote, branch, rebase }
    : { remote, branch, noCommit: !commitMerged, log, noFastForward }
  const url = remotes.find((candidate) => candidate.name === remote)?.url
  return (
    <OperationSheet
      title="拉取"
      command={pullCommand(request)}
      onClose={onClose}
      disabled={!remote || !branch || !summary.branch || start.isPending}
      onConfirm={() => start.mutate(request, { onSuccess: onClose })}
    >
      <Field label="从仓库拉取" hint={url}>
        <select
          className={selectClass}
          value={remote}
          onChange={(event) => {
            setRemote(event.target.value)
            setBranch(undefined)
          }}
        >
          {remotes.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="要拉取的远程分支">
        <div className="flex gap-2">
          <select className={selectClass} value={branch} onChange={(event) => setBranch(event.target.value)}>
            {branches.length === 0 && <option value="">（没有远程分支，先刷新）</option>}
            {branches.map((candidate) => (
              <option key={candidate.name} value={candidate.branch}>
                {candidate.branch}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={`抓取 ${remote} 以更新远程分支列表`}
            disabled={!remote || refresh.isPending}
            onClick={() => refresh.mutate({ remote })}
            className="flex h-6 shrink-0 items-center gap-1 rounded-md border bg-background px-3 shadow-xs disabled:opacity-50"
          >
            <RefreshCw className="size-3" />
            刷新
          </button>
        </div>
      </Field>
      <Field label="拉取到本地分支">
        <div className="pt-1">{summary.branch || "（HEAD 处于分离状态，无法拉取）"}</div>
      </Field>
      <Group title="选项">
        <Check label="立即提交合并的改动" checked={commitMerged} onChange={setCommitMerged} disabled={rebase} />
        <Check label="包括被合并提交的信息内容" checked={log} onChange={setLog} disabled={rebase} />
        <Check
          label="无论是否可以快进更新都创建新的提交"
          checked={noFastForward}
          onChange={setNoFastForward}
          disabled={rebase}
        />
        <Check label="用变基代替合并（警告：请确保您还没有推送您的变更）" checked={rebase} onChange={setRebase} />
      </Group>
      {start.error && <OperationErrorNotice error={start.error} onDismiss={() => start.reset()} />}
      {refresh.error && <OperationErrorNotice error={refresh.error} onDismiss={() => refresh.reset()} />}
    </OperationSheet>
  )
}
