//go:build windows

package main

import (
	"fmt"
	"os/exec"
)

// showFatalDialog displays a Windows dialog using mshta.
// Works even with -H windowsgui (no console window).
func showFatalDialog(title, message string) {
	safeMsg := ""
	for _, c := range message {
		if c == '\'' {
			safeMsg += "\\'"
		} else if c == '\n' {
			safeMsg += "\\n"
		} else {
			safeMsg += string(c)
		}
	}
	script := fmt.Sprintf(`javascript:alert('%s');close()`, safeMsg)
	_ = exec.Command("mshta", script).Run()
}
