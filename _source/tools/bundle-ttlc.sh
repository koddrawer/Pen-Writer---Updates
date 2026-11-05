#!/bin/sh
# Đóng gói tiktok-live-connector (ES Module) thành 1 file CommonJS cho Node 18 trên Android (import() làm văng app).
# Chạy sau khi đã dựng mobile/www (node mobile/build-www.js) để có node_modules với got 13.
set -e
D=$(mktemp -d); cd "$D"; npm init -y >/dev/null; npm i esbuild@0.24.2 --no-audit --no-fund >/dev/null
echo "module.exports = require('tiktok-live-connector');" > entry.js
NODE_PATH="$OLDPWD/mobile/www/nodejs/node_modules" npx esbuild entry.js --bundle --platform=node --target=node18 --format=cjs --minify-whitespace --legal-comments=none --outfile="$OLDPWD/app/core/vendor/tiktok-live-connector.cjs"
