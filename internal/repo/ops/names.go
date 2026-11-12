package ops

import "strings"

// validateRemoteName accepts the name of a configured remote, such as
// origin: present, and not something git would read as an option.
func validateRemoteName(name string) error {
	if name == "" {
		return invalid("missing remote; pass the name of a configured remote such as origin")
	}
	if strings.HasPrefix(name, "-") || strings.ContainsAny(name, " \t\r\n") {
		return invalid("remote %q is not a remote name; remote names cannot start with \"-\" or contain whitespace; pass a configured remote such as origin", name)
	}
	return nil
}

// validateBranchName accepts a branch name (or another revision such as a
// commit id) passed to git as one argument: present, and not something git
// would read as an option ("-f"), a forced refspec ("+main") or a src:dst
// pair. field names the request field in the message, such as "local
// branch". Whether the branch exists is left to git.
func validateBranchName(field, name string) error {
	if name == "" {
		return invalid("missing %s; pass a branch name such as \"main\"", field)
	}
	if strings.HasPrefix(name, "-") || strings.HasPrefix(name, "+") || strings.ContainsAny(name, ": \t\r\n") {
		return invalid("%s %q is not a branch name; branch names cannot start with \"-\" or \"+\" or contain \":\" or whitespace", field, name)
	}
	return nil
}
