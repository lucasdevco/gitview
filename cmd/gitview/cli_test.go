package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestServeCommandParsesConfiguration(t *testing.T) {
	var received serveConfig
	command := newCommand(func(_ context.Context, config serveConfig) error {
		received = config
		return nil
	})
	command.Writer = &bytes.Buffer{}
	command.ErrWriter = &bytes.Buffer{}

	if err := command.Run(context.Background(), []string{"gitview", "serve", "/repo", "--port", "9090"}); err != nil {
		t.Fatal(err)
	}
	if received.Repository != "/repo" || received.Port != 9090 {
		t.Fatalf("unexpected config: %+v", received)
	}
}

func TestServeCommandUsesDefaults(t *testing.T) {
	var received serveConfig
	command := newCommand(func(_ context.Context, config serveConfig) error {
		received = config
		return nil
	})
	command.Writer = &bytes.Buffer{}
	command.ErrWriter = &bytes.Buffer{}

	if err := command.Run(context.Background(), []string{"gitview", "serve"}); err != nil {
		t.Fatal(err)
	}
	if received.Repository != "." || received.Port != 8080 {
		t.Fatalf("unexpected defaults: %+v", received)
	}
}

func TestServeCommandRejectsInvalidPortBeforeAction(t *testing.T) {
	called := false
	command := newCommand(func(context.Context, serveConfig) error {
		called = true
		return nil
	})
	command.Writer = &bytes.Buffer{}
	command.ErrWriter = &bytes.Buffer{}

	err := command.Run(context.Background(), []string{"gitview", "serve", "--port", "65536"})
	if err == nil || !strings.Contains(err.Error(), "between 0 and 65535") {
		t.Fatalf("unexpected error: %v", err)
	}
	if called {
		t.Fatal("serve action should not run for an invalid port")
	}
}

func TestServeCommandRejectsExtraRepositoryArguments(t *testing.T) {
	command := newCommand(func(context.Context, serveConfig) error { return nil })
	command.Writer = &bytes.Buffer{}
	command.ErrWriter = &bytes.Buffer{}

	if err := command.Run(context.Background(), []string{"gitview", "serve", "one", "two"}); err == nil {
		t.Fatal("expected extra argument error")
	}
}

func TestCommandHelp(t *testing.T) {
	output := &bytes.Buffer{}
	command := newCommand(func(context.Context, serveConfig) error { return nil })
	command.Writer = output
	command.ErrWriter = output

	if err := command.Run(context.Background(), []string{"gitview", "serve", "--help"}); err != nil {
		t.Fatal(err)
	}
	text := output.String()
	if !strings.Contains(text, "gitview serve") || !strings.Contains(text, "--port") || !strings.Contains(text, "[repository]") {
		t.Fatalf("unexpected help output:\n%s", text)
	}
}
