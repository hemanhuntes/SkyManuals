import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@skymanuals/prisma';
import * as crypto from 'crypto';
import {
  Addon,
  AddonSearchRequest,
  AddonSearchResponse,
  LicenseCreateRequest,
  LicenseUpdateRequest,
  InstallationRequest,
  InstallationUpdateRequest,
  AddonType,
  LicenseTier,
  InstallStatus,
  HookType,
} from '@skymanuals/types';

@Injectable()
export class AddonService {
  private readonly logger = new Logger(AddonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Search and filter add-ons in the store
   */
  async searchAddons(request: AddonSearchRequest): Promise<AddonSearchResponse> {
    try {
      const whereConditions: any = {
        status: 'PUBLISHED', // Only show published add-ons
      };

      // Text search
      if (request.query) {
        whereConditions.OR = [
          { name: { contains: request.query, mode: 'insensitive' } },
          { description: { contains: request.query, mode: 'insensitive' } },
          { longDescription: { contains: request.query, mode: 'insensitive' } },
          { tags: { has: request.query } },
        ];
      }

      // Filter by type
      if (request.type) {
        whereConditions.type = request.type;
      }

      // Filter by tags
      if (request.tags && request.tags.length > 0) {
        whereConditions.tags = { hasSome: request.tags };
      }

      // Filter by categories
      if (request.categories && request.categories.length > 0) {
          whereConditions.categories = { hasSome: request.categories };
      }

      // Get available filters
      const [addons, totalCount] = await Promise.all([
        this.prisma.addon.findMany({
          where: whereConditions,
          include: {
            pricingTiers: true,
            reviews: { select: { rating: true } },
            _count: { select: { installations: true } },
          },
          orderBy: this.getSortOrder(request.sortBy, request.sortOrder),
          skip: (request.page - 1) * request.pageSize,
          take: request.pageSize,
        }),
        this.prisma.addon.count({ where: whereConditions }),
      ]);

      // Calculate ratings
      const addonsWithRatings = addons.map(addon => ({
        ...addon,
        rating: this.calculateRating(addon.reviews),
        reviewCount: addon.reviews.length,
      }));

      // Get filter data
      const [types, tiers] = await Promise.all([
        this.prisma.addon.groupBy({
          by: ['type'],
          where: { status: 'PUBLISHED' },
        }),
        this.prisma.addonPricingTier.groupBy({
          by: ['tier'],
          where: { addon: { status: 'PUBLISHED' } },
        }),
      ]);

      const tags = await this.getDistinctTags();
      const categories = await this.getDistinctCategories();

      return {
        addons: addonsWithRatings,
        pagination: {
          page: request.page,
          pageSize: request.pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / request.pageSize),
        },
        filters: {
          types: types.map(t => t.type),
          tiers: tiers.map(t => t.tier),
          tags,
          categories,
        },
      };
    } catch (error) {
      this.logger.error('Failed to search add-ons', error);
      throw new BadRequestException('Add-on search failed');
    }
  }

  /**
   * Get add-on details by ID
   */
  async getAddonById(addonId: string): Promise<Addon> {
    const addon = await this.prisma.addon.findUnique({
      where: { id: addonId, status: 'PUBLISHED' },
      include: {
        pricingTiers: true,
        reviews: {
          include: {
            user: { select: { name: true, email: true } },
          },
          where: { isPublished: true },
        },
      },
    });

    if (!addon) {
      throw new NotFoundException('Add-on not found');
    }

    return {
      ...addon,
      rating: this.calculateRating(addon.reviews),
      reviewCount: addon.reviews.length,
    };
  }

