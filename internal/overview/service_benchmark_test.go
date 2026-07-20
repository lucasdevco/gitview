package overview

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkParseLog(b *testing.B) {
	for _, commits := range []int{1_000, 10_000} {
		b.Run(fmt.Sprintf("commits_%d", commits), func(b *testing.B) {
			var history strings.Builder
			for index := 0; index < commits; index++ {
				fmt.Fprintf(&history, "\x1e%040d\x1fAuthor\x1fauthor@example.com\x1f2026-01-01T00:00:00Z\x1fCommit %d\n10\t2\tfile-%d.go\n", index, index, index)
			}
			raw := history.String()
			b.ReportAllocs()
			b.SetBytes(int64(len(raw)))
			b.ResetTimer()
			for range b.N {
				if _, err := parseLog(strings.NewReader(raw)); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
