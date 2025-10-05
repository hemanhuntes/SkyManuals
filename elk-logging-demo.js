#!/usr/bin/env node

/**
 * ELK Stack Logging Demo för SkyManuals
 * Simulerar loggar som skulle skickas till Elasticsearch via Logstash
 */

const http = require('http');

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

// Simulerad Elasticsearch endpoint (mock)
const ELASTICSEARCH_ENDPOINT = 'http://localhost:9200';

// Logstash pipeline konfiguration
const LOGSTASH_CONFIG = `
input {
  http {
    port => 5044
    codec => "json"
  }
  
  beats {
    port => 5045
  }
}

filter {
  if [service] == "skymanuals-api" {
    # Parse aviation-specific fields
    grok {
      match => { "message" => "%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{WORD:service} %{GREEDYDATA:message}" }
    }
    
    # Parse compliance events
    if [event_type] == "compliance" {
      mutate {
        add_field => { "compliance_level" => "%{compliance_level}" }
        add_field => { "regulation_framework" => "%{regulation_framework}" }
      }
    }
    
    # Parse audit events
    if [event_type] == "audit" {
      mutate {
        add_field => { "audit_action" => "%{audit_action}" }
        add_field => { "entity_type" => "%{entity_type}" }
        add_field => { "user_id" => "%{user_id}" }
        add_field => { "organization_id" => "%{organization_id}" }
      }
    }
    
    # Parse search analytics
    if [event_type] == "search" {
      mutate {
        add_field => { "search_query" => "%{search_query}" }
        add_field => { "search_time_ms" => "%{search_time_ms}" }
        add_field => { "result_count" => "%{result_count}" }
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["${ELASTICSEARCH_ENDPOINT}"]
    index => "skymanuals-logs-%{+YYYY.MM.dd}"
    template_name => "skymanuals"
    template_pattern => "skymanuals-*"
    template => "/usr/share/logstash/templates/skymanuals-template.json"
  }
  
  # Send compliance alerts to Slack
  if [compliance_level] == "CRITICAL" {
    http {
      url => "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
      http_method => "post"
      format => "json"
      mapping => {
        "text" => "🚨 CRITICAL Compliance Alert: %{message}"
        "channel" => "#compliance-alerts"
      }
    }
  }
}
`;

// Simulerade loggar för olika scenarier
const SAMPLE_LOGS = [
  // API Request logs
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'api_request',
    method: 'POST',
    endpoint: '/api/search/ask',
    user_id: 'user-123',
    organization_id: 'org-1',
    response_time_ms: 245,
    status_code: 200,
    message: 'AI search request processed successfully',
    search_query: 'emergency procedures for engine failure',
    result_count: 3,
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
  },
  
  // Audit logs
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'audit',
    audit_action: 'MANUAL_CREATED',
    entity_type: 'MANUAL',
    entity_id: 'manual-456',
    user_id: 'user-123',
    organization_id: 'org-1',
    message: 'New manual created: Boeing 737-800 Operations Manual',
    compliance_metadata: {
      regulatory_framework: 'EASA',
      certification_level: 'PART_25',
      retention_period_days: 2555
    },
    ip_address: '192.168.1.100'
  },
  
  // Workflow logs
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'workflow',
    workflow_id: 'workflow-789',
    manual_id: 'manual-456',
    action: 'WORKFLOW_TRANSITION',
    from_stage: 'DRAFT',
    to_stage: 'IN_REVIEW',
    user_id: 'user-123',
    organization_id: 'org-1',
    message: 'Workflow transitioned from DRAFT to IN_REVIEW',
    transition_time_ms: 89
  },
  
  // Compliance logs
  {
    timestamp: new Date().toISOString(),
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
  
  // Error logs
  {
    timestamp: new Date().toISOString(),
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
    stack_trace: 'ValidationError: File size exceeds maximum limit\\n    at ManualController.uploadManual (/app/src/manuals/manuals.controller.ts:45:12)',
    ip_address: '192.168.1.101'
  },
  
  // Security logs
  {
    timestamp: new Date().toISOString(),
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
  },
  
  // Performance logs
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'performance',
    metric: 'database_query',
    query_type: 'SELECT',
    table: 'manuals',
    execution_time_ms: 156,
    rows_returned: 25,
    message: 'Database query performance within acceptable range'
  },
  
  // WebSocket logs
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'websocket',
    action: 'CONNECTION_ESTABLISHED',
    user_id: 'user-789',
    organization_id: 'org-3',
    connection_id: 'ws-connection-abc123',
    message: 'WebSocket connection established for real-time notifications'
  },
  
  // Task management logs
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'task',
    task_id: 'task-101',
    action: 'TASK_COMPLETED',
    assigned_to: 'user-456',
    completed_by: 'user-456',
    task_type: 'APPROVAL_REVIEW',
    priority: 'HIGH',
    completion_time_ms: 2340,
    rating: 4,
    message: 'Approval task completed successfully'
  },
  
  // System health logs
  {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    service: 'skymanuals-api',
    event_type: 'system_health',
    metric: 'memory_usage',
    value: 68.5,
    unit: 'percentage',
    threshold: 80,
    status: 'HEALTHY',
    message: 'Memory usage within normal range'
  }
];

