#!/bin/bash

# SkyManuals Test Setup Script
# This script sets up the testing environment

set -e

echo "🚀 Setting up SkyManuals Test Environment..."

# Check if required tools are installed
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
}

echo "📋 Checking prerequisites..."
check_command "node"
check_command "npm"
check_command "docker"
check_command "docker-compose"

# Install dependencies
echo "📦 Installing dependencies..."
cd apps/api
npm install

# Setup test database
echo "🗄️ Setting up test database..."
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from example..."
    cp env.example .env
    echo "📝 Please update .env with your actual configuration"
fi

# Start test services
echo "🐳 Starting test services..."
cd ../..
docker-compose -f docker-compose.test.yml up -d postgres-test redis-test

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run database migrations
echo "🔄 Running database migrations..."
cd apps/api
npx prisma db push --schema=./prisma/schema.prisma

echo "✅ Test environment setup complete!"
echo ""
echo "🧪 Available test commands:"
echo "  npm run test:unit        - Run unit tests"
echo "  npm run test:integration - Run integration tests"
echo "  npm run test:e2e         - Run end-to-end tests"
echo "  npm run test:coverage    - Run tests with coverage"
echo "  npm run test:watch       - Run tests in watch mode"
echo ""
echo "🔧 Test services are running on:"
echo "  PostgreSQL: localhost:5433"
echo "  Redis: localhost:6380"
echo ""
echo "To stop test services:"
echo "  docker-compose -f docker-compose.test.yml down"
