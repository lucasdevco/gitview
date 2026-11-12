package git

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
)

// Version is a git release number.
type Version struct{ Major, Minor, Patch int }

// MinimumVersion is the oldest git gitview supports. 2.32 (June 2021) is the
// floor lazygit also uses; it has everything the workbench relies on:
// status --porcelain=v2, for-each-ref %(upstream:track), switch/restore,
// stash push with pathspecs, push --force-if-includes, and
// GIT_CONFIG_COUNT-style config injection through the environment.
var MinimumVersion = Version{2, 32, 0}

func (v Version) String() string { return fmt.Sprintf("%d.%d.%d", v.Major, v.Minor, v.Patch) }

// AtLeast reports whether v is the same as or newer than other.
func (v Version) AtLeast(other Version) bool {
	if v.Major != other.Major {
		return v.Major > other.Major
	}
	if v.Minor != other.Minor {
		return v.Minor > other.Minor
	}
	return v.Patch >= other.Patch
}

var versionPattern = regexp.MustCompile(`git version (\d+)\.(\d+)(?:\.(\d+))?`)

// RequireVersion reads the installed git version and fails with an
// UnsupportedVersion error, including upgrade advice, when it is older than
// MinimumVersion.
func RequireVersion(ctx context.Context, runner Runner) (Version, error) {
	command := Read("version")
	result, err := runner.Run(ctx, command)
	if err != nil {
		return Version{}, err
	}
	match := versionPattern.FindStringSubmatch(string(result.Stdout))
	if match == nil {
		return Version{}, &Error{
			Kind:    UnsupportedVersion,
			Command: command.String(),
			Stderr:  fmt.Sprintf("unrecognized output %q; gitview needs git %s or newer", result.Stdout, MinimumVersion),
		}
	}
	var version Version
	version.Major, _ = strconv.Atoi(match[1])
	version.Minor, _ = strconv.Atoi(match[2])
	if match[3] != "" {
		version.Patch, _ = strconv.Atoi(match[3])
	}
	if !version.AtLeast(MinimumVersion) {
		return version, &Error{
			Kind:    UnsupportedVersion,
			Command: command.String(),
			Stderr: fmt.Sprintf("found git %s, but gitview needs git %s or newer; upgrade git (https://git-scm.com/downloads) and try again",
				version, MinimumVersion),
		}
	}
	return version, nil
}
