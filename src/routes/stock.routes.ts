import { Router } from 'express';
import * as StockController from '../controllers/stock.controller';

const router = Router();
router.get('/', StockController.list);
export default router;
