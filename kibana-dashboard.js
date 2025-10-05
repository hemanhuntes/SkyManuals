#!/usr/bin/env node

/**
 * Kibana Dashboard Simulation för SkyManuals
 * Interaktiv dashboard för att visa ELK logs
 */

const readline = require('readline');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Simulerade loggar från vår test session
const LOGS = [
  {
    timestamp: '2024-10-05T17:10:21.363Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'api_request',
    method: 'GET',
    endpoint: '/api/status',
    response_time_ms: 45,
    status_code: 200,
    message: 'API status endpoint accessed',
    ip_address: '127.0.0.1',
    user_agent: 'curl/7.68.0'
  },
  {
    timestamp: '2024-10-05T17:10:40.441Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'api_request',
    method: 'GET',
    endpoint: '/api/manuals',
    response_time_ms: 123,
    status_code: 200,
    message: 'Manual list retrieved successfully',
    result_count: 3,
    organization_id: 'org-1'
  },
  {
    timestamp: '2024-10-05T17:10:54.111Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'ai_search',
    method: 'POST',
    endpoint: '/api/search/ask',
    search_query: 'What are the emergency procedures for engine failure?',
    search_time_ms: 260,
    result_count: 2,
    ai_confidence: 0.95,
    search_type: 'SEMANTIC',
    message: 'AI search query processed successfully',
    organization_id: 'org-1'
  },
  {
    timestamp: '2024-10-05T17:10:54.111Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'workflow',
    workflow_id: 'workflow-1',
    action: 'WORKFLOW_STATUS_CHECK',
    current_stage: 'REVIEW',
    status: 'IN_PROGRESS',
    message: 'Workflow status checked',
    organization_id: 'org-1'
  },
  {
    timestamp: '2024-10-05T17:11:03.039Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'task_management',
    task_id: 'task-1',
    action: 'TASK_LIST_RETRIEVED',
    task_count: 2,
    pending_tasks: 1,
    message: 'Task list retrieved for user',
    organization_id: 'org-1'
  },
  {
    timestamp: '2024-10-05T17:11:09.343Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'websocket_health',
    websocket_status: 'healthy',
    connections: 0,
    uptime_seconds: 1729,
    message: 'WebSocket health check performed'
  },
  {
    timestamp: '2024-10-05T17:11:15.000Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'user_scenario',
    scenario: 'pilot_emergency_search',
    user_role: 'pilot',
    organization_id: 'org-1',
    search_query: 'emergency landing procedures',
    result_count: 2,
    message: 'Pilot searched for emergency procedures'
  },
  {
    timestamp: '2024-10-05T17:11:20.000Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'user_scenario',
    scenario: 'author_workflow_check',
    user_role: 'author',
    organization_id: 'org-1',
    workflows_in_progress: 1,
    message: 'Author checked workflow status'
  },
  {
    timestamp: '2024-10-05T17:11:25.000Z',
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'user_scenario',
    scenario: 'reviewer_task_check',
    user_role: 'reviewer',
    organization_id: 'org-1',
    pending_tasks: 1,
    message: 'Reviewer checked assigned tasks'
  },
  {
    timestamp: '2024-10-05T17:12:00.000Z',
    level: 'WARN',
    service: 'skymanuals-api',
    event_type: 'compliance',
    compliance_level: 'MEDIUM',
    regulation_framework: 'EASA',
    regulation_code: 'CS-25.1309',
    manual_id: 'manual-456',
    compliance_status: 'PENDING_REVIEW',
    review_deadline: '2024-06-01',
    message: 'Compliance review deadline approaching',
    days_remaining: 45
  },
  {
    timestamp: '2024-10-05T17:12:30.000Z',
    level: 'ERROR',
    service: 'skymanuals-api',
    event_type: 'error',
    error_type: 'VALIDATION_ERROR',
    endpoint: '/api/manuals/upload',
    user_id: 'user-456',
    organization_id: 'org-2',
    error_message: 'File size exceeds maximum limit of 10MB',
    error_details: {
      file_size: 15728640,
      max_size: 10485760,
      file_name: 'large-manual.pdf'
    },
    ip_address: '192.168.1.101'
  },
  {
    timestamp: '2024-10-05T17:13:00.000Z',
    level: 'WARN',
    service: 'skymanuals-api',
    event_type: 'security',
    security_event: 'FAILED_LOGIN_ATTEMPT',
    user_id: 'unknown',
    ip_address: '203.0.113.42',
    user_agent: 'curl/7.68.0',
    attempt_count: 5,
    message: 'Multiple failed login attempts detected',
    blocked: true
  }
];

