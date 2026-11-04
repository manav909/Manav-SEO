#!/bin/sh
# Builds the Business Santa page script (no dependencies, plain JS bundled and minified).
# Usage: NODE_PATH=/path/to/node_modules sh build.sh
cd "$(dirname "$0")" && npx --yes esbuild@0.21.5 app.js --bundle --minify --format=esm --target=es2020 --legal-comments=none --outfile=../../businesssanta/assets/js/app.js
