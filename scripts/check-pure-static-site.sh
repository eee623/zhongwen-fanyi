#!/usr/bin/env sh
set -eu

required_files="
index.html
privacy/index.html
pay/index.html
assets/site.css
"

for path in $required_files; do
  test -f "$path"
done

grep -q 'href="/assets/site.css"' index.html
grep -q 'href="/assets/site.css"' privacy/index.html
grep -q 'href="/assets/site.css"' pay/index.html
grep -q '蜀ICP备2026033716号' index.html
grep -q '蜀ICP备2026033716号' privacy/index.html
grep -q '蜀ICP备2026033716号' pay/index.html
grep -q '支付宝二维码准备中' pay/index.html
grep -q '微信支付' pay/index.html

if grep -R -n -E '<script|\.js|node_modules|npm install|npm run|服务端生成' index.html privacy/index.html pay/index.html assets/site.css; then
  echo "Pure static site must not reference JavaScript or Node deployment steps." >&2
  exit 1
fi
