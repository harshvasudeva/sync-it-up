#!/bin/bash
echo "================================================"
echo "  SyncTabs Server - Setup & Start"
echo "================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org"
    exit 1
fi

echo "[OK] Node.js found: $(node --version)"

# Install dependencies
echo ""
echo "[*] Installing server dependencies..."
cd "$(dirname "$0")/server"
npm install

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install dependencies."
    exit 1
fi

echo ""
echo "[OK] Dependencies installed."
echo ""
echo "================================================"
echo "  Starting SyncTabs Server..."
echo "  Press Ctrl+C to stop."
echo "================================================"
echo ""

node server.js
