import { Router } from 'express';
import { validate } from '../middlewares/validate';
import { orderSchema, orderStatusSchema, orderPaymentSchema } from '../schemas';
import * as OrderController from '../controllers/order.controller';

const router = Router();

router.get('/',              OrderController.list);
router.get('/:id',           OrderController.getById);
router.post('/',             validate(orderSchema),       OrderController.create);
router.put('/:id',           validate(orderSchema),       OrderController.update);
router.put('/:id/status',    validate(orderStatusSchema),  OrderController.updateStatus);
router.put('/:id/payment',   validate(orderPaymentSchema), OrderController.updatePayment);
router.delete('/:id',        OrderController.cancel);

export default router;