// Kibana Dashboard konfiguration
const KIBANA_DASHBOARD = {
  "version": "7.17.0",
  "objects": [
    {
      "id": "skymanuals-overview",
      "type": "dashboard",
      "attributes": {
        "title": "SkyManuals System Overview",
        "panelsJSON": JSON.stringify([
          {
            "version": "7.17.0",
            "gridData": {
              "x": 0,
              "y": 0,
              "w": 24,
              "h": 15,
              "i": "1"
            },
            "panelIndex": "1",
            "embeddableConfig": {},
            "panelRefName": "panel_1"
          }
        ]),
        "timeRestore": false,
        "description": "Overview of SkyManuals system performance and health"
      }
    }
  ]
};

function displayLogstashConfig() {
  log('\n🔧 Logstash Pipeline Configuration', 'cyan');
  log('=' .repeat(60), 'bright');
  console.log(LOGSTASH_CONFIG);
}

function displaySampleLogs() {
  log('\n📊 Sample ELK Logs för SkyManuals', 'cyan');
  log('=' .repeat(60), 'bright');
  
  SAMPLE_LOGS.forEach((logEntry, index) => {
    const levelColor = logEntry.level === 'ERROR' ? 'red' : 
                      logEntry.level === 'WARN' ? 'yellow' : 'green';
    
    log(`\n${index + 1}. ${logEntry.event_type.toUpperCase()} - ${logEntry.level}`, levelColor);
    log(`   📅 ${logEntry.timestamp}`, 'blue');
    log(`   🏷️  Service: ${logEntry.service}`, 'blue');
    log(`   📝 Message: ${logEntry.message}`, 'blue');
    
    if (logEntry.user_id) {
      log(`   👤 User: ${logEntry.user_id}`, 'magenta');
    }
    if (logEntry.organization_id) {
      log(`   🏢 Organization: ${logEntry.organization_id}`, 'magenta');
    }
    if (logEntry.response_time_ms) {
      log(`   ⏱️  Response Time: ${logEntry.response_time_ms}ms`, 'yellow');
    }
    if (logEntry.compliance_level) {
      log(`   ⚖️  Compliance Level: ${logEntry.compliance_level}`, 'yellow');
    }
    if (logEntry.error_type) {
      log(`   ❌ Error Type: ${logEntry.error_type}`, 'red');
    }
  });
}

function displayKibanaQueries() {
  log('\n🔍 Kibana Query Examples', 'cyan');
  log('=' .repeat(60), 'bright');
  
  const queries = [
    {
      title: 'Find all compliance alerts',
      query: 'event_type:"compliance" AND compliance_level:"CRITICAL"',
      description: 'Hitta alla kritiska compliance-alarmer'
    },
    {
      title: 'API performance issues',
      query: 'event_type:"api_request" AND response_time_ms:>1000',
      description: 'API requests som tar längre än 1 sekund'
    },
    {
      title: 'Failed login attempts',
      query: 'event_type:"security" AND security_event:"FAILED_LOGIN_ATTEMPT"',
      description: 'Misslyckade inloggningsförsök'
    },
    {
      title: 'Workflow transitions today',
      query: 'event_type:"workflow" AND @timestamp:[now-1d TO now]',
      description: 'Workflow-transitioner från idag'
    },
    {
      title: 'User activity by organization',
      query: 'organization_id:"org-1" AND user_id:*',
      description: 'Användaraktivitet för organisation 1'
    },
    {
      title: 'Search analytics',
      query: 'event_type:"api_request" AND endpoint:"/api/search/ask"',
      description: 'AI search-användning och prestanda'
    }
  ];
  
  queries.forEach((query, index) => {
    log(`\n${index + 1}. ${query.title}`, 'green');
    log(`   🔍 Query: ${query.query}`, 'blue');
    log(`   📝 Description: ${query.description}`, 'yellow');
  });
}

