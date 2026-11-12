// The dialog asking for what a remote needs while a job runs: a user name,
// a password or token, an SSH passphrase or a host-key confirmation. git
// asks gitview's credential helper, which waits for this answer; 取消
// declines, and git then reports failed authentication. The answer is sent
// to the local server only and kept nowhere, so the input is not a form
// field browsers offer to save.
import { useQuery } from "@tanstack/react-query"
import { KeyRound } from "lucide-react"
import { Dialog } from "radix-ui"
import { useState } from "react"
import { useApi } from "@/lib/api/context"
import { type CredentialPrompt, type Job, jobsQuery, pendingPrompt } from "@/lib/api/jobs"
import { useAnswerPrompt } from "@/lib/api/use-job"
import { inputClass } from "../operations/operation-sheet"
import { describeJob } from "./job-status"

/** Shows the first credential prompt any job of the repository waits on. */
export function CredentialDialog({ repoId }: { repoId: string }) {
  const api = useApi()
  const jobs = useQuery(jobsQuery(api, repoId))
  const pending = pendingPrompt(jobs.data)
  if (!pending) return null
  // A new prompt (the password after the user name) starts empty.
  return <PromptDialog key={pending.prompt.id} repoId={repoId} job={pending.job} prompt={pending.prompt} />
}

function PromptDialog({ repoId, job, prompt }: { repoId: string; job: Job; prompt: CredentialPrompt }) {
  const answer = useAnswerPrompt(repoId)
  const [value, setValue] = useState("")
  const send = (text: string | null) => {
    if (!answer.isPending) answer.mutate({ jobId: job.id, promptId: prompt.id, answer: text })
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && send(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border bg-popover p-5 text-popover-foreground shadow-2xl"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" />
            <Dialog.Title className="text-[15px] font-semibold">需要凭据</Dialog.Title>
            <span className="ml-auto text-muted-foreground">{describeJob(job).title}</span>
          </div>
          <label className="block space-y-1.5">
            <span className="block break-all">{prompt.text}</span>
            <input
              type={prompt.secret ? "password" : "text"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  send(value)
                }
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              // biome-ignore lint/a11y/noAutofocus: the dialog exists to take this one answer
              autoFocus
              className={inputClass}
            />
          </label>
          <p className="text-muted-foreground">gitview 只把它交给 git，不会保存或记录。</p>
          {answer.error && <p className="text-destructive">提示已关闭：{answer.error.message}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => send(null)}
              className="h-6 min-w-20 rounded-md border bg-background px-3 shadow-xs"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => send(value)}
              disabled={answer.isPending}
              className="h-6 min-w-20 rounded-md bg-primary px-3 text-primary-foreground shadow-xs disabled:opacity-50"
            >
              确定
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
