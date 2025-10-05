#!/usr/bin/env node

/**
 * SkyManuals Integration Test Simulation
 * Simulerar realistiska användarscenarier mot vår API
 */

const http = require('http');

const API_BASE = 'http://localhost:3001';
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(body)
          };
          resolve(result);
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testHealthCheck() {
  log('\n🔍 Testing Health Check...', 'cyan');
  
  try {
    const response = await makeRequest('GET', '/health');
    if (response.status === 200) {
      log('✅ Health check passed', 'green');
      return true;
    } else {
      log(`❌ Health check failed: ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Health check error: ${error.message}`, 'red');
    return false;
  }
}

async function testManualManagement() {
  log('\n📚 Testing Manual Management...', 'cyan');
  
  try {
    // Get all manuals
    const response = await makeRequest('GET', '/api/manuals');
    if (response.status === 200 && response.body.manuals) {
      log(`✅ Retrieved ${response.body.manuals.length} manuals`, 'green');
      
      // Display manuals
      response.body.manuals.forEach((manual, index) => {
        log(`   ${index + 1}. ${manual.title} (${manual.status}) - v${manual.version}`, 'blue');
      });
      
      return true;
    } else {
      log('❌ Failed to retrieve manuals', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Manual management error: ${error.message}`, 'red');
    return false;
  }
}

async function testAISearch() {
  log('\n🤖 Testing AI Search...', 'cyan');
  
  const searchQueries = [
    'What are the emergency procedures for engine failure?',
    'How do I perform pre-flight checks?',
    'What are the fuel system requirements?'
  ];
  
  try {
    for (const query of searchQueries) {
      log(`   Searching: "${query}"`, 'yellow');
      
      const response = await makeRequest('POST', '/api/search/ask', {
        query: query,
        searchType: 'AI'
      });
      
      if (response.status === 200 && response.body.answer) {
        log(`   ✅ Found ${response.body.totalResults} results (${response.body.searchTimeMs}ms)`, 'green');
        log(`   📝 Answer: ${response.body.answer.substring(0, 100)}...`, 'blue');
        
        if (response.body.citations && response.body.citations.length > 0) {
          log(`   📚 Citations: ${response.body.citations.length} sources`, 'magenta');
        }
      } else {
        log(`   ❌ Search failed for: "${query}"`, 'red');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    log(`❌ AI search error: ${error.message}`, 'red');
    return false;
  }
}

async function testWorkflowManagement() {
  log('\n⚙️ Testing Workflow Management...', 'cyan');
  
  try {
    // Get workflows
    const response = await makeRequest('GET', '/api/workflows');
    if (response.status === 200 && response.body.workflows) {
      log(`✅ Retrieved ${response.body.workflows.length} workflows`, 'green');
      
      response.body.workflows.forEach((workflow, index) => {
        log(`   ${index + 1}. Workflow ${workflow.id}: ${workflow.currentStage} (${workflow.status})`, 'blue');
      });
      
      return true;
    } else {
      log('❌ Failed to retrieve workflows', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Workflow management error: ${error.message}`, 'red');
    return false;
  }
}

async function testTaskManagement() {
  log('\n📋 Testing Task Management...', 'cyan');
  
  try {
    // Get tasks
    const response = await makeRequest('GET', '/api/tasks');
    if (response.status === 200 && response.body.tasks) {
      log(`✅ Retrieved ${response.body.tasks.length} tasks`, 'green');
      
      response.body.tasks.forEach((task, index) => {
        const status = task.status === 'PENDING' ? '⏳' : '🔄';
        log(`   ${index + 1}. ${status} ${task.title} (${task.priority}) - Due: ${task.dueDate.split('T')[0]}`, 'blue');
      });
      
      return true;
    } else {
      log('❌ Failed to retrieve tasks', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Task management error: ${error.message}`, 'red');
    return false;
  }
}

async function testWebSocketHealth() {
  log('\n🔌 Testing WebSocket Health...', 'cyan');
  
  try {
    const response = await makeRequest('GET', '/api/notifications/health');
    if (response.status === 200 && response.body.status === 'healthy') {
      log('✅ WebSocket service is healthy', 'green');
      log(`   📊 Connections: ${response.body.connections}`, 'blue');
      log(`   ⏱️  Uptime: ${Math.round(response.body.uptime)}s`, 'blue');
      return true;
    } else {
      log('❌ WebSocket health check failed', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ WebSocket health error: ${error.message}`, 'red');
    return false;
  }
}

async function simulateUserScenario() {
  log('\n🎭 Simulating Complete User Scenario...', 'cyan');
  
  try {
    // Scenario: Pilot searches for emergency procedures
    log('   👨‍✈️  Pilot needs emergency procedures...', 'yellow');
    
    const searchResponse = await makeRequest('POST', '/api/search/ask', {
      query: 'emergency landing procedures',
      searchType: 'AI'
    });
    
    if (searchResponse.status === 200) {
      log('   ✅ Found emergency procedures', 'green');
      log(`   📖 ${searchResponse.body.totalResults} relevant sections found`, 'blue');
    }
    
    // Scenario: Author checks workflow status
    log('   👨‍💼 Author checks manual approval status...', 'yellow');
    
    const workflowResponse = await makeRequest('GET', '/api/workflows');
    if (workflowResponse.status === 200) {
      const pendingWorkflows = workflowResponse.body.workflows.filter(w => w.status === 'IN_PROGRESS');
      log(`   ✅ ${pendingWorkflows.length} workflows in progress`, 'green');
    }
    
    // Scenario: Reviewer checks assigned tasks
    log('   👨‍🔬 Reviewer checks assigned tasks...', 'yellow');
    
    const taskResponse = await makeRequest('GET', '/api/tasks');
    if (taskResponse.status === 200) {
      const pendingTasks = taskResponse.body.tasks.filter(t => t.status === 'PENDING');
      log(`   ✅ ${pendingTasks.length} tasks pending review`, 'green');
    }
    
    return true;
  } catch (error) {
    log(`❌ User scenario simulation error: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('🚀 Starting SkyManuals Integration Test Simulation', 'bright');
  log('=' .repeat(60), 'bright');
  
  const startTime = Date.now();
  const results = [];
  
  // Run all tests
  results.push(await testHealthCheck());
  results.push(await testManualManagement());
  results.push(await testAISearch());
  results.push(await testWorkflowManagement());
  results.push(await testTaskManagement());
  results.push(await testWebSocketHealth());
  results.push(await simulateUserScenario());
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  // Summary
  log('\n' + '=' .repeat(60), 'bright');
  log('📊 Test Results Summary', 'bright');
  log('=' .repeat(60), 'bright');
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  log(`✅ Tests Passed: ${passed}/${total}`, passed === total ? 'green' : 'yellow');
  log(`⏱️  Total Duration: ${duration}ms`, 'blue');
  
  if (passed === total) {
    log('\n🎉 All tests passed! System is ready for use.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Check the output above for details.', 'yellow');
  }
  
  log('\n🔗 Available API Endpoints:', 'cyan');
  log('   GET  /health - Health check', 'blue');
  log('   GET  /api/status - API status', 'blue');
  log('   GET  /api/manuals - List manuals', 'blue');
  log('   POST /api/search/ask - AI search', 'blue');
  log('   GET  /api/workflows - List workflows', 'blue');
  log('   GET  /api/tasks - List tasks', 'blue');
  log('   GET  /api/notifications/health - WebSocket health', 'blue');
}

// Run the tests
runAllTests().catch(error => {
  log(`💥 Test suite crashed: ${error.message}`, 'red');
  process.exit(1);
});
