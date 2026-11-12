// Package askpass is gitview's credential helper: the program git (as
// GIT_ASKPASS) and ssh (as SSH_ASKPASS) run when a remote asks for a user
// name, password, passphrase or host-key confirmation. Instead of reading a
// terminal nobody sees, the helper sends the prompt to the gitview server
// that started the job; the server shows it in the browser and returns what
// the user typed, which the helper prints for git. Nothing is written to
// disk.
//
// git runs the helper as "<program> <prompt>" without a shell, so it cannot
// pass a subcommand: the gitview binary itself is the program, and it acts
// as the helper when its environment holds the variables Env sets (see
// Requested and Main).
//
// The callback goes to a loopback address only and carries the job's
// secret, which the server accepts only while that job runs.
package askpass

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
)

const (
	// envURL is where the helper sends prompts: the server's askpass
	// endpoint on a loopback address.
	envURL = "GITVIEW_ASKPASS_URL"
	// envSecret authenticates the helper's request as coming from the job
	// it was started for.
	envSecret = "GITVIEW_ASKPASS_SECRET"
)

// Request is what the helper sends to the server's askpass endpoint, with
// "Authorization: Bearer <secret>".
type Request struct {
	// Prompt is git's or ssh's prompt, e.g. "Password for 'https://host': ".
	Prompt string `json:"prompt"`
}

// Response is the server's answer to a Request that the user answered.
// Any other status means there is no answer: the user declined, the job
// was canceled, or the prompt timed out.
type Response struct {
	Answer string `json:"answer"`
}

// Env returns the variables that make git and ssh, run with them, ask
// program (the gitview binary) for credentials, and make that helper call
// back to callbackURL with secret. SSH_ASKPASS_REQUIRE=force makes ssh use
// the helper even when gitview runs in a terminal.
func Env(program, callbackURL, secret string) []string {
	return []string{
		"GIT_ASKPASS=" + program,
		"SSH_ASKPASS=" + program,
		"SSH_ASKPASS_REQUIRE=force",
		envURL + "=" + callbackURL,
		envSecret + "=" + secret,
	}
}

// Requested reports whether this process was started as the credential
// helper, judging by the variables Env sets.
func Requested(getenv func(string) string) bool {
	return getenv(envURL) != "" && getenv(envSecret) != ""
}

// Main runs the helper: args are the arguments after the program name (git
// passes the prompt as the only one). It prints the answer on stdout and
// returns the process exit code: 0 with an answer, 1 without one, after
// saying why on stderr.
func Main(args []string, getenv func(string) string, stdout, stderr io.Writer) int {
	prompt := strings.Join(args, " ")
	answer, err := Ask(context.Background(), http.DefaultClient, getenv(envURL), getenv(envSecret), prompt)
	if err != nil {
		_, _ = fmt.Fprintln(stderr, "gitview askpass:", err)
		return 1
	}
	_, _ = fmt.Fprintln(stdout, answer)
	return 0
}

// ErrNoAnswer means the server has no answer for the prompt.
var ErrNoAnswer = errors.New("no answer: the prompt was declined, canceled or timed out")

// Ask sends prompt to the askpass endpoint at callbackURL and returns the
// answer. It refuses any address that is not plain HTTP on a loopback
// address, so a tampered environment cannot send the request elsewhere.
func Ask(ctx context.Context, client *http.Client, callbackURL, secret, prompt string) (string, error) {
	if err := checkLoopback(callbackURL); err != nil {
		return "", err
	}
	body, err := json.Marshal(Request{Prompt: prompt})
	if err != nil {
		return "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, callbackURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+secret)
	response, err := client.Do(request)
	if err != nil {
		return "", fmt.Errorf("reach gitview: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w (status %d)", ErrNoAnswer, response.StatusCode)
	}
	var answer Response
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<16)).Decode(&answer); err != nil {
		return "", fmt.Errorf("read gitview's answer: %w", err)
	}
	return answer.Answer, nil
}

func checkLoopback(callbackURL string) error {
	parsed, err := url.Parse(callbackURL)
	if err != nil || parsed.Scheme != "http" {
		return fmt.Errorf("callback address %q is not an http:// URL", callbackURL)
	}
	ip := net.ParseIP(parsed.Hostname())
	if ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("callback address %q is not on a loopback IP address", callbackURL)
	}
	return nil
}
