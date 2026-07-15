package admin

import "testing"

func TestSplitExternalDomains(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"http://localhost:8080", []string{"http://localhost:8080"}},
		{"http://localhost:8080;http://127.0.0.1:8080", []string{"http://localhost:8080", "http://127.0.0.1:8080"}},
		{"http://localhost:8080 ; http://127.0.0.1:8080", []string{"http://localhost:8080", "http://127.0.0.1:8080"}},
		{"http://cdn.example.com；http://img.example.com", []string{"http://cdn.example.com", "http://img.example.com"}},
		{"http://a.com;http://a.com", []string{"http://a.com"}},
	}
	for _, tc := range cases {
		got := splitExternalDomains(tc.in)
		if len(got) != len(tc.want) {
			t.Fatalf("split %q: got %v want %v", tc.in, got, tc.want)
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Fatalf("split %q[%d]: got %q want %q", tc.in, i, got[i], tc.want[i])
			}
		}
	}
}

func TestValidateExternalDomain_LocalhostAndIP(t *testing.T) {
	ok := []string{
		"http://localhost:8080",
		"https://localhost:8080",
		"http://127.0.0.1:8080",
		"127.0.0.1:8080",
		"localhost:8080",
		"https://cdn.example.com",
		"cdn.example.com",
	}
	for _, item := range ok {
		if err := validateExternalDomain(item); err != nil {
			t.Fatalf("expected ok for %q, got %v", item, err)
		}
	}
	bad := []string{
		"/uploads",
		"http://cdn.example.com/path",
		"http://cdn.example.com?x=1",
		"http://cdn.example.com#frag",
	}
	for _, item := range bad {
		if err := validateExternalDomain(item); err == nil {
			t.Fatalf("expected error for %q", item)
		}
	}
}

func TestValidateStrategyConfigs_MultipleDomains(t *testing.T) {
	err := validateStrategyConfigs(map[string]interface{}{
		"driver": "local",
		"url":    "http://localhost:8080;http://127.0.0.1:8080",
	})
	if err != nil {
		t.Fatalf("validate multi domain: %v", err)
	}
}
