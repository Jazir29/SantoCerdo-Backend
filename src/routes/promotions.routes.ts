import { Router } from 'express';
import { requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { promotionSchema } from '../schemas';
import * as PromotionController from '../controllers/promotion.controller';

const router = Router();

router.get('/',                PromotionController.list);
router.get('/validate/:code',  PromotionController.validateCode);
router.post('/',               requireRole('admin'), validate(promotionSchema), PromotionController.create);
router.put('/:id',             requireRole('admin'), validate(promotionSchema), PromotionController.update);
router.delete('/:id',          requireRole('admin'),                            PromotionController.remove);

export default router;
