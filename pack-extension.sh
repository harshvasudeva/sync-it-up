#!/bin/bash
# Pack Chrome extension into .crx format
#
# Usage: ./pack-extension.sh
#
# Requirements:
# - extension.pem (your private key, stored locally)
# - Chrome/Chromium installed
#
# Note: This is primarily for development/distribution.
#       For Chrome Web Store, submit the extension/ folder directly.

set -e

EXTENSION_DIR="$(pwd)/extension"
PEM_FILE="$(pwd)/extension.pem"
DIST_DIR="$(pwd)/dist"
OUTPUT_CRX="${DIST_DIR}/synctabs-extension.crx"

echo "🔨 Packing SyncTabs Extension..."
echo ""

# Check for .pem file
if [ ! -f "$PEM_FILE" ]; then
    echo "❌ Error: extension.pem not found!"
    echo "   Expected at: $PEM_FILE"
    echo ""
    echo "The .pem file is your private extension signing key."
    echo "Keep it safe and NEVER commit to git."
    echo ""
    echo "To generate a new key:"
    echo "  1. Open chrome://extensions/"
    echo "  2. Enable Developer mode (top-right)"
    echo "  3. Click 'Pack extension'"
    echo "  4. Select the extension/ folder"
    echo "  5. Save the generated key as extension.pem"
    echo ""
    exit 1
fi

echo "✓ Found extension.pem"
echo ""

# Ensure dist directory exists
mkdir -p "$DIST_DIR"

# Find Chrome/Chromium executable
if command -v google-chrome &> /dev/null; then
    CHROME="google-chrome"
elif command -v chromium &> /dev/null; then
    CHROME="chromium"
elif command -v chromium-browser &> /dev/null; then
    CHROME="chromium-browser"
elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
else
    echo "⚠️  Chrome/Chromium not found in PATH"
    echo ""
    echo "Option 1: Use Chrome's built-in packing"
    echo "  1. Open chrome://extensions/"
    echo "  2. Enable Developer mode"
    echo "  3. Click 'Pack extension'"
    echo "  4. Select: extension/"
    echo "  5. Select key file: extension.pem"
    echo ""
    echo "Option 2: Install Chromium"
    echo "  macOS: brew install chromium"
    echo "  Linux: sudo apt-get install chromium"
    echo ""
    exit 1
fi

echo "📦 Using Chrome at: $CHROME"
echo ""

# Pack extension
echo "Packing extension..."
"$CHROME" \
    --pack-extension="$EXTENSION_DIR" \
    --pack-extension-key="$PEM_FILE" \
    --no-message-box

# Chrome outputs to extension.crx in the parent directory
if [ -f "$(dirname "$EXTENSION_DIR")/extension.crx" ]; then
    mv "$(dirname "$EXTENSION_DIR")/extension.crx" "$OUTPUT_CRX"
    echo ""
    echo "✨ Successfully packed extension!"
    echo "   Output: $OUTPUT_CRX"
    echo "   Size: $(du -h "$OUTPUT_CRX" | cut -f1)"
    echo ""
    echo "📦 Installation options:"
    echo "   1. Drag & drop: $OUTPUT_CRX into chrome://extensions/"
    echo "   2. Sideload: chrome://extensions/ → Load unpacked → extension/ folder"
    echo "   3. Chrome Web Store: Submit extension/ folder directly"
    echo ""
else
    echo "⚠️  Chrome packing may have failed."
    echo "   Try the manual method above."
    exit 1
fi
