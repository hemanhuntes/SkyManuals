import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const documentUploadTime = new Trend('document_upload_time');
const searchResponseTime = new Trend('search_response_time');
const workflowTransitionTime = new Trend('workflow_transition_time');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 5 },   // Ramp up to 5 users
    { duration: '5m', target: 5 },   // Stay at 5 users
    { duration: '2m', target: 10 },  // Ramp up to 10 users
    { duration: '5m', target: 10 },  // Stay at 10 users
    { duration: '2m', target: 20 },  // Ramp up to 20 users
    { duration: '5m', target: 20 },  // Stay at 20 users
    { duration: '2m', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests must complete below 3s
    http_req_failed: ['rate<0.05'],    // Error rate must be below 5%
    errors: ['rate<0.05'],             // Custom error rate must be below 5%
    document_upload_time: ['p(95)<5000'], // Document uploads under 5s
    search_response_time: ['p(95)<2000'], // Search responses under 2s
    workflow_transition_time: ['p(95)<1000'], // Workflow transitions under 1s
  },
};

// Test data
const BASE_URL = 'http://localhost:3001';
const TEST_ORGANIZATIONS = [
  { id: 'load-test-org-1', name: 'Load Test Airlines 1' },
  { id: 'load-test-org-2', name: 'Load Test Airlines 2' },
  { id: 'load-test-org-3', name: 'Load Test Airlines 3' },
];

// Helper functions
function getRandomOrganization() {
  return TEST_ORGANIZATIONS[Math.floor(Math.random() * TEST_ORGANIZATIONS.length)];
}

function getAuthToken(organizationId) {
  const response = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: `testuser@${organizationId}.com`,
    password: 'testpassword123',
    organizationId: organizationId,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (response.status === 200) {
    const body = JSON.parse(response.body);
    return body.access_token;
  }
  
  return null;
}

