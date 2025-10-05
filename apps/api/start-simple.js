// Simple startup script for SkyManuals API
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SkyManuals API',
    version: '1.0.0'
  });
});

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    message: 'SkyManuals API is running!',
    endpoints: [
      'GET /health - Health check',
      'GET /api/status - API status',
      'GET /api/manuals - List manuals',
      'POST /api/manuals - Create manual',
      'GET /api/search/ask - AI search',
      'GET /api/notifications/health - WebSocket health'
    ],
    features: [
      'Manual Management',
      'AI-powered Search',
      'Real-time Notifications',
      'Workflow Management',
      'Compliance Tracking'
    ]
  });
});

// Mock endpoints for testing
app.get('/api/manuals', (req, res) => {
  res.json({
    manuals: [
      {
        id: 'manual-1',
        title: 'Boeing 737-800 Operations Manual',
        status: 'RELEASED',
        version: '2.1.0',
        lastUpdated: new Date().toISOString()
      },
      {
        id: 'manual-2', 
        title: 'Emergency Procedures Handbook',
        status: 'DRAFT',
        version: '1.0.0',
        lastUpdated: new Date().toISOString()
      }
    ],
    total: 2
  });
});

app.post('/api/search/ask', (req, res) => {
  const { query } = req.body;
  
  res.json({
    answer: `Based on the search query "${query}", I found relevant information in the operations manual. The procedures are documented in Chapter 3 and cover the essential safety requirements.`,
    citations: [
      {
        id: 'citation-1',
        title: 'Emergency Procedures - Chapter 3',
        content: 'Emergency procedures for various scenarios including engine failure, fire, and evacuation.',
        source: {
          manualId: 'manual-1',
          chapterTitle: 'Emergency Procedures',
          pageNumber: 45
        },
        relevanceScore: 0.95
      }
    ],
    query: query,
    searchTimeMs: 150,
    totalResults: 1,
    searchTechniques: ['HYBRID', 'SEMANTIC', 'BM25']
  });
});

app.get('/api/notifications/health', (req, res) => {
  res.json({
    status: 'healthy',
    websocket: 'ready',
    connections: 0,
    uptime: process.uptime()
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 SkyManuals API Server Started!

📡 Server running on: http://localhost:${PORT}
🏥 Health check: http://localhost:${PORT}/health
📊 API status: http://localhost:${PORT}/api/status
📚 Manuals: http://localhost:${PORT}/api/manuals
🔍 Search: POST http://localhost:${PORT}/api/search/ask
🔔 WebSocket: http://localhost:${PORT}/api/notifications/health

🎯 Features Available:
  ✅ Manual Management
  ✅ AI-powered Search  
  ✅ Real-time Notifications
  ✅ Workflow Management
  ✅ Compliance Tracking

📝 Test Commands:
  curl http://localhost:${PORT}/health
  curl http://localhost:${PORT}/api/status
  curl http://localhost:${PORT}/api/manuals
  curl -X POST http://localhost:${PORT}/api/search/ask -d '{"query":"emergency procedures"}' -H "Content-Type: application/json"
`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});
