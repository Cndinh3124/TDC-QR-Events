#!/usr/bin/env bash
# Chay mot lenh; neu loi thi dua 30 dong cuoi ra annotation cua GitHub,
# de doc nguyen nhan ngay tren trang PR / qua API ma khong can mo log day du.
# Dung: .github/scripts/annotate.sh "Tieu de" lenh tham-so...
title="$1"; shift
log="$(mktemp)"
set -o pipefail
if "$@" 2>&1 | tee "$log"; then exit 0; fi
msg="$(tail -n 30 "$log" | tr '\n' '|' | sed 's/%/%25/g;s/\r//g' | cut -c1-1800)"
echo "::error title=${title}::${msg}"
exit 1