function createTestManual(token, organizationId) {
  const manualData = {
    title: `Load Test Manual ${Date.now()}`,
    description: 'Manual created for load testing',
    version: '1.0.0',
    organizationId: organizationId,
  };

  const response = http.post(`${BASE_URL}/manuals`, JSON.stringify(manualData), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  check(response, {
    'manual created successfully': (r) => r.status === 201,
    'manual creation time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(response.status !== 201);

  return response.status === 201 ? JSON.parse(response.body) : null;
}

function simulateDocumentUpload(token, manualId) {
  const startTime = Date.now();
  
  // Simulate PDF upload with FormData
  const formData = {
    file: {
      name: `test-manual-${Date.now()}.pdf`,
      type: 'application/pdf',
      data: 'Mock PDF content for load testing...'.repeat(1000), // Simulate large file
    },
    title: `Load Test Manual ${Date.now()}`,
    description: 'Uploaded during load test',
    manualId: manualId,
  };

  const response = http.post(`${BASE_URL}/manuals/${manualId}/upload`, formData, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const uploadTime = Date.now() - startTime;
  documentUploadTime.add(uploadTime);

  check(response, {
    'document upload successful': (r) => r.status === 201,
    'upload time < 5s': () => uploadTime < 5000,
  });

  errorRate.add(response.status !== 201);

  return response.status === 201 ? JSON.parse(response.body) : null;
}

function performAISearch(token, query) {
  const startTime = Date.now();
  
  const response = http.post(`${BASE_URL}/search/ai`, JSON.stringify({
    query: query,
    searchType: 'SEMANTIC',
    filters: {
      contentTypes: ['CHAPTER', 'SECTION'],
    },
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  const searchTime = Date.now() - startTime;
  searchResponseTime.add(searchTime);

  check(response, {
    'search successful': (r) => r.status === 200,
    'search time < 2s': () => searchTime < 2000,
    'search returns results': (r) => {
      if (r.status === 200) {
        const body = JSON.parse(r.body);
        return body.results && body.results.length > 0;
      }
      return false;
    },
  });

  errorRate.add(response.status !== 200);

  return response.status === 200 ? JSON.parse(response.body) : null;
}

function simulateWorkflowTransition(token, workflowId, newStage) {
  const startTime = Date.now();
  
  const response = http.patch(`${BASE_URL}/workflows/${workflowId}/transition`, JSON.stringify({
    newStage: newStage,
    comment: `Transition to ${newStage} during load test`,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  const transitionTime = Date.now() - startTime;
  workflowTransitionTime.add(transitionTime);

  check(response, {
    'workflow transition successful': (r) => r.status === 200,
    'transition time < 1s': () => transitionTime < 1000,
  });

  errorRate.add(response.status !== 200);

  return response.status === 200 ? JSON.parse(response.body) : null;
}

function createWorkflow(token, manualId) {
  const workflowData = {
    manualId: manualId,
    definitionId: 'standard-approval-process',
    startedBy: 'load-test-user',
  };

  const response = http.post(`${BASE_URL}/workflows`, JSON.stringify(workflowData), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  check(response, {
    'workflow created successfully': (r) => r.status === 201,
  });

  errorRate.add(response.status !== 201);

  return response.status === 201 ? JSON.parse(response.body) : null;
}

function assignTask(token, workflowId) {
  const taskData = {
    workflowId: workflowId,
    title: `Load Test Task ${Date.now()}`,
    description: 'Task created during load test',
    assignedTo: 'load-test-reviewer',
    priority: 'MEDIUM',
  };

  const response = http.post(`${BASE_URL}/tasks`, JSON.stringify(taskData), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  check(response, {
    'task assigned successfully': (r) => r.status === 201,
  });

  errorRate.add(response.status !== 201);

  return response.status === 201 ? JSON.parse(response.body) : null;
}

function completeTask(token, taskId) {
  const completionData = {
    status: 'COMPLETED',
    completionNotes: 'Completed during load test',
    rating: 4,
  };

  const response = http.patch(`${BASE_URL}/tasks/${taskId}/complete`, JSON.stringify(completionData), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  check(response, {
    'task completed successfully': (r) => r.status === 200,
  });

  errorRate.add(response.status !== 200);

  return response.status === 200 ? JSON.parse(response.body) : null;
}

// Main test scenarios
export function setup() {
  console.log('Starting advanced load test setup...');
  
  // Create test organizations and users
  const setupResults = [];
  
  for (const org of TEST_ORGANIZATIONS) {
    const orgResponse = http.post(`${BASE_URL}/organizations`, JSON.stringify({
      id: org.id,
      name: org.name,
      type: 'AIRLINE',
      status: 'ACTIVE',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    if (orgResponse.status === 201) {
      setupResults.push({
        organizationId: org.id,
        status: 'created',
      });
    }
  }

  return setupResults;
}

export default function(data) {
  const org = getRandomOrganization();
  const token = getAuthToken(org.id);

  if (!token) {
    console.error(`Failed to get auth token for organization ${org.id}`);
    return;
  }

  // Scenario 1: Document Management Workflow (40% of users)
  if (Math.random() < 0.4) {
    // Create manual
    const manual = createTestManual(token, org.id);
    if (manual) {
      sleep(1);
      
      // Upload document
      const uploadResult = simulateDocumentUpload(token, manual.id);
      if (uploadResult) {
        sleep(2);
        
        // Create workflow
        const workflow = createWorkflow(token, manual.id);
        if (workflow) {
          sleep(1);
          
          // Assign task
          const task = assignTask(token, workflow.id);
          if (task) {
            sleep(1);
            
            // Complete task
            completeTask(token, task.id);
          }
        }
      }
    }
  }
  
  // Scenario 2: AI Search Operations (30% of users)
  else if (Math.random() < 0.7) {
    const searchQueries = [
      'What are the emergency procedures for engine failure?',
      'How do I perform pre-flight checks?',
      'What are the fuel system requirements?',
      'Emergency landing procedures',
      'Passenger evacuation checklist',
      'Maintenance inspection requirements',
      'Weather minimums for takeoff',
      'Communication procedures with ATC',
    ];

    const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
    const searchResults = performAISearch(token, query);
    
    if (searchResults && searchResults.results.length > 0) {
      sleep(1);
      
      // Simulate clicking on search results
      const randomResult = searchResults.results[Math.floor(Math.random() * searchResults.results.length)];
      const clickResponse = http.post(`${BASE_URL}/search/analytics`, JSON.stringify({
        query: query,
        resultId: randomResult.id,
        action: 'CLICK',
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      check(clickResponse, {
        'search analytics logged': (r) => r.status === 200,
      });
    }
  }
  
  // Scenario 3: Workflow Management (20% of users)
  else if (Math.random() < 0.9) {
    const workflowStages = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED'];
    const randomStage = workflowStages[Math.floor(Math.random() * workflowStages.length)];
    
    // Simulate workflow transition
    const transitionResult = simulateWorkflowTransition(token, 'mock-workflow-id', randomStage);
    
    if (transitionResult) {
      sleep(1);
      
      // Get workflow status
      const statusResponse = http.get(`${BASE_URL}/workflows/mock-workflow-id`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      check(statusResponse, {
        'workflow status retrieved': (r) => r.status === 200,
      });
    }
  }
  
  // Scenario 4: Compliance Monitoring (10% of users)
  else {
    // Get compliance dashboard
    const dashboardResponse = http.get(`${BASE_URL}/compliance/dashboard`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    check(dashboardResponse, {
      'compliance dashboard loaded': (r) => r.status === 200,
      'dashboard response time < 3s': (r) => r.timings.duration < 3000,
    });
    
    errorRate.add(dashboardResponse.status !== 200);
    
    sleep(2);
    
    // Get compliance alerts
    const alertsResponse = http.get(`${BASE_URL}/compliance/alerts`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    check(alertsResponse, {
      'compliance alerts loaded': (r) => r.status === 200,
    });
  }

  // Random sleep between operations
  sleep(Math.random() * 2 + 1);
}

export function teardown(data) {
  console.log('Advanced load test completed');
  console.log(`Tested organizations: ${data.length}`);
}
