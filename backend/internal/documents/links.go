package documents

import (
	"net/url"
	"regexp"
	"sort"
	"strings"
)

var wikiLinkPattern = regexp.MustCompile(`\[\[([^\]]+)\]\]`)

type docLinkToken struct {
	ID   string
	Slug string
}

func extractDocLinkTokens(text string) []docLinkToken {
	if text == "" {
		return nil
	}
	var tokens []docLinkToken
	matches := wikiLinkPattern.FindAllStringSubmatch(text, -1)
	for _, match := range matches {
		inner := strings.TrimSpace(match[1])
		if inner == "" {
			continue
		}
		parts := strings.SplitN(inner, "|", 2)
		target := strings.TrimSpace(parts[0])
		if target == "" {
			continue
		}
		lower := strings.ToLower(target)
		switch {
		case strings.HasPrefix(lower, "doc:"):
			id := strings.TrimSpace(target[len("doc:"):])
			if id != "" {
				tokens = append(tokens, docLinkToken{ID: id})
			}
			continue
		case strings.HasPrefix(lower, "path:"):
			slug := normalizeWikiTarget(target[len("path:"):])
			if slug != "" {
				tokens = append(tokens, docLinkToken{Slug: slug})
			}
			continue
		default:
			slug := normalizeWikiTarget(target)
			if slug != "" {
				tokens = append(tokens, docLinkToken{Slug: slug})
			}
		}
	}
	return tokens
}

func resolveDocLinkIDs(tokens []docLinkToken, slugMap map[string]string, skipDocID string) []string {
	if len(tokens) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	for _, token := range tokens {
		var candidate string
		if token.ID != "" {
			candidate = token.ID
		} else if token.Slug != "" && slugMap != nil {
			if resolved, ok := slugMap[token.Slug]; ok {
				candidate = resolved
			}
		}
		if candidate == "" || candidate == skipDocID {
			continue
		}
		seen[candidate] = struct{}{}
	}
	if len(seen) == 0 {
		return nil
	}
	result := make([]string, 0, len(seen))
	for id := range seen {
		result = append(result, id)
	}
	sort.Strings(result)
	return result
}

func normalizeWikiTarget(raw string) string {
	decoded := raw
	if v, err := url.PathUnescape(raw); err == nil {
		decoded = v
	}
	slug := strings.TrimSpace(decoded)
	slug = strings.TrimPrefix(slug, "/")
	slug = strings.TrimSuffix(slug, ".md")
	slug = strings.Trim(slug, "/")
	slug = strings.ReplaceAll(slug, "\\", "/")
	return slug
}
