package server

import (
	"crypto/subtle"
	"net"
	"net/http"
	"net/url"
	"strings"
)

// guard enforces gitview's local security model:
//
//   - every request must name a loopback Host, which defeats DNS rebinding;
//   - API requests must not come from another origin (Origin header, or
//     Sec-Fetch-Site for browsers that omit Origin on GET);
//   - API requests must carry the session token, as "Authorization: Bearer
//     <token>" or, for EventSource which cannot set headers, "?token=<token>".
//
// The page itself loads without a token: it is static and holds no
// repository data. The frontend reads the token from the URL it was opened
// with.
func guard(token string, next http.Handler) http.Handler {
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
		if !hasToken(r, token) {
			writeError(w, http.StatusUnauthorized, "invalid_token",
				"missing or invalid access token; open the URL printed by gitview at startup, which includes ?token=")
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

func hasToken(r *http.Request, token string) bool {
	presented := r.URL.Query().Get("token")
	if header := r.Header.Get("Authorization"); header != "" {
		scheme, value, ok := strings.Cut(header, " ")
		if !ok || !strings.EqualFold(scheme, "Bearer") {
			return false
		}
		presented = value
	}
	return presented != "" && subtle.ConstantTimeCompare([]byte(presented), []byte(token)) == 1
}
