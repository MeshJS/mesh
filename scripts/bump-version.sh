#!/bin/bash

# Check if version number is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

VERSION=$1

# List of package.json files to update
FILES=(
  "packages/mesh-common/package.json"
  "packages/mesh-contract/package.json"
  "packages/mesh-core/package.json"
  "packages/mesh-core-csl/package.json"
  "packages/mesh-core-cst/package.json"
  "packages/mesh-provider/package.json"
  "packages/mesh-react/package.json"
  "packages/mesh-svelte/package.json"
  "packages/mesh-transaction/package.json"
  "packages/mesh-wallet/package.json"
  "scripts/mesh-cli/package.json"
)

# Iterate over each specified package.json file and update the version field
for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    sed -i '' -e "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$FILE"

    # Update @meshsdk dependencies to the latest version
    sed -i '' -e "s/\"@meshsdk\/common\": \".*\"/\"@meshsdk\/common\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/contract\": \".*\"/\"@meshsdk\/contract\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/core\": \".*\"/\"@meshsdk\/core\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/core-csl\": \".*\"/\"@meshsdk\/core-csl\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/core-cst\": \".*\"/\"@meshsdk\/core-cst\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/provider\": \".*\"/\"@meshsdk\/provider\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/react\": \".*\"/\"@meshsdk\/react\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/svelte\": \".*\"/\"@meshsdk\/svelte\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/transaction\": \".*\"/\"@meshsdk\/transaction\": \"$VERSION\"/" "$FILE"
    sed -i '' -e "s/\"@meshsdk\/wallet\": \".*\"/\"@meshsdk\/wallet\": \"$VERSION\"/" "$FILE"
 
    echo "Updated version in $FILE"
  else
    echo "File not found: $FILE"
  fi
done

echo "Version updated to $VERSION in all specified package.json files."