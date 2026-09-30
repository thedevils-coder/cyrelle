import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async send(to: string, template: string, subject: string, body: string): Promise<void> {
    const delivery = await this.prisma.emailDelivery.create({
      data: { to, template, subject, body, status: 'QUEUED' },
    });
    const smtp = this.config.get<string>('SMTP_URL');
    if (!smtp) {
      this.logger.log(`Email ${template} to ${to}: ${subject}`);
      await this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: 'LOGGED' } });
      return;
    }
    try {
      const transport = nodemailer.createTransport(smtp);
      await transport.sendMail({
        from: this.config.get<string>('EMAIL_FROM') || 'Cyrelle <no-reply@cyrelle.app>',
        to,
        subject,
        text: body,
      });
      await this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: 'SENT' } });
    } catch (error) {
      this.logger.error(`Email failed for ${to}`, error instanceof Error ? error.stack : String(error));
      await this.prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED' } });
    }
  }
}
