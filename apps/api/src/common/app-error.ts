import { HttpException } from '@nestjs/common';

export class AppError extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ code, message }, status);
  }
}

export function errorBody(exception: unknown): { status: number; code: string; message: string } {
  if (exception instanceof AppError || exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { status, code: status === 400 ? 'VALIDATION_ERROR' : 'REQUEST_ERROR', message: response };
    }
    const body = response as { code?: string; message?: string | string[]; error?: string };
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message || body.error || 'Request failed';
    return { status, code: body.code || (status === 400 ? 'VALIDATION_ERROR' : 'REQUEST_ERROR'), message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
}
