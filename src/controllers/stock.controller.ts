import { Request, Response } from 'express';
import * as StockService from '../services/stock.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page      = Math.max(Number(req.query.page) || 1, 1);
  const limit     = Math.min(Number(req.query.limit) || 20, 100);
  const productId = req.query.productId ? Number(req.query.productId) : undefined;
  const type      = req.query.type as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate   = req.query.endDate   as string | undefined;
  const data = await StockService.list({ page, limit, productId, type, startDate, endDate });
  res.json(data);
});
