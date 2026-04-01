package files

import (
	"context"
	"strings"

	"skyimage/internal/data"
)

func (s *Service) notifyAuditDeleted(ctx context.Context, file data.FileAsset, reasonType, auditMessage string) error {
	if s.notifications == nil {
		return nil
	}
	return s.notifications.CreateImageDeletedByAudit(ctx, file, reasonType, strings.TrimSpace(auditMessage))
}

func (s *Service) notifyAdminDeleted(ctx context.Context, file data.FileAsset, reason string) error {
	if s.notifications == nil {
		return nil
	}
	return s.notifications.CreateImageDeletedByAdmin(ctx, file, strings.TrimSpace(reason))
}
