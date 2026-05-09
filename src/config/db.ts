import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'santocerdo',
  waitForConnections: true,
  connectionLimit: 4,
  queueLimit: 0,
  charset: 'utf8mb4',
  // Convierte automáticamente DATETIME de MySQL a string ISO
  dateStrings: false,
  timezone: 'Z',
  // Reusa conexiones TCP para evitar el handshake TLS en cada query (Clever está en Montreal, son ~150ms cada uno)
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export default pool;
