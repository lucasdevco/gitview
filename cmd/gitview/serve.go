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

	"gitview/internal/gitrepo"
	"gitview/internal/overview"
	"gitview/internal/server"
)

func serve(parent context.Context, config serveConfig) error {
	ctx, stop := signal.NotifyContext(parent, os.Interrupt, syscall.SIGTERM)
	defer stop()
	repository, err := gitrepo.Open(ctx, config.Repository)
	if err != nil {
		return err
	}
	api, err := server.New(overview.NewService(repository))
	if err != nil {
		return fmt.Errorf("initialize web server: %w", err)
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(config.Port)))
	if err != nil {
		return fmt.Errorf("listen on 127.0.0.1:%d: %w", config.Port, err)
	}
	httpServer := &http.Server{Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second}

	fmt.Printf("Analyzing %s\n", repository.Root())
	fmt.Printf("Open http://%s\n", listener.Addr().String())
	serveErr := make(chan error, 1)
	go func() { serveErr <- httpServer.Serve(listener) }()

	select {
	case <-ctx.Done():
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
