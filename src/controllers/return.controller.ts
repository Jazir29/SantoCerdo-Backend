import { Request, Response } from 'express';
import * as ReturnService from '../services/return.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const createReturn = asyncHandler(async (req: Request, res: Response) => {
  const orderId = Number(req.params.id);
  const result = await ReturnService.createReturn(orderId, req.body, req.user!.id);
  res.status(201).json({ success: true, returnId: result.returnId });
});

export const listByOrder = asyncHandler(async (req: Request, res: Response) => {
  const orderId = Number(req.params.id);
  const returns = await ReturnService.listByOrder(orderId);
  res.json(returns);
});
