package server

import (
	"net"
	"net/http"
	"net/url"
	"strings"
)

// guard enforces gitview's local security model. gitview listens on
// loopback only and is meant for the one user of this machine, so requests
// carry no credentials; instead:
//
//   - every request must name a loopback Host, which defeats DNS rebinding;
//   - API requests must not come from another origin (Origin header, or
//     Sec-Fetch-Site for browsers that omit Origin on GET), so other web
//     pages cannot drive the API.
//
// Write endpoints additionally accept only POST with a JSON body (see
// registerOperations), which a cross-origin form cannot send. The credential
// helper's callback (AskpassPath) also needs its job's secret.
func guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isLoopbackHost(r.Host) {
			writeError(w, http.StatusForbidden, "forbidden_host",
				"gitview only answers requests addressed to 127.0.0.1, localhost or [::1]; open the URL printed by gitview")
			return
		}
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		if !isSameOrigin(r) {
			writeError(w, http.StatusForbidden, "forbidden_origin",
				"cross-origin requests are not allowed; use the gitview page served from this address")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isLoopbackHost(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func isSameOrigin(r *http.Request) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site == "cross-site" || site == "same-site" {
		return false
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme != "http" {
		return false
	}
	return strings.EqualFold(parsed.Host, r.Host)
}
