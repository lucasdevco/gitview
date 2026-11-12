package askpass_test

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"

	"gitview/internal/askpass"
)

func TestHelperOnlyCallsLoopbackAddresses(t *testing.T) {
	for _, address := range []string{
		"http://example.com/api/v1/askpass",
		"https://127.0.0.1:8080/api/v1/askpass",
		"http://localhost.evil.test:8080/api/v1/askpass",
		"http://10.0.0.1:8080/api/v1/askpass",
	} {
		t.Run(address, func(t *testing.T) {
			client := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
				t.Fatal("the helper sent a request")
				return nil, nil
			})}
			if _, err := askpass.Ask(context.Background(), client, address, "secret", "Password: "); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestHelperIsRequestedOnlyWithBothVariables(t *testing.T) {
	env := map[string]string{}
	for _, entry := range askpass.Env("/bin/gitview", "http://127.0.0.1:1/api/v1/askpass", "s3cret") {
		key, value, _ := strings.Cut(entry, "=")
		env[key] = value
	}
	if env["GIT_ASKPASS"] != "/bin/gitview" || env["SSH_ASKPASS"] != "/bin/gitview" || env["SSH_ASKPASS_REQUIRE"] != "force" {
		t.Fatalf("env = %v", env)
	}
	if !askpass.Requested(func(key string) string { return env[key] }) {
		t.Fatal("helper not requested with its variables set")
	}
	if askpass.Requested(func(string) string { return "" }) {
		t.Fatal("helper requested without its variables")
	}
}

func TestHelperWithoutAnAnswerExitsNonZero(t *testing.T) {
	var stdout, stderr bytes.Buffer
	getenv := func(key string) string {
		return map[string]string{"GITVIEW_ASKPASS_URL": "http://example.com/", "GITVIEW_ASKPASS_SECRET": "s"}[key]
	}
	if code := askpass.Main([]string{"Password: "}, getenv, &stdout, &stderr); code != 1 || stdout.Len() != 0 {
		t.Fatalf("exit %d, stdout %q", code, stdout.String())
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
