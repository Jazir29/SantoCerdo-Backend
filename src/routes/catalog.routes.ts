import { Router } from 'express';
import { requireRole } from '../middlewares/auth';
import * as CatalogController from '../controllers/catalog.controller';

const router = Router();

router.get('/',                          CatalogController.listCategories);
router.get('/:category',                 CatalogController.listByCategory);
router.put('/:category/:code',           requireRole('admin'), CatalogController.upsert);
router.patch('/:category/:code/toggle',  requireRole('admin'), CatalogController.toggleActive);

export default router;
