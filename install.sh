#!/bin/bash
set -e

REPO_URL="https://github.com/onlyvitor/mottainAI"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/mottainai}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

echo "=== mottainAI Installer ==="
echo ""

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "Bun is not installed. mottainAI requires Bun >= 1.2.0."
    echo ""
    echo "Install Bun:"
    echo "  curl -fsSL https://bun.sh/install | bash"
    echo ""
    exit 1
fi

BUN_VERSION=$(bun --version)
echo "Found Bun $BUN_VERSION"

# Clone or update repository
if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing installation in $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git pull origin main 2>/dev/null || echo "Could not pull updates. Continuing with local files."
else
    echo "Cloning repository to $INSTALL_DIR..."
    if command -v git &> /dev/null; then
        git clone "$REPO_URL" "$INSTALL_DIR"
    else
        echo "Git is not installed. Please install git or clone the repository manually:"
        echo "  $REPO_URL"
        exit 1
    fi
fi

cd "$INSTALL_DIR"

# Install dependencies
echo "Installing dependencies..."
bun install

# Build packages
echo "Building packages..."
bun run build

# Create bin directory if needed
mkdir -p "$BIN_DIR"

# Install symlink or wrapper
if [ -f "$INSTALL_DIR/bin/mottainai" ]; then
    ln -sf "$INSTALL_DIR/bin/mottainai" "$BIN_DIR/mottainai"
    chmod +x "$INSTALL_DIR/bin/mottainai"
fi

# Check if bin dir is in PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    echo "WARNING: $BIN_DIR is not in your PATH."
    echo "Add this to your shell profile (.bashrc, .zshrc, etc.):"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    echo ""
fi

# Create starter config if missing
if [ ! -f "$INSTALL_DIR/yoru.json" ]; then
    cat > "$INSTALL_DIR/yoru.json" << 'EOF'
{
  "defaults": {
    "tier": "MEDIUM",
    "budget": {
      "dailyUsd": 10.0,
      "perRequestUsd": 0.1
    }
  },
  "rules": [],
  "blocked": [],
  "fallback": ["gemini-2.5-flash", "deepseek-v4-flash"],
  "providers": {},
  "systemPrompt": "You are Mottainai, an AI coding assistant. You have access to tools for reading, writing, and editing files, running shell commands, and searching code. Use tools to investigate and modify code as needed.",
  "maxSteps": 20
}
EOF
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "mottainAI installed to: $INSTALL_DIR"
echo "Binary linked to: $BIN_DIR/mottainai"
echo ""
echo "Next steps:"
echo ""
echo "1. Add your API keys to $INSTALL_DIR/yoru.json:"
echo "   {"
echo '     "providers": {'
echo '       "openai": { "apiKey": "sk-..." },'
echo '       "anthropic": { "apiKey": "sk-ant-..." },'
echo '       "google": { "apiKey": "..." },'
echo '       "deepseek": { "apiKey": "..." }'
echo "     }"
echo "   }"
echo ""
echo "2. Or set environment variables:"
echo "   export OPENAI_API_KEY=sk-..."
echo "   export ANTHROPIC_API_KEY=sk-ant-..."
echo "   export GOOGLE_GENERATIVE_AI_API_KEY=..."
echo "   export DEEPSEEK_API_KEY=..."
echo ""
echo "3. Run mottainai:"
echo "   mottainai"
echo ""
