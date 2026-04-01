package api

import (
	"errors"
	"net/http"

	"skyimage/internal/files"
)

func statusCodeFromError(err error, fallback int) int {
	if err == nil {
		return fallback
	}
	var statusErr *files.StatusError
	if errors.As(err, &statusErr) && statusErr.StatusCode > 0 {
		return statusErr.StatusCode
	}
	if fallback > 0 {
		return fallback
	}
	return http.StatusInternalServerError
}
