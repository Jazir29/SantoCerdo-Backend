import { Request, Response } from 'express';
import * as OrderService from '../services/order.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page      = Math.max(Number(req.query.page) || 1, 1);
  const limit     = Math.min(Number(req.query.limit) || 10, 200);
  const search    = `%${req.query.search || ''}%`;
  const status    = req.query.status    as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate   = req.query.endDate   as string | undefined;
  const data = await OrderService.list({ page, limit, search, status, startDate, endDate });
  res.json(data);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { order, items } = await OrderService.getById(Number(req.params.id));
  res.json({ ...order, items });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await OrderService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, orderId: result.orderId });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  await OrderService.update(Number(req.params.id), req.body, req.user!.id);
  res.json({ success: true });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  await OrderService.updateStatus(Number(req.params.id), req.body.status, req.user!.id);
  res.json({ success: true });
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  await OrderService.cancel(Number(req.params.id), req.user!.id);
  res.json({ success: true });
});

export const updatePayment = asyncHandler(async (req: Request, res: Response) => {
  await OrderService.updatePayment(Number(req.params.id), req.body, req.user!.id);
  res.json({ success: true });
});
