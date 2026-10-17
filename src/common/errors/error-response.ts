export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  issues?: unknown;
}

export interface ErrorResponse {
  statusCode: number;
  body: object;
}