function displayElasticsearchIndices() {
  log('\n🗂️  Elasticsearch Indices Structure', 'cyan');
  log('=' .repeat(60), 'bright');
  
  const indices = [
    {
      name: 'skymanuals-logs-2024.10.05',
      type: 'Daily log index',
      mapping: {
        'timestamp': 'date',
        'level': 'keyword',
        'service': 'keyword',
        'event_type': 'keyword',
        'user_id': 'keyword',
        'organization_id': 'keyword',
        'message': 'text',
        'response_time_ms': 'integer',
        'compliance_level': 'keyword',
        'audit_action': 'keyword',
        'error_type': 'keyword'
      }
    },
    {
      name: 'skymanuals-audit-2024.10.05',
      type: 'Audit log index',
      mapping: {
        'timestamp': 'date',
        'audit_action': 'keyword',
        'entity_type': 'keyword',
        'entity_id': 'keyword',
        'user_id': 'keyword',
        'organization_id': 'keyword',
        'compliance_metadata': 'object',
        'ip_address': 'ip'
      }
    },
    {
      name: 'skymanuals-compliance-2024.10.05',
      type: 'Compliance index',
      mapping: {
        'timestamp': 'date',
        'compliance_level': 'keyword',
        'regulation_framework': 'keyword',
        'regulation_code': 'keyword',
        'compliance_status': 'keyword',
        'review_deadline': 'date',
        'manual_id': 'keyword'
      }
    }
  ];
  
  indices.forEach((index, i) => {
    log(`\n${i + 1}. ${index.name}`, 'green');
    log(`   📁 Type: ${index.type}`, 'blue');
    log(`   🗺️  Mapping:`, 'blue');
    Object.entries(index.mapping).forEach(([field, type]) => {
      log(`      - ${field}: ${type}`, 'yellow');
    });
  });
}

function simulateRealTimeLogging() {
  log('\n📡 Simulating Real-time Logging', 'cyan');
  log('=' .repeat(60), 'bright');
  
  let logCount = 0;
  const maxLogs = 10;
  
  const interval = setInterval(() => {
    if (logCount >= maxLogs) {
      clearInterval(interval);
      log('\n✅ Real-time logging simulation completed', 'green');
      return;
    }
    
    const randomLog = SAMPLE_LOGS[Math.floor(Math.random() * SAMPLE_LOGS.length)];
    const timestamp = new Date().toISOString();
    
    // Simulate sending to Elasticsearch
    const logEntry = {
      ...randomLog,
      timestamp: timestamp,
      '@timestamp': timestamp,
      '_index': `skymanuals-logs-${timestamp.split('T')[0].replace(/-/g, '.')}`
    };
    
    const levelColor = logEntry.level === 'ERROR' ? 'red' : 
                      logEntry.level === 'WARN' ? 'yellow' : 'green';
    
    log(`[${timestamp}] ${logEntry.level} ${logEntry.service}: ${logEntry.message}`, levelColor);
    
    // Simulate Elasticsearch response
    log(`   📤 Sent to Elasticsearch index: ${logEntry._index}`, 'blue');
    
    logCount++;
  }, 1000);
}

function displayCostEstimate() {
  log('\n💰 ELK Stack Cost Estimate', 'cyan');
  log('=' .repeat(60), 'bright');
  
  const costs = [
    {
      service: 'Elasticsearch (t3.medium.elasticsearch)',
      instances: 2,
      cost_per_instance: 60,
      monthly_cost: 120
    },
    {
      service: 'Logstash (ECS Fargate)',
      instances: 1,
      cost_per_instance: 25,
      monthly_cost: 25
    },
    {
      service: 'Kibana (included with Elasticsearch)',
      instances: 1,
      cost_per_instance: 0,
      monthly_cost: 0
    },
    {
      service: 'Storage (100GB)',
      instances: 1,
      cost_per_instance: 10,
      monthly_cost: 10
    }
  ];
  
  let totalCost = 0;
  
  costs.forEach(cost => {
    log(`📊 ${cost.service}: $${cost.monthly_cost}/month`, 'blue');
    totalCost += cost.monthly_cost;
  });
  
  log(`\n💵 Total ELK Stack Cost: $${totalCost}/month`, 'green');
  log(`📈 Estimated log volume: 50,000 logs/day`, 'yellow');
  log(`🗄️  Retention period: 30 days`, 'yellow');
}

// Main function
function main() {
  log('🔍 SkyManuals ELK Stack Logging Demo', 'bright');
  log('=' .repeat(60), 'bright');
  
  displayLogstashConfig();
  displaySampleLogs();
  displayKibanaQueries();
  displayElasticsearchIndices();
  displayCostEstimate();
  
  // Ask user if they want to see real-time simulation
  log('\n🎮 Would you like to see real-time logging simulation?', 'cyan');
  log('Press Ctrl+C to stop the simulation at any time.', 'yellow');
  
  setTimeout(() => {
    simulateRealTimeLogging();
  }, 2000);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n\n👋 ELK logging demo completed!', 'green');
  log('📚 For production setup, see: docs/AWS-INFRASTRUCTURE.md', 'blue');
  process.exit(0);
});

// Run the demo
main();
