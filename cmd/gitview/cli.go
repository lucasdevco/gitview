package main

import (
	"context"
	"errors"
	"io"

	"github.com/urfave/cli/v3"
)

type serveConfig struct {
	Repository string
	Port       int
	// Stdout receives startup messages, including the URL to open.
	Stdout io.Writer
}

type serveAction func(context.Context, serveConfig) error

// newCommand builds the gitview CLI. Running gitview without a subcommand
// behaves like "gitview serve", so "gitview" alone opens the current repository.
func newCommand(action serveAction) *cli.Command {
	return &cli.Command{
		Name:        "gitview",
		Usage:       "manage a Git repository in a local web workbench",
		Description: "Gitview serves a Sourcetree-style Git workbench for a local repository on loopback.\nRunning gitview without a subcommand is the same as gitview serve.",
		ArgsUsage:   "[repository]",
		HideVersion: true,
		Suggest:     true,
		Flags:       serveFlags(),
		Arguments:   serveArguments(),
		Action:      runServe(action),
		Commands: []*cli.Command{
			{
				Name:      "serve",
				Aliases:   []string{"s"},
				Usage:     "start the local Git workbench",
				ArgsUsage: "[repository]",
				Flags:     serveFlags(),
				Arguments: serveArguments(),
				Action:    runServe(action),
			},
		},
	}
}

func serveFlags() []cli.Flag {
	return []cli.Flag{
		&cli.IntFlag{
			Name:             "port",
			Usage:            "loopback port to listen on; 0 selects an available port",
			Value:            8080,
			ValidateDefaults: true,
			Validator: func(port int) error {
				if port < 0 || port > 65535 {
					return errors.New("must be between 0 and 65535")
				}
				return nil
			},
		},
	}
}

func serveArguments() []cli.Argument {
	return []cli.Argument{
		&cli.StringArg{Name: "repository", Value: "."},
	}
}

func runServe(action serveAction) cli.ActionFunc {
	return func(ctx context.Context, command *cli.Command) error {
		if command.NArg() > 0 {
			return errors.New("gitview accepts at most one repository path")
		}
		return action(ctx, serveConfig{
			Repository: command.StringArg("repository"),
			Port:       command.Int("port"),
			Stdout:     command.Root().Writer,
		})
	}
}
