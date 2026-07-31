import { Router } from 'express';
import * as StatsController from '../controllers/stats.controller';

const router = Router();

router.get('/', StatsController.getDashboard);

export default router;
