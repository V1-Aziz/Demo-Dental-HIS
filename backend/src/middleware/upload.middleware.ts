// Multer configuration for screening image uploads. Files land on disk under
// `backend/uploads/screenings/{patient_id}/{uuid}.{ext}`. Only JPEG/PNG are
// accepted; everything else is rejected before the controller runs.  The
// absolute destination path is attached to each file so the service layer can
// persist a stable relative path back into the DB.
import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { v4 as uuidv4 } from 'uuid';

// Uploads directory lives inside the backend folder (next to `src/`) rather
// than inside `src/` so it is not swept into the compile output.  Path is
// resolved once at module load so it's stable regardless of process cwd.
export const SCREENING_UPLOAD_ROOT = path.resolve(__dirname, '../../uploads/screenings');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file, per spec
const MAX_FILES_PER_BATCH = 10;               // 10 files per batch, per spec
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const ACCEPTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const storage = multer.diskStorage({
  destination(req: Request, _file: Express.Multer.File, cb: (err: Error | null, destination: string) => void): void {
    const patientId = req.params['patientId'];
    if (!patientId || !/^\d+$/.test(patientId)) {
      cb(new Error('INVALID_PATIENT_ID'), '');
      return;
    }
    const dir = path.join(SCREENING_UPLOAD_ROOT, patientId);
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err as Error, '');
    }
  },
  filename(_req: Request, file: Express.Multer.File, cb: (err: Error | null, filename: string) => void): void {
    // UUID filename keeps the on-disk name opaque — no patient PII in filenames,
    // and no collisions when two uploads race on the same source filename.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const mime = (file.mimetype || '').toLowerCase();
  const ext  = path.extname(file.originalname || '').toLowerCase();
  if (!ACCEPTED_MIME_TYPES.has(mime) || !ACCEPTED_EXTENSIONS.has(ext)) {
    // Reject without throwing so multer surfaces a clean error rather than
    // a stack trace.  Server-level handler maps this to 415.
    cb(null, false);
    return;
  }
  cb(null, true);
}

export const screeningUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files:    MAX_FILES_PER_BATCH,
  },
});
