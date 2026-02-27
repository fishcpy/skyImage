package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"

	"skyimage/internal/api"
	"skyimage/internal/config"
	"skyimage/internal/data"
)

func main() {
	cfg := config.MustLoad()
	db := data.MustDatabase(cfg)
	srv := api.NewServer(cfg, db)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := srv.Run(ctx); err != nil {
		log.Fatal(err)
	}
}
