package documents

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var (
	frontMatterRE = regexp.MustCompile(`(?s)^---\r?\n(.*?)\r?\n---\r?\n?`)
	statusValues  = map[string]struct{}{
		"published": {},
		"unlisted":  {},
	}
)

type DocumentMetadata struct {
	Status string
	ID     string
	Owner  string
}

func parseDocumentMetadata(raw string) (DocumentMetadata, string) {
	trimmed := strings.TrimPrefix(raw, "\ufeff")
	meta := DocumentMetadata{}
	loc := frontMatterRE.FindStringIndex(trimmed)
	if loc == nil {
		return meta, trimmed
	}
	block := trimmed[loc[0]:loc[1]]
	body := trimmed[loc[1]:]
	status, id, owner := parseFrontMatterBlock(block)
	if status != "" {
		meta.Status = status
	}
	meta.ID = id
	meta.Owner = owner
	return meta, strings.TrimLeft(body, "\r\n")
}

func parseFrontMatterBlock(block string) (string, string, string) {
	status := ""
	id := ""
	owner := ""
	for _, rawLine := range strings.Split(block, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || line == "---" {
			continue
		}
		if strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			switch strings.ToLower(key) {
			case "status":
				status = normalizeStatus(value)
			case "id":
				id = value
			case "owner":
				owner = value
			}
			continue
		}
	}
	return status, id, strings.TrimSpace(owner)
}

func normalizeStatus(raw string) string {
	val := strings.ToLower(strings.TrimSpace(strings.Trim(raw, `"'`)))
	if val == "" {
		return ""
	}
	if _, ok := statusValues[val]; ok {
		return val
	}
	return ""
}

func trimStrings(list []string) []string {
	var out []string
	for _, item := range list {
		if trimmed := strings.TrimSpace(strings.Trim(item, `"'`)); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func uniqueStrings(list []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, item := range list {
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
	}
	return out
}

func idsToJSON(ids []string) string {
	return stringListToJSON(ids)
}

func idsFromJSON(raw string) []string {
	return stringListFromJSON(raw)
}

func stringListToJSON(list []string) string {
	normal := uniqueStrings(trimStrings(list))
	if len(normal) == 0 {
		return ""
	}
	if b, err := json.Marshal(normal); err == nil {
		return string(b)
	}
	return ""
}

func stringListFromJSON(raw string) []string {
	if raw == "" {
		return nil
	}
	var parsed []string
	if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
		return uniqueStrings(trimStrings(parsed))
	}
	return uniqueStrings(trimStrings(strings.Split(raw, ",")))
}

func stripFrontMatter(raw string) string {
	trimmed := strings.TrimPrefix(raw, "\ufeff")
	loc := frontMatterRE.FindStringIndex(trimmed)
	if loc == nil {
		return trimmed
	}
	return strings.TrimLeft(trimmed[loc[1]:], "\r\n")
}

func ensureFrontMatterID(raw string, id string) (string, bool) {
	if id == "" {
		return raw, false
	}
	trimmed := strings.TrimPrefix(raw, "\ufeff")
	hasBOM := len(raw) != len(trimmed)
	loc := frontMatterRE.FindStringIndex(trimmed)
	if loc == nil {
		body := trimmed
		if body == "" {
			body = "\n"
		}
		result := fmt.Sprintf("---\nid: %s\n---\n\n%s", id, body)
		if hasBOM {
			result = "\ufeff" + result
		}
		return result, true
	}
	block := trimmed[loc[0]:loc[1]]
	if frontMatterHasID(block) {
		return raw, false
	}
	idx := strings.Index(block, "\n")
	insertion := fmt.Sprintf("id: %s\n", id)
	var newBlock string
	if idx == -1 {
		newBlock = block + "\n" + insertion
	} else {
		newBlock = block[:idx+1] + insertion + block[idx+1:]
	}
	result := trimmed[:loc[0]] + newBlock + trimmed[loc[1]:]
	if hasBOM {
		result = "\ufeff" + result
	}
	return result, true
}

func setFrontMatterField(raw, key, value string) (string, bool) {
	if key == "" || value == "" {
		return raw, false
	}
	trimmed := strings.TrimPrefix(raw, "\ufeff")
	hasBOM := len(raw) != len(trimmed)
	loc := frontMatterRE.FindStringIndex(trimmed)
	insertion := fmt.Sprintf("%s: %s", key, value)
	if loc == nil {
		body := strings.TrimLeft(trimmed, "\r\n")
		if body == "" {
			body = "\n"
		}
		result := fmt.Sprintf("---\n%s\n---\n\n%s", insertion, body)
		if hasBOM {
			result = "\ufeff" + result
		}
		return result, true
	}
	block := trimmed[loc[0]:loc[1]]
	lines := strings.Split(block, "\n")
	loweredKey := strings.ToLower(strings.TrimSpace(key))
	replaced := false
	for i, line := range lines {
		clean := strings.TrimSpace(line)
		if clean == "" || clean == "---" {
			continue
		}
		if idx := strings.Index(clean, ":"); idx >= 0 {
			name := strings.ToLower(strings.TrimSpace(clean[:idx]))
			if name == loweredKey {
				lines[i] = fmt.Sprintf("%s: %s", key, value)
				replaced = true
				break
			}
		}
	}

	newBlock := block
	if replaced {
		newBlock = strings.Join(lines, "\n")
	} else {
		line := fmt.Sprintf("%s\n", insertion)
		if idx := strings.Index(block, "\n"); idx == -1 {
			newBlock = block + "\n" + line
		} else {
			newBlock = block[:idx+1] + line + block[idx+1:]
		}
	}

	if strings.TrimSpace(newBlock) == strings.TrimSpace(block) {
		return raw, false
	}
	result := trimmed[:loc[0]] + newBlock + trimmed[loc[1]:]
	if hasBOM {
		result = "\ufeff" + result
	}
	return result, true
}

func frontMatterHasID(block string) bool {
	for _, rawLine := range strings.Split(block, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || line == "---" {
			continue
		}
		if strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			if strings.EqualFold(strings.TrimSpace(parts[0]), "id") {
				return true
			}
		}
	}
	return false
}

func frontMatterHasKey(block, key string) bool {
	name := strings.ToLower(strings.TrimSpace(key))
	if name == "" {
		return false
	}
	for _, rawLine := range strings.Split(block, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || line == "---" {
			continue
		}
		if strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			if strings.ToLower(strings.TrimSpace(parts[0])) == name {
				return true
			}
		}
	}
	return false
}

func parentSlug(slug string) string {
	if idx := strings.LastIndex(slug, "/"); idx > 0 {
		return slug[:idx]
	}
	return ""
}
