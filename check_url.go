package main

import (
	"context"
	"fmt"

	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/files"
)

func main() {
	cfg := config.MustLoad()
	db := data.MustDatabase(cfg)
	svc := files.New(db, cfg)
	var file data.FileAsset
	if err := db.WithContext(context.Background()).Preload("Strategy").First(&file).Error; err != nil {
		panic(err)
	}
	dto, err := svc.ToDTO(context.Background(), file)
	if err != nil {
		panic(err)
	}
	fmt.Printf("view=%s direct=%s\n", dto.ViewURL, dto.DirectURL)
}
