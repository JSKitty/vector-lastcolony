#!/bin/bash
rm -f lastcolony.xdc

zip -r lastcolony.xdc \
  index.html \
  manifest.toml \
  icon.png \
  main.css \
  styles.css \
  js/ \
  images/ \
  audio/ \
  -x "*.git*" \
  -x "js/server.js"

echo ""
echo "Built lastcolony.xdc"
ls -lh lastcolony.xdc
