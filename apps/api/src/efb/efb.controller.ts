import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { OfflineCacheService } from './offline-cache.service';
import {
  DeviceEnrollmentRequest,
  SyncCheckRequest,
  SyncResponse,
  HighlightSync,
  NoteSync,
  CacheInvalidationRequest,
  RequestContext,
} from '@skymanuals/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('EFB')
@Controller('efb')
export class EFBController {
  private readonly logger = new Logger(EFBController.name);

  constructor(
    private readonly deviceService: DeviceService,
    private readonly offlineCacheService: OfflineCacheService,
  ) {}

  private createRequestContext(req: any, organizationId?: string): RequestContext {
    return {
      requestId: req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      correlationId: req.headers['x-correlation-id'],
      userId: req.user?.userId,
      organizationId: organizationId || req.user?.organizationId || 'system',
      userRole: req.user?.role,
      permissions: req.user?.permissions || [],
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
      metadata: {
        userEmail: req.user?.email,
        clientId: req.user?.clientId,
      },
    };
  }

  @Post('devices/enroll')
  @ApiOperation({ summary: 'Enroll new EFB device' })
  async enrollDevice(
    @Body() enrollment: DeviceEnrollmentRequest,
    @Req() req: any,
  ): Promise<any> {
    this.logger.log(`Device enrollment request: ${enrollment.deviceId}`);
    
    // Create request context for audit logging
    const context = this.createRequestContext(req, enrollment.organizationIdentifier);
    
    return this.deviceService.enrollDevice(enrollment, context);
  }

