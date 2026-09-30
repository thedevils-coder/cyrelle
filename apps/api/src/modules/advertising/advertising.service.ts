import { Injectable } from '@nestjs/common';
import { AdPlacement } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdvertisingService {
  constructor(private readonly prisma: PrismaService) {}

  async serve(placement: AdPlacement, user?: AuthUser) {
    const country = user?.profile?.countryCode;
    const language = user?.settings?.language;
    const ads = await this.prisma.advertisement.findMany({
      where: {
        placement,
        status: 'ACTIVE',
        campaign: {
          status: 'ACTIVE',
          OR: [{ startAt: null }, { startAt: { lte: new Date() } }],
          AND: [{ OR: [{ endAt: null }, { endAt: { gte: new Date() } }] }],
        },
      },
      include: { campaign: true },
      take: 20,
    });
    const matched = ads.filter((ad) => {
      const countries = ad.campaign.countries;
      const languages = ad.campaign.languages;
      if (countries.length && country && !countries.includes(country)) return false;
      if (languages.length && language && !languages.includes(language)) return false;
      return true;
    });
    return matched.slice(0, 3).map((ad) => ({
      id: ad.id,
      label: ad.label,
      title: ad.title,
      body: ad.body,
      mediaUrl: ad.mediaUrl,
      destination: ad.destination,
      sponsored: true,
    }));
  }

  async impression(adId: string, user?: AuthUser) {
    await this.event(adId, 'IMPRESSION', user);
    return { recorded: true };
  }

  async click(adId: string, user?: AuthUser) {
    await this.event(adId, 'CLICK', user);
    const ad = await this.prisma.advertisement.findUnique({ where: { id: adId } });
    return { recorded: true, destination: ad?.destination };
  }

  async createCampaign(user: AuthUser, input: { name: string; budgetMinor: number; currency: string; businessId?: string; countries?: string[]; languages?: string[] }) {
    const advertiser = await this.prisma.advertiser.create({
      data: { name: input.name, ownerId: user.id, businessId: input.businessId, countryCode: user.profile?.countryCode },
    });
    return this.prisma.adCampaign.create({
      data: {
        advertiserId: advertiser.id,
        name: input.name,
        status: 'PENDING_REVIEW',
        budgetMinor: input.budgetMinor,
        currency: input.currency.toUpperCase(),
        countries: input.countries ?? [],
        languages: input.languages ?? [],
      },
    });
  }

  async addCreative(user: AuthUser, campaignId: string, input: { placement: AdPlacement; label: 'SPONSORED' | 'ADVERTISEMENT' | 'PROMOTED'; title: string; body: string; destination: string; mediaUrl?: string }) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id: campaignId }, include: { advertiser: true } });
    if (!campaign || campaign.advertiser.ownerId !== user.id) throw new AppError(404, 'NOT_FOUND', 'Campaign not found');
    return this.prisma.advertisement.create({
      data: { campaignId, placement: input.placement, label: input.label, title: input.title, body: input.body, destination: input.destination, mediaUrl: input.mediaUrl, status: 'PENDING_REVIEW' },
    });
  }

  private async event(adId: string, type: 'IMPRESSION' | 'CLICK', user?: AuthUser) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: adId }, include: { campaign: true } });
    if (!ad) throw new AppError(404, 'NOT_FOUND', 'Advertisement not found');
    await this.prisma.adEvent.create({ data: { adId, type, userId: user?.id, country: user?.profile?.countryCode } });
    if (type === 'CLICK') {
      await this.prisma.adCampaign.update({ where: { id: ad.campaignId }, data: { spentMinor: { increment: Math.max(1, Math.round(ad.campaign.budgetMinor / 1000)) } } });
    }
    await this.prisma.analyticsEvent.create({ data: { userId: user?.id, name: type === 'CLICK' ? 'ad_click' : 'ad_impression', props: { adId } } });
  }
}
