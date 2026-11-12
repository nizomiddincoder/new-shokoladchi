import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message || code);
  }
}

export const badRequest = (code: string, message?: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const notFound = (code = 'NOT_FOUND', message = 'Topilmadi') => new HttpError(404, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'Ruxsat yo\'q') => new HttpError(403, code, message);
export const unauthorized = (code = 'UNAUTHORIZED', message = 'Avtorizatsiya talab qilinadi') =>
  new HttpError(401, code, message);
export const conflict = (code: string, message?: string, details?: unknown) =>
  new HttpError(409, code, message, details);

/** Async route handler'larni o'rab, xatoni next() ga uzatadi */
export const ah =
  <T extends Request = Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res, next).catch(next);
  };

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION', message: 'Ma\'lumotlar noto\'g\'ri', details: err.flatten() },
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  const anyErr = err as { type?: string; code?: string; message?: string; status?: number; statusCode?: number };
  if (anyErr?.type === 'entity.too.large' || anyErr?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Fayl juda katta' } });
  }
  if (anyErr?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'So\'rov formati noto\'g\'ri' } });
  }
  // multer va boshqa kutubxonalarning 4xx xatolari
  if (anyErr?.code?.startsWith?.('LIMIT_')) {
    return res.status(400).json({ error: { code: anyErr.code, message: anyErr.message || 'Fayl xatosi' } });
  }
  const status = anyErr?.status ?? anyErr?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return res.status(status).json({ error: { code: status === 404 ? 'NOT_FOUND' : 'HTTP_' + status, message: status === 404 ? 'Topilmadi' : anyErr.message || 'Xato' } });
  }
  logger.error({ err, url: req.originalUrl }, 'Kutilmagan xato');
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Serverda xato yuz berdi' } });
}
