//go:build !windows

package main

import (
	"fmt"
	"os"
)

// showFatalDialog prints to stderr on non-Windows platforms.
// On macOS/Linux there is no hidden-console mode, so stderr is visible.
func showFatalDialog(title, message string) {
	fmt.Fprintf(os.Stderr, "[FATAL] %s: %s\n", title, message)
}
