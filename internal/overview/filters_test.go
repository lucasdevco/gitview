package overview

import (
	"errors"
	"testing"
	"time"
)

func TestParseFilters(t *testing.T) {
	location := time.FixedZone("test", 8*60*60)
	filters, err := ParseFilters("2026-01-01", "2026-01-31", "internal/parser/../server", location)
	if err != nil {
		t.Fatal(err)
	}
	if filters.Since != "2026-01-01" || filters.Until != "2026-01-31" || filters.Path != "internal/server" {
		t.Fatalf("unexpected filters: %+v", filters)
	}
	if !filters.includes(time.Date(2026, 1, 31, 23, 59, 59, 0, location)) {
		t.Fatal("until date should include the entire local calendar day")
	}
	if filters.includes(time.Date(2026, 2, 1, 0, 0, 0, 0, location)) {
		t.Fatal("date after until should be excluded")
	}
}

func TestParseFiltersRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name, since, until, path, code string
	}{
		{name: "since", since: "01-01-2026", code: "invalid_since"},
		{name: "until", until: "tomorrow", code: "invalid_until"},
		{name: "range", since: "2026-02-01", until: "2026-01-31", code: "invalid_date_range"},
		{name: "absolute path", path: "/tmp/outside", code: "invalid_path"},
		{name: "parent path", path: "../outside", code: "invalid_path"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := ParseFilters(test.since, test.until, test.path, time.UTC)
			var filterErr *FilterError
			if !errors.As(err, &filterErr) || filterErr.Code != test.code {
				t.Fatalf("expected %s, got %v", test.code, err)
			}
		})
	}
}
