package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"gitview/internal/workspace"
)

// heartbeatInterval keeps idle event streams from being closed by proxies
// and lets the server notice clients that went away.
const heartbeatInterval = 25 * time.Second

// streamEvents serves the workspace's events as server-sent events. Every
// event is one "data:" line holding a JSON object whose "type" field names
// its kind, e.g.
//
//	data: {"type":"repo.changed","repoId":"…","version":3,"changed":["refs"]}
//
// The stream opens with a comment once the subscription is in place. It
// ends when the client goes away, the server shuts down, or the client falls
// too far behind; a reconnecting client must refetch everything.
func (s *Server) streamEvents(w http.ResponseWriter, r *http.Request) {
	sub := s.workspace.Subscribe()
	defer sub.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	stream := http.NewResponseController(w)
	if _, err := fmt.Fprint(w, ": subscribed\n\n"); err != nil {
		return
	}
	_ = stream.Flush()

	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()
	for {
		var chunk string
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			chunk = ": heartbeat\n\n"
		case event, ok := <-sub.Events():
			if !ok {
				return
			}
			data, err := encodeEvent(event)
			if err != nil {
				continue
			}
			chunk = "data: " + string(data) + "\n\n"
		}
		if _, err := fmt.Fprint(w, chunk); err != nil {
			return
		}
		if err := stream.Flush(); err != nil {
			return
		}
	}
}

// encodeEvent is event's JSON object with its "type" field first.
func encodeEvent(event workspace.Event) ([]byte, error) {
	fields, err := json.Marshal(event)
	if err != nil {
		return nil, err
	}
	if len(fields) < 2 || fields[0] != '{' {
		return nil, fmt.Errorf("event %s must encode as a JSON object", event.EventType())
	}
	kind, err := json.Marshal(event.EventType())
	if err != nil {
		return nil, err
	}
	encoded := append([]byte(`{"type":`), kind...)
	if string(fields) != "{}" {
		encoded = append(encoded, ',')
	}
	return append(encoded, fields[1:]...), nil
}
