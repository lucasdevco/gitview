package main

import (
	"context"
	"fmt"
	"os"

	"gitview/internal/askpass"
)

func main() {
	// git and ssh run gitview itself as their credential helper (GIT_ASKPASS,
	// SSH_ASKPASS) with the prompt as the only argument; see internal/askpass.
	if askpass.Requested(os.Getenv) {
		os.Exit(askpass.Main(os.Args[1:], os.Getenv, os.Stdout, os.Stderr))
	}
	if err := newCommand(serve).Run(context.Background(), os.Args); err != nil {
		fmt.Fprintln(os.Stderr, "gitview:", err)
		os.Exit(1)
	}
}
