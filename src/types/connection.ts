export type ConnectionStatus = 'not-connected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  message: string | null;
  checkedAt: number | null;
}
