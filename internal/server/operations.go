package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"slices"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
	"gitview/internal/repo/ops"
	"gitview/internal/workspace"
)

// operations are the write operations served at
// POST /api/v1/repos/{repoId}/operations/{op}.
//
// To add one, write it in internal/repo/ops as
//
//	func Name(ctx context.Context, r *repo.Repository, request NameRequest) error
//
// and register it here with newOperation. The request struct is decoded from
// the JSON body and must implement ops.Request; the response lists the git
// commands it ran.
//
// Long-running operations that talk to remotes (fetch, pull, push) are
// registered with newJob instead: the response is 202 Accepted with the
// started job (see jobs.go), progress arrives as job.updated events, and the
// job's commands and error are read from GET .../jobs/{jobId}.
var operations = map[string]operation{
	"stage":   newOperation(ops.Stage),
	"unstage": newOperation(ops.Unstage),
	"commit":  newOperation(ops.Commit),

	// One hunk of a file's diff.
	"stageHunk":   newOperation(ops.StageHunk),
	"unstageHunk": newOperation(ops.UnstageHunk),
	"discardHunk": newOperation(ops.DiscardHunk),

	// Branches.
	"checkout":       newOperation(ops.Checkout),
	"createBranch":   newOperation(ops.CreateBranch),
	"deleteBranches": newOperation(ops.DeleteBranches),
	"renameBranch":   newOperation(ops.RenameBranch),
	"setUpstream":    newOperation(ops.SetUpstream),

	// Stashes: push saves the working tree; apply and drop name a stash by
	// index and oid.
	"stashPush":  newOperation(ops.StashPush),
	"stashApply": newOperation(ops.StashApply),
	"stashDrop":  newOperation(ops.StashDrop),

	// Merge and rebase; a conflict leaves the repository merging or
	// rebasing until it is concluded or aborted.
	"merge":       newOperation(ops.Merge),
	"abortMerge":  newOperation(ops.AbortMerge),
	"rebase":      newOperation(ops.Rebase),
	"abortRebase": newOperation(ops.AbortRebase),

	// One commit of the history. Cherry-pick and revert conflicts, like
	// merge conflicts, leave the repository cherry-picking or reverting
	// until the resolution is committed or they are aborted.
	"createTag":       newOperation(ops.CreateTag),
	"reset":           newOperation(ops.Reset),
	"cherryPick":      newOperation(ops.CherryPick),
	"abortCherryPick": newOperation(ops.AbortCherryPick),
	"revert":          newOperation(ops.Revert),
	"abortRevert":     newOperation(ops.AbortRevert),

	// Background jobs.
	"fetch": newJob(ops.Fetch),
	"pull":  newJob(ops.Pull),
	"push":  newJob(ops.Push),
	// 拿来: fast-forward a branch that is not checked out.
	"fetchInto": newJob(ops.FetchInto),
}

// maxOperationBody bounds an operation's JSON request body.
const maxOperationBody = 1 << 20

// operation decodes a request body and returns the work to run under the
// repository's write lock.
type operation struct {
	prepare func(body []byte) (workspace.WriteFunc, error)
	// background runs the work as a job instead of within the request.
	background bool
}

// newOperation registers an operation that runs within the request.
func newOperation[Request ops.Request](run func(context.Context, *repo.Repository, Request) error) operation {
	return operation{prepare: prepareWrite(run)}
}

// newJob registers an operation that runs as a background job.
func newJob[Request ops.Request](run func(context.Context, *repo.Repository, Request) error) operation {
	return operation{prepare: prepareWrite(run), background: true}
}

// prepareWrite decodes and validates a request. Every request is validated
// here, and only here, so an invalid one is rejected with 400 before it
// waits for the write lock or starts a job.
func prepareWrite[Request ops.Request](run func(context.Context, *repo.Repository, Request) error) func([]byte) (workspace.WriteFunc, error) {
	return func(body []byte) (workspace.WriteFunc, error) {
		var request Request
		if err := decodeOperationBody(body, &request); err != nil {
			return nil, err
		}
		if err := request.Validate(); err != nil {
			return nil, err
		}
		return func(ctx context.Context, r *repo.Repository) error { return run(ctx, r, request) }, nil
	}
}

// decodeOperationBody decodes a JSON object strictly; an empty body means
// all fields take their zero value.
func decodeOperationBody(body []byte, into any) error {
	if len(strings.TrimSpace(string(body))) == 0 {
		return nil
	}
	decoder := json.NewDecoder(strings.NewReader(string(body)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(into); err != nil {
		return &ops.InvalidRequestError{Message: "invalid JSON request body: " + err.Error()}
	}
	if decoder.More() {
		return &ops.InvalidRequestError{Message: "invalid JSON request body: unexpected data after the object"}
	}
	return nil
}

func (s *Server) registerOperations(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/repos/{repoId}/operations/{op}", s.withRepo(s.runOperation))
	mux.HandleFunc("/api/v1/repos/{repoId}/operations/{op}", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "operations only accept POST with a JSON body")
	})
	mux.HandleFunc("GET /api/v1/repos/{repoId}/commands", s.withRepo(s.listCommands))
	s.registerJobs(mux)
}

// operationResult is the response to a successful operation.
type operationResult struct {
	// Commands are the git commands the operation ran, in order.
	Commands []git.LogEntry `json:"commands"`
}

func (s *Server) runOperation(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	name := r.PathValue("op")
	op, ok := operations[name]
	if !ok {
		known := make([]string, 0, len(operations))
		for key := range operations {
			known = append(known, key)
		}
		slices.Sort(known)
		writeError(w, http.StatusNotFound, "unknown_operation",
			fmt.Sprintf("unknown operation %q; available operations: %s", name, strings.Join(known, ", ")))
		return
	}
	if mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || mediaType != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type",
			"operations only accept a JSON body; send Content-Type: application/json")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxOperationBody))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "body_too_large", "the request body is larger than 1 MiB")
		return
	}
	run, err := op.prepare(body)
	if err != nil {
		writeOperationError(w, err, nil)
		return
	}
	if op.background {
		s.startJob(w, repo, name, run)
		return
	}
	commands, err := repo.Write(r.Context(), run)
	if err != nil {
		writeOperationError(w, err, commands)
		return
	}
	writeData(w, operationResult{Commands: nonNil(commands)})
}

// writeOperationError reports a failed operation. Besides code, message and
// hint, the error carries git's output (for a failed hook, the hook's
// output) and the commands that ran before and including the failing one.
func writeOperationError(w http.ResponseWriter, err error, commands []git.LogEntry) {
	status, described := describeError(err)
	writeJSON(w, status, map[string]any{"error": struct {
		apiError
		Commands []git.LogEntry `json:"commands"`
	}{described, nonNil(commands)}})
}

// listCommands answers GET /api/v1/repos/{repoId}/commands: the repository's
// recent write commands, oldest first.
func (s *Server) listCommands(w http.ResponseWriter, _ *http.Request, repo *workspace.Repo) {
	writeData(w, repo.Commands())
}

func nonNil(commands []git.LogEntry) []git.LogEntry {
	if commands == nil {
		return []git.LogEntry{}
	}
	return commands
}
