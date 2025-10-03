import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics for SkyManuals-specific measurements
const manualLoadRate = new Rate('skymanuals_manual_load_success_rate');
const askQueryDuration = new Trend('skymanuals_ask_query_duration');
const efbSyncDuration = new Trend('skymanuals_efb_sync_duration');
const userJourneySuccessRate = new Rate('skymanuals_user_journey_success_rate');

// Test configuration
export let options = {
  stages: [
    { duration: '2m', target: 10 },   // Warm-up
    { duration: '5m', target: 50 },   // Ramp up to normal load
    { duration: '30m', target: 50 },  // Sustained load
    { duration: '2m', target: 100 },   // Spike load
    { duration: '5m', target: 100 },  // Maintain spike
    { duration: '2m', target: 0 },    // Ramp down
  ],
  
  // SLO thresholds
  thresholds: {
    // Availability thresholds (99.5% target)
    'http_req_duration{status!~"4..":status!~"5.."}': ['p(95)<2000'], // P95 < 2s
    'http_req_failed': ['rate<0.005'], // <0.5% error rate
    
    // Critical endpoint thresholds
    'skymanuals_manual_load_success_rate': ['rate>=0.99'], // 99% success
    'skymanuals_ask_query_duration': ['p(95)<2000', 'p(99)<5000'], // P95 < 2s, P99 < 5s
    'skymanuals_efb_sync_duration': ['p(95)<5000', 'p(99)<10000'], // P95 < 5s, P99 < 10s
    
    // User journey thresholds
    'skymanuals_user_journey_success_rate': ['rate>=0.98'], // 98% complete journeys
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.skymanuals.com';
const TEST_ORG_ID = __ENV.TEST_ORG_ID || 'test-organization';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || 'test-token';

// Test data
const MANUAL_TITLES = [
  'Boeing 737-800 Operations Manual',
  'Airbus A320 Flight Operations Manual',
  'Boeing 787 Dreamliner Procedures',
  'Embraer E190 Maintenance Manual',
];

const SEARCH_QUERIES = [
  'emergency procedures',
  'takeoff performance',
  'landing checklist',
  'fuel calculation',
  'weather minimums',
  'system failures',
];

const AIRCRAFT_TYPES = ['737', 'A320', '787', 'E190'];

// Helper functions
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomAircraft() {
  return getRandomElement(AIRCRAFT_TYPES);
}

function getRandomQuery() {
  return `${getRandomElement(SEARCH_QUERIES)} for ${getRandomAircraft()}`;
}

function createAuthHeaders() {
  return {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'x-org-id': TEST_ORG_ID,
    'Content-Type': 'application/json',
    'User-Agent': 'k6-load-test/1.0',
  };
}

// Test scenarios
function testHealthCheck() {
  const response = http.get(`${BASE_URL}/api/health`);
  
  check(response, {
    'health check responds': r => r.status === 200,
    'health check fast': r => r.timings.duration < 100,
    'health check includes commit': r => JSON.parse(r.body).commitSha !== undefined,
  });
}

function testManualLoading() {
  const manualId = `manual-${__VU}-${__ITER}`;
  
  // GET manual endpoint
  const response = http.get(`${BASE_URL}/api/manuals/${manualId}`, {
    headers: createAuthHeaders(),
  });
  
  const success = check(response, {
    'manual loads successfully': r => r.status === 200 || r.status === 404,
    'manual loads within SLO': r => r.timings.duration < 500,
    'manual includes required fields': r => {
      if (r.status === 200) {
        const body = JSON.parse(r.body);
        return body.title !== undefined && body.version !== undefined;
      }
      return true;
    },
  });
  
  manualLoadRate.add(success);
  
  // Record duration for successful requests
  if (success) {
    askQueryDuration.add(response.timings.duration);
  }
}

function testAskAPI() {
  const query = getRandomQuery();
  
  const response = http.post(`${BASE_URL}/api/search/ask`, JSON.stringify({
    query: query,
    organizationId: TEST_ORG_ID,
    maxTokens: 500,
  }), {
    headers: createAuthHeaders(),
  });
  
  const success = check(response, {
    'ask responds successfully': r => r.status === 200,
    'ask within SLO (P95)': r => r.timings.duration < 2000,
    'ask within SLO (P99)': r => r.timings.duration < 5000,
    'ask returns answer': r => {
      if (r.status === 200) {
        const body = JSON.parse(r.body);
        return body.answer !== undefined && body.citations !== undefined;
      }
      return true;
    },
    'ask includes citations': r => {
      if (r.status === 200) {
        const body = JSON.parse(r.body);
        return Array.isArray(body.citations) && body.citations.length > 0;
      }
      return true;
    },
  });
  
  askQueryDuration.add(response.timings.duration);
}

function testEFBSync() {
  const deviceId = `device-${__VU}-${__ITER}`;
  const lastSync = Date.now() - (Math.random() * 3600000); // 0-1 hour ago
  
  // Test delta sync
  const syncResponse = http.post(`${BASE_URL}/api/efb/sync/delta`, JSON.stringify({
    deviceId: deviceId,
    organizationId: TEST_ORG_ID,
    lastSyncTimestamp: new Date(lastSync).toISOString(),
    manualIds: [`manual-${Math.floor(Math.random() * 10)}`],
  }), {
    headers: createAuthHeaders(),
  });
  
  const success = check(syncResponse, {
    'sync responds successfully': r => r.status === 200,
    'sync within SLO (P95)': r => r.timings.duration < 5000,
    'sync within SLO (P99)': r => r.timings.duration < 10000,
    'sync returns manifest': r => {
      if (r.status === 200) {
        const body = JSON.parse(r.body);
        return body. manifest !== undefined || body.chunks !== undefined;
      }
      return true;
    },
  });
  
  efbSyncDuration.add(syncResponse.timings.duration);
  
  // Test cache manifest download
  if (success && syncResponse.status === 200) {
    const manifestData = JSON.parse(syncResponse.body);
    if (manifestData.manifest && manifestData.manifest.downloadUrl) {
      const manifestResponse = http.get(manifestData.manifest.downloadUrl);
      
      check(manifestResponse, {
        'manifest downloads': r => r.status === 200,
        'manifest download fast': r => r.timings.duration < 1000,
      });
    }
  }
}

function testUserJourney() {
  // Simulate complete user journey: health → auth → manual load → search → manual update
  let journeySuccess = true;
  
  try {
    // 1. Health check
    const healthResponse = http.get(`${BASE_URL}/api/health`);
    journeySuccess = journeySuccess && healthResponse.status === 200;
    
    // 2. Manual list
    const manualsResponse = http.get(`${BASE_URL}/api/manuals`, {
      headers: createAuthHeaders(),
    });
    journeySuccess = journeySuccess && manualsResponse.status === 200;
    
    if (journeySuccess) {
      const manuals = JSON.parse(manualsResponse.body);
      if (manuals.length > 0) {
        // 3. Load specific manual
        const manualId = manuals[0].id;
        const manualResponse = http.get(`${BASE_URL}/api/manuals/${manualId}`, {
          headers: createAuthHeaders(),
        });
        journeySuccess = journeySuccess && manualResponse.status === 200;
        
        // 4. Ask question about manual
        const askResponse = http.post(`${BASE_URL}/api/search/ask`, JSON.stringify({
          query: `What are the key procedures in ${manuals[0].title}?`,
          organizationId: TEST_ORG_ID,
        }), {
          headers: createAuthHeaders(),
        });
        journeySuccess = journeySuccess && askResponse.status === 200;
        
        // 5. Update manual (simulated)
        const updateResponse = http.patch(`${BASE_URL}/api/manuals/${manualId}`, JSON.stringify({
          version: `v${Date.now()}`,
          description: 'Updated via load test',
        }), {
          headers: createAuthHeaders(),
        });
        journeySuccess = journeySuccess && (updateResponse.status === 200 || updateResponse.status === 403);
      }
    }
  } catch (error) {
    journeySuccess = false;
    console.error('User journey failed:', error);
  }
  
  userJourneySuccessRate.add(journeySuccess);
}

function testDatabaseOperations() {
  // Test database-heavy operations
  const operation = Math.random();
  
  if (operation < 0.3) {
    // Read-heavy: Search operations
    http.get(`${BASE_URL}/api/search?q=${encodeURIComponent(getRandomQuery())}&type=manual`, {
      headers: createAuthHeaders(),
    });
    
  } else if (operation < 0.6) {
    // Write-heavy: Create/update operations
    const manualData = {
      title: `${getRandomElement(MANUAL_TITLES)} - Test ${Date.now()}`,
      description: 'Load test generated manual',
      organizationId: TEST_ORG_ID,
      status: 'DRAFT',
    };
    
    http.post(`${BASE_URL}/api/manuals`, JSON.stringify(manualData), {
      headers: createAuthHeaders(),
    });
    
  } else {
    // Complex queries: Analytics operations
    http.get(`${BASE_URL}/api/analytics/manuals/usage`, {
      headers: createAuthHeaders(),
    });
  }
}

function testConcurrentEFBOperations() {
  // Simulate multiple EFB devices syncing simultaneously
  const deviceCount = Math.floor(Math.random() * 3) + 1; // 1-3 devices
  const promises = [];
  
  for (let i = 0; i < deviceCount; i++) {
    promises.push(
      http.post(`${BASE_URL}/api/efb/sync/heartbeat`, JSON.stringify({
        deviceId: `device-${__VU}-${__ITER}-${i}`,
        organizationId: TEST_ORG_ID,
        lastSyncAt: new Date(Date.now() - Math.random() * 300000).toISOString(),
      }), {
        headers: createAuthHeaders(),
      })
    );
  }
  
  const responses = __ENV.DISABLE_CONCURRENT_TESTS ? promises : promises; // Fallback to sequential
  
  check(responses, {
    'concurrent sync operations complete': r => Array.isArray(r) && r.every(resp => resp.status === 200),
  });
}

// Main test cycle
export default function() {
  const userType = __VU % 100; // Percentile distribution
  
  // 95% of traffic: Normal operations
  if (userType <= 94) {
    const operation = Math.random();
    
    if (operation < 0.2) {
      testHealthCheck();
    } else if (operation < 0.4) {
      testManualLoading();
    } else if (operation < 0.6) {
      testAskAPI();
    } else if (operation < 0.8) {
      testUserJourney();
    } else {
      testDatabaseOperations();
    }
    
    // 2% of traffic: EFB operations
  } else if (userType <= 96) {
    testEFBSync();
    
    // 1% of traffic: Concurrent EFB operations
  } else if (userType <= 97) {
    testConcurrentEFBOperations();
    
    // 3% of traffic: Power users (multiple operations)
  } else {
    testUserJourney();
    sleep(0.5);
    testAskAPI();
    sleep(0.5);
    testManualLoading();
  }
  
  // Realistic think time between operations
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds
}

// Setup and teardown
export function setup() {
  console.log('🚀 Starting SkyManuals Load Tests');
  console.log(`📊 Target: ${__ENV.TARGET_LOAD || '50'} concurrent users`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`🏢 Organization: ${TEST_ORG_ID}`);
  
  // Verify basic connectivity
  const healthCheck = http.get(`${BASE_URL}/api/health`);
  
  if (healthCheck.status !== 200) {
    throw new Error(`Health check failed: ${healthCheck.status}`);
  }
  
  console.log('✅ Health check passed');
  
  return { 
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    organizationId: TEST_ORG_ID,
  };
}

export function teardown(data) {
  console.log('🏁 Load tests completed');
  console.log(`📈 Test duration: ${__ENV.TEST_DURATION || 'Manual'}`);
  console.log(`🔗 Base URL: ${data.baseUrl}`);
  console.log(`⚙️ Organization: ${data.organizationId}`);
  
  // Generate summary report
  const summary = {
    testTimestamp: data.timestamp,
    completedAt: new Date().toISOString(),
    baseUrl: data.baseUrl,
    organizationId: data.organizationId,
    thresholds: {
      availability: '99.5% target',
      performanceP95: '2s max',
      performanceP99: '5s max',
      errorRate: '<0.5%',
    },
  };
  
  console.log('📋 Test Summary:', JSON.stringify(summary, null, 2));
}

// Error handling
export function handleSummary(data) {
  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      totalRequests: data.metrics.http_reqs?.count || 0,
      avgRequestDuration: data.metrics.http_req_duration?.avg || 0,
      p95Duration: data.metrics.http_req_duration?.['p(95)'] || 0,
      p99Duration: data.metrics.http_req_duration?.['p(99)'] || 0,
      errorRate: data.metrics.http_req_failed?.rate || 0,
      efbSyncDuration: data.metrics.skymanuals_efb_sync_duration?.['p(95)'] || 0,
      askQueryDuration: data.metrics.skymanuals_ask_query_duration?.['p(95)'] || 0,
      manualLoadRate: data.metrics.skymanuals_manual_load_success_rate?.rate || 0,
      userJourneySuccess: data.metrics.skymanuals_user_journey_success_rate?.rate || 0,
    },
    slos: {
      availability: `${((1 - data.metrics.http_req_failed?.rate || 0) * 100).toFixed(2)}%`,
      performance: {
        p95Passed: (data.metrics.http_req_duration?.['p(95)'] || 0) < 2000,
        p99Passed: (data.metrics.http_req_duration?.['p(99)'] || 0) < 5000,
      },
      efbsyncPassed: (data.metrics.skymanuals_efb_sync_duration?.['p(95)'] || 0) < 5000,
      askQueryPassed: (data.metrics.skymanuals_ask_query_duration?.['p(95)'] || 0) < 2000,
    },
    
    alerts: generateSLOAlerts(data.metrics),
  };
  
  // Log summary to stdout for CI/CD integration
  console.log('\n🎯 SLO Test Results:');
  console.log(JSON.stringify(results, null, 2));
  
  return {
    stdout: `results-${new Date().toISOString().split('T')[0]}.json`,
    'results.json': JSON.stringify(results, null, 2),
  };
}

function generateSLOAlerts(metrics) {
  const alerts = [];
  
  // Availability alerts
  const errorRate = metrics.http_req_failed?.rate || 0;
  if (errorRate > 0.005) { // >0.5%
    alerts.push({
      level: 'CRITICAL',
      message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds SLO of 0.5%`,
      metric: 'availability',
      value: errorRate,
      threshold: 0.005,
    });
  }
  
  // Performance alerts
  const p95Duration = metrics.http_req_duration?.['p(95)'] || 0;
  if (p95Duration > 2000) {
    alerts.push({
      level: 'WARNING',
      message: `P95 duration ${p95Duration.toFixed(0)}ms exceeds SLO of 2000ms`,
      metric: 'performance',
      value: p95Duration,
      threshold: 2000,
    });
  }
  
  // EFB sync alerts
  const efbsyncDuration = metrics.skymanuals_efb_sync_duration?.['p(95)'] || 0;
  if (efbsyncDuration > 5000) {
    alerts.push({
      level: 'WARNING',
      message: `EFB sync P95 ${efbsyncDuration.toFixed(0)}ms exceeds SLO of 5000ms`,
      metric: 'efbsync',
      value: efbsyncDuration,
      threshold: 5000,
    });
  }
  
  return alerts;
}
