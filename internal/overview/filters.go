package overview

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

type FilterError struct {
	Code    string
	Message string
}

func (e *FilterError) Error() string { return e.Message }

func ParseFilters(since, until, path string, location *time.Location) (Filters, error) {
	if location == nil {
		location = time.Local
	}
	filters := Filters{location: location}
	var err error
	if since != "" {
		filters.since, err = time.ParseInLocation(time.DateOnly, since, location)
		if err != nil {
			return Filters{}, &FilterError{Code: "invalid_since", Message: "since must use YYYY-MM-DD"}
		}
		filters.Since = since
	}
	if until != "" {
		end, parseErr := time.ParseInLocation(time.DateOnly, until, location)
		if parseErr != nil {
			return Filters{}, &FilterError{Code: "invalid_until", Message: "until must use YYYY-MM-DD"}
		}
		filters.untilExclusive = end.AddDate(0, 0, 1)
		filters.Until = until
	}
	if !filters.since.IsZero() && !filters.untilExclusive.IsZero() && !filters.since.Before(filters.untilExclusive) {
		return Filters{}, &FilterError{Code: "invalid_date_range", Message: "since must be on or before until"}
	}

	filters.Path, err = normalizePath(path)
	if err != nil {
		return Filters{}, err
	}
	return filters, nil
}

func normalizePath(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" || value == "." {
		return "", nil
	}
	if filepath.IsAbs(value) {
		return "", &FilterError{Code: "invalid_path", Message: "path must be relative to the repository root"}
	}
	cleaned := filepath.ToSlash(filepath.Clean(value))
	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", &FilterError{Code: "invalid_path", Message: "path must stay inside the repository root"}
	}
	if strings.ContainsRune(cleaned, '\x00') {
		return "", &FilterError{Code: "invalid_path", Message: "path contains an invalid character"}
	}
	return cleaned, nil
}

func (f Filters) includes(authored time.Time) bool {
	location := f.location
	if location == nil {
		location = time.Local
	}
	local := authored.In(location)
	if !f.since.IsZero() && local.Before(f.since) {
		return false
	}
	if !f.untilExclusive.IsZero() && !local.Before(f.untilExclusive) {
		return false
	}
	return true
}

func (f Filters) cacheKey() string {
	return fmt.Sprintf("%s\x00%s\x00%s", f.Since, f.Until, f.Path)
}
