package git

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
)

// Git prints nothing of its own when a hook stops a command; only the hook's
// output appears. To tell a hook failure from any other failure, write
// commands run with GIT_TRACE2_EVENT pointing at a temporary file, and
// failedHook reads the child-process events git records there: each hook runs
// as a child with child_class "hook".

//
// The events include the argv of every process git starts, which for
// network commands can hold a remote URL with an embedded token (only git
// versions newer than our 2.32 minimum redact it). So the file is readable by the user alone,
// in a directory only the user can enter, and both are removed as soon as
// the command has finished and the events have been read.

// hookTrace is a temporary trace2 event file for one write command.
type hookTrace struct{ dir, path string }

// newHookTrace creates the event file. On failure it returns nil and the
// command runs without hook detection.
func newHookTrace() *hookTrace {
	dir, err := os.MkdirTemp("", "gitview-trace2-") // mode 0700
	if err != nil {
		return nil
	}
	path := filepath.Join(dir, "events.jsonl")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		_ = os.RemoveAll(dir)
		return nil
	}
	_ = file.Close()
	return &hookTrace{dir: dir, path: path}
}

// env is the variable that makes git write its events to the file.
func (t *hookTrace) env() string { return "GIT_TRACE2_EVENT=" + t.path }

// failedHook returns the name of a hook that exited non-zero, or "".
func (t *hookTrace) failedHook() string {
	file, err := os.Open(t.path)
	if err != nil {
		return ""
	}
	defer file.Close()

	type childKey struct {
		sid string
		id  int
	}
	hooks := map[childKey]string{}
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64<<10), 4<<20)
	for scanner.Scan() {
		var event struct {
			Event      string `json:"event"`
			SID        string `json:"sid"`
			ChildID    int    `json:"child_id"`
			ChildClass string `json:"child_class"`
			HookName   string `json:"hook_name"`
			Code       int    `json:"code"`
		}
		if json.Unmarshal(scanner.Bytes(), &event) != nil {
			continue
		}
		key := childKey{event.SID, event.ChildID}
		switch event.Event {
		case "child_start":
			if event.ChildClass == "hook" {
				hooks[key] = event.HookName
			}
		case "child_exit":
			if name, ok := hooks[key]; ok && event.Code != 0 {
				return name
			}
		}
	}
	return ""
}

func (t *hookTrace) remove() { _ = os.RemoveAll(t.dir) }
