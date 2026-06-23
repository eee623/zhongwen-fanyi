#!/usr/bin/env sh
set -eu

required_files="
index.html
privacy/index.html
pay/index.html
assets/public.css
assets/checkout.css
assets/checkout.js
assets/product/7b579892-ccf1-42cc-b8a8-36b4be626d83.png
assets/product/c99831d7-ec02-4ba2-8a10-21764d4b0bfe.png
assets/product/4b6e942b-db77-43e7-a51c-8a55d7ff721f.png
favicon.svg
robots.txt
"

for path in $required_files; do
  test -f "$path"
done

grep -q 'href="assets/public.css"' index.html
grep -q 'href="../assets/public.css"' privacy/index.html
grep -q 'href="../assets/checkout.css"' pay/index.html
grep -q 'src="../assets/checkout.js"' pay/index.html
grep -q '蜀ICP备2026033716号' index.html
grep -q '蜀ICP备2026033716号' privacy/index.html
grep -q '蜀ICP备2026033716号' pay/index.html
grep -q '支付宝二维码准备中' pay/index.html
grep -q '微信支付' pay/index.html

if grep -R -n -E 'node_modules|npm install|npm run|node server|tsx|vite|wxt|your-real-domain|assets/site.css|href="/|src="/|action="/' index.html privacy/index.html pay/index.html robots.txt assets/public.css assets/checkout.css assets/checkout.js; then
  echo "Root static site must not require server-side dependencies or build steps." >&2
  exit 1
fi
