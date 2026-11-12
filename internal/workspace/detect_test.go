package workspace

import (
	"context"
	"slices"
	"testing"
	"time"

	"gitview/internal/git"
	"gitview/internal/gittest"
	"gitview/internal/repo"
)

func openWith(t *testing.T, config detection, r *gittest.Repo) (*Workspace, *Repo, *Subscription) {
	t.Helper()
	ws := newWorkspace(config)
	t.Cleanup(ws.Close)
	opened, err := ws.Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	sub := ws.Subscribe()
	t.Cleanup(sub.Close)
	return ws, opened, sub
}

func nextChange(t *testing.T, sub *Subscription, within time.Duration) RepoChanged {
	t.Helper()
	select {
	case event := <-sub.Events():
		changed, ok := event.(RepoChanged)
		if !ok {
			t.Fatalf("unexpected event %#v", event)
		}
		return changed
	case <-time.After(within):
		t.Fatalf("no change within %s", within)
		return RepoChanged{}
	}
}

func TestPollingNoticesRefChangesWithoutFileNotifications(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	_, opened, sub := openWith(t, detection{settle: time.Millisecond, poll: 20 * time.Millisecond}, r)

	r.Git("branch", "feature/login")

	event := nextChange(t, sub, 2*time.Second)
	if event.RepoID != opened.ID || !slices.Equal(event.Changed, []Area{AreaRefs}) || event.Version != 1 {
		t.Fatalf("unexpected event %+v", event)
	}
}

func TestChangingABranchUpstreamIsARefsChange(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	r.Git("branch", "base")
	r.Git("branch", "feature")
	_, _, sub := openWith(t, detection{settle: time.Millisecond, poll: 20 * time.Millisecond}, r)

	r.Git("branch", "--set-upstream-to=base", "feature")

	if event := nextChange(t, sub, 2*time.Second); !slices.Equal(event.Changed, []Area{AreaRefs}) {
		t.Fatalf("unexpected event %+v", event)
	}
}

// stashTwice leaves two stashes, so dropping stash@{1} changes the stash
// list while refs/stash stays as it is.
func stashTwice(r *gittest.Repo) {
	r.Commit("a.txt", "a\n", "first")
	r.Write("a.txt", "one\n")
	r.Git("stash", "push", "-m", "one")
	r.Write("a.txt", "two\n")
	r.Git("stash", "push", "-m", "two")
}

func TestDroppingAnOlderStashIsARefsChange(t *testing.T) {
	r := gittest.Init(t)
	stashTwice(r)
	_, _, sub := openWith(t, detection{settle: time.Millisecond, poll: 20 * time.Millisecond}, r)

	r.Git("stash", "drop", "stash@{1}")

	if event := nextChange(t, sub, 2*time.Second); !slices.Equal(event.Changed, []Area{AreaRefs}) {
		t.Fatalf("unexpected event %+v", event)
	}
}

func TestFileNotificationsNoticeDroppingAnOlderStash(t *testing.T) {
	r := gittest.Init(t)
	stashTwice(r)
	// Polling is too slow to be what reports the change.
	_, _, sub := openWith(t, detection{watchFiles: true, settle: 20 * time.Millisecond, poll: time.Hour}, r)

	r.Git("stash", "drop", "stash@{1}")

	if event := nextChange(t, sub, 2*time.Second); !slices.Equal(event.Changed, []Area{AreaRefs}) {
		t.Fatalf("unexpected event %+v", event)
	}
}

func TestFileNotificationsNoticeBranchesInNewDirectories(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	// Polling is too slow to be what reports the change.
	_, _, sub := openWith(t, detection{watchFiles: true, settle: 20 * time.Millisecond, poll: time.Hour}, r)

	r.Git("branch", "feature/login")
	nextChange(t, sub, 2*time.Second)
	r.Git("branch", "feature/signup")
	if event := nextChange(t, sub, 2*time.Second); event.Version != 2 {
		t.Fatalf("unexpected event %+v", event)
	}
}

func TestAWriteIsReportedOnceWithoutIntermediateStates(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	_, opened, sub := openWith(t, detection{watchFiles: true, settle: time.Millisecond, poll: 10 * time.Millisecond}, r)

	_, err := opened.Write(context.Background(), func(ctx context.Context, w *repo.Repository) error {
		if _, err := w.Runner.Run(ctx, git.Write("branch", "one")); err != nil {
			return err
		}
		time.Sleep(100 * time.Millisecond) // several polls and notifications
		_, err := w.Runner.Run(ctx, git.Write("branch", "two"))
		return err
	})
	if err != nil {
		t.Fatal(err)
	}

	event := nextChange(t, sub, time.Second)
	if !slices.Equal(event.Changed, []Area{AreaRefs, AreaWorktree}) || event.Version != 1 {
		t.Fatalf("unexpected event %+v", event)
	}
	select {
	case extra := <-sub.Events():
		t.Fatalf("write reported twice: %+v", extra)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestClosingTheWorkspaceEndsSubscriptions(t *testing.T) {
	r := gittest.Init(t)
	ws, _, sub := openWith(t, defaultDetection, r)

	ws.Close()

	if _, open := <-sub.Events(); open {
		t.Fatal("subscription should be closed")
	}
	if _, open := <-ws.Subscribe().Events(); open {
		t.Fatal("subscribing to a closed workspace should end at once")
	}
}

func TestASubscriberThatFallsBehindIsDropped(t *testing.T) {
	ws := newWorkspace(defaultDetection)
	slow := ws.Subscribe()
	for range subscriberBuffer + 1 {
		ws.Publish(RepoChanged{})
	}
	received := 0
	for range slow.Events() {
		received++
	}
	if received != subscriberBuffer {
		t.Fatalf("received %d events before being dropped", received)
	}
}
