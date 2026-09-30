import { Logger } from '@nestjs/common';
import { signSumsubRequest } from '../sumsub/signature';

export class SumsubRequestError extends Error {
  constructor(
    readonly status: number,
    readonly correlationId: string | null,
  ) {
    super('Sumsub request failed');
    this.name = 'SumsubRequestError';
  }
}

export interface SumsubClientConfig {
  appToken: string;
  secretKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * All Sumsub HTTP calls go through this client.
 * Responses that can contain document numbers are reduced to the fields Cyrelle stores.
 */
export class SumsubClient {
  private readonly logger = new Logger(SumsubClient.name);

  constructor(private readonly config: SumsubClientConfig) {}

  private get fetchImpl(): typeof fetch {
    return this.config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async request(method: string, pathWithQuery: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signSumsubRequest(this.config.secretKey, timestamp, method, pathWithQuery, raw);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}${pathWithQuery}`, {
        method,
        headers: {
          Accept: 'application/json',
          'X-App-Token': this.config.appToken,
          'X-App-Access-Ts': timestamp,
          'X-App-Access-Sig': signature,
          ...(raw ? { 'Content-Type': 'application/json' } : {}),
        },
        body: raw || undefined,
      });
    } catch (error) {
      this.logger.error(`Sumsub network error ${method} ${pathWithQuery.split('?')[0]}`);
      throw error;
    }
    const text = await response.text();
    let json: Record<string, unknown> = {};
    if (text) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>;
      } catch {
        json = {};
      }
    }
    if (!response.ok) {
      const correlationId = typeof json.correlationId === 'string' ? json.correlationId : null;
      if (response.status !== 404) {
        const route = pathWithQuery.split('?')[0].replace(/externalUserId=[^/]+/, 'externalUserId').replace(/applicants\/[^/]+/, 'applicants/:id');
        this.logger.error(`Sumsub ${method} ${route} failed status=${response.status} correlationId=${correlationId ?? 'none'}`);
      }
      throw new SumsubRequestError(response.status, correlationId);
    }
    return { status: response.status, json };
  }

  async createApplicant(levelName: string, input: { externalUserId: string; email?: string | null; countryAlpha3?: string | null }): Promise<{ applicantId: string; inspectionId: string | null }> {
    const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;
    const body: Record<string, unknown> = {
      externalUserId: input.externalUserId,
      type: 'individual',
    };
    if (input.email) body.email = input.email;
    if (input.countryAlpha3) body.fixedInfo = { country: input.countryAlpha3 };
    const { json } = await this.request('POST', path, body);
    return { applicantId: String(json.id), inspectionId: typeof json.inspectionId === 'string' ? json.inspectionId : null };
  }

  async findByExternalUserId(externalUserId: string): Promise<{ applicantId: string; inspectionId: string | null } | null> {
    const path = `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`;
    try {
      const { json } = await this.request('GET', path);
      if (typeof json.id !== 'string') return null;
      return { applicantId: json.id, inspectionId: typeof json.inspectionId === 'string' ? json.inspectionId : null };
    } catch (error) {
      if (error instanceof SumsubRequestError && error.status === 404) return null;
      throw error;
    }
  }

  async createSdkToken(input: { externalUserId: string; email?: string | null; levelName: string; ttlInSecs: number }): Promise<string> {
    const body: Record<string, unknown> = {
      userId: input.externalUserId,
      levelName: input.levelName,
      ttlInSecs: input.ttlInSecs,
    };
    if (input.email) body.applicantIdentifiers = { email: input.email };
    const { json } = await this.request('POST', '/resources/accessTokens/sdk', body);
    if (typeof json.token !== 'string' || !json.token) throw new SumsubRequestError(502, null);
    return json.token;
  }

  async deactivate(applicantId: string): Promise<void> {
    await this.request('PATCH', `/resources/applicants/${encodeURIComponent(applicantId)}/presence/deactivated`);
  }
}
