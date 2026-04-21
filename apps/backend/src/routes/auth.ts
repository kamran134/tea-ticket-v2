import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
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

  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET!, { expiresIn: '24h' });
  return res.json({ success: true, data: { token } });
});
