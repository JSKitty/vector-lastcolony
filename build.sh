#!/bin/bash

# Build script for Last Colony WebXDC package
# Creates lastcolony.xdc with minified files for production

cd "$(dirname "$0")"

# Remove old package if exists
rm -f lastcolony.xdc

# Create a temporary build directory
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

# Copy required files to build directory
cp index.html manifest.toml icon.png main.css styles.css "$BUILD_DIR/"
cp -r js images audio "$BUILD_DIR/"

# Remove files we don't want in the build
find "$BUILD_DIR" -name ".DS_Store" -delete
find "$BUILD_DIR" -name "*.md" -delete
rm -f "$BUILD_DIR/js/server.js"
rm -f "$BUILD_DIR/js/release.sh"

# Minify JavaScript files using terser (if available)
if command -v npx &> /dev/null; then
  for file in "$BUILD_DIR"/js/*.js; do
    if [ -f "$file" ]; then
      filename=$(basename "$file")
      # Skip already minified files
      if [[ "$filename" == *.min.js ]]; then
        continue
      fi
      npx terser "$file" --compress --mangle --output "$file" 2>/dev/null || true
    fi
  done
fi

# Minify CSS files
for file in "$BUILD_DIR"/*.css; do
  if [ -f "$file" ]; then
    # Remove comments and extra whitespace
    perl -0777 -pe 's|/\*.*?\*/||gs; s/\s+/ /g; s/\s*([{};:,])\s*/$1/g; s/;}/}/g' "$file" > "$file.min" && mv "$file.min" "$file"
  fi
done

# Minify HTML file
if [ -f "$BUILD_DIR/index.html" ]; then
  perl -0777 -pe '
    s/<!--.*?-->//gs;
    s/^\s+//gm;
    s/\s+$//gm;
    s/\n\s*\n/\n/g;
  ' "$BUILD_DIR/index.html" > "$BUILD_DIR/index.html.min" && mv "$BUILD_DIR/index.html.min" "$BUILD_DIR/index.html"
fi

# Create zip with maximum compression (-9)
cd "$BUILD_DIR"
zip -9 -r "$OLDPWD/lastcolony.xdc" .

echo ""
echo "Built lastcolony.xdc"
ls -lh "$OLDPWD/lastcolony.xdc"
