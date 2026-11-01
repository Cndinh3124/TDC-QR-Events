#!/usr/bin/env bash
# Khoi phuc ban sao luu vao mot CSDL DICH. Mac dinh tu choi neu CSDL dich da co bang (tranh ghi de nham).
#
#   DEFAULTS_FILE=/etc/tdc-qr/restore.cnf ./restore.sh /var/backups/tdc-qr/tdc_qr-20261101-020000.sql.gz tdc_qr_khoi_phuc
#
# Ghi de CSDL dang co: dat FORCE=1 (chi sau khi da dung ung dung va sao luu ban hien tai).
set -euo pipefail

file="${1:?Cach dung: restore.sh <tep.sql.gz> <ten_csdl_dich>}"
target="${2:?Thieu ten CSDL dich}"
: "${DEFAULTS_FILE:?Can dat DEFAULTS_FILE}"
CLIENT_BIN="${CLIENT_BIN:-mysql}"

[[ -f "$file" ]] || { echo "Khong thay tep: $file" >&2; exit 2; }
[[ "$target" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Ten CSDL dich chi gom chu, so, gach duoi" >&2; exit 2; }
gzip -t "$file"

tables="$("$CLIENT_BIN" --defaults-extra-file="$DEFAULTS_FILE" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$target'")"
if [[ "$tables" != "0" && "${FORCE:-0}" != "1" ]]; then
  echo "CSDL '$target' da co $tables bang. Tu choi khoi phuc de tranh ghi de (dat FORCE=1 neu chac chan)." >&2
  exit 3
fi

"$CLIENT_BIN" --defaults-extra-file="$DEFAULTS_FILE" -e "CREATE DATABASE IF NOT EXISTS \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
zcat "$file" | "$CLIENT_BIN" --defaults-extra-file="$DEFAULTS_FILE" "$target"
echo "Da khoi phuc vao '$target'."
