import { Request, Response } from 'express';
import * as PromotionService from '../services/promotion.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page   = Number(req.query.page)  || 1;
  const limit  = Number(req.query.limit) || 10;
  const search = `%${req.query.search || ''}%`;
  const data = await PromotionService.list({ page, limit, search });
  res.json(data);
});

export const validateCode = asyncHandler(async (req: Request, res: Response) => {
  const result = await PromotionService.validateCode(req.params.code);
  res.json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const promotion = await PromotionService.create(req.body, req.user!.id);
  res.status(201).json(promotion);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  await PromotionService.update(Number(req.params.id), req.body, req.user!.id);
  res.json({ success: true });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await PromotionService.remove(Number(req.params.id), req.user!.id);
  res.json({ success: true });
});