function clearScreen() {
  console.clear();
}

function displayHeader() {
  log('🔍 Kibana Dashboard - SkyManuals Logs', 'bright');
  log('=' .repeat(80), 'bright');
  log('📊 Index: skymanuals-logs-* | 📅 Time Range: Last 1 hour | 🔍 Total Documents: ' + LOGS.length, 'cyan');
  log('=' .repeat(80), 'bright');
}

function displayOverview() {
  log('\n📈 Overview Dashboard', 'cyan');
  log('─'.repeat(40), 'blue');
  
  // Calculate metrics
  const totalLogs = LOGS.length;
  const errorLogs = LOGS.filter(log => log.level === 'ERROR').length;
  const warnLogs = LOGS.filter(log => log.level === 'WARN').length;
  const infoLogs = LOGS.filter(log => log.level === 'INFO').length;
  
  const apiRequests = LOGS.filter(log => log.event_type === 'api_request').length;
  const aiSearches = LOGS.filter(log => log.event_type === 'ai_search').length;
  const userScenarios = LOGS.filter(log => log.event_type === 'user_scenario').length;
  
  const avgResponseTime = LOGS
    .filter(log => log.response_time_ms)
    .reduce((sum, log) => sum + log.response_time_ms, 0) / 
    LOGS.filter(log => log.response_time_ms).length;
  
  // Display metrics in a grid
  log('📊 Log Levels:', 'blue');
  log(`   ${colors.bgGreen} INFO: ${infoLogs} ${colors.reset} | ${colors.bgYellow} WARN: ${warnLogs} ${colors.reset} | ${colors.bgRed} ERROR: ${errorLogs} ${colors.reset}`);
  
  log('\n🎯 Event Types:', 'blue');
  log(`   🌐 API Requests: ${apiRequests} | 🤖 AI Searches: ${aiSearches} | 🎭 User Scenarios: ${userScenarios}`);
  
  log('\n⏱️  Performance:', 'blue');
  log(`   📊 Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
  
  log('\n🏢 Organizations:', 'blue');
  const orgs = [...new Set(LOGS.filter(log => log.organization_id).map(log => log.organization_id))];
  log(`   📋 Active Organizations: ${orgs.join(', ')}`);
}

function displayLogTable(filteredLogs = LOGS) {
  log('\n📋 Discover - Log Entries', 'cyan');
  log('─'.repeat(40), 'blue');
  
  if (filteredLogs.length === 0) {
    log('   No logs found matching your criteria', 'yellow');
    return;
  }
  
  log('   Time                 | Level | Event Type     | Message', 'blue');
  log('   ' + '─'.repeat(80), 'blue');
  
  filteredLogs.slice(0, 10).forEach(logEntry => {
    const time = logEntry.timestamp.split('T')[1].split('.')[0];
    const level = logEntry.level.padEnd(5);
    const eventType = (logEntry.event_type || '').padEnd(13);
    const message = logEntry.message.substring(0, 40);
    
    const levelColor = logEntry.level === 'ERROR' ? 'red' : 
                      logEntry.level === 'WARN' ? 'yellow' : 'green';
    
    log(`   ${time} | ${colors[levelColor]}${level}${colors.reset} | ${eventType} | ${message}`, 'reset');
  });
  
  if (filteredLogs.length > 10) {
    log(`   ... and ${filteredLogs.length - 10} more entries`, 'yellow');
  }
}

function displaySearchQuery(query, results) {
  log('\n🔍 Search Results', 'cyan');
  log('─'.repeat(40), 'blue');
  log(`   Query: ${query}`, 'blue');
  log(`   Results: ${results.length} documents found`, 'green');
  
  if (results.length > 0) {
    log('\n   Top Results:', 'blue');
    results.slice(0, 3).forEach((logEntry, index) => {
      log(`   ${index + 1}. [${logEntry.timestamp}] ${logEntry.level} - ${logEntry.message}`, 'green');
    });
  }
}

function displayFieldStats() {
  log('\n📊 Field Statistics', 'cyan');
  log('─'.repeat(40), 'blue');
  
  const eventTypes = {};
  const levels = {};
  const organizations = {};
  
  LOGS.forEach(logEntry => {
    eventTypes[logEntry.event_type] = (eventTypes[logEntry.event_type] || 0) + 1;
    levels[logEntry.level] = (levels[logEntry.level] || 0) + 1;
    if (logEntry.organization_id) {
      organizations[logEntry.organization_id] = (organizations[logEntry.organization_id] || 0) + 1;
    }
  });
  
  log('📈 Event Types:', 'blue');
  Object.entries(eventTypes)
    .sort(([,a], [,b]) => b - a)
    .forEach(([type, count]) => {
      log(`   ${type}: ${count}`, 'yellow');
    });
  
  log('\n📊 Log Levels:', 'blue');
  Object.entries(levels)
    .sort(([,a], [,b]) => b - a)
    .forEach(([level, count]) => {
      const color = level === 'ERROR' ? 'red' : level === 'WARN' ? 'yellow' : 'green';
      log(`   ${colors[color]}${level}: ${count}${colors.reset}`, 'reset');
    });
  
  log('\n🏢 Organizations:', 'blue');
  Object.entries(organizations)
    .sort(([,a], [,b]) => b - a)
    .forEach(([org, count]) => {
      log(`   ${org}: ${count} events`, 'yellow');
    });
}

function searchLogs(query) {
  const lowerQuery = query.toLowerCase();
  return LOGS.filter(logEntry => 
    logEntry.message.toLowerCase().includes(lowerQuery) ||
    logEntry.event_type.toLowerCase().includes(lowerQuery) ||
    logEntry.level.toLowerCase().includes(lowerQuery) ||
    (logEntry.search_query && logEntry.search_query.toLowerCase().includes(lowerQuery)) ||
    (logEntry.endpoint && logEntry.endpoint.toLowerCase().includes(lowerQuery))
  );
}

function filterLogs(filters) {
  let filtered = LOGS;
  
  if (filters.level) {
    filtered = filtered.filter(log => log.level === filters.level);
  }
  
  if (filters.event_type) {
    filtered = filtered.filter(log => log.event_type === filters.event_type);
  }
  
  if (filters.organization_id) {
    filtered = filtered.filter(log => log.organization_id === filters.organization_id);
  }
  
  if (filters.time_range) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    filtered = filtered.filter(log => new Date(log.timestamp) >= oneHourAgo);
  }
  
  return filtered;
}

function displayMenu() {
  log('\n🎮 Dashboard Controls', 'cyan');
  log('─'.repeat(40), 'blue');
  log('   [1] Search logs', 'blue');
  log('   [2] Filter by level (ERROR/WARN/INFO)', 'blue');
  log('   [3] Filter by event type', 'blue');
  log('   [4] Filter by organization', 'blue');
  log('   [5] Show field statistics', 'blue');
  log('   [6] Show all logs', 'blue');
  log('   [7] Export logs', 'blue');
  log('   [8] Refresh dashboard', 'blue');
  log('   [q] Quit', 'blue');
  log('─'.repeat(40), 'blue');
}

function exportLogs(logs) {
  log('\n📤 Export Options', 'cyan');
  log('─'.repeat(40), 'blue');
  log('   [1] Export as JSON', 'blue');
  log('   [2] Export as CSV', 'blue');
  log('   [3] Export as Kibana query', 'blue');
  
  // Simulate export
  log('\n   📊 Export Summary:', 'green');
  log(`   📋 Total logs: ${logs.length}`);
  log(`   💾 Estimated size: ${(logs.length * 0.5).toFixed(1)}KB`);
  log(`   📁 File: skymanuals-logs-${new Date().toISOString().split('T')[0]}.json`);
}

async function interactiveDashboard() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  let currentLogs = LOGS;
  let currentFilters = {};
  
  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));
  
  while (true) {
    clearScreen();
    displayHeader();
    displayOverview();
    displayLogTable(currentLogs);
    displayMenu();
    
    const choice = await question('\n   Enter your choice: ');
    
    switch (choice.toLowerCase()) {
      case '1':
        const searchTerm = await question('   Enter search term: ');
        const searchResults = searchLogs(searchTerm);
        displaySearchQuery(searchTerm, searchResults);
        currentLogs = searchResults;
        await question('   Press Enter to continue...');
        break;
        
      case '2':
        const level = await question('   Enter level (ERROR/WARN/INFO): ');
        if (['ERROR', 'WARN', 'INFO'].includes(level.toUpperCase())) {
          currentFilters.level = level.toUpperCase();
          currentLogs = filterLogs(currentFilters);
          log(`   ✅ Filtered by level: ${level.toUpperCase()}`, 'green');
        } else {
          log('   ❌ Invalid level', 'red');
        }
        await question('   Press Enter to continue...');
        break;
        
      case '3':
        const eventTypes = [...new Set(LOGS.map(log => log.event_type))];
        log(`   Available event types: ${eventTypes.join(', ')}`, 'blue');
        const eventType = await question('   Enter event type: ');
        if (eventTypes.includes(eventType)) {
          currentFilters.event_type = eventType;
          currentLogs = filterLogs(currentFilters);
          log(`   ✅ Filtered by event type: ${eventType}`, 'green');
        } else {
          log('   ❌ Invalid event type', 'red');
        }
        await question('   Press Enter to continue...');
        break;
        
      case '4':
        const orgs = [...new Set(LOGS.filter(log => log.organization_id).map(log => log.organization_id))];
        log(`   Available organizations: ${orgs.join(', ')}`, 'blue');
        const org = await question('   Enter organization ID: ');
        if (orgs.includes(org)) {
          currentFilters.organization_id = org;
          currentLogs = filterLogs(currentFilters);
          log(`   ✅ Filtered by organization: ${org}`, 'green');
        } else {
          log('   ❌ Invalid organization', 'red');
        }
        await question('   Press Enter to continue...');
        break;
        
      case '5':
        displayFieldStats();
        await question('   Press Enter to continue...');
        break;
        
      case '6':
        currentLogs = LOGS;
        currentFilters = {};
        log('   ✅ Showing all logs', 'green');
        await question('   Press Enter to continue...');
        break;
        
      case '7':
        exportLogs(currentLogs);
        await question('   Press Enter to continue...');
        break;
        
      case '8':
        log('   🔄 Refreshing dashboard...', 'yellow');
        await new Promise(resolve => setTimeout(resolve, 1000));
        break;
        
      case 'q':
        rl.close();
        return;
        
      default:
        log('   ❌ Invalid choice', 'red');
        await question('   Press Enter to continue...');
        break;
    }
  }
}

// Start the interactive dashboard
async function main() {
  try {
    await interactiveDashboard();
  } catch (error) {
    log('\n👋 Dashboard closed. Goodbye!', 'green');
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n\n👋 Kibana dashboard closed!', 'green');
  process.exit(0);
});

main();
