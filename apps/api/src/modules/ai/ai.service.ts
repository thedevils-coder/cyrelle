import { Injectable } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { translate } from '@cyrelle/shared';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

const BASIC_TONES = ['professional', 'friendly', 'casual', 'inspirational'];
const PREMIUM_TONES = ['funny', 'romantic', 'motivational', 'promotional'];

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async caption(user: AuthUser, input: { topic?: string; description?: string; tone?: string; length?: string; language?: string; business?: string; action?: string }) {
    const personal = await this.entitlements.personal(user.id);
    const tone = (input.tone || 'friendly').toLowerCase();
    const length = (input.length || 'medium').toLowerCase();
    const advanced = personal.entitlements.includes('AI_ADVANCED');
    if (PREMIUM_TONES.includes(tone) && !advanced) throw new AppError(403, 'ENTITLEMENT_REQUIRED', 'That tone is part of enhanced Premium AI');
    if (!BASIC_TONES.includes(tone) && !PREMIUM_TONES.includes(tone)) throw new AppError(400, 'TONE_INVALID', 'Choose a supported tone');
    if (length === 'long' && !advanced) throw new AppError(403, 'ENTITLEMENT_REQUIRED', 'Long captions are part of enhanced Premium AI');
    await this.consumeQuota(user.id, advanced);
    const language = (input.language || user.settings?.language || 'en').split('-')[0];
    const text = await this.generate(input, tone, length, language);
    return { caption: text, hashtags: this.hashtags(input.topic || input.business || 'cyrelle', language), emojis: tone === 'professional' ? [] : ['✨', '💫'], language, provider: process.env.AI_PROVIDER || 'cyrelle-local' };
  }

  async favorite(user: AuthUser, caption: string, language: string) {
    return this.prisma.aiFavorite.create({ data: { userId: user.id, caption, language } });
  }

  favorites(user: AuthUser) {
    return this.prisma.aiFavorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  private async consumeQuota(userId: string, advanced: boolean) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const used = await this.prisma.aiUsage.count({ where: { userId, createdAt: { gte: since } } });
    const limit = advanced ? 200 : 20;
    if (used >= limit) throw new AppError(429, 'AI_QUOTA', 'You have reached today’s AI limit');
    await this.prisma.aiUsage.create({ data: { userId, tool: 'caption' } });
  }

  private async generate(input: { topic?: string; description?: string; business?: string; action?: string }, tone: string, length: string, language: string) {
    const external = process.env.AI_API_KEY && process.env.AI_BASE_URL;
    const subject = input.description || input.topic || input.business || 'a moment worth sharing';
    if (external) {
      const response = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: `Write a ${length} ${tone} social caption in ${language} about ${subject}. ${input.action || 'generate'}. No hashtags.` }],
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = payload.choices?.[0]?.message?.content;
        if (content) return content.trim();
      }
    }
    const opener = localOpeners[language] || localOpeners.en;
    const toneLine = opener[tone] || opener.friendly;
    const detail = input.business ? `${input.business}: ${subject}` : subject;
    if (length === 'short') return `${toneLine} ${detail}.`;
    if (length === 'long') return `${toneLine} ${detail}. ${opener.more}`;
    return `${toneLine} ${detail}. ${opener.more.split('.')[0]}.`;
  }

  private hashtags(topic: string, language: string) {
    const base = topic.toLowerCase().replace(/[^a-z0-9]+/gi, '').slice(0, 24) || 'cyrelle';
    return [`#${base}`, '#cyrelle', `#${language}`];
  }
}

const localOpeners: Record<string, Record<string, string>> = {
  en: { friendly: 'Here is something I wanted to share.', professional: 'A note worth your time.', casual: 'Okay, this one.', inspirational: 'Keep going.', funny: 'Plot twist:', romantic: 'Soft light, full heart.', motivational: 'Start before you feel ready.', promotional: 'Now booking.', more: 'Come closer, stay a while, and make it yours.' },
  es: { friendly: 'Quería compartir esto.', professional: 'Una nota que vale tu tiempo.', casual: 'Miren esto.', inspirational: 'Sigue.', more: 'Acércate y hazlo tuyo.' },
  fr: { friendly: 'Je voulais partager ceci.', professional: 'Une note qui mérite votre temps.', casual: 'Regardez ça.', inspirational: 'Continuez.', more: 'Approchez et faites-le vôtre.' },
  pt: { friendly: 'Eu queria compartilhar isto.', professional: 'Uma nota que vale o seu tempo.', casual: 'Olha isso.', inspirational: 'Continue.', more: 'Chegue mais perto e faça seu.' },
  de: { friendly: 'Das wollte ich teilen.', professional: 'Eine Notiz, die sich lohnt.', casual: 'Schaut mal.', inspirational: 'Weiter so.', more: 'Komm näher und mach es zu deinem.' },
  hi: { friendly: 'मैं यह साझा करना चाहती थी।', professional: 'आपके समय के लायक एक बात।', casual: 'यह देखिए।', inspirational: 'आगे बढ़ती रहिए।', more: 'पास आइए और इसे अपना बनाइए।' },
  ar: { friendly: 'أردت مشاركة هذا.', professional: 'ملاحظة تستحق وقتك.', casual: 'انظري إلى هذا.', inspirational: 'واصلي.', more: 'اقتربي واجعليه لك.' },
};

export const aiThrottle = Throttle({ default: { limit: 30, ttl: 60000 } });
void translate;
