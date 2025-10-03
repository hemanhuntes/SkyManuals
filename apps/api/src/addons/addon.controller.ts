import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard, SecurityGuard } from '../auth/auth.guard';
import { AuditService } from '../audit/audit.service';
import { AddonService } from './addon.service';
import { HookExecutionService } from './hook-execution.service';
import {
  AddonSearchRequest,
  LicenseCreateRequest,
  InstallationRequest,
  InstallationUpdateRequest,
  HookExecutionRequest,
  RequestContext,
  AuditEventType,
  AuditSeverity,
} from '@skymanuals/types';

@ApiTags('Add-ons')
@Controller('addons')
@UseGuards(SecurityGuard)
export class AddonController {
  constructor(
    private readonly addonService: AddonService,
    private readonly hookExecutionService: HookExecutionService,
    private readonly auditService: AuditService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search add-ons in the store' })
  @ApiResponse({ status: 200, description: 'Add-ons retrieved successfully' })
  async searchAddons(@Query() searchRequest: AddonSearchRequest) {
    return this.addonService.searchAddons(searchRequest);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get add-on details' })
  @ApiResponse({ status: 200, description: 'Add-on details retrieved successfully' })
  async getAddon(@Param('id') id: string) {
    return this.addonService.getAddonById(id);
  }

  @Post('licenses')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a license for an add-on' })
  @ApiResponse({ status: 201, description: 'License created successfully' })
  async createLicense(
    @Body() request: LicenseCreateRequest,
    @Body('context') context: RequestContext,
  ) {
    const license = await this.addonService.createLicense(request);

    // Log audit event
    await this.auditService.logEvent(context, {
      type: AuditEventType.DATA_MODIFICATION,
      severity: AuditSeverity.MEDIUM,
      action: 'LICENSE_CREATED',
      resource: 'Add-on License',
      resourceId: license.id,
      resourceType: 'License' as any,
      afterData: {
        addonId: request.addonId,
        tier: request.tier,
        seatsPurchased: request.seatsPurchased,
        isTrial: request.trialDays ? true : false,
      },
    });

    return license;
  }

  @Post('install')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Install an add-on' })
  @ApiResponse({ status: 201, description: 'Add-on installed successfully' })
  async installAddon(
    @Body() request: InstallationRequest,
    @Body('context') context: RequestContext,
  ) {
    const installation = await this.addonService.installAddon(request);

    // Log audit event
    await this.auditService.logEvent(context, {
      type: AuditEventType.DATA_MODIFICATION,
      severity: AuditSeverity.MEDIUM,
      action: 'ADDON_INSTALLED',
      resource: 'Add-on Installation',
      resourceId: installation.id,
      resourceType: 'Installation' as any,
      afterData: {
        addonId: request.addonId,
        webhookUrl: request.webhookUrl,
      },
    });

    return installation;
  }

  @Put('installations/:id')
  @ApiBearerAuth()
  @ ApiOperation({ summary: 'Update installation settings' })
  @ApiResponse({ status: 200, description: 'Installation updated successfully' })
  async updateInstallation(
    @Param('id') id: string,
    @Body() updates: InstallationUpdateRequest,
    @Body('context') context: RequestContext,
  ) {
    const installation = await this.addonService.updateInstallation(id, updates);

    // Log audit event
    await this.auditService.logEvent(context, {
      type: AuditEventType.DATA_MODIFICATION,
      severity: AuditSeverity.MEDIUM,
      action: 'INSTALLATION_UPDATED',
      resource: 'Add-on Installation',
      resourceId: id,
      resourceType: 'Installation' as any,
      afterData: updates,
    });

    return installation;
  }

  @Delete('installations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Uninstall an add-on' })
  @ApiResponse({ status: 200, description: 'Add-on uninstalled successfully' })
  @HttpCode(HttpStatus.OK)
  async uninstallAddon(
    @Param('id') id: string,
    @Body('context') context: RequestContext,
  ) {
    await this.addonService.uninstallAddon(id);

    // Log audit event
    await this.auditService.logEvent(context, {
      type: AuditEventType.DATA_DELETION,
      severity: AuditSeverity.HIGH,
      action: 'ADDON_UNINSTALLED',
      resource: 'Add-on Installation',
      resourceId: id,
      resourceType: 'Installation' as any,
    });

    return { success: true };
  }

  @Get('organization/:organizationId/installations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organization installatations' })
  @ApiResponse({ status: 200, description: 'Installations retrieved successfully' })
  async getOrganizationInstallations(@Param('organizationId') organizationId: string) {
    return this.addonService.getOrganizationInstallations(organizationId);
  }

  @Get('organization/:organizationId/licenses')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organization licenses' })
  @ApiResponse({ status: 200, description: 'Licensese retrieved successfully' })
  async getOrganizationLicenses(@Param('organizationId') organizationId: string) {
    return this.addonService.getOrganizationLicenses(organizationId);
  }

  @Get(':id/compatibility')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check add-on compatibility' })
  @ApiResponse({ status: 200, description: 'Compatibility check completed' })
  async checkCompatibility(@Param('id') id: string) {
    return this.addonService.checkCompatibility(id);
  }

  @Post('hooks/execute')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Execute a hook for an installation' })
  @ApiResponse({ status: 200, description: 'Hook executed successfully' })
  async executeHook(
    @Body() request: HookExecutionRequest,
    @Body('context') context: RequestContext,
  ) {
    return this.hookExecutionService.executeHook(request, context);
  }

  @Get('organization/:organizationId/hooks/logs')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get webhook execution logs' })
  @ApiResponse({ status: 200, description: 'Hook logs retrieved successfully' })
  @ApiQuery({ name: 'installationId', required: false })
  @ApiQuery({ name: 'hookType', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async getHookExecutionLogs(
    @Param('organizationId') organizationId: string,
    @Query('installationId') installationId?: string,
    @Query('hookType') hookType?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
  ) {
    const filters = {
      installationId,
      hookType: hookType as any,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    const pagination = {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    };

    return this.hookExecutionService.getHookExecutionLogs(
      organizationId,
      filters,
      pagination,
    );
  }

  @Post('admin/bulk-hooks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Execute bulk hooks (admin only)' })
  @ApiResponse({ status: 200, description: 'Bulk hook execution completed' })
  async executeBulkHooks(
    @Body('hookType') hookType: string,
    @Body('payload') payload: Record<string, any>,
    @Body('organizationId') organizationId?: string,
  ) {
    return this.hookExecutionService.executeBulkHooks(
      hookType as any,
      payload,
      organizationId,
    );
  }

  @Post('admin/process-failed-hooks')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Process failed hook executions for retry (admin only)' })
  @ApiResponse({ status: 200, description: 'Failed hooks processed for retry' })
  async processFailedHooks() {
    await this.hookExecutionService.processFailedHookExecutions();
    return { success: true, message: 'Failed hook executions processed for retry' };
  }
}
