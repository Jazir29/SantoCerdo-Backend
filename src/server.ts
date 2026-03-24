import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { authMiddleware } from './middlewares/auth';
import authRoutes       from './routes/auth.routes';
import productRoutes    from './routes/products.routes';
import customerRoutes   from './routes/customers.routes';
import orderRoutes      from './routes/orders.routes';
import promotionRoutes  from './routes/promotions.routes';
import statsRoutes      from './routes/stats.routes';

dotenv.config();

const app  = express();
const PORT = Number(process.env.PORT) || 4000;

// ── Middlewares globales ───────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// ── Rutas públicas (sin auth) ─────────────────────────────────
app.use('/api', authRoutes);

// ── Rutas protegidas (requieren JWT) ─────────────────────────
app.use('/api/products',   authMiddleware, productRoutes);
app.use('/api/customers',  authMiddleware, customerRoutes);
app.use('/api/orders',     authMiddleware, orderRoutes);
app.use('/api/promotions', authMiddleware, promotionRoutes);
app.use('/api/stats',      authMiddleware, statsRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// ── Arranque ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});

export default app;
