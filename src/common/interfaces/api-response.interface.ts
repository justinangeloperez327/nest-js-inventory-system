export interface ApiErrorResponse {
  code: string;
  message: string;
  statusCode: number;
  path: string;
  traceId: string;
  timestamp: string;
  errors?: Record<string, string[]>;
  details?: unknown;
}
