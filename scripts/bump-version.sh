#!/usr/bin/env bash
set -euo pipefail

# Usage: bump-version.sh [major|minor|patch] [--tag] [--no-commit]
# Bumps version in root package.json, extension package.json, and manifest.json

BUMP_TYPE="${1:-patch}"
DO_TAG=false
DO_COMMIT=true

for arg in "$@"; do
  case "$arg" in
    --tag) DO_TAG=true ;;
    --no-commit) DO_COMMIT=false ;;
  esac
done

if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
  echo "Usage: bump-version.sh [major|minor|patch] [--tag] [--no-commit]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Read current version from root package.json
CURRENT_VERSION=$(node -e "console.log(require('$ROOT_DIR/package.json').version)")
echo "Current version: $CURRENT_VERSION"

# Calculate new version
NEW_VERSION=$(node -e "
  const [major, minor, patch] = '$CURRENT_VERSION'.split('.').map(Number);
  const bump = '$BUMP_TYPE';
  if (bump === 'major') console.log(\`\${major+1}.0.0\`);
  else if (bump === 'minor') console.log(\`\${major}.\${minor+1}.0\`);
  else console.log(\`\${major}.\${minor}.\${patch+1}\`);
")
echo "New version: $NEW_VERSION ($BUMP_TYPE)"

# Bump version in all 3 files using node -e (cross-platform, no sed issues)
FILES=(
  "$ROOT_DIR/package.json"
  "$ROOT_DIR/packages/extension/package.json"
  "$ROOT_DIR/packages/extension/manifest.json"
)

for file in "${FILES[@]}"; do
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$file', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('$file', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  Updated: $file"
done

if $DO_COMMIT; then
  cd "$ROOT_DIR"
  git add package.json packages/extension/package.json packages/extension/manifest.json
  git commit -m "chore: bump version to v$NEW_VERSION"
  echo "Committed version bump"
fi

if $DO_TAG; then
  cd "$ROOT_DIR"
  git tag "v$NEW_VERSION"
  echo "Tagged v$NEW_VERSION"
fi

echo "Done! Version bumped to $NEW_VERSION"
