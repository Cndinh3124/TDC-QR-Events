// Dinh dang loi thong nhat { statusCode, code, message } - dac ta 7
// [BM] loi khong luong truoc (500) khong lo chi tiet ra ngoai.
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (body && typeof body === 'object' && body.code) {
        return res.status(status).json(body);
      }
      const codeByStatus: Record<number, string> = {
        400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
        413: 'PAYLOAD_TOO_LARGE', 429: 'TOO_MANY_REQUESTS',
      };
      const message =
        status === 429 ? 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.'
        : status === 404 ? 'Không tìm thấy đường dẫn.'
        : status === 413 ? 'Dữ liệu gửi lên quá lớn.'
        : 'Yêu cầu không hợp lệ.';
      return res.status(status).json({ statusCode: status, code: codeByStatus[status] || 'ERROR', message });
    }
    // loi cua body-parser (JSON hong, body qua lon) la loi client co status 4xx, khong phai 500
    const e = exception as { status?: number; expose?: boolean; type?: string };
    if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500 && e.expose) {
      const tooLarge = e.status === 413;
      return res.status(e.status).json({
        statusCode: e.status,
        code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: tooLarge ? 'Dữ liệu gửi lên quá lớn.' : 'Dữ liệu gửi lên không đọc được.',
      });
    }
    // loi khong luong truoc: ghi log noi bo (khong ghi du lieu nhay cam), tra thong bao chung
    this.logger.error((exception as Error)?.message, (exception as Error)?.stack);
    return res.status(500).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.',
    });
  }
}
