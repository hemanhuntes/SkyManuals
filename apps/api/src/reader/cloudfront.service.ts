import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudFrontClient, CreateDistributionCommand, GetDistributionCommand, UpdateDistributionCommand, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

export interface CloudFrontConfig {
  domainName: string;
  originAccessIdentity: string;
  certificateArn?: string;
  priceClass: 'PriceClass_100' | 'PriceClass_200' | 'PriceClass_All';
  enabled: boolean;
}

export interface SignedUrlOptions {
  expiresIn?: number; // seconds
  ipAddress?: string;
  trustedSigners?: string[];
}

export interface InvalidationResult {
  id: string;
  status: string;
  createTime: Date;
  paths: string[];
}

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class CloudFrontService {
  private readonly logger = new Logger(CloudFrontService.name);
  private cloudFrontClient: CloudFrontClient;
  private s3Client: S3Client;
  private readonly distributionId: string;
  private readonly domainName: string;
  private readonly keyPairId: string;
  private readonly privateKey: string;
  private readonly s3Bucket: string;

  constructor(private configService: ConfigService) {
    // Initialize CloudFront client
    this.cloudFrontClient = new CloudFrontClient({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.distributionId = this.configService.get('CLOUDFRONT_DISTRIBUTION_ID');
    this.domainName = this.configService.get('CLOUDFRONT_DOMAIN_NAME', 'd1234567890.cloudfront.net');
    this.keyPairId = this.configService.get('CLOUDFRONT_KEY_PAIR_ID');
    this.privateKey = this.configService.get('CLOUDFRONT_PRIVATE_KEY');
    this.s3Bucket = this.configService.get('AWS_S3_BUCKET', 'skymanuals-bundles');
  }

  async createDistribution(config: CloudFrontConfig): Promise<{
    id: string;
    domainName: string;
    status: string;
  }> {
    this.logger.log(`Creating CloudFront distribution for ${config.domainName}`);

    try {
      const command = new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: `skymanuals-${Date.now()}`,
          Aliases: config.certificateArn ? {
            Quantity: 1,
            Items: [this.domainName]
          } : undefined,
          DefaultRootObject: 'index.html',
          Origins: {
            Quantity: 1,
            Items: [{
              Id: 'S3-bundles',
              DomainName: config.domainName,
              S3OriginConfig: {
                OriginAccessIdentity: config.originAccessIdentity
              }
            }]
          },
          DefaultCacheBehavior: {
            TargetOriginId: 'S3-bundles',
            ViewerProtocolPolicy: 'redirect-to-https',
            AllowedMethods: {
              Quantity: 2,
              Items: ['GET', 'HEAD'],
              CachedMethods: {
                Quantity: 2,
                Items: ['GET', 'HEAD']
              }
            },
            Compress: true,
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: 'none'
              }
            },
            MinTTL: 0,
            DefaultTTL: 86400, // 1 day
            MaxTTL: 31536000, // 1 year
            TrustedSigners: {
              Enabled: true,
              Quantity: 1,
              Items: ['self']
            }
          },
          CacheBehaviors: {
            Quantity: 2,
            Items: [
              {
                PathPattern: '/bundles/*/manifest.json',
                TargetOriginId: 'S3-bundles',
                ViewerProtocolPolicy: 'redirect-to-https',
                AllowedMethods: {
                  Quantity: 2,
                  Items: ['GET', 'HEAD'],
                  CachedMethods: {
                    Quantity: 2,
                    Items: ['GET', 'HEAD']
                  }
                },
                Compress: true,
                ForwardedValues: {
                  QueryString: false,
                  Cookies: {
                    Forward: 'none'
                  }
                },
                MinTTL: 0,
                DefaultTTL: 300, // 5 minutes (manifests change frequently)
                MaxTTL: 3600 // 1 hour
              },
              {
                PathPattern: '/bundles/*/chunk-*.json.gz',
                TargetOriginId: 'S3-bundles',
                ViewerProtocolPolicy: 'redirect-to-https',
                AllowedMethods: {
                  Quantity: 2,
                  Items: ['GET', 'HEAD'],
                  CachedMethods: {
                    Quantity: 2,
                    Items: ['GET', 'HEAD']
                  }
                },
                Compress: true,
                ForwardedValues: {
                  QueryString: false,
                  Cookies: {
                    Forward: 'none'
                  }
                },
                MinTTL: 0,
                DefaultTTL: 86400, // 1 day
                MaxTTL: 31536000 // 1 year
              }
            ]
          },
          Comment: 'SkyManuals Bundle Distribution',
          Enabled: config.enabled,
          PriceClass: config.priceClass,
          ViewerCertificate: config.certificateArn ? {
            ACMCertificateArn: config.certificateArn,
            SSLSupportMethod: 'sni-only',
            MinimumProtocolVersion: 'TLSv1.2_2021'
          } : {
            CloudFrontDefaultCertificate: true
          }
        }
      });

      const response = await this.cloudFrontClient.send(command);
      const distribution = response.Distribution;

      this.logger.log(`CloudFront distribution created: ${distribution.Id}`);

      return {
        id: distribution.Id,
        domainName: distribution.DomainName,
        status: distribution.Status
      };
    } catch (error) {
      this.logger.error(`Failed to create CloudFront distribution:`, error);
      throw new Error(`CloudFront distribution creation failed: ${error.message}`);
    }
  }

  async getDistribution(distributionId?: string): Promise<any> {
    const id = distributionId || this.distributionId;
    
    if (!id) {
      throw new Error('Distribution ID not configured');
    }

    try {
      const command = new GetDistributionCommand({ Id: id });
      const response = await this.cloudFrontClient.send(command);
      
      return {
        id: response.Distribution.Id,
        domainName: response.Distribution.DomainName,
        status: response.Distribution.Status,
        enabled: response.Distribution.DistributionConfig.Enabled,
        lastModified: response.Distribution.LastModifiedTime,
        etag: response.ETag
      };
    } catch (error) {
      this.logger.error(`Failed to get CloudFront distribution ${id}:`, error);
      throw new Error(`Failed to get distribution: ${error.message}`);
    }
  }

  async generateSignedUrl(
    url: string,
    options: SignedUrlOptions = {}
  ): Promise<string> {
    const {
      expiresIn = 24 * 60 * 60, // 24 hours default
      ipAddress,
      trustedSigners = ['self']
    } = options;

    if (!this.keyPairId || !this.privateKey) {
      this.logger.warn('CloudFront signing not configured, returning unsigned URL');
      return url;
    }

    try {
      // Parse URL to get path
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;

      // Create policy
      const policy = {
        Statement: [{
          Resource: `https://${this.domainName}${path}`,
          Condition: {
            DateLessThan: {
              'AWS:EpochTime': Math.floor(Date.now() / 1000) + expiresIn
            },
            ...(ipAddress && {
              IpAddress: {
                'AWS:SourceIp': ipAddress
              }
            })
          }
        }]
      };

      const policyJson = JSON.stringify(policy);
      const policyB64 = Buffer.from(policyJson).toString('base64');

      // Create signature
      const signature = crypto
        .createSign('RSA-SHA1')
        .update(policyB64)
        .sign(this.privateKey, 'base64');

      // Construct signed URL
      const signedUrl = new URL(url);
      signedUrl.searchParams.set('Expires', (Math.floor(Date.now() / 1000) + expiresIn).toString());
      signedUrl.searchParams.set('Signature', signature);
      signedUrl.searchParams.set('Key-Pair-Id', this.keyPairId);

      return signedUrl.toString();
    } catch (error) {
      this.logger.error(`Failed to generate signed URL:`, error);
      throw new Error(`Signed URL generation failed: ${error.message}`);
    }
  }

  async createInvalidation(paths: string[]): Promise<InvalidationResult> {
    if (!this.distributionId) {
      throw new Error('Distribution ID not configured');
    }

    this.logger.log(`Creating invalidation for ${paths.length} paths`);

    try {
      const command = new CreateInvalidationCommand({
        DistributionId: this.distributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: paths.length,
            Items: paths
          },
          CallerReference: `skymanuals-${Date.now()}`
        }
      });

      const response = await this.cloudFrontClient.send(command);
      const invalidation = response.Invalidation;

      this.logger.log(`Invalidation created: ${invalidation.Id}`);

      return {
        id: invalidation.Id,
        status: invalidation.Status,
        createTime: invalidation.CreateTime,
        paths: invalidation.InvalidationBatch.Paths.Items
      };
    } catch (error) {
      this.logger.error(`Failed to create invalidation:`, error);
      throw new Error(`Invalidation creation failed: ${error.message}`);
    }
  }

  async invalidateBundle(bundleId: string): Promise<InvalidationResult> {
    const paths = [
      `/bundles/${bundleId}/manifest.json`,
      `/bundles/${bundleId}/chunk-*`
    ];

    return this.createInvalidation(paths);
  }

  async invalidateManifest(bundleId: string): Promise<InvalidationResult> {
    const paths = [`/bundles/${bundleId}/manifest.json`];
    return this.createInvalidation(paths);
  }

  async getBundleUrl(bundleId: string, chunkIndex?: number): Promise<string> {
    const baseUrl = `https://${this.domainName}`;
    
    if (chunkIndex !== undefined) {
      return `${baseUrl}/bundles/${bundleId}/chunk-${chunkIndex}.json.gz`;
    }
    
    return `${baseUrl}/bundles/${bundleId}/manifest.json`;
  }

  async getSignedBundleUrl(
    bundleId: string,
    chunkIndex?: number,
    options?: SignedUrlOptions
  ): Promise<string> {
    const url = await this.getBundleUrl(bundleId, chunkIndex);
    return this.generateSignedUrl(url, options);
  }

  // Cache optimization methods
  async optimizeCacheBehavior(pathPattern: string, ttl: number): Promise<boolean> {
    try {
      const distribution = await this.getDistribution();
      
      // This would require updating the distribution configuration
      // In production, you'd implement this with UpdateDistributionCommand
      this.logger.log(`Optimizing cache behavior for ${pathPattern} with TTL ${ttl}s`);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to optimize cache behavior:`, error);
      return false;
    }
  }

  async getCacheStatistics(): Promise<{
    requests: number;
    bytesDownloaded: number;
    hitRate: number;
  }> {
    // In production, you'd integrate with CloudWatch metrics
    return {
      requests: 0,
      bytesDownloaded: 0,
      hitRate: 0
    };
  }

  // Health check
  async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      const distribution = await this.getDistribution();
      
      return {
        status: 'healthy',
        details: {
          distributionId: distribution.id,
          domainName: distribution.domainName,
          status: distribution.status,
          enabled: distribution.enabled
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error.message }
      };
    }
  }

  // Cost optimization
  async getCostEstimate(): Promise<{
    monthlyRequests: number;
    monthlyDataTransfer: number;
    estimatedCost: number;
  }> {
    // CloudFront pricing (as of 2024)
    const requestPrice = 0.0075; // per 10,000 requests
    const dataTransferPrice = 0.085; // per GB

    const stats = await this.getCacheStatistics();
    
    const monthlyRequests = stats.requests;
    const monthlyDataTransferGB = stats.bytesDownloaded / (1024 * 1024 * 1024);
    
    const requestCost = (monthlyRequests / 10000) * requestPrice;
    const dataTransferCost = monthlyDataTransferGB * dataTransferPrice;
    
    return {
      monthlyRequests,
      monthlyDataTransfer: monthlyDataTransferGB,
      estimatedCost: requestCost + dataTransferCost
    };
  }

  // Upload bundle to S3 and return CloudFront URL
  async uploadBundle(content: string, filename: string, options: UploadOptions = {}): Promise<string> {
    try {
      this.logger.log(`📤 Uploading bundle to S3: ${filename}`);
      
      const key = `bundles/${filename}`;
      const buffer = Buffer.from(content, 'utf8');
      
      const command = new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: options.contentType || 'application/json',
        CacheControl: options.cacheControl || 'public, max-age=3600',
        Metadata: options.metadata || {},
        ServerSideEncryption: 'AES256'
      });

      await this.s3Client.send(command);
      
      // Return CloudFront URL
      const cdnUrl = `https://${this.domainName}/${key}`;
      this.logger.log(`✅ Bundle uploaded successfully: ${cdnUrl}`);
      
      return cdnUrl;
      
    } catch (error) {
      this.logger.error(`❌ Failed to upload bundle: ${error.message}`);
      throw new Error(`Bundle upload failed: ${error.message}`);
    }
  }
}
