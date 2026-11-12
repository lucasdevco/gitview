package workspace

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"gitview/internal/askpass"
	"gitview/internal/git"
)

// Credential prompts. When a job's git command needs a user name,
// password, passphrase or host-key confirmation, git runs the credential
// helper (internal/askpass), which calls the server back with the job's
// secret. The job then shows the prompt as its Prompt — published in a
// JobUpdated event — and waits for AnswerPrompt, for the job to be
// canceled, for the helper to go away, or for promptTimeout. Answers are
// handed to the helper and kept nowhere else.

// CredentialHelper tells jobs how git reaches gitview's credential helper.
type CredentialHelper struct {
	// Program is the executable git runs as GIT_ASKPASS and SSH_ASKPASS:
	// the gitview binary.
	Program string
	// URL is the server's askpass endpoint on a loopback address.
	URL string
}

// CredentialPrompt is a question git asks while a job runs.
type CredentialPrompt struct {
	ID string `json:"id"`
	// Text is git's or ssh's prompt, e.g. "Password for 'https://host': ".
	Text string `json:"text"`
	// Secret says the answer should be typed hidden (a password or
	// passphrase), unlike a user name or a yes/no confirmation.
	Secret bool `json:"secret"`
}

// promptTimeout is how long a prompt waits for an answer before git is told
// there is none.
const promptTimeout = 5 * time.Minute

var (
	// ErrUnknownSecret means no running job has the secret a credential
	// helper presented.
	ErrUnknownSecret = errors.New("no running job has this credential helper secret")
	// ErrPromptPending means the job is already waiting for an answer.
	ErrPromptPending = errors.New("the job is already waiting for an answer to another prompt")
	// ErrNoAnswer means the prompt closed without an answer: the user
	// declined it, the job was canceled, the helper went away or it timed out.
	ErrNoAnswer = errors.New("the prompt closed without an answer")
	// ErrPromptClosed means the prompt being answered is no longer waiting.
	ErrPromptClosed = errors.New("the prompt is no longer waiting for an answer")
	// ErrJobNotFound means the repository has no job with the given ID.
	ErrJobNotFound = errors.New("no such job")
)

// UseCredentialHelper makes jobs started from now on ask for credentials
// through helper instead of failing when a remote needs them.
func (w *Workspace) UseCredentialHelper(helper CredentialHelper) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.helper = &helper
}

func (w *Workspace) credentialHelper() *CredentialHelper {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.helper
}

// Ask is the credential helper's call: it shows text as a prompt of the
// running job whose secret it is and returns the user's answer. It fails
// with ErrUnknownSecret for a secret of no running job, and with ErrNoAnswer
// when the prompt closes unanswered; ctx ending (the helper going away)
// closes it too.
func (w *Workspace) Ask(ctx context.Context, secret, text string) (string, error) {
	for _, r := range w.Repos() {
		for _, j := range r.jobs.all() {
			if j.hasSecret(secret) {
				return j.ask(ctx, text)
			}
		}
	}
	return "", ErrUnknownSecret
}

// AnswerPrompt answers the job's pending prompt promptID; a nil answer
// declines it, which git reports as failed authentication. It fails with
// ErrJobNotFound, or ErrPromptClosed when that prompt is no longer waiting.
func (r *Repo) AnswerPrompt(jobID, promptID string, answer *string) (Job, error) {
	j, ok := r.jobs.find(jobID)
	if !ok {
		return Job{}, ErrJobNotFound
	}
	if err := j.answer(promptID, answer); err != nil {
		return j.get(), err
	}
	return j.get(), nil
}

// pendingPrompt is a prompt waiting for its answer.
type pendingPrompt struct {
	prompt  CredentialPrompt
	answers chan *string
}

// credentialEnv is what the job's commands need to reach the credential
// helper; nil without a helper.
func (j *job) credentialEnv(helper *CredentialHelper) []string {
	if helper == nil {
		return nil
	}
	return askpass.Env(helper.Program, helper.URL, j.secret)
}

func (j *job) hasSecret(secret string) bool {
	j.mu.Lock()
	running := j.snapshot.State == JobRunning
	j.mu.Unlock()
	return running && secret != "" && subtle.ConstantTimeCompare([]byte(secret), []byte(j.secret)) == 1
}

func (j *job) ask(ctx context.Context, text string) (string, error) {
	j.mu.Lock()
	if j.pending != nil {
		j.mu.Unlock()
		return "", ErrPromptPending
	}
	pending := &pendingPrompt{
		prompt:  CredentialPrompt{ID: newJobID(), Text: strings.TrimSpace(text), Secret: isSecretPrompt(text)},
		answers: make(chan *string, 1),
	}
	j.pending = pending
	j.snapshot.Prompt = &pending.prompt
	j.publishLocked()
	j.mu.Unlock()

	timeout := time.NewTimer(promptTimeout)
	defer timeout.Stop()
	var answer *string
	select {
	case answer = <-pending.answers:
	case <-ctx.Done():
	case <-j.ctx.Done():
	case <-timeout.C:
	}
	j.closePrompt(pending)
	if answer == nil {
		return "", ErrNoAnswer
	}
	return *answer, nil
}

func (j *job) answer(promptID string, answer *string) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.pending == nil || j.pending.prompt.ID != promptID {
		return ErrPromptClosed
	}
	j.pending.answers <- answer
	j.clearPromptLocked()
	return nil
}

// closePrompt clears pending if it is still the job's prompt.
func (j *job) closePrompt(pending *pendingPrompt) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.pending == pending {
		j.clearPromptLocked()
	}
}

func (j *job) clearPromptLocked() {
	j.pending = nil
	j.snapshot.Prompt = nil
	j.publishLocked()
}

// isSecretPrompt tells a password or passphrase prompt from a user name
// prompt or ssh's yes/no host-key question.
func isSecretPrompt(text string) bool {
	lower := strings.ToLower(text)
	return !strings.HasPrefix(lower, "username") && !strings.Contains(lower, "(yes/no")
}

func newSecret() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// withCredentials adds the credential helper's variables to runner.
func withCredentials(runner git.Runner, env []string) git.Runner {
	if len(env) == 0 {
		return runner
	}
	return git.WithEnv(runner, env...)
}
