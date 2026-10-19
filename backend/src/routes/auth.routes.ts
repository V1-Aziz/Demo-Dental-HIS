import { Router } from 'express';
import { login, refresh, logout, heartbeat, register, registerableRoles } from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';
import { loginSchema, refreshSchema, logoutSchema } from '../validators/auth.validator';
import { submitRegistrationSchema } from '../validators/pending-registration.validator';
import { auth } from '../middleware/auth.middleware';
import { sessionActivityMiddleware } from '../middleware/session-activity.middleware';

const router = Router();

router.post('/login',    validate(loginSchema),    login);
router.post('/refresh',  validate(refreshSchema),  refresh);
router.post('/logout',   validate(logoutSchema),   logout);
router.post('/register', validate(submitRegistrationSchema), register);
router.get('/registerable-roles', registerableRoles);

// Heartbeat: keeps last_activity_at fresh when the user isn't making other calls.
// auth + sessionActivityMiddleware do the real work; the handler just returns 200.
router.post('/heartbeat', auth, sessionActivityMiddleware, heartbeat);

export default router;
