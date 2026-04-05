import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// ── Helper: construir nombre completo ────────────────────────
const fullName = (first: string, last: string) =>
  `${first} ${last}`.trim();

// ── POST /api/login ──────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ message: 'Usuario y contraseña requeridos' });
    return;
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password, name, first_name, last_name, role FROM users WHERE username = ? AND deleted_at IS NULL',
      [username]
    ) as any[];

    const user = rows[0];
    if (!user) {
      res.status(401).json({ success: false, message: 'Credenciales inválidas' });
      return;
    }

    // Soporte para passwords hasheadas y en texto plano (legacy)
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

    const secret     = process.env.JWT_SECRET || 'fallback_secret';
    const expiresIn  = process.env.JWT_EXPIRES_IN || '8h';
    const userPayload = {
      id:         user.id,
      username:   user.username,
      name:       user.name,
      first_name: user.first_name || '',
      last_name:  user.last_name  || '',
      role:       user.role,
    };

    const token = jwt.sign(userPayload, secret, { expiresIn } as jwt.SignOptions);

    res.json({ success: true, token, user: userPayload });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// ── GET /api/users ───────────────────────────────────────────
router.get('/users', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, name, first_name, last_name, role FROM users WHERE deleted_at IS NULL ORDER BY id ASC'
    ) as any[];
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
});

// ── POST /api/users ──────────────────────────────────────────
router.post('/users', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { username, password, first_name, last_name, role } = req.body;
  const createdBy = (req as any).user?.id;

  if (!username || !password || !first_name || !last_name || !role) {
    res.status(400).json({ message: 'Todos los campos son obligatorios' });
    return;
  }

  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL',
      [username]
    ) as any[];
    if (existing.length > 0) {
      res.status(409).json({ message: 'El nombre de usuario ya existe' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const name   = fullName(first_name, last_name);

    const [result] = await pool.query(
      'INSERT INTO users (username, password, name, first_name, last_name, role, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, hashed, name, first_name, last_name, role, createdBy]
    ) as any[];

    const newUser = {
      id: result.insertId,
      username,
      name,
      first_name,
      last_name,
      role,
    };

    res.status(201).json({ success: true, user: newUser });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear usuario' });
  }
});

// ── PUT /api/users/:id ───────────────────────────────────────
router.put('/users/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id        = Number(req.params.id);
  const updatedBy = (req as any).user?.id;
  const { username, first_name, last_name, role, password } = req.body;

  if (!username || !first_name || !last_name || !role) {
    res.status(400).json({ message: 'Faltan campos obligatorios' });
    return;
  }

  try {
    const name = fullName(first_name, last_name);

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET username=?, name=?, first_name=?, last_name=?, role=?, password=?, updated_by=? WHERE id=?',
        [username, name, first_name, last_name, role, hashed, updatedBy, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET username=?, name=?, first_name=?, last_name=?, role=?, updated_by=? WHERE id=?',
        [username, name, first_name, last_name, role, updatedBy, id]
      );
    }

    res.json({ success: true, user: { id, username, name, first_name, last_name, role } });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
});

// ── PUT /api/users/:id/profile ───────────────────────────────
// Mismo usuario editando su propio perfil — verifica contraseña actual
router.put('/users/:id/profile', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { username, first_name, last_name, currentPassword, newPassword } = req.body;

  try {
    const [rows] = await pool.query(
      'SELECT password FROM users WHERE id = ? AND deleted_at IS NULL',
      [id]
    ) as any[];

    if (!rows[0]) {
      res.status(404).json({ message: 'Usuario no encontrado' });
      return;
    }

    // Si quiere cambiar contraseña — verificar la actual
    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({ success: false, message: 'Debes ingresar tu contraseña actual' });
        return;
      }
      const isValid = await bcrypt.compare(currentPassword, rows[0].password);
      if (!isValid) {
        res.status(401).json({ success: false, message: 'Contraseña actual incorrecta' });
        return;
      }
    }

    const name   = fullName(first_name || '', last_name || '');
    const updatedBy = (req as any).user?.id;

    if (newPassword) {
      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.query(
        'UPDATE users SET username=?, name=?, first_name=?, last_name=?, password=?, updated_by=? WHERE id=?',
        [username, name, first_name, last_name, hashed, updatedBy, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET username=?, name=?, first_name=?, last_name=?, updated_by=? WHERE id=?',
        [username, name, first_name, last_name, updatedBy, id]
      );
    }

    const updatedUser = { id, username, name, first_name, last_name };
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar perfil' });
  }
});

// ── DELETE /api/users/:id ────────────────────────────────────
router.delete('/users/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const id        = Number(req.params.id);
  const deletedBy = (req as any).user?.id;

  if (id === deletedBy) {
    res.status(400).json({ message: 'No puedes eliminar tu propio usuario' });
    return;
  }

  try {
    await pool.query(
      'UPDATE users SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
      [deletedBy, id]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar usuario' });
  }
});

export default router;