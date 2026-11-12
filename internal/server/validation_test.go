package server_test

import (
	"net/http"
	"strings"
	"testing"
)

// Branch and remote names follow the same rules in every operation: a name
// git would read as an option, a forced refspec or a src:dst pair is
// rejected before anything runs, and the message names the field.
func TestBranchAndRemoteNamesAreValidatedAlikeInEveryOperation(t *testing.T) {
	s := newRemoteSetup(t)
	f := newFixture(t, s.local)
	for name, c := range map[string]struct {
		op   string
		body map[string]any
		want string
	}{
		"checkout refspec":         {"checkout", map[string]any{"branch": "a:b"}, `branch "a:b" is not a branch name`},
		"merge forced refspec":     {"merge", map[string]any{"branch": "+main"}, `branch "+main" is not a branch name`},
		"rebase with space":        {"rebase", map[string]any{"onto": "a b"}, `onto "a b" is not a branch name`},
		"upstream option":          {"setUpstream", map[string]any{"branch": "main", "upstream": "-x"}, `upstream "-x"`},
		"delete refspec":           {"deleteBranches", map[string]any{"branches": []string{"+main"}}, `branch "+main"`},
		"fetch option remote":      {"fetch", map[string]any{"remote": "-x"}, `remote "-x" is not a remote name`},
		"pull option remote":       {"pull", map[string]any{"remote": "-x"}, `remote "-x" is not a remote name`},
		"push option remote":       {"push", map[string]any{"remote": "-x", "tags": true}, `remote "-x" is not a remote name`},
		"push remote refspec":      {"push", map[string]any{"remote": "origin", "branches": []map[string]any{{"local": "main", "remote": "a:b"}}}, `remote branch "a:b"`},
		"fetchInto missing remote": {"fetchInto", map[string]any{"branch": "main", "local": "main"}, "missing remote"},
		"fetchInto missing branch": {"fetchInto", map[string]any{"remote": "origin", "local": "main"}, "missing remote branch"},
		"fetchInto local refspec":  {"fetchInto", map[string]any{"remote": "origin", "branch": "main", "local": "a:b"}, `local branch "a:b"`},
	} {
		t.Run(name, func(t *testing.T) {
			code, response := f.operate(t, c.op, c.body)
			if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
				t.Fatalf("status %d: %+v", code, response.Error)
			}
			if !strings.Contains(response.Error.Message, c.want) {
				t.Fatalf("message = %q, want it to contain %q", response.Error.Message, c.want)
			}
			if strings.Contains(response.Error.Message, "local branch name such as") && !strings.Contains(c.want, "local") {
				t.Fatalf("message = %q talks about a local branch", response.Error.Message)
			}
		})
	}
}
