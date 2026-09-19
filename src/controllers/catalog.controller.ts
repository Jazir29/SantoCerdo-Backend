import { Request, Response } from 'express';
import * as CatalogService from '../services/catalog.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const listByCategory = asyncHandler(async (req: Request, res: Response) => {
  const items = await CatalogService.listByCategory(req.params.category);
  res.json(items);
});

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await CatalogService.listCategories();
  res.json(categories);
});

export const upsert = asyncHandler(async (req: Request, res: Response) => {
  const { category, code } = req.params;
  await CatalogService.upsert(category, code, req.body);
  res.json({ success: true });
});

export const toggleActive = asyncHandler(async (req: Request, res: Response) => {
  await CatalogService.toggleActive(req.params.category, req.params.code);
  res.json({ success: true });
});
