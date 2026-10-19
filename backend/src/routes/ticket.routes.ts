import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import * as ticketController from '../controllers/ticket.controller';

const ALL_ROLES = ['Admin','Doctor','Student','Receptionist','LabTechnician','DentalAssistant','InventoryManager','Radiologist'] as const;

const createSchema  = z.object({ ticketTypeId: z.number().int().positive(), details: z.string().min(1) });
const replySchema   = z.object({ messageText: z.string().min(1) });
const resolveSchema = z.object({ note: z.string().optional() });

const router = Router();

router.get('/types',         auth, authorize(...ALL_ROLES), ticketController.listTypes);
router.get('/',              auth, authorize(...ALL_ROLES), ticketController.list);
router.post('/',             auth, authorize(...ALL_ROLES), validate(createSchema),  audit({ eventType: 'Ticket_Create',  eventDescription: 'Ticket submitted',  getDetails: (req) => `New ticket submitted by user #${req.user?.userId}` }),                                    ticketController.create);
router.get('/:id',           auth, authorize(...ALL_ROLES), ticketController.getDetail);
router.post('/:id/reply',    auth, authorize(...ALL_ROLES), validate(replySchema),   ticketController.reply);
router.patch('/:id/resolve', auth, authorize('Admin'),      validate(resolveSchema), audit({ eventType: 'Ticket_Update',  eventDescription: 'Ticket resolved',   getDetails: (req) => `Ticket #${req.params['id']} resolved` }),                                                     ticketController.resolve);

export default router;
