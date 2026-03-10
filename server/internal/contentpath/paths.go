package contentpath

import "path/filepath"

var (
	DocsRoot      string
	PublishedRoot string
	UnlistedRoot  string
	DraftsRoot    string
)

func SetRoots(docsPath string) {
	DocsRoot = filepath.Clean(docsPath)
	PublishedRoot = filepath.Join(DocsRoot, "published")
	UnlistedRoot = filepath.Join(DocsRoot, "unlisted")
	DraftsRoot = filepath.Join(DocsRoot, "drafts")
}


func GetRootForStatus(status string) string {
	switch status {
	case "unlisted":
		return UnlistedRoot
	default:
		return PublishedRoot
	}
}
