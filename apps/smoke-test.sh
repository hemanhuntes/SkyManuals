#!/bin/bash

echo "🧪 Running SkyManuals smoke test..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running"
  exit 1
fi

# Start services
echo "🚀 Starting services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check API health endpoint
echo "🔍 Testing API health endpoint..."
API_HEALTH=$(curl -s http://localhost:3001/api/health)
echo "API Response: $API_HEALTH"

if echo "$API_HEALTH" | grep -q "ok"; then
  echo "✅ API health check passed"
else
  echo "❌ API health check failed"
  docker-compose logs api
  docker-compose down
  exit 1
fi

# Check web app is running
echo "🔍 Testing web application..."
WEB_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
echo "Web Response Code: $WEB_RESPONSE"

if [ "$WEB_RESPONSE" = "200" ]; then
  echo "✅ Web application is running"
else
  echo "❌ Web application health check failed"
  docker-compose logs web
  docker-compose down
  exit 1
fi

# Check database connection
echo "🔍 Testing database connection..."
DB_CHECK=$(docker-compose exec -T postgres pg_isready -U postgres)
echo "Database Status: $DB_CHECK"

if echo "$DB_CHECK" | grep -q "accepting connections"; then
  echo "✅ Database is accepting connections"
else
  echo "❌ Database connection failed"
  docker-compose logs postgres
  docker-compose down
  exit 1
fi

# Check Redis
echo "🔍 Testing Redis connection..."
REDIS_CHECK=$(docker-compose exec -T redis redis-cli ping)
echo "Redis Response: $REDIS_CHECK"

if [ "$REDIS_CHECK" = "PONG" ]; then
  echo "✅ Redis is responding"
else
  echo "❌ Redis connection failed"
  docker-compose logs redis
  docker-compose down
  exit 1
fi

echo ""
echo "🎉 All smoke tests passed!"
echo "📊 Services status:"
docker-compose ps

echo ""
echo "🌐 Access URLs:"
echo "   Web App: http://localhost:3000"
echo "   API Docs: http://localhost:3001/api"
echo "   API Health: http://localhost:3001/api/health"

echo ""
echo "🛑 To stop services: docker-compose down"






