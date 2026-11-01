#!/usr/bin/env bash
# Sao luu CSDL TDC QR Events: ban dump nhat quan (khong khoa bang), nen, kiem tra lai, xoa ban cu.
# Mat khau KHONG dua tren dong lenh: dung tep cau hinh client (chmod 600), xem docs/trien-khai.md.
#
#   BACKUP_DIR=/var/backups/tdc-qr DB_NAME=tdc_qr DEFAULTS_FILE=/etc/tdc-qr/backup.cnf ./backup.sh
#
# Bien tuy chon: KEEP_DAYS (mac dinh 14), DUMP_BIN (mac dinh mysqldump).
set -euo pipefail

: "${BACKUP_DIR:?Can dat BACKUP_DIR}"
: "${DB_NAME:?Can dat DB_NAME}"
: "${DEFAULTS_FILE:?Can dat DEFAULTS_FILE (tep [client] user/password/host)}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DUMP_BIN="${DUMP_BIN:-mysqldump}"

[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || { echo "KEEP_DAYS phai la so nguyen" >&2; exit 2; }
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || { echo "DB_NAME chi gom chu, so, gach duoi" >&2; exit 2; }

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/${DB_NAME}-${stamp}.sql.gz"
tmp="${out}.partial"
trap 'rm -f "$tmp"' EXIT

# pipefail: neu dump loi thi khong tao tep thanh pham
"$DUMP_BIN" --defaults-extra-file="$DEFAULTS_FILE" --single-transaction --routines --triggers --no-tablespaces "$DB_NAME" | gzip -9 > "$tmp"

# kiem tra: nen hop le va co cau truc bang
gzip -t "$tmp"
# dung grep -c (doc het dau vao): grep -q thoat som lam zcat bi SIGPIPE, voi pipefail se bao loi nham
n_tables="$(zcat "$tmp" | grep -c 'CREATE TABLE' || true)"
[[ "$n_tables" -gt 0 ]] || { echo "Ban sao luu khong co bang nao - bo qua" >&2; exit 1; }
mv "$tmp" "$out"
trap - EXIT

# xoa ban cu hon KEEP_DAYS ngay (chi tep dung mau ten cua DB nay)
find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "$out"
