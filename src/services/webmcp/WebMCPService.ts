import type { Tool } from '@/types/tool';

const TOOL_CATALOG: Tool[] = [
  {
    id: 'createOrder',
    name: 'createOrder',
    description: 'Create a new customer order.',
    requiredRoles: ['support', 'admin'],
    requiredScopes: ['orders:write'],
    schema: {
      parameters: [
        { name: 'customer_name', type: 'string', required: true, description: 'Customer or account name' },
        { name: 'amount', type: 'number', required: true, description: 'Order amount in dollars' },
      ],
    },
  },
  {
    id: 'updateOrderStatus',
    name: 'updateOrderStatus',
    description: 'Update an existing order status.',
    requiredRoles: ['support', 'admin'],
    requiredScopes: ['orders:write'],
    schema: {
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Order UUID' },
        { name: 'status', type: 'string', required: true, description: 'New order status' },
      ],
    },
  },
  {
    id: 'searchOrders',
    name: 'searchOrders',
    description: 'Search orders by customer name.',
    requiredRoles: ['viewer', 'support', 'admin'],
    requiredScopes: ['orders:read'],
    schema: {
      parameters: [
        { name: 'query', type: 'string', required: false, description: 'Customer search text' },
      ],
    },
  },
  {
    id: 'deleteOrder',
    name: 'deleteOrder',
    description: 'Delete an order.',
    requiredRoles: ['admin'],
    requiredScopes: ['admin:delete'],
    schema: {
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Order UUID' },
      ],
    },
  },
  {
    id: 'approveRefund',
    name: 'approveRefund',
    description: 'Mark an order refund as approved.',
    requiredRoles: ['admin'],
    requiredScopes: ['admin:refund'],
    schema: {
      parameters: [
        { name: 'id', type: 'string', required: true, description: 'Order UUID' },
      ],
    },
  },
  {
    id: 'updateQuota',
    name: 'updateQuota',
    description: 'Update an application user quota.',
    requiredRoles: ['admin'],
    requiredScopes: ['admin:quota'],
    schema: {
      parameters: [
        { name: 'user_id', type: 'string', required: true, description: 'Application user UUID' },
        { name: 'quota', type: 'number', required: true, description: 'New quota value' },
      ],
    },
  },
];

const TOOL_ENDPOINTS: Record<string, string> = {
  createOrder: '/create-order',
  updateOrderStatus: '/update-order-status',
  searchOrders: '/search-orders',
  deleteOrder: '/delete-order',
  approveRefund: '/approve-refund',
  updateQuota: '/update-quota',
};

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/g, '');
}

function toJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

export class WebMCPService {
  private baseUrl = '';

  constructor(baseUrl = '') {
    this.baseUrl = normalizeUrl(baseUrl);
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = normalizeUrl(baseUrl);
  }

  async getTools(): Promise<Tool[]> {
    if (!this.baseUrl) {
      throw new Error('No WebMCP base URL configured');
    }
    return TOOL_CATALOG;
  }

  async testConnection(): Promise<{ toolCount: number }> {
    if (!this.baseUrl) {
      throw new Error('No WebMCP base URL configured');
    }

    const response = await fetch(`${this.baseUrl}/search-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`WebMCP connection test failed (${response.status}): ${text}`);
    }

    return { toolCount: TOOL_CATALOG.length };
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.baseUrl) {
      throw new Error('No WebMCP base URL configured');
    }

    const endpoint = TOOL_ENDPOINTS[toolName];
    if (!endpoint) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tool execution failed (${response.status}): ${text}`);
    }

    return toJsonResponse(response);
  }
}

export const webMCPService = new WebMCPService(import.meta.env.VITE_WEBMCP_BASE_URL ?? '');
