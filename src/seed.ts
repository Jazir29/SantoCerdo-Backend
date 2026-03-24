import bcrypt from 'bcryptjs';
import pool from './config/db';

async function seed() {
  console.log('🌱 Iniciando seed...');

  // ── Usuario admin ─────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await pool.query(
    `INSERT IGNORE INTO users (username, password, name, role) VALUES (?, ?, ?, ?)`,
    ['admin', hashedPassword, 'Administrador', 'admin']
  );
  console.log('✅ Usuario admin creado (contraseña: admin123)');

  // ── Producto inicial ──────────────────────────────────────
  const [prodCheck] = await pool.query('SELECT COUNT(*) as c FROM products') as any[];
  if (prodCheck[0].c === 0) {
    await pool.query(
      `INSERT INTO products (name, description, price, cost, stock, category) VALUES (?, ?, ?, ?, ?, ?)`,
      ['Pote Manteca Artesanal 750 g', 'Manteca de cerdo 100% natural y artesanal', 85, 50, 100, 'Manteca']
    );
    console.log('✅ Producto inicial creado');
  }

  // ── Clientes iniciales ────────────────────────────────────
  const [custCheck] = await pool.query('SELECT COUNT(*) as c FROM customers') as any[];
  if (custCheck[0].c === 0) {
    const cols = `(type, document_id, name, last_name, trade_name, email, phone)`;
    const q    = `INSERT INTO customers ${cols} VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const [r1] = await pool.query(q, ['natural', '71234567', 'Juan', 'Pérez', null, 'juan.perez@email.com', '987654321']) as any[];
    const [r2] = await pool.query(q, ['natural', '76543210', 'María', 'Gómez', null, 'maria.gomez@email.com', '912345678']) as any[];
    const [r3] = await pool.query(q, ['natural', '40123456', 'Roberto', 'Gómez', null, 'roberto.gomez@email.com', '955555555']) as any[];
    const [r4] = await pool.query(q, ['empresa', '20123456781', 'Inversiones Surco SAC', null, 'Panadería Surco', 'contacto@panaderiasurco.pe', '014441111']) as any[];
    const [r5] = await pool.query(q, ['empresa', '20123456782', 'Distribuidora Magdalena EIRL', null, 'Pastelería Magdalena', 'ventas@pasteleriamagdalena.pe', '014442222']) as any[];

    // Direcciones principales en customer_addresses
    const addrCols = `(customer_id, name, address, reference, department, province, district, is_favorite)`;
    const addrQ    = `INSERT INTO customer_addresses ${addrCols} VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    await pool.query(addrQ, [r1.insertId, 'Principal', 'Av. Larco 745, Int. 402', 'A una cuadra del Parque Kennedy.', 'Lima', 'Lima', 'Miraflores', 1]);
    await pool.query(addrQ, [r1.insertId, 'Trabajo', 'Calle Las Orquídeas 580', 'Frente al centro empresarial Real.', 'Lima', 'Lima', 'San Isidro', 0]);
    await pool.query(addrQ, [r2.insertId, 'Principal', 'Jr. Júpiter 1245, Urb. Sol de Oro', 'Cerca al cruce de Av. Angélica Gamarra.', 'Lima', 'Lima', 'Los Olivos', 1]);
    await pool.query(addrQ, [r3.insertId, 'Principal', 'Calle Lima 210', 'A espaldas del Mirador de Yanahuara.', 'Arequipa', 'Arequipa', 'Yanahuara', 1]);
    await pool.query(addrQ, [r4.insertId, 'Principal', 'Av. Manuel Olguín 335, Oficina 1201', 'Al costado del CC Jockey Plaza.', 'Lima', 'Lima', 'Santiago de Surco', 1]);
    await pool.query(addrQ, [r5.insertId, 'Principal', 'Jr. José Granda 475', 'A dos cuadras del cruce con Av. Javier Prado Oeste.', 'Lima', 'Lima', 'Magdalena del Mar', 1]);

    console.log('✅ Clientes iniciales creados');
  }

  // ── Promociones iniciales ─────────────────────────────────
  const [promoCheck] = await pool.query('SELECT COUNT(*) as c FROM promotions') as any[];
  if (promoCheck[0].c === 0) {
    await pool.query(`
      INSERT INTO promotions (name, code, type, value, start_date, end_date, active) VALUES
        ('Descuento de Bienvenida', 'BIENVENIDA10', 'percentage', 10,    NULL,         NULL,         1),
        ('Cupón Fijo S/ 20',        'FIJO20',        'fixed',      20,    NULL,         NULL,         1),
        ('Oferta Paga 2 Lleva 3',   '3X2ARTESANAL',  'percentage', 33.33, NULL,         NULL,         1),
        ('Descuento verano 2026',   'VERANO2026',     'percentage', 20,    '2026-01-01', '2026-04-30', 1)
    `);
    console.log('✅ Promociones iniciales creadas');
  }

  console.log('🎉 Seed completado');
  await pool.end();
}

seed().catch(err => {
  console.error('❌ Error en seed:', err);
  process.exit(1);
});
