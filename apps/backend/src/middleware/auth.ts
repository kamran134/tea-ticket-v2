import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import { ErrorCodes, fail } from '../errors';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Unauthorized');
    return;
  }

  const token = header.slice(7);
  try {
    jwt.verify(token, env.JWT_SECRET);
    next();
  } catch {
    fail(res, 401, ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
  }
}
