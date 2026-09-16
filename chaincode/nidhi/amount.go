package main

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

func isPositiveAmount(amount string) bool {
	if amount == "" {
		return false
	}
	n, err := strconv.ParseFloat(amount, 64)
	if err != nil || n <= 0 {
		return false
	}
	for _, c := range amount {
		if (c < '0' || c > '9') && c != '.' {
			return false
		}
	}
	return strings.Count(amount, ".") <= 1
}

func normalizeAmount(n float64) string {
	s := strconv.FormatFloat(n, 'f', 6, 64)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	if s == "" || s == "-" {
		return "0"
	}
	return s
}

func addAmount(a, b string) (string, error) {
	x, err := strconv.ParseFloat(a, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount %q", a)
	}
	y, err := strconv.ParseFloat(b, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount %q", b)
	}
	return normalizeAmount(x + y), nil
}

func subAmount(a, b string) (string, error) {
	x, err := strconv.ParseFloat(a, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount %q", a)
	}
	y, err := strconv.ParseFloat(b, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount %q", b)
	}
	n := x - y
	if n < -1e-9 {
		return "", fmt.Errorf("Insufficient funds")
	}
	return normalizeAmount(n), nil
}

func compareAmount(a, b string) (int, error) {
	x, err := strconv.ParseFloat(a, 64)
	if err != nil {
		return 0, err
	}
	y, err := strconv.ParseFloat(b, 64)
	if err != nil {
		return 0, err
	}
	d := x - y
	if math.Abs(d) < 1e-9 {
		return 0, nil
	}
	if d < 0 {
		return -1, nil
	}
	return 1, nil
}
