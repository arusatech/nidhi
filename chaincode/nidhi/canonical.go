package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// CanonicalJSON matches @annadata/nidhi canonicalJson (sorted object keys).
func CanonicalJSON(v any) (string, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var n any
	if err := dec.Decode(&n); err != nil {
		return "", err
	}
	return canonicalValue(n), nil
}

func canonicalValue(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case bool:
		if x {
			return "true"
		}
		return "false"
	case json.Number:
		return x.String()
	case string:
		b, _ := json.Marshal(x)
		return string(b)
	case []any:
		parts := make([]string, len(x))
		for i, item := range x {
			parts[i] = canonicalValue(item)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			kb, _ := json.Marshal(k)
			parts = append(parts, string(kb)+":"+canonicalValue(x[k]))
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		return fmt.Sprint(x)
	}
}

func mustInt64(n json.Number) int64 {
	i, err := n.Int64()
	if err != nil {
		f, _ := n.Float64()
		return int64(f)
	}
	return i
}

func parseJSONMap(raw string) (map[string]any, error) {
	dec := json.NewDecoder(strings.NewReader(raw))
	dec.UseNumber()
	var n any
	if err := dec.Decode(&n); err != nil {
		return nil, err
	}
	m, ok := n.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("expected JSON object")
	}
	return m, nil
}

func asString(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case json.Number:
		return x.String()
	default:
		return fmt.Sprint(x)
	}
}

func asInt64(v any) int64 {
	switch x := v.(type) {
	case json.Number:
		return mustInt64(x)
	case float64:
		return int64(x)
	case int64:
		return x
	case string:
		i, _ := strconv.ParseInt(x, 10, 64)
		return i
	default:
		return 0
	}
}
