import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthResponseSchema, type HealthResponse } from '@skymanuals/types';
import { execSync } from 'child_process';

@ApiTags('health')
@Controller('api')
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ 
    status: 200, 
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        commitSha: { type: 'string', example: 'abc123def' },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' }
      }
    }
  })
  async health(): Promise<HealthResponse> {
    let commitSha = 'unknown';
    
    try {
      commitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch (error) {
      // Fallback if git is not available
      console.warn('Could not get git commit SHA:', error);
    }

    const healthData = {
      status: 'ok' as const,
      commitSha,
      timestamp: new Date().toISOString(),
    };

    return HealthResponseSchema.parse(healthData);
  }
}
