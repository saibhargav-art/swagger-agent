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

export type ToolIntent = 'create' | 'read' | 'list' | 'search' | 'get' | 'update' | 'delete' | 'approve' | 'write';

export interface ToolMetadata {
  intent?: ToolIntent;
  filterable?: string[];
  searchable?: string[];
  recordIdField?: string;
  displayField?: string;
  resolveIdWith?: string;
  requiresConfirmation?: boolean;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  requiredRoles: string[];
  requiredScopes: string[];
  schema: ToolSchema;
  metadata?: ToolMetadata;
}
