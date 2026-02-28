package files

import (
	"sync"
	"time"
)

type uploadLimiter struct {
	mu     sync.Mutex
	events map[uint][]time.Time
}

func newUploadLimiter() *uploadLimiter {
	return &uploadLimiter{
		events: make(map[uint][]time.Time),
	}
}

func (l *uploadLimiter) Allow(userID uint, perMinute int, perHour int) (bool, time.Duration) {
	if perMinute <= 0 && perHour <= 0 {
		return true, 0
	}

	now := time.Now()
	maxWindow := time.Hour
	if perHour <= 0 {
		maxWindow = time.Minute
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	history := l.events[userID]
	history = pruneOlderThan(history, now, maxWindow)

	if perMinute > 0 {
		count, oldest := countWithin(history, now, time.Minute)
		if count >= perMinute {
			return false, time.Minute - now.Sub(oldest)
		}
	}

	if perHour > 0 {
		count, oldest := countWithin(history, now, time.Hour)
		if count >= perHour {
			return false, time.Hour - now.Sub(oldest)
		}
	}

	history = append(history, now)
	l.events[userID] = history
	return true, 0
}

func pruneOlderThan(history []time.Time, now time.Time, window time.Duration) []time.Time {
	if len(history) == 0 {
		return history
	}
	cutoff := now.Add(-window)
	idx := 0
	for idx < len(history) && history[idx].Before(cutoff) {
		idx++
	}
	if idx == 0 {
		return history
	}
	if idx >= len(history) {
		return nil
	}
	return history[idx:]
}

func countWithin(history []time.Time, now time.Time, window time.Duration) (int, time.Time) {
	if len(history) == 0 {
		return 0, now
	}
	cutoff := now.Add(-window)
	idx := 0
	for idx < len(history) && history[idx].Before(cutoff) {
		idx++
	}
	if idx >= len(history) {
		return 0, now
	}
	return len(history) - idx, history[idx]
}
