package main

import (
	"sort"
	"strings"
)

type memState struct {
	kv map[string][]byte
}

func newMemState() *memState {
	return &memState{kv: map[string][]byte{}}
}

func (m *memState) Get(key string) ([]byte, error) {
	return m.kv[key], nil
}

func (m *memState) Put(key string, value []byte) error {
	cp := make([]byte, len(value))
	copy(cp, value)
	m.kv[key] = cp
	return nil
}

func (m *memState) GetByPrefix(prefix string) ([][]byte, error) {
	keys := make([]string, 0)
	for k := range m.kv {
		if strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	out := make([][]byte, 0, len(keys))
	for _, k := range keys {
		out = append(out, m.kv[k])
	}
	return out, nil
}
