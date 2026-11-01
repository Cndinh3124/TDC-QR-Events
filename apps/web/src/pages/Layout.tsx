// Khung quan tri: menu trai xanh Doan, thanh tren; chua dang nhap thi ve /dang-nhap.
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, Reminders } from '../api';
import { useAuth } from '../auth';

// Man chi Doan truong: API da chan 403, day chi de khong hien man trong (dac ta 8.2)
export function RequireAdmin() {
  const { user } = useAuth();
  return user?.role === 'SCHOOL_ADMIN' ? <Outlet /> : <div className="error">Chỉ quản trị Đoàn trường mới dùng được mục này.</div>;
}

export function Layout() {
  const { user, loading, signOut } = useAuth();
  const { pathname } = useLocation();
  const [due, setDue] = useState(0);

  // so nhac viec canh muc Tong quan; cap nhat moi lan doi man
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    api<Reminders>('GET', '/admin/dashboard/reminders').then((r) => setDue(r.pendingReview.length + r.appealsDue.length)).catch(() => {});
  }, [user, pathname]);

  if (loading) return <div className="content">Đang tải…</div>;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  // [BM] TK moi tao bat buoc doi mat khau truoc khi dung cac man khac (API cung chan)
  if (user.mustChangePassword && pathname !== '/doi-mat-khau') return <Navigate to="/doi-mat-khau" replace />;

  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">TDC-QR-Events</div>
        <NavLink to="/tong-quan">Tổng quan{due > 0 && <span className="nav-badge" title="Việc cần xử lý">{due}</span>}</NavLink>
        <div className="group">Hoạt động</div>
        <NavLink to="/su-kien">Sự kiện</NavLink>
        <NavLink to="/khieu-nai">Khiếu nại</NavLink>
        <div className="group">Sinh viên</div>
        <NavLink to="/sinh-vien">Hồ sơ sinh viên</NavLink>
        <NavLink to="/bao-cao">Báo cáo ĐRL</NavLink>
        {user.role === 'SCHOOL_ADMIN' && (
          <>
            <div className="group">Hệ thống</div>
            <NavLink to="/tai-khoan">Tài khoản quản trị</NavLink>
            <NavLink to="/don-vi">Đơn vị</NavLink>
            <NavLink to="/cau-hinh">Cấu hình</NavLink>
            <NavLink to="/nhat-ky">Nhật ký</NavLink>
          </>
        )}
        <div className="group">Tài khoản</div>
        <NavLink to="/doi-mat-khau">Đổi mật khẩu</NavLink>
      </nav>
      <div className="main">
        <header className="top">
          <span>{user.fullName}</span>
          <button className="btn" onClick={signOut}>Đăng xuất</button>
        </header>
        <main className="content wide">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
