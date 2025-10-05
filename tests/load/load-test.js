import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users
    { duration: '5m', target: 10 }, // Stay at 10 users
    { duration: '2m', target: 20 }, // Ramp up to 20 users
    { duration: '5m', target: 20 }, // Stay at 20 users
    { duration: '2m', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.1'],     // Error rate must be below 10%
    errors: ['rate<0.1'],              // Custom error rate must be below 10%
  },
};

// Test data
const BASE_URL = 'http://localhost:3001';
const TEST_USER = {
  email: 'loadtest@example.com',
  password: 'testpassword123',
};

// Helper function to get auth token
function getAuthToken() {
  const response = http.post(`${BASE_URL}/auth/login`, JSON.stringify(TEST_USER), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (response.status === 200) {
    const body = JSON.parse(response.body);
    return body.access_token;
  }
  
  return null;
}

// Helper function to create test organization
function createTestOrganization(token) {
  const orgData = {
    name: `Load Test Org ${Date.now()}`,
    type: 'AIRLINE',
    status: 'ACTIVE',
  };

  const response = http.post(`${BASE_URL}/organizations`, JSON.stringify(orgData), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 201) {
    return JSON.parse(response.body);
  }
  
  return null;
}

// Helper function to create test manual
function createTestManual(token, organizationId) {
  const manualData = {
    title: `Load Test Manual ${Date.now()}`,
    organizationId: organizationId,
    status: 'DRAFT',
  };

  const response = http.post(`${BASE_URL}/manuals`, JSON.stringify(manualData), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 201) {
    return JSON.parse(response.body);
  }
  
  return null;
}

export default function() {
  const token = getAuthToken();
  
  if (!token) {
    errorRate.add(1);
    return;
  }

  // Test 1: Health Check
  const healthResponse = http.get(`${BASE_URL}/health`);
  check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 500ms': (r) => r.timings.duration < 500,
  });
  errorRate.add(healthResponse.status !== 200 ? 1 : 0);

  sleep(1);

  // Test 2: Get Organizations
  const orgsResponse = http.get(`${BASE_URL}/organizations`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  check(orgsResponse, {
    'organizations status is 200': (r) => r.status === 200,
    'organizations response time < 1s': (r) => r.timings.duration < 1000,
  });
  errorRate.add(orgsResponse.status !== 200 ? 1 : 0);

  sleep(1);

  // Test 3: Create Organization (10% of requests)
  if (Math.random() < 0.1) {
    const org = createTestOrganization(token);
    check(org !== null, {
      'organization created successfully': (r) => r === true,
    });
    errorRate.add(org === null ? 1 : 0);
    
    if (org) {
      // Test 4: Create Manual in new organization
      const manual = createTestManual(token, org.id);
      check(manual !== null, {
        'manual created successfully': (r) => r === true,
      });
      errorRate.add(manual === null ? 1 : 0);
    }
  }

  sleep(1);

  // Test 5: Search Query
  const searchQuery = {
    query: 'emergency procedures',
    filters: {},
    limit: 5,
  };

  const searchResponse = http.post(`${BASE_URL}/search/ask`, JSON.stringify(searchQuery), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  check(searchResponse, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 3s': (r) => r.timings.duration < 3000,
    'search returns results': (r) => {
      const body = JSON.parse(r.body);
      return body.answer && body.citations;
    },
  });
  errorRate.add(searchResponse.status !== 200 ? 1 : 0);

  sleep(1);

  // Test 6: Get Manuals
  const manualsResponse = http.get(`${BASE_URL}/manuals`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  check(manualsResponse, {
    'manuals status is 200': (r) => r.status === 200,
    'manuals response time < 2s': (r) => r.timings.duration < 2000,
  });
  errorRate.add(manualsResponse.status !== 200 ? 1 : 0);

  sleep(1);

  // Test 7: WebSocket Connection (simulate with HTTP)
  const wsResponse = http.get(`${BASE_URL}/notifications/health`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  check(wsResponse, {
    'websocket health status is 200': (r) => r.status === 200,
    'websocket health response time < 1s': (r) => r.timings.duration < 1000,
  });
  errorRate.add(wsResponse.status !== 200 ? 1 : 0);

  sleep(1);
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: `
=== Load Test Results ===
Duration: ${data.metrics.iteration_duration.values.avg.toFixed(2)}ms avg
Requests: ${data.metrics.http_reqs.values.count} total
Errors: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)}%
P95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
P99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms
Data Sent: ${(data.metrics.data_sent.values.count / 1024).toFixed(2)} KB
Data Received: ${(data.metrics.data_received.values.count / 1024).toFixed(2)} KB
========================
    `,
  };
}