  /**
   * Create a license for an add-on
   */
  async createLicense(request: LicenseCreateRequest): Promise<any> {
    try {
      // Verify add-on exists
      const addon = await this.prisma.addon.findUnique({
        where: { id: request.addonId },
        include: { pricingTiers: true },
      });

      if (!addon) {
        throw new NotFoundException('Add-on not found');
      }

      // Check if organization already has a license for this add-on
      const existingLicense = await this.prisma.license.findUnique({
        where: {
          addonId_organizationId: {
            addonId: request.addonId,
            organizationId: request.organizationId,
          },
        },
      });

      if (existingLicense) {
        throw new BadRequestException('Organization already has a license for this add-on');
      }

      // Get pricing tier details
      const pricingTier = addon.pricingTiers.find(pt => pt.tier === request.tier);
      if (!pricingTier) {
        throw new BadRequestException('Invalid pricing tier');
      }

      // Calculate end date
      const startDate = new Date();
      let endDate: Date | null = null;

      if (request.billingPeriod !== 'ONE_TIME') {
        const months = request.billingPeriod === 'YEARLY' ? 12 : 1;
        endDate = new Date(startDate.getTime() + months * 30 * 24 * 60 * 60 * 1000);
      }

      // Handle trial period
      if (request.trialDays && request.trialDays > 0) {
        endDate = new Date(startDate.getTime() + request.trialDays * 24 * 60 * 60 * 1000);
      }

      // Generate license key
      const licenseKey = this.generateLicenseKey(addon.id, request.organizationId);

      // Create license
      const license = await this.prisma.license.create({
        data: {
          addonId: request.addonId,
          organizationId: request.organizationId,
          tier: request.tier,
          seatsPurchased: request.seatsPurchased,
          startDate,
          endDate,
          isActive: true,
          autoRenew: request.autoRenew,
          isTrial: !!request.trialDays,
          trialEndsAt: request.trialDays ? endDate : null,
          price: pricingTier.price,
          currency: pricingTier.currency,
          billingPeriod: request.billingPeriod,
          nextBillingDate: endDate,
          purchaseNotes: request.purchaseNotes,
          licenseKey: licenseKey,
          createdBy: request.createdBy,
        },
      });

      // Update add-on download count
      await this.prisma.addon.update({
        where: { id: request.addonId },
        data: { downloadCount: { increment: 1 } },
      });

      this.logger.log(`License created for add-on ${request.addonId} in organization ${request.organizationId}`);

      return license;
    } catch (error) {
      this.logger.error('Failed to create license', error);
      throw error;
    }
  }

  /**
   * Install an add-on for an organization
   */
  async installAddon(request: InstallationRequest): Promise<any> {
    try {
      // Check if add-on exists
      const addon = await this.prisma.addon.findUnique({
        where: { id: request.addonId },
      });

      if (!addon) {
        throw new NotFoundException('Add-on not found');
      }

      // Verify license if provided
      if (request.licenseId) {
        const license = await this.prisma.license.findUnique({
          where: { id: request.licenseId },
        });

        if (!license || !license.isActive) {
          throw new BadRequestException('License not found or inactive');
        }

        // Check organization match
        if (license.organizationId !== request.organizationId) {
          throw new BadRequestException('License does not belong to this organization');
        }
      }

      // Check for existing installation
      const existingInstallation = await this.prisma.installation.findUnique({
        where: {
          addonId_organizationId: {
            addonId: request.addonId,
            organizationId: request.organizationId,
          },
        },
      });

      if (existingInstallation) {
        throw new BadRequestException('Add-on is already installed');
      }

      // Create installation
      const installation = await this.prisma.installation.create({
        data: {
          addonId: request.addonId,
          organizationId: request.organizationId,
          licenseId: request.licenseId,
          status: 'INSTALLED',
          settings: request.settings,
          enabledHooks: addon.hooks || [],
          webhookUrl: request.webhookUrl,
          installedVersion: addon.version,
          installedAt: new Date(),
        },
      });

      // Activate installation
      await this.activateInstallation(installation.id);

      this.logger.log(`Add-on ${request.addonId} installed for organization ${request.organizationId}`);

      return installation;
    } catch (error) {
      this.logger.error('Failed to install add-on', error);
      throw error;
    }
  }

  /**
   * Activate an installation
   */
  async activateInstallation(installationId: string): Promise<any> {
    const installation = await this.prisma.installation.update({
      where: { id: installationId },
      data: { status: 'ACTIVE' },
      include: { addon: true },
    });

    // Create analytics entry for new installation
    await this.createAnalyticsRecord(
      installation.addonId,
      installation.organizationId,
      'MONTHLY',
    );

    return installation;
  }

