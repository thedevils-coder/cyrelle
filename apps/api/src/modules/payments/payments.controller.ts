import { Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('webhooks/:provider')
  async webhook(@Param('provider') provider: string, @Headers() headers: Record<string, string>, @Req() request: { rawBody?: Buffer; body: unknown }) {
    const raw = request.rawBody?.toString('utf8') || JSON.stringify(request.body ?? {});
    const event = this.payments.provider().verifyWebhook(headers, raw);
    if (!event || this.payments.provider().code !== provider) {
      throw new AppError(400, 'WEBHOOK_INVALID', 'The payment notification could not be verified');
    }
    if (event.metadata?.appointmentId && (event.status === 'succeeded' || event.type?.includes('captured'))) {
      await this.prisma.appointmentPayment.updateMany({
        where: { appointmentId: event.metadata.appointmentId },
        data: { paymentStatus: 'SUCCEEDED', providerRef: event.providerRef },
      });
      await this.prisma.appointment.updateMany({ where: { id: event.metadata.appointmentId, status: 'PENDING_PAYMENT' }, data: { status: 'CONFIRMED' } });
    }
    return { received: true };
  }
}