  @Post('devices/:deviceId/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve device enrollment' })
  async approveDevice(
    @Param('deviceId') deviceId: string,
    @Body() body: { customPolicies?: string[] },
    @Request() req: any,
  ): Promise<any> {
    this.logger.log(`Approving device: ${deviceId}`);
    
    // Create request context for audit logging
    const context = this.createRequestContext(req);
    
    return this.deviceService.approveDevice(
      deviceId,
      req.user.id,
      body.customPolicies || [],
      context,
    );
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get device list for admin interface' })
  async getDeviceList(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
    @Query('status') status?: string,
    @Query('platform') platform?: string,
    @Query('search') search?: string,
    @Request() req: any,
  ): Promise<any> {
    const organizationId = req.user.organizationId;
    return this.deviceService.getDeviceList(
      organizationId,
      parseInt(page),
      parseInt(pageSize),
      { status, platform, search },
    );
  }

  @Post('devices/:deviceId/suspend')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend device access' })
  async suspendDevice(
    @Param('deviceId') deviceId: string,
    @Body() body: { reason: string },
    @Request() req: any,
  ): Promise<any> {
    this.logger.log(`Suspending device: ${deviceId}, reason: ${body.reason}`);
    return this.deviceService.suspendDevice(deviceId, body.reason);
  }

  @Post('policies')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create device policy' })
  async createPolicy(@Body() policyData: any, @Request() req: any): Promise<any> {
    this.logger.log(`Creating policy: ${policyData.name}`);
    return this.deviceService.createDevicePolicy({
      ...policyData,
      organizationId: req.user.organizationId,
      createdBy: req.user.id,
    });
  }

  @Post('policies/update')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update device policies in bulk' })
  async updatePolicies(
    @Body() request: DevicePolicyUpdateRequest,
    @Request() req: any,
  ): Promise<any> {
    this.logger.log(`Updating policies: ${request.deviceIds.length} devices`);
    return this.deviceService.updateDevicePolicies(request);
  }

  @Post('sync/check')
  @ApiOperation({ summary: 'Check sync status and get needed updates' })
  async syncCheck(@Body() request: SyncCheckRequest): Promise<SyncResponse> {
    this.logger.log(`Checking sync status for device: ${request.deviceId}`);
    return this.offlineCacheService.checkSyncStatus(request);
  }

  @Post('sync/incremental')
  @ApiOperation({ summary: 'Create incremental sync job' })
  async createIncrementalSync(
    @Body() body: {
      deviceId: string;
      readerBundleId: string;
      lastSyncTimestamp?: string;
    },
  ): Promise<any> {
    this.logger.log(
      `Creating incremental sync: ${body.deviceId}, bundle ${body.readerBundleId}`,
    );
    return this.offlineCacheService.createIncrementalSync(
      body.deviceId,
      body.readerBundleId,
      body.lastSyncTimestamp ? new Date(body.lastSyncTimestamp) : undefined,
    );
  }

  @Post('cache/chunk')
  @ApiOperation({ summary: 'Cache downloaded chunk data' })
  async cacheChunk(
    @Body() body: {
      deviceId: string;
      readerBundleId: string;
      chunkIndex: number;
      chunkData: string; // Base64 encoded
    },
  ): Promise<any> {
    this.logger.log(
      `Caching chunk ${body.chunkIndex} for device ${body.deviceId}`,
    );
    const chunkData = Buffer.from(body.chunkData, 'base64');
    return this.offlineCacheService.cacheChunk(
      body.deviceId,
      body.readerBundleId,
      body.chunkIndex,
      chunkData,
    );
  }

  @Post('cache/manifest')
  @ApiOperation({ summary: 'Update cache manifest' })
  async updateCacheManifest(
    @Body() body: {
      deviceId: string;
      readerBundleId: string;
      bundleVersion: string;
      chunks: any[];
    },
  ): Promise<any> {
    this.logger.log(
      `Updating cache manifest for device ${body.deviceId}, bundle ${body.readerBundleId}`,
    );
    return this.offlineCacheService.updateCacheManifest(
      body.deviceId,
      body.readerBundleId,
      body.bundleVersion,
      body.chunks,
    );
  }

  @Post('sync/highlights')
  @ApiOperation({ summary: 'Sync highlights from device' })
  async syncHighlights(
    @Body() highlightSync: HighlightSync,
    @Req() req: any,
  ): Promise<any> {
    this.logger.log(
      `Syncing highlights from device ${highlightSync.deviceId}`,
    );
    
    // Create request context for audit logging and conflict resolution
    const context = this.createRequestContext(req);
    
    return this.offlineCacheService.syncHighlights(highlightSync, context);
  }

  @Post('sync/notes')
  @ApiOperation({ summary: 'Sync notes from device' })
  async syncNotes(
    @Body() noteSync: NoteSync,
    @Req() req: any,
  ): Promise<any> {
    this.logger.log(`Syncing notes from device ${noteSync.deviceId}`);
    
    // Create request context for audit logging and conflict resolution
    const context = this.createRequestContext(req);
    
    return this.offlineCacheService.syncNotes(noteSync, context);
  }

  @Post('cache/invalidate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate device cache' })
  async invalidateCache(
    @Body() request: CacheInvalidationRequest,
    @Request() req: any,
  ): Promise<any> {
    this.logger.log(
      `Invalidating cache for ${request.deviceIds.length} devices`,
    );
    return this.offlineCacheService.invalidateCache(request);
  }

  @Get('devices/:deviceId/policies')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get policies for specific device' })
  async getDevicePolicies(@Param('deviceId') deviceId: string): Promise<any> {
    this.logger.log(`Getting policies for device: ${deviceId}`);
    return this.deviceService.getDevicePolicies(deviceId);
  }

  @Post('devices/:deviceId/analytics')
  @ApiOperation({ summary: 'Log device analytics event' })
  async logDeviceAnalytics(
    @Param('deviceId') deviceId: string,
    @Body() body: {
      userId: string;
      organizationId: string;
      action: string;
      targetId?: string;
      metadata?: any;
    },
  ): Promise<any> {
    this.logger.log(`Logging analytics: ${body.action} for device ${deviceId}`);
    await this.deviceService.logDeviceAnalytics(
      deviceId,
      body.userId,
      body.organizationId,
      body.action,
      body.targetId,
      body.metadata,
    );
    return { success: true };
  }
}
