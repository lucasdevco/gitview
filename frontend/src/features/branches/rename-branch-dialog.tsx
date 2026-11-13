// 重命名… from a branch's context menu.
import { useState } from "react"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Field, inputClass, OperationSheet } from "@/features/operations/operation-sheet"
import { useOperation } from "@/lib/api/use-operation"
import { placeholder, renameBranchCommand } from "@/lib/command-preview"
import { branchNameProblem } from "./branch-name"

export function RenameBranchDialog({
  repoId,
  branch,
  branchNames,
  onClose,
}: {
  repoId: string
  branch: string
  /** Every local branch name, to reject names already in use. */
  branchNames: string[]
  onClose: () => void
}) {
  const operation = useOperation(repoId, "renameBranch")
  const [newName, setNewName] = useState(branch)
  const problem = newName === branch ? "请输入新的分支名" : branchNameProblem(newName, branchNames)
  const request = { branch, newName }
  const blocked = useWritesBlocked(repoId)
  const canSubmit = !problem && !operation.isPending && !blocked
  const submit = () => canSubmit && operation.mutate(request, { onSuccess: onClose })
  return (
    <OperationSheet
      title={`重命名分支 ${branch}`}
      showTitle
      width={480}
      command={renameBranchCommand({ branch, newName: newName || placeholder("新名称") })}
      onClose={onClose}
      onConfirm={submit}
      confirmLabel="重命名"
      disabled={!canSubmit}
      pending={operation.isPending}
      blockedBy={blocked}
    >
      <Field label="新名称" hint={problem ? undefined : `refs/heads/${newName}`}>
        <input
          className={inputClass}
          value={newName}
          aria-label="新分支名"
          aria-invalid={!!problem && newName !== branch}
          // biome-ignore lint/a11y/noAutofocus: the sheet exists to edit this one field
          autoFocus
          onFocus={(event) => event.target.select()}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && submit()}
        />
        {problem && newName !== branch && <div className="mt-0.5 px-1 text-destructive">{problem}</div>}
      </Field>
      {operation.error && <OperationErrorNotice error={operation.error} onDismiss={() => operation.reset()} />}
    </OperationSheet>
  )
}
