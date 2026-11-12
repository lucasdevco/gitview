import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useApi } from "./context"
import { type OperationName, type OperationRequests, operationKeys, runOperation } from "./operations"

/**
 * A mutation running one write operation on a repository. When it settles,
 * successful or not, the command log is refreshed. Everything else the
 * operation changed is refreshed by the one "repo.changed" event the server
 * sends when the write finishes (see events.ts).
 */
export function useOperation<Op extends OperationName>(repoId: string, op: Op) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: OperationRequests[Op]) => runOperation(api, repoId, op, request),
    onSettled: () => queryClient.invalidateQueries({ queryKey: operationKeys.commandLog(repoId) }),
  })
}
