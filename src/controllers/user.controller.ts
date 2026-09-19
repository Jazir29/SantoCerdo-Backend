import { Request, Response } from 'express';
import * as UserService from '../services/user.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const getAll = asyncHandler(async (req: Request, res: Response) => {
  const page  = Math.max(Number(req.query.page)  || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const data = await UserService.getAll(page, limit);
  res.json(data);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = await UserService.create(req.body, req.user!.id);
  res.status(201).json({ success: true, user });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = await UserService.update(Number(req.params.id), req.body, req.user!.id);
  res.json({ success: true, user });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await UserService.updateProfile(Number(req.params.id), req.body, req.user!.id);
  res.json({ success: true, user });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await UserService.remove(Number(req.params.id), req.user!.id);
  res.json({ success: true });
});
