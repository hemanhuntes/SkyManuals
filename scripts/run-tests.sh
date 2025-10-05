#!/bin/bash

# SkyManuals Test Runner Script
# This script runs all tests with proper setup and teardown

set -e

echo "🧪 Running SkyManuals Tests..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
TEST_TYPE=${1:-"all"}
COVERAGE=${2:-"false"}

cd apps/api

# Check if test services are running
print_status "Checking test services..."
if ! docker-compose -f ../../docker-compose.test.yml ps postgres-test | grep -q "Up"; then
    print_warning "Test services not running. Starting them..."
    docker-compose -f ../../docker-compose.test.yml up -d postgres-test redis-test
    sleep 10
fi

# Run database setup
print_status "Setting up test database..."
npx prisma db push --schema=./prisma/schema.prisma

# Run tests based on type
case $TEST_TYPE in
    "unit")
        print_status "Running unit tests..."
        npm run test:unit
        ;;
    "integration")
        print_status "Running integration tests..."
        npm run test:integration
        ;;
    "e2e")
        print_status "Running end-to-end tests..."
        npm run test:e2e
        ;;
    "all")
        print_status "Running all tests..."
        if [ "$COVERAGE" = "true" ]; then
            npm run test:coverage
        else
            npm test
        fi
        ;;
    "watch")
        print_status "Running tests in watch mode..."
        npm run test:watch
        ;;
    *)
        print_error "Invalid test type: $TEST_TYPE"
        echo "Usage: $0 [unit|integration|e2e|all|watch] [coverage]"
        exit 1
        ;;
esac

if [ $? -eq 0 ]; then
    print_success "All tests passed! ✅"
else
    print_error "Some tests failed! ❌"
    exit 1
fi

# Generate test report
if [ "$COVERAGE" = "true" ]; then
    print_status "Generating coverage report..."
    if [ -d "coverage" ]; then
        print_success "Coverage report generated in apps/api/coverage/"
        print_status "Open apps/api/coverage/lcov-report/index.html to view detailed coverage"
    fi
fi

print_success "Test run completed!"
