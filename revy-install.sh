#!/bin/bash

# Revy Installation Script
# Installs revy by moving existing files to proper locations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Revy Installation Script ===${NC}"

# Get script directory (where all files should be)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define installation paths
REVY_HOME="$HOME/.revy"
REVY_BIN="$HOME/.local/bin"

echo "Creating directories..."
mkdir -p "$REVY_BIN"
mkdir -p "$REVY_HOME"
mkdir -p "$HOME/.local/share/revy"

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
if [ -d "$SCRIPT_DIR/deps" ]; then
    cd "$SCRIPT_DIR/deps"
    npm install chalk@4.1.2 ora@5.4.1 cli-progress@3.12.0 --save
fi

# Move files to proper locations
echo "Moving files to installation directories..."

# Move revy executable to ~/.local/bin
if [ -f "$SCRIPT_DIR/revy" ]; then
    cp "$SCRIPT_DIR/revy" "$REVY_BIN/revy"
    chmod +x "$REVY_BIN/revy"
    echo "✓ Moved revy executable"
else
    echo -e "${RED}Error: revy executable not found in current directory${NC}"
    exit 1
fi

# Move folders to ~/.revy/
for folder in config deps lib; do
    if [ -d "$SCRIPT_DIR/$folder" ]; then
        cp -r "$SCRIPT_DIR/$folder" "$REVY_HOME/"
        echo "✓ Moved $folder directory"
    else
        echo -e "${YELLOW}Warning: $folder directory not found${NC}"
    fi
done

# Add to PATH if not already there
if ! grep -q "export PATH.*\.local/bin" "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    echo -e "${YELLOW}Added ~/.local/bin to PATH in .bashrc${NC}"
fi

echo -e "${GREEN}✅ Installation complete!${NC}"
echo ""
echo "To start using revy:"
echo "1. Reload your shell: source ~/.bashrc"
echo "2. Run: revy"
echo ""
echo "Installation locations:"
echo "  Executable: $REVY_BIN/revy"
echo "  Libraries: $REVY_HOME/lib/"
echo "  Config: $REVY_HOME/config/"
echo "  Dependencies: $REVY_HOME/deps/"
echo "  Data: $HOME/.local/share/revy/"