#!/bin/bash
#
# Generic Build Script for Foundry VTT Modules
# Creates a distributable ZIP package in the releases/ folder
# Auto-detects module ID, version, and GitHub URL from module.json
#

set -e  # Exit on error

# Colors for output (disabled if not a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

# Change to script directory (allows running from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Read module.json ────────────────────────────────────────────────

if [ ! -f "module.json" ]; then
    echo -e "${RED}ERROR: module.json not found!${NC}"
    exit 1
fi

# Extract fields from module.json (jq preferred, fallback to grep/sed)
if command -v jq &> /dev/null; then
    MODULE_ID=$(jq -r '.id' module.json)
    VERSION=$(jq -r '.version' module.json)
    GITHUB_URL=$(jq -r '.url // empty' module.json)
else
    MODULE_ID=$(grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' module.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' module.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
    GITHUB_URL=$(grep -o '"url"[[:space:]]*:[[:space:]]*"[^"]*"' module.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
fi

if [ -z "$MODULE_ID" ] || [ "$MODULE_ID" = "null" ]; then
    echo -e "${RED}ERROR: Could not extract module id from module.json${NC}"
    exit 1
fi

if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
    echo -e "${RED}ERROR: Could not extract version from module.json${NC}"
    exit 1
fi

# Output file name
OUTPUT_FILE="${MODULE_ID}-v${VERSION}.zip"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Foundry VTT Module - Build Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  Module:  ${GREEN}${MODULE_ID}${NC}"
echo -e "  Version: ${GREEN}${VERSION}${NC}"
echo ""

# ─── Check required files ────────────────────────────────────────────

echo -e "${BLUE}[1/6]${NC} Checking project files..."

REQUIRED_FILES=("module.json")
OPTIONAL_FILES=("README.md" "LICENSE" "CHANGELOG.md")
KNOWN_DIRS=("scripts" "lang" "styles" "templates" "assets" "packs" "icons" "images" "fonts")

# Verify required files
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}ERROR: Required file '$file' not found!${NC}"
        exit 1
    fi
done

# Detect which optional files exist
INCLUDE_FILES=("${REQUIRED_FILES[@]}")
for file in "${OPTIONAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        INCLUDE_FILES+=("$file")
    fi
done

# Detect which known directories exist
INCLUDE_DIRS=()
for dir in "${KNOWN_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        INCLUDE_DIRS+=("$dir")
    fi
done

if [ ${#INCLUDE_DIRS[@]} -eq 0 ]; then
    echo -e "${YELLOW}WARNING: No standard module directories found (scripts/, lang/, styles/, templates/)${NC}"
fi

echo -e "  Files: ${INCLUDE_FILES[*]}"
echo -e "  Dirs:  ${INCLUDE_DIRS[*]:-none}"
echo -e "  ${GREEN}OK${NC}"

# ─── Create releases directory ───────────────────────────────────────

echo -e "${BLUE}[2/6]${NC} Creating releases directory..."
mkdir -p releases
echo -e "  ${GREEN}OK${NC}"

# ─── Create temporary staging directory ──────────────────────────────

echo -e "${BLUE}[3/6]${NC} Creating temporary staging directory..."
TEMP_DIR=$(mktemp -d)
trap "rm -rf '$TEMP_DIR'" EXIT
echo -e "  ${GREEN}OK${NC}"

# ─── Stage files ─────────────────────────────────────────────────────

echo -e "${BLUE}[4/6]${NC} Staging files for packaging..."

for file in "${INCLUDE_FILES[@]}"; do
    cp "$file" "$TEMP_DIR/"
    echo -e "  Copied: $file"
done

for dir in "${INCLUDE_DIRS[@]}"; do
    cp -r "$dir" "$TEMP_DIR/"
    echo -e "  Copied: $dir/"
done

# ─── Update download URL in staged module.json ──────────────────────

echo -e "${BLUE}[5/6]${NC} Updating module.json download URL..."

if [ -n "$GITHUB_URL" ] && [ "$GITHUB_URL" != "null" ]; then
    # Extract GitHub owner/repo from URL (supports https://github.com/owner/repo)
    GITHUB_PATH=$(echo "$GITHUB_URL" | sed 's|https://github.com/||')
    NEW_DOWNLOAD_URL="https://github.com/${GITHUB_PATH}/releases/download/v${VERSION}/${OUTPUT_FILE}"

    sed -i.bak "s|\"download\"[[:space:]]*:[[:space:]]*\"[^\"]*\"|\"download\": \"${NEW_DOWNLOAD_URL}\"|" "$TEMP_DIR/module.json"
    rm -f "$TEMP_DIR/module.json.bak"

    echo -e "  ${GREEN}${NEW_DOWNLOAD_URL}${NC}"
else
    echo -e "  ${YELLOW}Skipped (no GitHub url in module.json)${NC}"
fi

# ─── Create ZIP archive ─────────────────────────────────────────────

echo -e "${BLUE}[6/6]${NC} Creating ZIP archive..."

# Remove existing release file if it exists
if [ -f "releases/${OUTPUT_FILE}" ]; then
    rm "releases/${OUTPUT_FILE}"
fi

OUTPUT_PATH="$SCRIPT_DIR/releases/${OUTPUT_FILE}"
(cd "$TEMP_DIR" && zip -r -q "$OUTPUT_PATH" .)

# ─── Verify and report ───────────────────────────────────────────────

if [ ! -f "releases/${OUTPUT_FILE}" ]; then
    echo -e "${RED}ERROR: Failed to create ZIP file${NC}"
    exit 1
fi

ZIP_SIZE=$(ls -lh "releases/${OUTPUT_FILE}" | awk '{print $5}')

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Build Successful!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Output:  ${BLUE}releases/${OUTPUT_FILE}${NC}"
echo -e "  Size:    ${BLUE}${ZIP_SIZE}${NC}"
echo ""
echo -e "  ZIP Contents:"
unzip -l "releases/${OUTPUT_FILE}" | tail -n +4 | head -n -2 | while IFS= read -r line; do
    echo -e "    $line"
done
echo ""
echo -e "  ${GREEN}GitHub release command:${NC}"
echo "    gh release create v${VERSION} releases/${OUTPUT_FILE} module.json --title \"v${VERSION}\""
echo ""
