import {
  Customer,
  Order,
  Product,
  Promotion,
  DashboardStats,
  CustomerAddress,
} from '../types';

// Apunta al nuevo backend en puerto 4000
const API_BASE = 'http://localhost:4000/api';

// ── Token helpers ─────────────────────────────────────────────
const getToken = (): string | null => localStorage.getItem('token');

const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Wrapper que lanza el error si la respuesta no es ok
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    // Token expirado — limpiar sesión y redirigir al login
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
    throw new Error('Sesión expirada');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Error ${res.status}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────

export const api = {
  // ── Auth ────────────────────────────────────────────────────
  login: async (credentials: { username: string; password: string }) => {
    const data = await apiFetch<{ success: boolean; token: string; user: any }>(
      `${API_BASE}/login`,
      { method: 'POST', body: JSON.stringify(credentials) }
    );
    if (data.token) localStorage.setItem('token', data.token);
    return data;
  },

  // ── Stats ───────────────────────────────────────────────────
  getStats: async (params: {
    range?: string;
    status?: string;
    customerType?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<DashboardStats> => {
    const query = new URLSearchParams(params as any).toString();
    return apiFetch(`${API_BASE}/stats?${query}`);
  },

  // ── Products ────────────────────────────────────────────────
  getProducts: async (
    page = 1,
    limit = 10,
    search = ''
  ): Promise<{ data: Product[]; total: number; totalPages: number }> => {
    const offset = (page - 1) * limit;
    const data = await apiFetch<{ items: Product[]; total: number }>(
      `${API_BASE}/products?limit=${limit}&offset=${offset}&search=${encodeURIComponent(search)}`
    );
    return {
      data: data.items,
      total: data.total,
      totalPages: Math.ceil(data.total / limit),
    };
  },

  getAllProducts: async (): Promise<Product[]> => {
    const data = await apiFetch<{ items: Product[]; total: number }>(
      `${API_BASE}/products?limit=1000`
    );
    return data.items || [];
  },

  createProduct: async (product: Partial<Product>): Promise<Product> =>
    apiFetch(`${API_BASE}/products`, { method: 'POST', body: JSON.stringify(product) }),

  updateProduct: async (id: number, product: Partial<Product>): Promise<void> =>
    apiFetch(`${API_BASE}/products/${id}`, { method: 'PUT', body: JSON.stringify(product) }),

  deleteProduct: async (id: number): Promise<void> =>
    apiFetch(`${API_BASE}/products/${id}`, { method: 'DELETE' }),

  // ── Customers ───────────────────────────────────────────────
  getCustomers: async (params: {
    page?: number;
    limit?: number;
    offset?: number;
    search?: string;
    type?: string;
    department?: string;
    province?: string;
    district?: string;
  }): Promise<{ data: Customer[]; total: number; totalPages: number; page: number }> => {
    const limit  = params.limit || 10;
    const offset =
      params.offset !== undefined
        ? params.offset
        : ((params.page || 1) - 1) * limit;
    const page = params.page || Math.floor(offset / limit) + 1;

    const queryParams: any = { ...params };
    delete queryParams.page;
    queryParams.limit  = limit;
    queryParams.offset = offset;

    const query = new URLSearchParams(queryParams).toString();
    const data  = await apiFetch<{ items: Customer[]; total: number }>(
      `${API_BASE}/customers?${query}`
    );
    return {
      data: data.items,
      total: data.total,
      totalPages: Math.ceil(data.total / limit),
      page,
    };
  },

  getAllCustomers: async (): Promise<Customer[]> => {
    const data = await apiFetch<{ items: Customer[]; total: number }>(
      `${API_BASE}/customers?limit=1000`
    );
    return data.items || [];
  },

  createCustomer: async (customer: Partial<Customer>): Promise<Customer> =>
    apiFetch(`${API_BASE}/customers`, { method: 'POST', body: JSON.stringify(customer) }),

  updateCustomer: async (id: number, customer: Partial<Customer>): Promise<void> =>
    apiFetch(`${API_BASE}/customers/${id}`, { method: 'PUT', body: JSON.stringify(customer) }),

  deleteCustomer: async (id: number): Promise<void> =>
    apiFetch(`${API_BASE}/customers/${id}`, { method: 'DELETE' }),

  getCustomerAddresses: async (customerId: number): Promise<CustomerAddress[]> =>
    apiFetch(`${API_BASE}/customers/${customerId}/addresses`),

  addCustomerAddress: async (
    customerId: number,
    address: Partial<CustomerAddress>
  ): Promise<CustomerAddress> =>
    apiFetch(`${API_BASE}/customers/${customerId}/addresses`, {
      method: 'POST',
      body: JSON.stringify(address),
    }),

  updateCustomerAddress: async (
    customerId: number,
    addressId: number,
    address: Partial<CustomerAddress>
  ): Promise<void> =>
    apiFetch(`${API_BASE}/customers/${customerId}/addresses/${addressId}`, {
      method: 'PUT',
      body: JSON.stringify(address),
    }),

  deleteCustomerAddress: async (customerId: number, addressId: number): Promise<void> =>
    apiFetch(`${API_BASE}/customers/${customerId}/addresses/${addressId}`, {
      method: 'DELETE',
    }),

  setFavoriteAddress: async (customerId: number, addressId: number): Promise<void> =>
    apiFetch(`${API_BASE}/customers/${customerId}/favorite-address`, {
      method: 'PUT',
      body: JSON.stringify({ addressId }),
    }),

  // ── Orders ──────────────────────────────────────────────────
  getOrders: async (params: {
    page?: number;
    limit?: number;
    offset?: number;
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ data: Order[]; total: number; totalPages: number; page: number }> => {
    const limit  = params.limit || 10;
    const offset =
      params.offset !== undefined
        ? params.offset
        : ((params.page || 1) - 1) * limit;
    const page = params.page || Math.floor(offset / limit) + 1;

    const queryParams: any = { ...params };
    delete queryParams.page;
    queryParams.limit  = limit;
    queryParams.offset = offset;

    const query = new URLSearchParams(queryParams).toString();
    const data  = await apiFetch<{ items: Order[]; total: number }>(
      `${API_BASE}/orders?${query}`
    );
    return {
      data: data.items,
      total: data.total,
      totalPages: Math.ceil(data.total / limit),
      page,
    };
  },

  getOrderById: async (id: string): Promise<Order> =>
    apiFetch(`${API_BASE}/orders/${id}`),

  createOrder: async (order: any): Promise<{ success: boolean; orderId: number }> =>
    apiFetch(`${API_BASE}/orders`, { method: 'POST', body: JSON.stringify(order) }),

  updateOrder: async (id: number, order: any): Promise<void> =>
    apiFetch(`${API_BASE}/orders/${id}`, { method: 'PUT', body: JSON.stringify(order) }),

  updateOrderStatus: async (id: number, status: string): Promise<void> =>
    apiFetch(`${API_BASE}/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  cancelOrder: async (id: number): Promise<void> =>
    apiFetch(`${API_BASE}/orders/${id}`, { method: 'DELETE' }),

  // ── Promotions ──────────────────────────────────────────────
  getPromotions: async (
    page = 1,
    limit = 10,
    search = ''
  ): Promise<{ data: Promotion[]; total: number; totalPages: number; page: number }> =>
    apiFetch(
      `${API_BASE}/promotions?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`
    ),

  createPromotion: async (promotion: Partial<Promotion>): Promise<Promotion> =>
    apiFetch(`${API_BASE}/promotions`, { method: 'POST', body: JSON.stringify(promotion) }),

  updatePromotion: async (id: number, promotion: Partial<Promotion>): Promise<void> =>
    apiFetch(`${API_BASE}/promotions/${id}`, { method: 'PUT', body: JSON.stringify(promotion) }),

  deletePromotion: async (id: number): Promise<void> =>
    apiFetch(`${API_BASE}/promotions/${id}`, { method: 'DELETE' }),

  validatePromotion: async (
    code: string
  ): Promise<{ valid: boolean; promotion?: Promotion; message?: string }> =>
    apiFetch(`${API_BASE}/promotions/validate/${code}`),
};
