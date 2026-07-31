import { Request, Response } from 'express';
import * as BatchService from '../services/batch.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page   = Math.max(Number(req.query.page) || 1, 1);
  const limit  = Math.min(Number(req.query.limit) || 10, 100);
  const search = `%${req.query.search || ''}%`;
  const data = await BatchService.list({ page, limit, search });
  res.json(data);
});
