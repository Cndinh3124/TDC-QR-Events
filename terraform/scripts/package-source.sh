#!/usr/bin/env bash
# Dong goi ma nguon dang commit (HEAD) thanh tar.gz de dua len S3: repo private nen may chu khong clone duoc.
# Dung voi data "external": in ra mot doi tuong JSON, khong in gi khac len stdout.
# [BM] git archive chi lay tep da commit, nen .env va tep bi gitignore khong bao gio len S3.
set -euo pipefail
root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
# duong dan tuyet doi: git -C doi thu muc lam viec nen duong dan tuong doi se sai
mkdir -p "$(dirname "$1")"
out="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
git -C "$root" archive --format=tar.gz -o "$out" HEAD
md5="$(openssl md5 -r "$out" | cut -d' ' -f1)"
printf '{"path":"%s","md5":"%s"}\n' "$out" "$md5"
