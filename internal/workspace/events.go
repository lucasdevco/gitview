package workspace

import "sync"

// Event is a message on the workspace event stream (GET /api/v1/events).
// Each kind of event is its own struct; its JSON form, plus a "type" field
// holding EventType, is what subscribers receive. Add a kind by declaring a
// struct with an EventType method and publishing it with Workspace.Publish.
type Event interface {
	// EventType names the kind of event, e.g. "repo.changed".
	EventType() string
}

// Area is a part of a repository whose change is reported separately, so a
// client refreshes only what depends on it.
type Area string

const (
	// AreaRefs covers HEAD, branches, tags, remote-tracking branches and stash.
	AreaRefs Area = "refs"
	// AreaIndex covers the staging area.
	AreaIndex Area = "index"
	// AreaWorktree covers files in the working tree. Outside edits are not
	// watched (clients poll status); gitview's own writes report it.
	AreaWorktree Area = "worktree"
	// AreaState covers an in-progress merge, rebase, cherry-pick or revert.
	AreaState Area = "state"
)

// RepoChanged reports that an open repository changed. Version increases
// with every change of that repository.
type RepoChanged struct {
	RepoID  string `json:"repoId"`
	Version uint64 `json:"version"`
	Changed []Area `json:"changed"`
}

// EventType implements Event.
func (RepoChanged) EventType() string { return "repo.changed" }

// subscriberBuffer is how many events a subscriber may fall behind before it
// is dropped.
const subscriberBuffer = 64

// Subscription receives every event published after it was created.
type Subscription struct {
	events chan Event
	hub    *eventHub
}

// Events delivers the subscription's events. It is closed when the
// subscription is closed, when the workspace is closed, or when the
// subscriber fell too far behind; a client that reconnects after that must
// assume anything may have changed.
func (s *Subscription) Events() <-chan Event { return s.events }

// Close ends the subscription. It is safe to call more than once.
func (s *Subscription) Close() { s.hub.remove(s) }

// eventHub fans events out to subscribers.
type eventHub struct {
	mu          sync.Mutex
	subscribers map[*Subscription]struct{}
	closed      bool
}

func newEventHub() *eventHub {
	return &eventHub{subscribers: map[*Subscription]struct{}{}}
}

func (h *eventHub) subscribe() *Subscription {
	h.mu.Lock()
	defer h.mu.Unlock()
	sub := &Subscription{events: make(chan Event, subscriberBuffer), hub: h}
	if h.closed {
		close(sub.events)
		return sub
	}
	h.subscribers[sub] = struct{}{}
	return sub
}

func (h *eventHub) publish(event Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for sub := range h.subscribers {
		select {
		case sub.events <- event:
		default:
			// Never block publishers on a slow client; dropping it makes the
			// client reconnect and refetch.
			delete(h.subscribers, sub)
			close(sub.events)
		}
	}
}

func (h *eventHub) remove(sub *Subscription) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.subscribers[sub]; ok {
		delete(h.subscribers, sub)
		close(sub.events)
	}
}

func (h *eventHub) close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closed = true
	for sub := range h.subscribers {
		delete(h.subscribers, sub)
		close(sub.events)
	}
}
