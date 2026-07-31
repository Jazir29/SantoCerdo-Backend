import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import pool from '../config/db';
import { authMiddleware, requireRole } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { createUserSchema, updateUserSchema, updateProfileSchema } from '../schemas';
import * as UserController from '../controllers/user.controller';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Demasiados intentos. Intenta nuevamente en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const router = Router();

// ── POST /api/login ──────────────────────────────────────────
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ message: 'Usuario y contraseña requeridos' });
    return;
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password, name, first_name, last_name, role FROM users WHERE username = ? AND deleted_at IS NULL',
      [username],
    ) as any[];

    const user = rows[0];
    if (!user) {
      res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      return;
    }

    let isValid = false;
    if (user.password.startsWith('$2')) {
      isValid = await bcrypt.compare(password, user.password);
    } else {
      isValid = password === user.password;
    }

    if (!isValid) {
      res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      return;
    }

    const expiresIn  = process.env.JWT_EXPIRES_IN || '8h';
    const userPayload = {
      id:         user.id,
      username:   user.username,
      name:       user.name,
      first_name: user.first_name || '',
      last_name:  user.last_name  || '',
      role:       user.role,
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn } as jwt.SignOptions);

    const secure = process.env.COOKIE_SECURE === 'true';
    res.cookie('token', token, {
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ success: true, user: userPayload });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// ── POST /api/logout ─────────────────────────────────────────
router.post('/logout', (_req, res) => {
  const secure = process.env.COOKIE_SECURE === 'true';
  res.clearCookie('token', {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
  });
  res.json({ success: true });
});

// ── User management routes ───────────────────────────────────
router.get('/users',              authMiddleware, requireRole('admin'),                              UserController.getAll);
router.post('/users',             authMiddleware, requireRole('admin'), validate(createUserSchema),  UserController.create);
router.put('/users/:id',          authMiddleware, requireRole('admin'), validate(updateUserSchema),  UserController.update);
router.put('/users/:id/profile',  authMiddleware,                       validate(updateProfileSchema), UserController.updateProfile);
router.delete('/users/:id',       authMiddleware, requireRole('admin'),                              UserController.remove);

export default router;
