// Dieu khien phan trang don gian: Truoc / Sau + "Trang x / y"
export function Pagination({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <nav className="pager" aria-label="Phân trang">
      <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Trước</button>
      <span>Trang {page} / {pages} · {total.toLocaleString('vi-VN')} mục</span>
      <button className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau →</button>
    </nav>
  );
}
