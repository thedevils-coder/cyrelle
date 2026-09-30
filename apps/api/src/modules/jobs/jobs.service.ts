import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue?: Queue;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (!url || config.get<string>('ENABLE_QUEUES') === 'false') return;
    this.queue = new Queue('cyrelle', { connection: { url } });
  }

  async enqueue(name: string, data: Record<string, unknown>, delayMs = 0): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.add(name, data, { delay: delayMs, removeOnComplete: 200, removeOnFail: 200 });
    } catch (error) {
      this.logger.warn(`Queue ${name} failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
