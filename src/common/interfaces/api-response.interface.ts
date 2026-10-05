export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  code: string;
  message: string | string[];
  statusCode: number;
  path: string;
  requestId: string;
  timestamp: string;
  fields?: Record<string, string[]>;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiError;
}
