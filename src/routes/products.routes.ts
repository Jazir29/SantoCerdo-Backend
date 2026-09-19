import { Router } from 'express';
import { requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { productSchema, newProductWithBatchSchema, addBatchSchema, stockAdjustmentSchema } from '../schemas';
import * as ProductController from '../controllers/product.controller';

const router = Router();

router.get('/',                     ProductController.list);
router.post('/',                    requireRole('admin'), validate(productSchema),             ProductController.create);
router.post('/batches/new-product', requireRole('admin'), validate(newProductWithBatchSchema), ProductController.createWithBatch);
router.put('/:id',                  requireRole('admin'), validate(productSchema),             ProductController.update);
router.delete('/:id',               requireRole('admin'),                                      ProductController.remove);
router.post('/:id/batches',         requireRole('admin'), validate(addBatchSchema),            ProductController.addBatch);
router.get('/:id/batches',          ProductController.getBatchHistory);
router.post('/:id/stock-adjustment', requireRole('admin'), validate(stockAdjustmentSchema), ProductController.adjustStock);

export default router;
