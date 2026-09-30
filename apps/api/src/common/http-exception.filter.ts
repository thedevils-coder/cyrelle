import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { errorBody } from './app-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const prismaCode = (exception as { code?: string })?.code;
    if (prismaCode === 'P2002') {
      response.status(409).json({
        error: { code: 'CONFLICT', message: 'That value is already in use', requestId: request.requestId ?? null },
      });
      return;
    }
    const body = errorBody(exception);
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    response.status(body.status).json({
      error: { code: body.code, message: body.message, requestId: request.requestId ?? null },
    });
  }
}
