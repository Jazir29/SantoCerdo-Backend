import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import pinoHttp   from 'pino-http';

import { authMiddleware } from './middlewares/auth';
import { errorHandler }  from './middlewares/errorHandler';
import authRoutes       from './routes/auth.routes';
import productRoutes    from './routes/products.routes';
import customerRoutes   from './routes/customers.routes';
import orderRoutes      from './routes/orders.routes';
import promotionRoutes  from './routes/promotions.routes';
import statsRoutes      from './routes/stats.routes';
import batchesRouter  from './routes/batches.routes';
import stockRoutes    from './routes/stock.routes';
import catalogRoutes  from './routes/catalog.routes';
import openapiSpec   from './openapi';
import logger        from './config/logger';

dotenv.config();

const app  = express();
const PORT = Number(process.env.PORT) || 4000;

// ── Swagger UI (antes de Helmet para relajar CSP solo en /api/docs) ──
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'Santo Cerdo API',
  swaggerOptions: { persistAuthorization: true },
}));

// ── Middlewares globales ───────────────────────────────────────
app.use(pinoHttp({
  logger,
  // No loguear health check ni docs para no ensuciar los logs
  autoLogging: { ignore: (req) => req.url === '/api/health' || (req.url?.startsWith('/api/docs') ?? false) },
  customLogLevel: (_req, res) => res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
}));
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// ── Rutas públicas (sin auth) ─────────────────────────────────
app.use('/api', authRoutes);

// ── Rutas protegidas (requieren JWT) ─────────────────────────
app.use('/api/products',   authMiddleware, productRoutes);
app.use('/api/customers',  authMiddleware, customerRoutes);
app.use('/api/orders',     authMiddleware, orderRoutes);
app.use('/api/promotions', authMiddleware, promotionRoutes);
app.use('/api/stats',      authMiddleware, statsRoutes);
app.use('/api/batches',          authMiddleware, batchesRouter);
app.use('/api/stock-movements', authMiddleware, stockRoutes);
app.use('/api/catalogs',        authMiddleware, catalogRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// ── Error handler centralizado ────────────────────────────────
app.use(errorHandler);

// ── Arranque ──────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Backend corriendo en http://localhost:${PORT}`);

  const selfUrl = process.env.SELF_URL;
  if (selfUrl) {
    setInterval(async () => {
      try { await fetch(`${selfUrl}/api/health`); } catch (_) { /* silencioso */ }
    }, 12 * 60 * 1000);
    logger.info({ selfUrl }, 'Auto-ping activo');
  }
});



export default app;
