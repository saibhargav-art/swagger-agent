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
  schema: ToolSchema;
  annotations: {
    readOnly: boolean;
    destructive: boolean;
  };
}
