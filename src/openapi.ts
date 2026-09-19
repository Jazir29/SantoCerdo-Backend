const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Santo Cerdo ERP — API',
    version: '1.0.0',
    description:
      'API interna del ERP de Santo Cerdo. Todos los endpoints (excepto `/login` y `/health`) requieren autenticación mediante cookie `token` (httpOnly JWT).',
  },
  servers: [{ url: '/api', description: 'API' }],

  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'token',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id:               { type: 'integer' },
          username:         { type: 'string', example: 'jgarcia' },
          first_name:       { type: 'string', example: 'Juan' },
          last_name:        { type: 'string', example: 'García' },
          second_last_name: { type: 'string', nullable: true },
          role:             { type: 'string', enum: ['admin', 'vendedor', 'produccion'] },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id:           { type: 'integer' },
          name:         { type: 'string', example: 'Manteca de Cerdo Premium' },
          description:  { type: 'string' },
          price:        { type: 'number', example: 25.5 },
          cost:         { type: 'number', example: 14.0 },
          stock:        { type: 'integer', example: 80 },
          category:     { type: 'string', example: 'manteca' },
          weight_grams: { type: 'integer', nullable: true, example: 500 },
          image_url:    { type: 'string', nullable: true },
        },
      },
      Customer: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          type:        { type: 'string', enum: ['natural', 'empresa'] },
          document_id: { type: 'string', example: '20512345678' },
          name:        { type: 'string', example: 'Panadería El Sol' },
          last_name:   { type: 'string', nullable: true },
          trade_name:  { type: 'string', nullable: true },
          email:       { type: 'string', nullable: true },
          phone:       { type: 'string', nullable: true },
        },
      },
      CustomerAddress: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          customer_id: { type: 'integer' },
          name:        { type: 'string', example: 'Local Principal' },
          address:     { type: 'string', example: 'Av. Los Alisos 123' },
          reference:   { type: 'string', nullable: true },
          department:  { type: 'string', example: 'Lima' },
          province:    { type: 'string', example: 'Lima' },
          district:    { type: 'string', example: 'Los Olivos' },
          is_favorite: { type: 'integer', enum: [0, 1] },
        },
      },
      OrderItem: {
        type: 'object',
        properties: {
          product_id:   { type: 'integer' },
          quantity:     { type: 'integer', example: 3 },
          price:        { type: 'number', example: 25.5 },
          product_name: { type: 'string' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id:                  { type: 'integer' },
          customer_id:         { type: 'integer' },
          total_amount:        { type: 'number', example: 76.5 },
          discount_amount:     { type: 'number', example: 0 },
          status:              { type: 'string', enum: ['pending', 'shipped', 'completed', 'cancelled'] },
          payment_status:      { type: 'string', enum: ['unpaid', 'partial', 'paid'] },
          payment_method:      { type: 'string', enum: ['cash', 'transfer', 'yape', 'plin', 'other'], nullable: true },
          paid_at:             { type: 'string', format: 'date-time', nullable: true },
          delivery_address:    { type: 'string' },
          delivery_department: { type: 'string' },
          delivery_province:   { type: 'string' },
          delivery_district:   { type: 'string' },
          delivery_reference:  { type: 'string', nullable: true },
          promotion_id:        { type: 'integer', nullable: true },
          created_at:          { type: 'string', format: 'date-time' },
          items:               { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
        },
      },
      Promotion: {
        type: 'object',
        properties: {
          id:           { type: 'integer' },
          name:         { type: 'string', example: 'Descuento Verano' },
          code:         { type: 'string', example: 'VERANO25' },
          type:         { type: 'string', enum: ['percentage', 'fixed'] },
          value:        { type: 'number', example: 15 },
          active:       { type: 'integer', enum: [0, 1] },
          start_date:   { type: 'string', format: 'date', nullable: true },
          end_date:     { type: 'string', format: 'date', nullable: true },
          max_uses:     { type: 'integer', nullable: true },
          current_uses: { type: 'integer' },
        },
      },
      Batch: {
        type: 'object',
        properties: {
          id:                    { type: 'integer' },
          product_id:            { type: 'integer' },
          product_name:          { type: 'string' },
          batch_yield_grams:     { type: 'integer' },
          unit_weight_grams:     { type: 'integer' },
          units_produced:        { type: 'integer' },
          total_batch_cost:      { type: 'number' },
          cost_per_unit:         { type: 'number' },
          price_per_unit:        { type: 'number' },
          margin_percent:        { type: 'number' },
          notes:                 { type: 'string', nullable: true },
          created_at:            { type: 'string', format: 'date-time' },
          ingredients_detail:    { type: 'array', items: { type: 'object' } },
          operations_detail:     { type: 'array', items: { type: 'object' } },
        },
      },
      StockMovement: {
        type: 'object',
        properties: {
          id:          { type: 'integer' },
          product_id:  { type: 'integer' },
          product_name:{ type: 'string' },
          type:        { type: 'string', enum: ['in', 'out', 'adjustment'] },
          quantity:    { type: 'integer' },
          reason:      { type: 'string' },
          created_at:  { type: 'string', format: 'date-time' },
          created_by:  { type: 'string' },
        },
      },
      Paginated: {
        type: 'object',
        properties: {
          data:       { type: 'array', items: {} },
          total:      { type: 'integer' },
          totalPages: { type: 'integer' },
          page:       { type: 'integer' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
      },
    },
  },

  security: [{ cookieAuth: [] }],

  paths: {
    // ── Auth ──────────────────────────────────────────────────────
    '/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', example: 'admin' },
                  password: { type: 'string', example: '••••••••' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login exitoso — establece cookie `token`',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          401: { description: 'Credenciales inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          429: { description: 'Rate limit excedido (10 intentos / 15 min)' },
        },
      },
    },
    '/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Cerrar sesión',
        responses: {
          200: { description: 'Cookie eliminada' },
        },
      },
    },

    // ── Users ─────────────────────────────────────────────────────
    '/users': {
      get: {
        tags: ['Usuarios'],
        summary: 'Listar todos los usuarios',
        description: 'Requiere rol **admin**.',
        responses: {
          200: {
            description: 'Lista de usuarios',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Usuarios'],
        summary: 'Crear usuario',
        description: 'Requiere rol **admin**.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password', 'first_name', 'last_name', 'role'],
                properties: {
                  username:         { type: 'string' },
                  password:         { type: 'string' },
                  first_name:       { type: 'string' },
                  last_name:        { type: 'string' },
                  second_last_name: { type: 'string' },
                  role:             { type: 'string', enum: ['admin', 'vendedor', 'produccion'] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Usuario creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          400: { description: 'Datos inválidos o username duplicado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/users/{id}': {
      put: {
        tags: ['Usuarios'],
        summary: 'Actualizar usuario',
        description: 'Requiere rol **admin**.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username:         { type: 'string' },
                  password:         { type: 'string' },
                  first_name:       { type: 'string' },
                  last_name:        { type: 'string' },
                  second_last_name: { type: 'string' },
                  role:             { type: 'string', enum: ['admin', 'vendedor', 'produccion'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Usuario actualizado' },
          404: { description: 'Usuario no encontrado' },
        },
      },
      delete: {
        tags: ['Usuarios'],
        summary: 'Eliminar usuario (soft delete)',
        description: 'Requiere rol **admin**. No se puede eliminar el propio usuario.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Usuario eliminado' },
          404: { description: 'Usuario no encontrado' },
        },
      },
    },
    '/users/{id}/profile': {
      put: {
        tags: ['Usuarios'],
        summary: 'Actualizar perfil propio',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username:         { type: 'string' },
                  first_name:       { type: 'string' },
                  last_name:        { type: 'string' },
                  second_last_name: { type: 'string' },
                  currentPassword:  { type: 'string' },
                  newPassword:      { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Perfil actualizado' },
          400: { description: 'Contraseña actual incorrecta' },
        },
      },
    },

    // ── Products ──────────────────────────────────────────────────
    '/products': {
      get: {
        tags: ['Productos'],
        summary: 'Listar productos',
        parameters: [
          { name: 'page',     in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',    in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search',   in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Lista paginada de productos',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Paginated' },
                    { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Productos'],
        summary: 'Crear producto',
        description: 'Requiere rol **admin**.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'price', 'cost', 'stock', 'category'],
                properties: {
                  name:         { type: 'string' },
                  description:  { type: 'string' },
                  price:        { type: 'number' },
                  cost:         { type: 'number' },
                  stock:        { type: 'integer' },
                  category:     { type: 'string' },
                  weight_grams: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Producto creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Product' } } } },
        },
      },
    },
    '/products/{id}': {
      put: {
        tags: ['Productos'],
        summary: 'Actualizar producto',
        description: 'Requiere rol **admin**.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Product' },
            },
          },
        },
        responses: {
          200: { description: 'Producto actualizado' },
          404: { description: 'Producto no encontrado' },
        },
      },
      delete: {
        tags: ['Productos'],
        summary: 'Eliminar producto (soft delete)',
        description: 'Requiere rol **admin**.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Producto eliminado' },
        },
      },
    },
    '/products/{id}/batches': {
      get: {
        tags: ['Productos'],
        summary: 'Historial de lotes del producto',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Lista de lotes', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Batch' } } } } },
        },
      },
      post: {
        tags: ['Productos'],
        summary: 'Registrar nuevo lote de producción para producto existente',
        description: 'Requiere rol **admin**.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  batch_yield_grams:      { type: 'integer' },
                  unit_weight_grams:      { type: 'integer' },
                  total_ingredients_cost: { type: 'number' },
                  total_operations_cost:  { type: 'number' },
                  notes:                  { type: 'string' },
                  ingredients_detail:     { type: 'array', items: { type: 'object' } },
                  operations_detail:      { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Lote registrado y stock actualizado' },
        },
      },
    },
    '/products/batches/new-product': {
      post: {
        tags: ['Productos'],
        summary: 'Crear producto nuevo con primer lote de producción',
        description: 'Requiere rol **admin**.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name:                   { type: 'string' },
                  description:            { type: 'string' },
                  category:               { type: 'string' },
                  batch_yield_grams:      { type: 'integer' },
                  unit_weight_grams:      { type: 'integer' },
                  total_ingredients_cost: { type: 'number' },
                  total_operations_cost:  { type: 'number' },
                  price_per_unit:         { type: 'number' },
                  notes:                  { type: 'string' },
                  ingredients_detail:     { type: 'array', items: { type: 'object' } },
                  operations_detail:      { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Producto y lote creados' },
        },
      },
    },

    // ── Customers ─────────────────────────────────────────────────
    '/customers': {
      get: {
        tags: ['Clientes'],
        summary: 'Listar clientes',
        parameters: [
          { name: 'page',       in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',      in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search',     in: 'query', schema: { type: 'string' } },
          { name: 'type',       in: 'query', schema: { type: 'string', enum: ['natural', 'empresa'] } },
          { name: 'department', in: 'query', schema: { type: 'string' } },
          { name: 'province',   in: 'query', schema: { type: 'string' } },
          { name: 'district',   in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Lista paginada de clientes',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Paginated' },
                    { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Customer' } } } },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Clientes'],
        summary: 'Crear cliente',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['type', 'name', 'document_id'],
                properties: {
                  type:        { type: 'string', enum: ['natural', 'empresa'] },
                  document_id: { type: 'string' },
                  name:        { type: 'string' },
                  last_name:   { type: 'string' },
                  trade_name:  { type: 'string' },
                  email:       { type: 'string', format: 'email' },
                  phone:       { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Cliente creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
        },
      },
    },
    '/customers/{id}': {
      put: {
        tags: ['Clientes'],
        summary: 'Actualizar cliente',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } },
        },
        responses: { 200: { description: 'Cliente actualizado' } },
      },
      delete: {
        tags: ['Clientes'],
        summary: 'Eliminar cliente (soft delete)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Cliente eliminado' } },
      },
    },
    '/customers/{id}/favorite-address': {
      put: {
        tags: ['Clientes'],
        summary: 'Establecer dirección favorita',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { address_id: { type: 'integer' } } } } },
        },
        responses: { 200: { description: 'Favorita actualizada' } },
      },
    },
    '/customers/{id}/addresses': {
      get: {
        tags: ['Clientes'],
        summary: 'Listar direcciones del cliente',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Lista de direcciones', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/CustomerAddress' } } } } },
        },
      },
      post: {
        tags: ['Clientes'],
        summary: 'Agregar dirección al cliente',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerAddress' } } },
        },
        responses: { 201: { description: 'Dirección creada' } },
      },
    },
    '/customers/{id}/addresses/{addressId}': {
      put: {
        tags: ['Clientes'],
        summary: 'Actualizar dirección',
        parameters: [
          { name: 'id',        in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'addressId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerAddress' } } },
        },
        responses: { 200: { description: 'Dirección actualizada' } },
      },
      delete: {
        tags: ['Clientes'],
        summary: 'Eliminar dirección',
        parameters: [
          { name: 'id',        in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'addressId', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Dirección eliminada' } },
      },
    },

    // ── Orders ────────────────────────────────────────────────────
    '/orders': {
      get: {
        tags: ['Órdenes'],
        summary: 'Listar órdenes',
        parameters: [
          { name: 'page',      in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',     in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search',    in: 'query', schema: { type: 'string' } },
          { name: 'status',    in: 'query', schema: { type: 'string', enum: ['all', 'pending', 'shipped', 'completed', 'cancelled'] } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate',   in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: {
            description: 'Lista paginada de órdenes',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Paginated' },
                    { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Order' } } } },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Órdenes'],
        summary: 'Crear orden',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['customer_id', 'items', 'delivery_address', 'delivery_department', 'delivery_province', 'delivery_district'],
                properties: {
                  customer_id:         { type: 'integer' },
                  items:               { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
                  promotion_id:        { type: 'integer', nullable: true },
                  delivery_address:    { type: 'string' },
                  delivery_department: { type: 'string' },
                  delivery_province:   { type: 'string' },
                  delivery_district:   { type: 'string' },
                  delivery_reference:  { type: 'string' },
                  payment_status:      { type: 'string', enum: ['unpaid', 'partial', 'paid'] },
                  payment_method:      { type: 'string', enum: ['cash', 'transfer', 'yape', 'plin', 'other'] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Orden creada y stock descontado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
          400: { description: 'Stock insuficiente u orden inválida' },
        },
      },
    },
    '/orders/{id}': {
      get: {
        tags: ['Órdenes'],
        summary: 'Obtener orden por ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Detalle de la orden con items', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        },
      },
      put: {
        tags: ['Órdenes'],
        summary: 'Actualizar orden',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
        },
        responses: { 200: { description: 'Orden actualizada' } },
      },
      delete: {
        tags: ['Órdenes'],
        summary: 'Cancelar orden (restaura stock)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Orden cancelada y stock restaurado' } },
      },
    },
    '/orders/{id}/status': {
      put: {
        tags: ['Órdenes'],
        summary: 'Actualizar estado de la orden',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['pending', 'shipped', 'completed', 'cancelled'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Estado actualizado' } },
      },
    },
    '/orders/{id}/payment': {
      put: {
        tags: ['Órdenes'],
        summary: 'Registrar información de pago',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['payment_status'],
                properties: {
                  payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'] },
                  payment_method: { type: 'string', enum: ['cash', 'transfer', 'yape', 'plin', 'other'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Pago registrado' } },
      },
    },

    // ── Promotions ────────────────────────────────────────────────
    '/promotions': {
      get: {
        tags: ['Promociones'],
        summary: 'Listar promociones',
        parameters: [
          { name: 'page',   in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',  in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Lista paginada de promociones',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Paginated' },
                    { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Promotion' } } } },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Promociones'],
        summary: 'Crear promoción',
        description: 'Requiere rol **admin**.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Promotion' } } },
        },
        responses: {
          201: { description: 'Promoción creada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Promotion' } } } },
        },
      },
    },
    '/promotions/validate/{code}': {
      get: {
        tags: ['Promociones'],
        summary: 'Validar código de promoción',
        parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' }, example: 'VERANO25' }],
        responses: {
          200: { description: 'Promoción válida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Promotion' } } } },
          404: { description: 'Código inválido o expirado' },
        },
      },
    },
    '/promotions/{id}': {
      put: {
        tags: ['Promociones'],
        summary: 'Actualizar promoción',
        description: 'Requiere rol **admin**.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Promotion' } } },
        },
        responses: { 200: { description: 'Promoción actualizada' } },
      },
      delete: {
        tags: ['Promociones'],
        summary: 'Eliminar promoción (soft delete)',
        description: 'Requiere rol **admin**.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Promoción eliminada' } },
      },
    },

    // ── Batches ───────────────────────────────────────────────────
    '/batches': {
      get: {
        tags: ['Producción'],
        summary: 'Listar todos los lotes de producción',
        parameters: [
          { name: 'page',       in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',      in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search',     in: 'query', schema: { type: 'string' } },
          { name: 'product_id', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          200: {
            description: 'Lista paginada de lotes',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Paginated' },
                    { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Batch' } } } },
                  ],
                },
              },
            },
          },
        },
      },
    },

    // ── Stock movements ───────────────────────────────────────────
    '/stock-movements': {
      get: {
        tags: ['Inventario'],
        summary: 'Historial de movimientos de stock',
        parameters: [
          { name: 'page',       in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit',      in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'product_id', in: 'query', schema: { type: 'integer' } },
          { name: 'type',       in: 'query', schema: { type: 'string', enum: ['in', 'out', 'adjustment'] } },
          { name: 'startDate',  in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate',    in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: {
            description: 'Lista paginada de movimientos',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Paginated' },
                    { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/StockMovement' } } } },
                  ],
                },
              },
            },
          },
        },
      },
    },

    // ── Stats ─────────────────────────────────────────────────────
    '/stats': {
      get: {
        tags: ['Dashboard'],
        summary: 'Estadísticas del dashboard',
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate',   in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: {
            description: 'Resumen de ventas, stock, clientes y gráficos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    revenue:                 { type: 'number' },
                    discounts:               { type: 'number' },
                    orders:                  { type: 'integer' },
                    customers:               { type: 'integer' },
                    avgOrderValue:           { type: 'number' },
                    lowStock:                { type: 'integer' },
                    topProduct:              { type: 'object' },
                    recentOrders:            { type: 'array', items: { $ref: '#/components/schemas/Order' } },
                    salesData:               { type: 'array', items: { type: 'object' } },
                    salesByCustomerType:     { type: 'array', items: { type: 'object' } },
                    topProductsList:         { type: 'array', items: { type: 'object' } },
                    orderStatusDistribution: { type: 'array', items: { type: 'object' } },
                    revenueVsCost:           { type: 'array', items: { type: 'object' } },
                    topCustomers:            { type: 'array', items: { type: 'object' } },
                    salesByDistrict:         { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Health ────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Sistema'],
        summary: 'Health check',
        security: [],
        responses: {
          200: {
            description: 'Servidor operativo',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status:    { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export default spec;
