import { Router } from 'express';
import { requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { productSchema, newProductWithBatchSchema, addBatchSchema } from '../schemas';
import * as ProductController from '../controllers/product.controller';

const router = Router();

router.get('/',                     ProductController.list);
router.post('/',                    requireRole('admin'), validate(productSchema),             ProductController.create);
router.post('/batches/new-product', requireRole('admin'), validate(newProductWithBatchSchema), ProductController.createWithBatch);
router.put('/:id',                  requireRole('admin'), validate(productSchema),             ProductController.update);
router.delete('/:id',               requireRole('admin'),                                      ProductController.remove);
router.post('/:id/batches',         requireRole('admin'), validate(addBatchSchema),            ProductController.addBatch);
router.get('/:id/batches',          ProductController.getBatchHistory);

export default router;
