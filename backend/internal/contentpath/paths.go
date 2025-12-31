package contentpath

import "path/filepath"

var (
	ContentRoot string
	DocsRoot    string
)

func SetRoots(content string) {
	ContentRoot = filepath.Clean(content)
	DocsRoot = filepath.Join(ContentRoot, "docs")
}
