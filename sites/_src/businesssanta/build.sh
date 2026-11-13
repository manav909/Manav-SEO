#!/bin/sh
# Builds the Business Santa page script (plain JS, no dependencies), bundled and minified.
# Each build gets its own file name (app.<hash>.js) so no browser can ever pair a cached old script with a new page.
# Usage: sh build.sh
set -e
cd "$(dirname "$0")"
OUT=../../businesssanta/assets/js
npx --yes esbuild@0.21.5 app.js --bundle --minify --format=esm --target=es2020 --legal-comments=none --outfile=/tmp/bs-app.js
H=$(sha1sum /tmp/bs-app.js | cut -c1-10)
rm -f $OUT/app*.js
cp /tmp/bs-app.js $OUT/app.$H.js
sed -i -E "s#/assets/js/app[^\"]*\.js#/assets/js/app.$H.js#" ../../businesssanta/home-desktop.html
echo "built app.$H.js"
python3 pages/home_ld.py
python3 pages/build_pages.py
python3 m/assemble.py
