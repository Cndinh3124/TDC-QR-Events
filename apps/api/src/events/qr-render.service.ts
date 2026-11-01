// Ve ma QR ra PNG va PDF A4 de in - dac ta 3.2
// QR ve dang vector trong PDF (net hon anh) ; font Open Sans (assets/fonts, co du dau tieng Viet); thieu file thi lui ve DejaVu trong node_modules.
import { Inject, Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { APP_ENV } from '../config/app-config.module';
import { AppEnv } from '../config/env';
import { QrPurpose } from './entities/event-qr-token.entity';

export interface QrPdfInput {
  url: string;
  purpose: QrPurpose;
  title: string;
  startAt: Date;
  endAt: Date;
  locationName: string | null;
}

const PAGE_W = 595.28;
const NAVY = '#0B3A86';
const LOGO_FILE = 'cum3logo.png'; // anh ghep Doan - TDC - Hoi (khong tach duoc), dac ta chot-giao-dien muc 5
const BUNDLED_LOGO = join(__dirname, '..', '..', 'assets', 'brand', LOGO_FILE);
const fmtTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false,
});

@Injectable()
export class QrRenderService {
  private fonts: { regular: Buffer; bold: Buffer } | null = null;
  private logo: Buffer | null | undefined;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  png(url: string): Promise<Buffer> {
    return QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', width: 1024, margin: 4 });
  }

  pdf(input: QrPdfInput): Promise<Buffer> {
    const { regular, bold } = this.loadFonts();
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'QR diem danh', Creator: 'TDC-QR-Events' } });
    doc.registerFont('Sans', regular);
    doc.registerFont('Sans-Bold', bold);

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        this.drawHeader(doc);
        this.drawTitle(doc, input);
        this.drawQr(doc, input.url);
        this.drawFooter(doc, input);
        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument): void {
    const logo = this.loadLogo();
    if (logo) {
      const w = 190;
      doc.image(logo, (PAGE_W - w) / 2, 30, { width: w });
    }
    doc.font('Sans-Bold').fontSize(11).fillColor(NAVY);
    doc.text('ĐOÀN THANH NIÊN – HỘI SINH VIÊN', 40, 120, { width: PAGE_W - 80, align: 'center' });
  }

  private drawTitle(doc: PDFKit.PDFDocument, i: QrPdfInput): void {
    doc.font('Sans-Bold').fontSize(26).fillColor('#13213C');
    doc.text(i.title, 40, 145, { width: PAGE_W - 80, height: 105, align: 'center', ellipsis: true });
    doc.font('Sans-Bold').fontSize(20).fillColor(NAVY);
    doc.text(i.purpose === 'CHECKIN' ? 'ĐIỂM DANH VÀO' : 'ĐIỂM DANH RA', 40, 262, { width: PAGE_W - 80, align: 'center' });
  }

  // ve tung o QR bang hinh chu nhat; vung trang xung quanh (quiet zone) 4 o theo chuan
  private drawQr(doc: PDFKit.PDFDocument, url: string): void {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const quiet = 4;
    const size = 340;
    const cell = size / (n + quiet * 2);
    const x0 = (PAGE_W - size) / 2;
    const y0 = 300;
    doc.rect(x0, y0, size, size).lineWidth(1).fillAndStroke('#FFFFFF', '#E1E7F0');
    doc.fillColor('#000000');
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.data[r * n + c]) doc.rect(x0 + (c + quiet) * cell, y0 + (r + quiet) * cell, cell + 0.2, cell + 0.2).fill();
      }
    }
  }

  private drawFooter(doc: PDFKit.PDFDocument, i: QrPdfInput): void {
    doc.font('Sans').fontSize(14).fillColor('#13213C');
    doc.text('1. Mở camera điện thoại và quét mã QR\n2. Nhập MSSV, họ tên và chọn khoa\n3. Kiểm tra thông tin rồi bấm Xác nhận', 130, 665, {
      width: PAGE_W - 260, lineGap: 4,
    });
    doc.font('Sans').fontSize(11).fillColor('#5B6678');
    const where = i.locationName ? `\nĐịa điểm: ${i.locationName}` : '';
    doc.text(`Thời gian: ${fmtTime.format(i.startAt)} – ${fmtTime.format(i.endAt)}${where}`, 40, 750, {
      width: PAGE_W - 80, height: 48, align: 'center', ellipsis: true,
    });
  }

  private loadFonts(): { regular: Buffer; bold: Buffer } {
    if (!this.fonts) {
      const openSans = join(__dirname, '..', '..', 'assets', 'fonts');
      if (existsSync(join(openSans, 'OpenSans-Regular.ttf')) && existsSync(join(openSans, 'OpenSans-Bold.ttf'))) {
        this.fonts = { regular: readFileSync(join(openSans, 'OpenSans-Regular.ttf')), bold: readFileSync(join(openSans, 'OpenSans-Bold.ttf')) };
      } else {
        const dir = join(dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
        this.fonts = { regular: readFileSync(join(dir, 'DejaVuSans.ttf')), bold: readFileSync(join(dir, 'DejaVuSans-Bold.ttf')) };
      }
    }
    return this.fonts;
  }

  // BRAND_DIR (tuy chon) la thu muc chua cum3logo.png de thay logo di kem; khong co thi dung ban dong goi san
  private loadLogo(): Buffer | null {
    if (this.logo === undefined) {
      const dir = this.env.brandDir;
      const found = [dir ? join(dir, LOGO_FILE) : '', BUNDLED_LOGO].find((p) => p && existsSync(p));
      this.logo = found ? readFileSync(found) : null;
    }
    return this.logo;
  }
}
