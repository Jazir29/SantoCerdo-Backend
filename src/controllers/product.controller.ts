import { Request, Response } from 'express';
import * as ProductService from '../services/product.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page   = Math.max(Number(req.query.page) || 1, 1);
  const limit  = Math.min(Number(req.query.limit) || 10, 1000);
  const search = `%${req.query.search || ''}%`;
  const data = await ProductService.list(page, limit, search);
  res.json(data);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const product = await ProductService.create(req.body, req.user!.id);
  res.status(201).json(product);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  await ProductService.update(Number(req.params.id), req.body, req.user!.id);
  res.json({ success: true });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await ProductService.remove(Number(req.params.id), req.user!.id);
  res.json({ success: true });
});

export const createWithBatch = asyncHandler(async (req: Request, res: Response) => {
  const product = await ProductService.createWithBatch(req.body, req.user!.id);
  res.status(201).json(product);
});

export const addBatch = asyncHandler(async (req: Request, res: Response) => {
  const batch = await ProductService.addBatch(Number(req.params.id), req.body, req.user!.id);
  res.status(201).json(batch);
});

export const getBatchHistory = asyncHandler(async (req: Request, res: Response) => {
  const batches = await ProductService.getBatchHistory(Number(req.params.id));
  res.json(batches);
});
