package logger

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
)

// Level represents log severity
type Level int

const (
	DEBUG Level = iota
	INFO
	WARN
	ERROR
)

const maxLogSize = 10 * 1024 * 1024 // 10 MB

var (
	level   Level = INFO
	logFile *os.File
	mu      sync.Mutex
	std     *log.Logger
	logPath string
)

// Init opens (or creates) the log file at dataFolder/synctabs-companion.log.
func Init(dataFolder string, lvl string) error {
	mu.Lock()
	defer mu.Unlock()

	if err := os.MkdirAll(dataFolder, 0755); err != nil {
		return err
	}

	logPath = filepath.Join(dataFolder, "synctabs-companion.log")

	// Rotate if too large
	if info, err := os.Stat(logPath); err == nil && info.Size() >= maxLogSize {
		bak := logPath + ".bak"
		_ = os.Remove(bak)
		_ = os.Rename(logPath, bak)
	}

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	logFile = f

	// Write to both file and stdout (stdout is a no-op with -H windowsgui)
	writer := io.MultiWriter(f, os.Stdout)
	std = log.New(writer, "", log.LstdFlags)

	setLevel(lvl)
	return nil
}

// SetLevel changes the log level at runtime.
func SetLevel(lvl string) {
	mu.Lock()
	defer mu.Unlock()
	setLevel(lvl)
}

func setLevel(lvl string) {
	switch lvl {
	case "debug":
		level = DEBUG
	case "warn":
		level = WARN
	case "error":
		level = ERROR
	default:
		level = INFO
	}
}

// LogPath returns the current log file path.
func LogPath() string {
	mu.Lock()
	defer mu.Unlock()
	return logPath
}

// Close closes the log file.
func Close() {
	mu.Lock()
	defer mu.Unlock()
	if logFile != nil {
		_ = logFile.Close()
	}
}

func output(lvl Level, prefix, format string, args ...interface{}) {
	mu.Lock()
	defer mu.Unlock()
	if lvl < level {
		return
	}
	msg := fmt.Sprintf(format, args...)
	if std != nil {
		std.Printf("%s %s", prefix, msg)
	} else {
		fmt.Printf("%s %s\n", prefix, msg)
	}
}

// Debug logs a debug message.
func Debug(format string, args ...interface{}) {
	output(DEBUG, "[DEBUG]", format, args...)
}

// Info logs an info message.
func Info(format string, args ...interface{}) {
	output(INFO, "[INFO] ", format, args...)
}

// Warn logs a warning message.
func Warn(format string, args ...interface{}) {
	output(WARN, "[WARN] ", format, args...)
}

// Error logs an error message.
func Error(format string, args ...interface{}) {
	output(ERROR, "[ERROR]", format, args...)
}
