import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { env } from '../env';

export const authRouter = Router();

// One shared admin password for the whole system, no lockout or attempt
// logging otherwise — slow down brute force per client IP (see S9 in the audit).
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts, please try again later' },
});

authRouter.post('/login', loginRateLimit, async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    return res.status(400).json({ success: false, error: 'Password required' });
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    return res.status(500).json({ success: false, error: 'Admin password not configured' });
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  const token = jwt.sign({ admin: true }, env.JWT_SECRET, { expiresIn: '24h' });
  return res.json({ success: true, data: { token } });
});
