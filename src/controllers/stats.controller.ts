import { Request, Response } from 'express';
import * as StatsService from '../services/stats.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const range        = req.query.range        as string || '30days';
  const status       = req.query.status       as string || 'all';
  const customerType = req.query.customerType as string || 'all';
  const startDate    = req.query.startDate    as string | undefined;
  const endDate      = req.query.endDate      as string | undefined;
  const data = await StatsService.getDashboard({ range, status, customerType, startDate, endDate });
  res.json(data);
});
