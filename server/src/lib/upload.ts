import multer from 'multer';
import { badRequest } from './errors';

/** Mijoz dizayni: katta o'lchamli sifatli JPG bo'lishi mumkin */
export const designUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(badRequest('BAD_IMAGE', 'Faqat rasm yuklash mumkin'));
    cb(null, true);
  },
});

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(badRequest('BAD_IMAGE', 'Faqat rasm yuklash mumkin'));
    cb(null, true);
  },
});
