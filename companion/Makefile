BINARY    = dist/synctabs-companion.exe
INSTALLER = dist/SyncTabs-Companion-Setup.exe
VERSION   = 1.0.0
MODULE    = github.com/harshvasudeva/synctabs-companion

.PHONY: all build build-debug installer icons clean deps

all: build

## Install Go dependencies
deps:
	go mod tidy

## Build the Windows executable (no console window, stripped)
build: deps
	@mkdir -p dist
	GOOS=windows GOARCH=amd64 go build \
		-ldflags="-H windowsgui -s -w -X '$(MODULE)/config.AppVersion=$(VERSION)'" \
		-o $(BINARY) .
	@echo "Built: $(BINARY)"
	@ls -lh $(BINARY)

## Build with console visible (for development/debugging)
build-debug: deps
	@mkdir -p dist
	GOOS=windows GOARCH=amd64 go build \
		-ldflags="-X '$(MODULE)/config.AppVersion=$(VERSION)-debug'" \
		-o dist/synctabs-companion-debug.exe .
	@echo "Built: dist/synctabs-companion-debug.exe"

## Build NSIS installer (requires makensis on PATH)
installer: build
	@which makensis > /dev/null 2>&1 || (echo "Error: makensis not found. Install NSIS." && exit 1)
	makensis installer.nsi
	@echo "Installer: $(INSTALLER)"

## Convert extension PNGs to ICO format (requires Python + Pillow)
icons:
	python3 -c "\
from PIL import Image, ImageEnhance; \
import os; \
i16=Image.open('../extension/icons/icon16.png').convert('RGBA'); \
i32=Image.open('../extension/icons/icon48.png').convert('RGBA').resize((32,32)); \
i48=Image.open('../extension/icons/icon48.png').convert('RGBA'); \
i16.save('assets/icon_connected.ico',format='ICO',sizes=[(16,16),(32,32),(48,48)],append_images=[i32,i48]); \
g=lambda img: ImageEnhance.Brightness(img.convert('LA').convert('RGBA')).enhance(0.5); \
g(i16).save('assets/icon_disconnected.ico',format='ICO',sizes=[(16,16),(32,32),(48,48)],append_images=[g(i32),g(i48)]); \
print('Icons created')"

## Clean build artifacts
clean:
	rm -rf dist/

## Verify build compiles (cross-compile check from non-Windows)
verify:
	GOOS=windows GOARCH=amd64 go build -o /dev/null . && echo "Build check: OK"
