package main

import (
	"context"
	"fmt"
	"os"
)

func main() {
	if err := newCommand(serve).Run(context.Background(), os.Args); err != nil {
		fmt.Fprintln(os.Stderr, "gitview:", err)
		os.Exit(1)
	}
}
