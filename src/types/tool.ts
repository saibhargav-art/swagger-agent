export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface ToolParameter {
  name: string;
  type: ParameterType;
  description?: string;
  required: boolean;
  enum?: string[];
}

export interface ToolSchema {
  parameters: ToolParameter[];
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  requiredRoles: string[];
  requiredScopes: string[];
  schema: ToolSchema;
}

export type ActivityStatus = 'pending' | 'executing' | 'success' | 'error';

export interface ToolActivity {
  id: string;
  toolName: string;
  status: ActivityStatus;
  timestamp: number;
  duration?: number;
  result?: unknown;
  error?: string;
}
