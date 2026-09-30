import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { AppointmentsService } from './appointments.service';

class BookDto {
  @IsString() serviceId!: string;
  @IsString() startsAt!: string;
  @IsOptional() @IsString() viewerZone?: string;
  @IsOptional() @IsString() notes?: string;
}

class PayDto {
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsInt() amountMinor?: number;
  @IsOptional() @IsInt() commissionMinor?: number;
  @IsOptional() @IsInt() businessMinor?: number;
}

class ReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() body?: string;
}

@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Public() @Get('services/:id/slots')
  slots(@Param('id') id: string, @Query('date') date: string, @Query('zone') zone?: string) {
    return this.appointments.slots(id, date, zone);
  }

  @Post('appointments')
  book(@CurrentUser() user: AuthUser, @Body() body: BookDto) {
    return this.appointments.book(user, body);
  }

  @Get('appointments')
  list(@CurrentUser() user: AuthUser) {
    return this.appointments.listMine(user);
  }

  @Post('appointments/:id/pay')
  pay(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: PayDto) {
    return this.appointments.pay(user, id, body.idempotencyKey, body as unknown as Record<string, unknown>);
  }

  @Post('appointments/:id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointments.complete(user, id);
  }

  @Post('appointments/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointments.cancel(user, id);
  }

  @Post('appointments/:id/reschedule')
  reschedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { startsAt: string }) {
    return this.appointments.reschedule(user, id, body.startsAt);
  }

  @Post('appointments/:id/review')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: ReviewDto) {
    return this.appointments.review(user, id, body.rating, body.body);
  }
}
