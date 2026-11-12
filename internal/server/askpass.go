package server

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"

	"gitview/internal/askpass"
	"gitview/internal/workspace"
)

// AskpassPath is the endpoint gitview's credential helper calls back. Pass
// the server's address plus this path to workspace.UseCredentialHelper.
//
// The helper runs as a child of git, so the endpoint only answers loopback
// clients presenting the secret of the job that started git, valid only
// while that job runs.
const AskpassPath = "/api/v1/askpass"

// maxPromptBody bounds the helper's request.
const maxPromptBody = 16 << 10

// answerAskpass serves POST AskpassPath: it holds the request until the
// user answers the prompt in the browser, then returns the answer.
func (s *Server) answerAskpass(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackAddr(r.RemoteAddr) {
		writeError(w, http.StatusForbidden, "forbidden_client", "the credential helper must call from this machine")
		return
	}
	scheme, secret, _ := strings.Cut(r.Header.Get("Authorization"), " ")
	if !strings.EqualFold(scheme, "Bearer") || secret == "" {
		writeError(w, http.StatusUnauthorized, "invalid_secret", "the credential helper must present its job's secret")
		return
	}
	var request askpass.Request
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxPromptBody))
	if err == nil {
		err = json.Unmarshal(body, &request)
	}
	if err != nil || strings.TrimSpace(request.Prompt) == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "send {\"prompt\": \"...\"} with the prompt git asked")
		return
	}
	answer, err := s.workspace.Ask(r.Context(), secret, request.Prompt)
	switch {
	case errors.Is(err, workspace.ErrUnknownSecret):
		writeError(w, http.StatusUnauthorized, "invalid_secret", "no running job has this secret")
	case errors.Is(err, workspace.ErrPromptPending):
		writeError(w, http.StatusConflict, "prompt_pending", err.Error())
	case err != nil:
		writeError(w, http.StatusGone, "no_answer", "the prompt was declined, canceled or timed out")
	default:
		writeJSON(w, http.StatusOK, askpass.Response{Answer: answer})
	}
}

func isLoopbackAddr(hostport string) bool {
	host, _, err := net.SplitHostPort(hostport)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// promptAnswer is the body of POST .../jobs/{jobId}/prompt.
type promptAnswer struct {
	// PromptID is the prompt being answered, from the job's prompt.
	PromptID string `json:"promptId"`
	// Answer is what the user typed; null or absent declines the prompt.
	Answer *string `json:"answer"`
}

// answerPrompt serves POST /api/v1/repos/{repoId}/jobs/{jobId}/prompt.
func (s *Server) answerPrompt(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	var answer promptAnswer
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxPromptBody))
	if err == nil {
		err = decodeOperationBody(body, &answer)
	}
	if err != nil || answer.PromptID == "" {
		writeError(w, http.StatusBadRequest, "invalid_request",
			"send {\"promptId\": \"...\", \"answer\": \"...\"} with the job's prompt ID, or answer null to decline")
		return
	}
	job, err := repo.AnswerPrompt(r.PathValue("jobId"), answer.PromptID, answer.Answer)
	switch {
	case errors.Is(err, workspace.ErrJobNotFound):
		writeJobNotFound(w, r)
	case errors.Is(err, workspace.ErrPromptClosed):
		writeError(w, http.StatusConflict, "prompt_closed",
			"the prompt is no longer waiting for an answer: it was answered elsewhere, timed out or the job ended")
	default:
		writeData(w, viewJob(job))
	}
}
