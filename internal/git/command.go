// Package git is gitview's execution layer: every call to the system git
// binary goes through a Runner, built from a Command, so environment,
// argument handling and error classification are the same everywhere.
package git

import "strings"

// Command is one git invocation. Build it with Read or Write and the Arg
// helpers; arguments are passed to git verbatim and never through a shell.
type Command struct {
	args  []string
	write bool
	input []byte
	// progress receives stderr line by line while the command runs; see
	// Reporting.
	progress func(Progress)
	// env holds variables added to git's environment; see WithEnv. Like
	// input, it is not part of String.
	env []string
}

// Read starts a command that only inspects the repository. Read commands run
// with GIT_OPTIONAL_LOCKS=0 so they never contend with writers for index.lock.
func Read(subcommand string, args ...string) *Command {
	return &Command{args: append([]string{subcommand}, args...)}
}

// Write starts a command that changes the repository, its index or its
// working tree.
func Write(subcommand string, args ...string) *Command {
	return &Command{args: append([]string{subcommand}, args...), write: true}
}

// Arg appends arguments.
func (c *Command) Arg(args ...string) *Command {
	c.args = append(c.args, args...)
	return c
}

// ArgIf appends arguments only when condition is true.
func (c *Command) ArgIf(condition bool, args ...string) *Command {
	if condition {
		c.args = append(c.args, args...)
	}
	return c
}

// Input sets what the command reads on standard input, such as the patch
// for "git apply". It is not part of String: logs and previews show only
// the arguments.
func (c *Command) Input(data []byte) *Command {
	c.input = data
	return c
}

// Argv returns the arguments after "git".
func (c *Command) Argv() []string {
	return append([]string(nil), c.args...)
}

// IsWrite reports whether the command changes the repository.
func (c *Command) IsWrite() bool { return c.write }

// String renders the command the way a user would type it in a POSIX shell,
// for command logs and previews.
func (c *Command) String() string {
	parts := make([]string, 0, len(c.args)+1)
	parts = append(parts, "git")
	for _, arg := range c.args {
		parts = append(parts, shellQuote(arg))
	}
	return strings.Join(parts, " ")
}

func shellQuote(arg string) string {
	if arg == "" {
		return "''"
	}
	safe := true
	for _, r := range arg {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("_@%+=:,./-^~", r)) {
			safe = false
			break
		}
	}
	if safe {
		return arg
	}
	return "'" + strings.ReplaceAll(arg, "'", `'\''`) + "'"
}
