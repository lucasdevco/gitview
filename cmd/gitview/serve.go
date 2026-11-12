package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"gitview/internal/git"
	"gitview/internal/server"
	"gitview/internal/workspace"
)

func serve(parent context.Context, config serveConfig) error {
	ctx, stop := signal.NotifyContext(parent, os.Interrupt, syscall.SIGTERM)
	defer stop()

	if _, err := git.RequireVersion(ctx, git.NewRunner(".")); err != nil {
		return err
	}
	ws := workspace.New()
	defer ws.Close()
	repo, err := ws.Open(ctx, config.Repository)
	if err != nil {
		return err
	}
	api, err := server.New(ws)
	if err != nil {
		return fmt.Errorf("initialize web server: %w", err)
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(config.Port)))
	if err != nil {
		return fmt.Errorf("listen on 127.0.0.1:%d: %w", config.Port, err)
	}
	// Remotes that need credentials ask for them in the browser: git runs
	// this binary as its credential helper, which calls back here.
	if program, err := os.Executable(); err == nil {
		ws.UseCredentialHelper(workspace.CredentialHelper{
			Program: program,
			URL:     "http://" + listener.Addr().String() + server.AskpassPath,
		})
	} else {
		_, _ = fmt.Fprintf(config.Stdout, "Warning: remotes that ask for credentials will fail: %v\n", err)
	}
	httpServer := &http.Server{Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second}

	_, _ = fmt.Fprintf(config.Stdout, "Serving %s\n", repo.Root())
	_, _ = fmt.Fprintf(config.Stdout, "Open http://%s/\n", listener.Addr().String())
	serveErr := make(chan error, 1)
	go func() { serveErr <- httpServer.Serve(listener) }()

	select {
	case <-ctx.Done():
		// End event streams first; Shutdown waits for open requests.
		ws.Close()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shut down server: %w", err)
		}
		return nil
	case err := <-serveErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
