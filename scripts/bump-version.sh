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
  "packages/mesh-transaction/package.json"
  "packages/mesh-wallet/package.json"
)

# Iterate over each specified package.json file and update the version field
for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    sed -i '' -e "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$FILE"
    echo "Updated version in $FILE"
  else
    echo "File not found: $FILE"
  fi
done

echo "Version updated to $VERSION in all specified package.json files."