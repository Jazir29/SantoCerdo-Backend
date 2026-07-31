import { Request, Response } from 'express';
import * as CustomerService from '../services/customer.service';
import { asyncHandler } from '../middlewares/errorHandler';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page       = Math.max(Number(req.query.page) || 1, 1);
  const limit      = Math.min(Number(req.query.limit) || 10, 1000);
  const search     = `%${req.query.search || ''}%`;
  const type       = req.query.type       as string | undefined;
  const department = req.query.department as string | undefined;
  const province   = req.query.province   as string | undefined;
  const district   = req.query.district   as string | undefined;
  const data = await CustomerService.list({ page, limit, search, type, department, province, district });
  res.json(data);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const customer = await CustomerService.create(req.body, req.user!.id);
  res.status(201).json(customer);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  await CustomerService.update(Number(req.params.id), req.body, req.user!.id);
  res.json({ success: true });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await CustomerService.remove(Number(req.params.id), req.user!.id);
  res.json({ success: true });
});

export const getAddresses = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await CustomerService.getAddresses(Number(req.params.id));
  res.json(addresses);
});

export const createAddress = asyncHandler(async (req: Request, res: Response) => {
  const address = await CustomerService.createAddress(Number(req.params.id), req.body, req.user!.id);
  res.status(201).json(address);
});

export const updateAddress = asyncHandler(async (req: Request, res: Response) => {
  await CustomerService.updateAddress(
    Number(req.params.id),
    Number(req.params.addressId),
    req.body,
    req.user!.id,
  );
  res.json({ success: true });
});

export const deleteAddress = asyncHandler(async (req: Request, res: Response) => {
  await CustomerService.deleteAddress(
    Number(req.params.id),
    Number(req.params.addressId),
    req.user!.id,
  );
  res.json({ success: true });
});

export const updateFavoriteAddress = asyncHandler(async (req: Request, res: Response) => {
  const { addressId } = req.body;
  await CustomerService.updateFavoriteAddress(
    Number(req.params.id),
    addressId || null,
    req.user!.id,
  );
  res.json({ success: true });
});
