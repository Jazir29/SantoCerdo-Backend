import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../services/errors';
import logger from '../config/logger';

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const asyncHandler = (fn: AsyncFn): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ message: 'Error interno del servidor' });
};
