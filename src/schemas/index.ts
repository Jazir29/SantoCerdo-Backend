import { z } from 'zod';

const positiveInt  = z.coerce.number().int().positive();
const nonNegInt    = z.coerce.number().int().min(0);
const positiveNum  = z.coerce.number().positive();
const nonNegNum    = z.coerce.number().min(0);
const optStr       = z.string().max(500).optional().nullable();

// ── Productos ────────────────────────────────────────────────
export const productSchema = z.object({
  name:         z.string().min(1).max(255),
  description:  z.string().max(1000).optional().nullable(),
  price:        positiveNum,
  cost:         nonNegNum,
  stock:        nonNegInt.optional().default(0),
  weight_grams: positiveInt.optional().nullable(),
  category:     z.string().max(100).optional().nullable(),
  image_url:    z.string().url().max(500).optional().nullable().or(z.literal('')),
});

const batchDetailItem = z.object({
  name:   z.string().min(1).max(255),
  amount: nonNegNum,
});

export const newProductWithBatchSchema = z.object({
  name:               z.string().min(1).max(255),
  category:           z.string().max(100).optional().nullable(),
  batch_yield_grams:  positiveInt,
  unit_weight_grams:  positiveInt,
  price_per_unit:     positiveNum,
  ingredients_detail: z.array(batchDetailItem).min(1),
  operations_detail:  z.array(batchDetailItem).default([]),
  notes:              z.string().max(1000).optional().nullable(),
});

export const addBatchSchema = z.object({
  batch_yield_grams:  positiveInt,
  unit_weight_grams:  positiveInt,
  price_per_unit:     positiveNum,
  ingredients_detail: z.array(batchDetailItem).min(1),
  operations_detail:  z.array(batchDetailItem).default([]),
  notes:              z.string().max(1000).optional().nullable(),
});

// ── Clientes ─────────────────────────────────────────────────
export const customerSchema = z.object({
  type:        z.enum(['natural', 'empresa']).default('natural'),
  document_id: z.string().max(20).optional().nullable(),
  name:        z.string().min(1).max(200),
  last_name:   z.string().max(200).optional().nullable(),
  trade_name:  z.string().max(200).optional().nullable(),
  email:       z.string().email().max(255).optional().nullable().or(z.literal('')),
  phone:       z.string().max(30).optional().nullable(),
});

export const addressSchema = z.object({
  name:       z.string().max(200).optional().nullable(),
  address:    z.string().min(1).max(500),
  reference:  optStr,
  department: z.string().max(100).optional().nullable(),
  province:   z.string().max(100).optional().nullable(),
  district:   z.string().max(100).optional().nullable(),
});

// ── Órdenes ──────────────────────────────────────────────────
const orderItemSchema = z.object({
  product_id: positiveInt,
  quantity:   positiveInt,
});

export const orderSchema = z.object({
  customer_id:          positiveInt,
  items:                z.array(orderItemSchema).min(1),
  promotion_id:         positiveInt.optional().nullable(),
  delivery_address:     z.string().max(500).optional().nullable(),
  delivery_department:  z.string().max(100).optional().nullable(),
  delivery_province:    z.string().max(100).optional().nullable(),
  delivery_district:    z.string().max(100).optional().nullable(),
  delivery_reference:   z.string().max(500).optional().nullable(),
  new_address_to_save:  z.any().optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(['pending', 'shipped', 'completed', 'cancelled']),
});

export const orderPaymentSchema = z.object({
  payment_status: z.enum(['unpaid', 'partial', 'paid']),
  payment_method: z.enum(['cash', 'transfer', 'yape', 'plin', 'other']).optional().nullable(),
});

// ── Promociones ───────────────────────────────────────────────
export const promotionSchema = z.object({
  name:       z.string().min(1).max(255),
  code:       z.string().min(1).max(100),
  type:       z.enum(['percentage', 'fixed']),
  value:      positiveNum,
  start_date: z.string().datetime({ offset: true }).optional().nullable().or(z.literal('')),
  end_date:   z.string().datetime({ offset: true }).optional().nullable().or(z.literal('')),
  active:     z.union([z.boolean(), z.number().int().min(0).max(1)]).optional().default(1),
});

// ── Usuarios ──────────────────────────────────────────────────
export const createUserSchema = z.object({
  username:   z.string().min(3).max(100),
  password:   z.string().min(6).max(255),
  first_name: z.string().min(1).max(100),
  last_name:  z.string().min(1).max(100),
  role:       z.enum(['admin', 'user']),
});

export const updateUserSchema = z.object({
  username:   z.string().min(3).max(100),
  first_name: z.string().min(1).max(100),
  last_name:  z.string().min(1).max(100),
  role:       z.enum(['admin', 'user']),
  password:   z.string().min(6).max(255).optional(),
});

export const updateProfileSchema = z.object({
  username:        z.string().min(3).max(100).optional(),
  first_name:      z.string().min(1).max(100).optional(),
  last_name:       z.string().min(1).max(100).optional(),
  currentPassword: z.string().optional(),
  newPassword:     z.string().min(6).max(255).optional(),
});
