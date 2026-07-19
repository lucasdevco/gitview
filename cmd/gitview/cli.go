package main

import (
	"context"
	"errors"

	"github.com/urfave/cli/v3"
)

type serveConfig struct {
	Repository string
	Port       int
}

type serveAction func(context.Context, serveConfig) error

func newCommand(action serveAction) *cli.Command {
	return &cli.Command{
		Name:        "gitview",
		Usage:       "analyze a Git repository in a local web interface",
		Description: "Gitview reads local Git history and serves an embedded web interface on loopback.",
		HideVersion: true,
		Suggest:     true,
		Commands: []*cli.Command{
			{
				Name:      "serve",
				Usage:     "start the local Git analysis web interface",
				ArgsUsage: "[repository]",
				Flags: []cli.Flag{
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
				},
				Arguments: []cli.Argument{
					&cli.StringArg{Name: "repository", Value: "."},
				},
				Action: func(ctx context.Context, command *cli.Command) error {
					if command.NArg() > 0 {
						return errors.New("serve accepts at most one repository path")
					}
					return action(ctx, serveConfig{
						Repository: command.StringArg("repository"),
						Port:       command.Int("port"),
					})
				},
			},
		},
	}
}
