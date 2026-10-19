import { Router } from 'express';
import { auth } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  getAttendanceStats,
  getClinicOccupancy,
  getClinics,
} from '../../controllers/reports/appointment-reports.controller';

const router = Router();

router.get('/appointments/attendance', auth, authorize('Admin'), getAttendanceStats);
router.get('/appointments/occupancy', auth, authorize('Admin'), getClinicOccupancy);
router.get('/appointments/clinics', auth, authorize('Admin'), getClinics);

export default router;
