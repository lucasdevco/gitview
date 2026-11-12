import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useApi } from "./context"
import { type OperationName, type OperationRequests, runOperation } from "./operations"
import { repoKeys } from "./queries"

/**
 * A mutation running one write operation on a repository. When it settles,
 * successful or not, every query of that repository is refreshed, including
 * the command log.
 */
export function useOperation<Op extends OperationName>(repoId: string, op: Op) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: OperationRequests[Op]) => runOperation(api, repoId, op, request),
    onSettled: () => queryClient.invalidateQueries({ queryKey: repoKeys.repo(repoId) }),
  })
}
