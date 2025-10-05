# SkyManuals Testing Guide

## 🚀 Quick Start

### 1. Setup Test Environment
```bash
# Navigate to API directory
cd apps/api

# Copy environment template
cp env.example .env

# Install dependencies
npm install

# Setup test services (PostgreSQL + Redis)
docker-compose -f ../../docker-compose.test.yml up -d

# Setup test database
npx prisma db push
```

### 2. Run Tests

#### Unit Tests
```bash
npm run test:unit
```

#### Integration Tests
```bash
npm run test:integration
```

#### End-to-End Tests
```bash
npm run test:e2e
```

#### All Tests with Coverage
```bash
npm run test:coverage
```

#### Watch Mode (Development)
```bash
npm run test:watch
```

## 📋 Test Structure

### Unit Tests (`test/unit/`)
- **notification.gateway.spec.ts** - WebSocket Gateway functionality
- **workflow-state-machine.spec.ts** - Workflow business logic
- **search.service.spec.ts** - Search and AI functionality

### Integration Tests (`test/integration/`)
- **app.e2e-spec.ts** - Complete API flow testing
- **websocket.e2e-spec.ts** - Real-time WebSocket testing

## 🧪 Test Categories

### 1. Authentication & Authorization
- User login/logout
- JWT token validation
- Organization-based access control
- Role-based permissions

### 2. Manual Management
- Create/update/delete manuals
- Chapter and section management
- Content validation
- Version control

### 3. Workflow & Approvals
- Workflow state transitions
- Task creation and assignment
- Approval processes
- Business rule validation

### 4. Search & AI
- Semantic search functionality
- OpenAI integration
- Citation generation
- Search analytics

### 5. Real-time Features
- WebSocket connections
- Live notifications
- Multi-user scenarios
- Connection management

### 6. Compliance & Audit
- Audit logging
- Compliance checking
- Regulation matching
- Impact analysis

## 🔧 Test Configuration

### Environment Variables
```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/skymanuals_test"
TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/skymanuals_test"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6380

# JWT
JWT_SECRET=test-jwt-secret

# OpenAI (for testing)
OPENAI_API_KEY=test-openai-key
```

### Test Services
- **PostgreSQL**: `localhost:5433` (test database)
- **Redis**: `localhost:6380` (test cache)
- **API**: `localhost:3001` (test server)

## 📊 Test Metrics

### Coverage Targets
- **Unit Tests**: >90% line coverage
- **Integration Tests**: >80% API endpoint coverage
- **E2E Tests**: >70% user journey coverage

### Performance Targets
- **API Response Time**: <2s (95th percentile)
- **WebSocket Latency**: <100ms
- **Database Queries**: <500ms
- **Search Response**: <3s

## 🐛 Debugging Tests

### Common Issues

#### Database Connection Errors
```bash
# Check if PostgreSQL is running
docker-compose -f ../../docker-compose.test.yml ps

# Restart services
docker-compose -f ../../docker-compose.test.yml restart
```

#### Test Timeouts
```bash
# Increase timeout in jest.config.js
testTimeout: 60000
```

#### WebSocket Connection Issues
```bash
# Check if API server is running
curl http://localhost:3001/health

# Check WebSocket health
curl http://localhost:3001/notifications/health
```

### Debug Mode
```bash
# Run specific test with debug output
npm run test:unit -- --verbose notification.gateway.spec.ts

# Run with coverage and debug
npm run test:coverage -- --verbose
```

## 🚀 Load Testing

### Using k6
```bash
# Install k6
brew install k6  # macOS
# or download from https://k6.io/

# Run load test
k6 run tests/load/load-test.js
```

### Load Test Scenarios
1. **Normal Load**: 10-20 concurrent users
2. **Peak Load**: 50-100 concurrent users
3. **Stress Test**: 200+ concurrent users
4. **WebSocket Load**: 500+ concurrent connections

## 📈 Test Reports

### Coverage Reports
- **Location**: `apps/api/coverage/lcov-report/index.html`
- **Command**: `npm run test:coverage`
- **Format**: HTML + JSON

### Load Test Reports
- **Location**: `load-test-results.json`
- **Command**: `k6 run tests/load/load-test.js`
- **Format**: JSON + Console output

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg15
        env:
          POSTGRES_PASSWORD: password
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd apps/api && npm install
      - run: cd apps/api && npm run test:coverage
```

## 📝 Writing New Tests

### Unit Test Template
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { YourService } from '../src/your.service';

describe('YourService', () => {
  let service: YourService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [YourService],
    }).compile();

    service = module.get<YourService>(YourService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should perform expected behavior', async () => {
    // Arrange
    const input = 'test input';
    
    // Act
    const result = await service.method(input);
    
    // Assert
    expect(result).toBeDefined();
    expect(result).toMatchObject({
      expectedProperty: 'expectedValue',
    });
  });
});
```

### Integration Test Template
```typescript
import { testEnv } from '../setup';

describe('Your Feature Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    await testEnv.setup();
    app = testEnv.getApp();
    prisma = testEnv.getPrisma();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('should perform complete workflow', async () => {
    // Test complete user journey
    const response = await app.getHttpServer()
      .post('/api/your-endpoint')
      .send({ testData: 'value' })
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      status: 'success',
    });
  });
});
```

## 🎯 Best Practices

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Keep tests independent and isolated

### Test Data
- Use factories for test data creation
- Clean up after each test
- Use realistic test data
- Avoid hardcoded values

### Performance
- Mock external services
- Use database transactions for cleanup
- Avoid long-running operations in tests
- Set appropriate timeouts

### Maintenance
- Update tests when features change
- Remove obsolete tests
- Keep test documentation current
- Regular test review and refactoring
