import { Router } from 'express';
import * as BatchController from '../controllers/batch.controller';

const router = Router();

router.get('/', BatchController.list);

export default router;
