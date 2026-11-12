package server

import (
	"context"
	"encoding/json"
	"errors"
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
// and register it here. The request struct is decoded from the JSON body;
// the response lists the git commands it ran.
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
}

// maxOperationBody bounds an operation's JSON request body.
const maxOperationBody = 1 << 20

// operation decodes a request body and returns the work to run under the
// repository's write lock.
type operation func(body []byte) (workspace.WriteFunc, error)

func newOperation[Request any](run func(context.Context, *repo.Repository, Request) error) operation {
	return func(body []byte) (workspace.WriteFunc, error) {
		var request Request
		if err := decodeOperationBody(body, &request); err != nil {
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
	run, err := op(body)
	if err != nil {
		writeOperationError(w, err, nil)
		return
	}
	commands, err := repo.Write(r.Context(), run)
	if err != nil {
		writeOperationError(w, err, commands)
		return
	}
	writeData(w, operationResult{Commands: nonNil(commands)})
}

// writeOperationError reports a failed operation. Besides code and message,
// the error carries git's output (for a failed hook, the hook's output) and
// the commands that ran before and including the failing one.
func writeOperationError(w http.ResponseWriter, err error, commands []git.LogEntry) {
	status, code, message := describeError(err)
	body := map[string]any{"code": code, "message": message, "commands": nonNil(commands)}
	var gitErr *git.Error
	if errors.As(err, &gitErr) {
		body["output"] = gitErr.Output()
		if gitErr.Kind == git.HookFailed {
			body["message"] = fmt.Sprintf("the %s hook failed; fix what it reports, or skip hooks for this commit", gitErr.Hook)
		}
	}
	writeJSON(w, status, map[string]any{"error": body})
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
