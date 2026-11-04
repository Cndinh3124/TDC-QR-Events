// Logo Doan - TDC - Hoi (tep trong public/brand), cung thu tu voi anh ghep cum3logo.png trong PDF.
// Logo TDC mau xanh nhat nen dat trong khung tron trang de doc duoc tren nen xanh Doan dam - chot-giao-dien.md muc 5.
export function LogoTrio({ size = 40 }: { size?: number }) {
  return (
    <span className="logos" style={{ ['--logo' as string]: `${size}px` }}>
      <img src="/brand/logo-doan.png" alt="Đoàn TNCS Hồ Chí Minh" />
      <span className="logo-chip"><img src="/brand/logo-tdc.png" alt="Trường Cao đẳng Công nghệ Thủ Đức" /></span>
      <img src="/brand/logo-hoi.png" alt="Hội Sinh viên Việt Nam" />
    </span>
  );
}