  /**
   * Update installation settings
   */
  async updateInstallation(
    installationId: string,
    updates: InstallationUpdateRequest,
  ): Promise<any> {
    try {
      const installation = await this.prisma.installation.update({
        where: { id: installationId },
        data: {
          ...updates,
          lastUpdatedAt: new Date(),
        },
        include: { addon: true },
      });

      this.logger.log(`Installation ${installationId} updated`);

      return installation;
    } catch (error) {
      this.logger.error('Failed to update installation', error);
      throw error;
    }
  }

  /**
   * Uninstall an add-on
   */
  async uninstallAddon(installationId: string): Promise<void> {
    try {
      await this.prisma.installation.update({
        where: { id: installationId },
        data: {
          status: 'UNINSTALLED',
          lastUpdatedAt: new Date(),
        },
      });

      this.logger.log(`Add-on uninstalled: ${installationId}`);
    } catch (error) {
      this.logger.error('Failed to uninstall add-on', error);
      throw error;
    }
  }

  /**
   * Get organization's installed add-ons
   */
  async getOrganizationInstallations(organizationId: string): Promise<any[]> {
    return this.prisma.installation.findMany({
      where: { organizationId },
      include: {
        addon: {
          include: {
            pricingTiers: true,
          },
        },
      },
      orderBy: { installedAt: 'desc' },
    });
  }

  /**
   * Get organization's licenses
   */
  async getOrganizationLicenses(organizationId: string): Promise<any[]> {
    return this.prisma.license.findMany({
      where: { organizationId },
      include: {
        addon: {
          include: {
            pricingTiers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Check add-on compatibility
   */
  async checkCompatibility(addonId: string): Promise<any> {
    const addon = await this.prisma.addon.findUnique({
      where: { id: addonId },
      include: {
        dependencies: {
          include: { dependencyAddon: true },
        },
      },
    });

    if (!addon) {
      throw new NotFoundException('Add-on not found');
    }

    return {
      compatible: true, // Simplified for MVP
      version: addon.version,
      dependencies: addon.dependencies,
      requirements: {
        minVersion: addon.minVersion,
        maxVersion: addon.maxVersion,
        permissions: addon.permissions,
      },
    };
  }

  /**
   * Utility methods
   */
  private calculateRating(reviews: any[]): number | undefined {
    if (reviews.length === 0) return undefined;
    
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return Math.round((sum / reviews.length) * 10) / 10; // Round to 1 decimal place
  }

  private getSortOrder(sortBy: string, sortOrder: string): any {
    const orderMap = {
      name: { name: sortOrder },
      downloads: { downloadCount: sortOrder },
      rating: { rating: sortOrder },
      created: { createdAt: sortOrder },
      updated: { updatedAt: sortOrder },
    };

    return orderMap[sortBy] || { name: 'asc' };
  }

  private async getDistinctTags(): Promise<string[]> {
    // Get all unique tags from published add-ons
    const addons = await this.prisma.addon.findMany({
      where: { status: 'PUBLISHED' },
      select: { tags: true },
    });

    const allTags = addons.flatMap(addon => addon.tags);
    return [...new Set(allTags)].sort();
  }

  private async getDistinctCategories(): Promise<string[]> {
    // Get all unique categories from published add-ons
    const addons = await this.prisma.addon.findMany({
      where: { status: 'PUBLISHED' },
      select: { categories: true },
    });

    const allCategories = addons.flatMap(addon => addon.categories);
    return [...new Set(allCategories)].sort();
  }

  private generateLicenseKey(addonId: string, organizationId: string): string {
    const data = `${addonId}:${organizationId}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async createAnalyticsRecord(
    addonId: string,
    organizationId: string,
    period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  ): Promise<void> {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case 'DAILY':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'WEEKLY':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        startDate = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
        endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'MONTHLY':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'YEARLY':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear() + 1, 0, 1);
        break;
    }

    try {
      await this.prisma.addonAnalytics.create({
        data: {
          addonId,
          organizationId,
          period,
          startDate,
          endDate,
        },
      });
    } catch (error) {
      // Analytics record might already exist, ignore duplicate errors
      this.logger.debug('Analytics record already exists or failed to create');
    }
  }
}
