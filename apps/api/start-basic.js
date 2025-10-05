// Basic HTTP server for SkyManuals API
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3001;

// Simple in-memory database for uploaded manuals
let uploadedManuals = [
  {
    id: 'manual-1',
    title: 'Boeing 737-800 Operations Manual',
    description: 'Complete operations manual for Boeing 737-800 aircraft',
    version: '2.1.0',
    status: 'APPROVED', // Approved and visible to viewers
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    organizationId: 'org-1',
    createdBy: 'author-1',
    approvedBy: 'reviewer-1',
    approvedAt: new Date().toISOString()
  },
  {
    id: 'manual-2',
    title: 'Emergency Procedures Handbook',
    description: 'Critical emergency procedures for all crew members',
    version: '1.0.0',
    status: 'PENDING_REVIEW', // Waiting for reviewer approval
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    organizationId: 'org-1',
    createdBy: 'author-1',
    approvedBy: null,
    approvedAt: null
  },
  {
    id: 'manual-3',
    title: 'Maintenance Procedures Manual',
    description: 'Technical maintenance procedures and schedules',
    version: '1.5.0',
    status: 'DRAFT', // Still being edited by author
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    organizationId: 'org-2',
    createdBy: 'author-2',
    approvedBy: null,
    approvedAt: null
  },
  {
    id: 'manual-1759694697982',
    title: 'Boeing 737 Flight Manual',
    description: 'Complete flight manual for Boeing 737 aircraft',
    version: '2.1.0',
    status: 'PENDING_REVIEW',
    createdAt: '2025-10-05T20:04:57.983Z',
    updatedAt: '2025-10-05T20:04:57.983Z',
    organizationId: 'org-1',
    createdBy: 'author-1',
    approvedBy: null,
    approvedAt: null,
    filename: 'manual-1759694697982-aviation-manual.pdf',
    originalName: 'aviation-manual.pdf',
    fileSize: 662
  }
];

// Aviation Regulations Library
const regulationsLibrary = [
  {
    id: 'easa-21g',
    code: 'EASA.21G',
    title: 'Production Organisation Approval',
    category: 'PRODUCTION',
    authority: 'EASA',
    version: '2.1',
    status: 'ACTIVE',
    effectiveDate: '2023-01-01',
    description: 'Requirements for production organisation approval under Part 21G',
    requirements: [
      'Quality management system implementation',
      'Production planning and control',
      'Documentation and record keeping',
      'Personnel competency requirements',
      'Facility and equipment standards'
    ],
    applicableManuals: ['Aircraft Maintenance Manual', 'Production Manual', 'Quality Manual']
  },
  {
    id: 'easa-145',
    code: 'EASA.145',
    title: 'Maintenance Organisation Approval',
    category: 'MAINTENANCE',
    authority: 'EASA',
    version: '3.2',
    status: 'ACTIVE',
    effectiveDate: '2023-06-15',
    description: 'Requirements for maintenance organisation approval under Part 145',
    requirements: [
      'Maintenance organisation structure',
      'Personnel authorisation and training',
      'Equipment and tooling requirements',
      'Maintenance procedures and documentation',
      'Quality assurance system'
    ],
    applicableManuals: ['Aircraft Maintenance Manual', 'Component Maintenance Manual', 'Maintenance Planning Document']
  },
  {
    id: 'faa-145',
    code: 'FAA.145',
    title: 'Repair Station Operations',
    category: 'MAINTENANCE',
    authority: 'FAA',
    version: '1.8',
    status: 'ACTIVE',
    effectiveDate: '2023-03-01',
    description: 'FAA requirements for repair station operations under Part 145',
    requirements: [
      'Repair station certificate requirements',
      'Quality control system',
      'Personnel training and certification',
      'Facility requirements',
      'Record keeping and documentation'
    ],
    applicableManuals: ['Aircraft Maintenance Manual', 'Component Maintenance Manual', 'Repair Station Manual']
  },
  {
    id: 'easa-66',
    code: 'EASA.66',
    title: 'Certifying Staff Requirements',
    category: 'PERSONNEL',
    authority: 'EASA',
    version: '4.1',
    status: 'ACTIVE',
    effectiveDate: '2023-09-01',
    description: 'Requirements for aircraft maintenance certifying staff under Part 66',
    requirements: [
      'Basic knowledge requirements',
      'Experience requirements',
      'Type training requirements',
      'Recurrent training obligations',
      'Licence endorsement procedures'
    ],
    applicableManuals: ['Training Manual', 'Maintenance Manual', 'Personnel Manual']
  },
  {
    id: 'icao-annex6',
    code: 'ICAO.ANNEX6',
    title: 'Operation of Aircraft',
    category: 'OPERATIONS',
    authority: 'ICAO',
    version: '12.0',
    status: 'ACTIVE',
    effectiveDate: '2023-11-01',
    description: 'International standards for aircraft operations',
    requirements: [
      'Flight operations procedures',
      'Aircraft performance requirements',
      'Crew resource management',
      'Emergency procedures',
      'Maintenance requirements'
    ],
    applicableManuals: ['Flight Operations Manual', 'Aircraft Flight Manual', 'Emergency Procedures Manual']
  },
  {
    id: 'easa-ops1',
    code: 'EASA.OPS1',
    title: 'Commercial Air Transport Operations',
    category: 'OPERATIONS',
    authority: 'EASA',
    version: '2.4',
    status: 'ACTIVE',
    effectiveDate: '2023-08-01',
    description: 'Requirements for commercial air transport operations under OPS 1',
    requirements: [
      'Operational control and supervision',
      'Flight time limitations',
      'Aircraft maintenance requirements',
      'Training and checking requirements',
      'Operations manual requirements'
    ],
    applicableManuals: ['Operations Manual', 'Training Manual', 'Maintenance Control Manual']
  }
];

// Simple JSON response helper
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data, null, 2));
}

// Parse JSON body
function parseJSONBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      callback(null, parsed);
    } catch (err) {
      callback(err, null);
    }
  });
}

// Create server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  console.log(`${method} ${path}`);

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // Routes
  if (path === '/health') {
    sendJSON(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'SkyManuals API',
      version: '1.0.0',
      uptime: process.uptime()
    });
    return;
  }

  if (path === '/api/status') {
    sendJSON(res, 200, {
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
      ],
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (path === '/api/manuals' && method === 'GET') {
    sendJSON(res, 200, {
      manuals: uploadedManuals,
      total: uploadedManuals.length,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // POST /api/manuals - Create manual
  if (path === '/api/manuals' && method === 'POST') {
    parseJSONBody(req, (err, data) => {
      if (err) {
        sendJSON(res, 400, {
          error: 'Invalid JSON',
          message: err.message
        });
        return;
      }

      // Check if manual already exists (for sync from BFF)
      const existingIndex = uploadedManuals.findIndex(m => m.id === data.id);
      
      if (existingIndex >= 0) {
        // Update existing manual
        uploadedManuals[existingIndex] = {
          ...uploadedManuals[existingIndex],
          ...data,
          updatedAt: new Date().toISOString()
        };
        
        sendJSON(res, 200, {
          success: true,
          manual: uploadedManuals[existingIndex],
          message: 'Manual updated successfully'
        });
        return;
      }

      const newManual = {
        id: data.id || `manual-${Date.now()}`,
        title: data.title || 'Untitled Manual',
        description: data.description || '',
        version: data.version || '1.0.0',
        status: data.status || 'PENDING_REVIEW', // New uploads need review
        organizationId: data.organizationId || 'default-org',
        createdBy: data.createdBy || 'system',
        approvedBy: data.approvedBy || null,
        approvedAt: data.approvedAt || null,
        updatedAt: data.updatedAt || new Date().toISOString(),
        createdAt: data.createdAt || new Date().toISOString(),
        filename: data.filename || null,
        originalName: data.originalName || null,
        fileSize: data.fileSize || null
      };

      // Add to in-memory database
      uploadedManuals.push(newManual);

      sendJSON(res, 201, {
        success: true,
        manual: newManual,
        message: 'Manual created successfully'
      });
    });
    return;
  }

  // POST /api/manuals/upload - Upload document
  if (path === '/api/manuals/upload' && method === 'POST') {
    // Simple mock response for file upload
    const newManual = {
      id: `manual-${Date.now()}`,
      title: 'Uploaded Document',
      description: 'Document uploaded via file upload',
      version: '1.0.0',
      status: 'PENDING_REVIEW', // New uploads need review
      organizationId: 'org-1',
      createdBy: 'system',
      approvedBy: null,
      approvedAt: null,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    // Add to in-memory database
    uploadedManuals.push(newManual);

    sendJSON(res, 201, {
      success: true,
      manual: newManual,
      message: 'Document uploaded successfully'
    });
    return;
  }

  // PUT /api/manuals/:id/approve - Approve manual
  if (path.match(/^\/api\/manuals\/[^\/]+\/approve$/) && method === 'PUT') {
    const manualId = path.split('/')[3];
    const manual = uploadedManuals.find(m => m.id === manualId);
    
    if (!manual) {
      sendJSON(res, 404, {
        error: 'Manual not found',
        code: 'NOT_FOUND'
      });
      return;
    }
    
    if (manual.status !== 'PENDING_REVIEW') {
      sendJSON(res, 400, {
        error: 'Manual is not pending review',
        code: 'INVALID_STATUS'
      });
      return;
    }
    
    // Approve the manual
    manual.status = 'APPROVED';
    manual.approvedBy = 'reviewer-1'; // Mock reviewer
    manual.approvedAt = new Date().toISOString();
    manual.updatedAt = new Date().toISOString();
    
    sendJSON(res, 200, {
      success: true,
      manual: manual,
      message: 'Manual approved successfully'
    });
    return;
  }

  // PUT /api/manuals/:id/reject - Reject manual
  if (path.match(/^\/api\/manuals\/[^\/]+\/reject$/) && method === 'PUT') {
    const manualId = path.split('/')[3];
    const manual = uploadedManuals.find(m => m.id === manualId);
    
    if (!manual) {
      sendJSON(res, 404, {
        error: 'Manual not found',
        code: 'NOT_FOUND'
      });
      return;
    }
    
    if (manual.status !== 'PENDING_REVIEW') {
      sendJSON(res, 400, {
        error: 'Manual is not pending review',
        code: 'INVALID_STATUS'
      });
      return;
    }
    
    // Reject the manual
    manual.status = 'REJECTED';
    manual.approvedBy = 'reviewer-1'; // Mock reviewer
    manual.approvedAt = new Date().toISOString();
    manual.updatedAt = new Date().toISOString();
    
    sendJSON(res, 200, {
      success: true,
      manual: manual,
      message: 'Manual rejected successfully'
    });
    return;
  }

  // GET /api/manuals/pending - Get manuals pending review
  if (path === '/api/manuals/pending' && method === 'GET') {
    const pendingManuals = uploadedManuals.filter(m => m.status === 'PENDING_REVIEW');
    
    sendJSON(res, 200, {
      manuals: pendingManuals,
      total: pendingManuals.length,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // DELETE /api/manuals/:id - Delete manual (Admin only)
  if (path.match(/^\/api\/manuals\/[^\/]+$/) && method === 'DELETE') {
    const manualId = path.split('/')[3];
    const manualIndex = uploadedManuals.findIndex(m => m.id === manualId);
    
    if (manualIndex === -1) {
      sendJSON(res, 404, {
        error: 'Manual not found',
        code: 'NOT_FOUND'
      });
      return;
    }
    
    // Remove manual from database
    const deletedManual = uploadedManuals.splice(manualIndex, 1)[0];
    
    sendJSON(res, 200, {
      success: true,
      message: 'Manual deleted successfully',
      deletedManual: deletedManual
    });
    return;
  }

  // PUT /api/manuals/:id - Update manual (Admin only)
  if (path.match(/^\/api\/manuals\/[^\/]+$/) && method === 'PUT') {
    const manualId = path.split('/')[3];
    const manual = uploadedManuals.find(m => m.id === manualId);
    
    if (!manual) {
      sendJSON(res, 404, {
        error: 'Manual not found',
        code: 'NOT_FOUND'
      });
      return;
    }
    
    parseJSONBody(req, (err, data) => {
      if (err) {
        sendJSON(res, 400, {
          error: 'Invalid JSON',
          message: err.message
        });
        return;
      }

      // Update manual fields
      if (data.title) manual.title = data.title;
      if (data.description) manual.description = data.description;
      if (data.version) manual.version = data.version;
      manual.updatedAt = new Date().toISOString();

      sendJSON(res, 200, {
        success: true,
        manual: manual,
        message: 'Manual updated successfully'
      });
    });
    return;
  }

  // PUT /api/manuals/:id/status - Change manual status (Admin only)
  if (path.match(/^\/api\/manuals\/[^\/]+\/status$/) && method === 'PUT') {
    const manualId = path.split('/')[3];
    const manual = uploadedManuals.find(m => m.id === manualId);
    
    if (!manual) {
      sendJSON(res, 404, {
        error: 'Manual not found',
        code: 'NOT_FOUND'
      });
      return;
    }
    
    parseJSONBody(req, (err, data) => {
      if (err) {
        sendJSON(res, 400, {
          error: 'Invalid JSON',
          message: err.message
        });
        return;
      }

      const validStatuses = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'];
      if (!validStatuses.includes(data.status)) {
        sendJSON(res, 400, {
          error: 'Invalid status',
          code: 'INVALID_STATUS',
          validStatuses: validStatuses
        });
        return;
      }

      // Update status
      manual.status = data.status;
      manual.updatedAt = new Date().toISOString();
      
      // Update approval fields if changing to/from approved status
      if (data.status === 'APPROVED') {
        manual.approvedBy = 'admin-1';
        manual.approvedAt = new Date().toISOString();
      } else if (manual.status === 'APPROVED' && data.status !== 'APPROVED') {
        manual.approvedBy = null;
        manual.approvedAt = null;
      }

      sendJSON(res, 200, {
        success: true,
        manual: manual,
        message: `Manual status changed to ${data.status}`
      });
    });
    return;
  }

  // GET /api/manuals/all - Get all manuals for admin (including rejected)
  if (path === '/api/manuals/all' && method === 'GET') {
    sendJSON(res, 200, {
      manuals: uploadedManuals,
      total: uploadedManuals.length,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (path === '/api/search/ask' && method === 'POST') {
    parseJSONBody(req, (err, data) => {
      if (err) {
        sendJSON(res, 400, {
          error: 'Invalid JSON',
          message: err.message
        });
        return;
      }

      const query = data.query || 'test query';
      
      sendJSON(res, 200, {
        answer: `Based on the search query "${query}", I found relevant information in the operations manual. The procedures are documented in Chapter 3 and cover the essential safety requirements. This includes emergency procedures, standard operating procedures, and compliance guidelines.`,
        citations: [
          {
            id: 'citation-1',
            title: 'Emergency Procedures - Chapter 3',
            content: 'Emergency procedures for various scenarios including engine failure, fire, and evacuation. All crew members must be familiar with these procedures.',
            source: {
              manualId: 'manual-1',
              chapterTitle: 'Emergency Procedures',
              sectionTitle: 'Engine Failure',
              pageNumber: 45
            },
            relevanceScore: 0.95,
            highlightedText: 'emergency procedures',
            context: 'Emergency procedures for various scenarios'
          },
          {
            id: 'citation-2',
            title: 'Safety Protocols - Chapter 2',
            content: 'Standard safety protocols and checklists that must be followed during all operations.',
            source: {
              manualId: 'manual-1',
              chapterTitle: 'Safety Protocols',
              sectionTitle: 'Pre-flight Checklist',
              pageNumber: 23
            },
            relevanceScore: 0.87,
            highlightedText: 'safety protocols',
            context: 'Standard safety protocols and checklists'
          }
        ],
        query: query,
        searchTimeMs: Math.floor(Math.random() * 200) + 100,
        totalResults: 2,
        hasMoreResults: false,
        searchTechniques: ['HYBRID', 'SEMANTIC', 'BM25']
      });
    });
    return;
  }

  if (path === '/api/notifications/health') {
    sendJSON(res, 200, {
      status: 'healthy',
      websocket: 'ready',
      connections: 0,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (path === '/api/workflows' && method === 'GET') {
    sendJSON(res, 200, {
      workflows: [
        {
          id: 'workflow-1',
          manualId: 'manual-1',
          status: 'IN_PROGRESS',
          currentStage: 'REVIEW',
          initiatedBy: 'user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'workflow-2',
          manualId: 'manual-2',
          status: 'APPROVED',
          currentStage: 'COMPLETED',
          initiatedBy: 'user-2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      total: 2,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (path === '/api/tasks' && method === 'GET') {
    sendJSON(res, 200, {
      tasks: [
        {
          id: 'task-1',
          title: 'Review Emergency Procedures Chapter',
          description: 'Please review the emergency procedures chapter for accuracy and completeness.',
          role: 'technical_reviewer',
          priority: 'HIGH',
          status: 'PENDING',
          assignedTo: 'user-2',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString()
        },
        {
          id: 'task-2',
          title: 'Approve Safety Protocols Manual',
          description: 'Final approval needed for the safety protocols manual.',
          role: 'final_approver',
          priority: 'URGENT',
          status: 'IN_PROGRESS',
          assignedTo: 'user-3',
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString()
        }
      ],
      total: 2,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // GET /api/regulations - List regulations
  if (path === '/api/regulations' && method === 'GET') {
    const query = url.parse(req.url, true).query;
    const { category, authority, search } = query;
    
    let filteredRegulations = regulationsLibrary;
    
    // Filter by category
    if (category) {
      filteredRegulations = filteredRegulations.filter(reg => 
        reg.category === category.toUpperCase()
      );
    }
    
    // Filter by authority
    if (authority) {
      filteredRegulations = filteredRegulations.filter(reg => 
        reg.authority.toLowerCase() === authority.toLowerCase()
      );
    }
    
    // Search in title, description, and requirements
    if (search) {
      const searchLower = search.toLowerCase();
      filteredRegulations = filteredRegulations.filter(reg => 
        reg.title.toLowerCase().includes(searchLower) ||
        reg.description.toLowerCase().includes(searchLower) ||
        reg.requirements.some(req => req.toLowerCase().includes(searchLower))
      );
    }

    sendJSON(res, 200, {
      regulations: filteredRegulations,
      total: filteredRegulations.length,
      categories: [...new Set(regulationsLibrary.map(r => r.category))],
      authorities: [...new Set(regulationsLibrary.map(r => r.authority))],
      timestamp: new Date().toISOString()
    });
    return;
  }

  // GET /api/regulations/:id - Get specific regulation
  if (path.startsWith('/api/regulations/') && method === 'GET') {
    const pathParts = path.split('/');
    const regulationId = pathParts[pathParts.length - 1];
    
    const regulation = regulationsLibrary.find(reg => reg.id === regulationId);
    
    if (!regulation) {
      sendJSON(res, 404, {
        error: 'Regulation not found',
        code: 'REGULATION_NOT_FOUND'
      });
      return;
    }

    sendJSON(res, 200, {
      regulation: regulation,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // POST /api/regulations/compliance-check - Check manual compliance
  if (path === '/api/regulations/compliance-check' && method === 'POST') {
    parseJSONBody(req, (err, data) => {
      if (err) {
        sendJSON(res, 400, {
          error: 'Invalid JSON',
          message: err.message
        });
        return;
      }

      const { manualId, manualType, content } = data;
      
      // Simple compliance checking logic
      const applicableRegulations = regulationsLibrary.filter(reg => 
        reg.applicableManuals.some(manual => 
          manual.toLowerCase().includes(manualType.toLowerCase())
        )
      );

      const complianceResults = applicableRegulations.map(regulation => {
        // Simple keyword matching for demonstration
        const contentLower = (content || '').toLowerCase();
        const matchedRequirements = regulation.requirements.filter(req => 
          contentLower.includes(req.toLowerCase().split(' ')[0]) // Match first word
        );

        return {
          regulationId: regulation.id,
          regulationCode: regulation.code,
          regulationTitle: regulation.title,
          authority: regulation.authority,
          compliance: matchedRequirements.length / regulation.requirements.length,
          matchedRequirements: matchedRequirements,
          missingRequirements: regulation.requirements.filter(req => 
            !contentLower.includes(req.toLowerCase().split(' ')[0])
          ),
          status: matchedRequirements.length / regulation.requirements.length > 0.5 ? 'COMPLIANT' : 'NON_COMPLIANT'
        };
      });

      sendJSON(res, 200, {
        manualId: manualId,
        manualType: manualType,
        complianceResults: complianceResults,
        overallCompliance: complianceResults.every(r => r.status === 'COMPLIANT'),
        timestamp: new Date().toISOString()
      });
    });
    return;
  }

  // 404 for unknown routes
  sendJSON(res, 404, {
    error: 'Not found',
    message: `Route ${method} ${path} not found`,
    availableRoutes: [
      'GET /health',
      'GET /api/status',
      'GET /api/manuals',
      'POST /api/search/ask',
      'GET /api/notifications/health',
      'GET /api/workflows',
      'GET /api/tasks',
      'GET /api/regulations',
      'GET /api/regulations/:id',
      'POST /api/regulations/compliance-check'
    ]
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`
🚀 SkyManuals API Server Started!

📡 Server running on: http://localhost:${PORT}
🏥 Health check: http://localhost:${PORT}/health
📊 API status: http://localhost:${PORT}/api/status
📚 Manuals: http://localhost:${PORT}/api/manuals
🔍 Search: POST http://localhost:${PORT}/api/search/ask
🔔 WebSocket: http://localhost:${PORT}/api/notifications/health
📋 Workflows: http://localhost:${PORT}/api/workflows
✅ Tasks: http://localhost:${PORT}/api/tasks

🎯 Features Available:
  ✅ Manual Management
  ✅ AI-powered Search  
  ✅ Real-time Notifications
  ✅ Workflow Management
  ✅ Task Management
  ✅ Compliance Tracking

📝 Test Commands:
  curl http://localhost:${PORT}/health
  curl http://localhost:${PORT}/api/status
  curl http://localhost:${PORT}/api/manuals
  curl http://localhost:${PORT}/api/workflows
  curl http://localhost:${PORT}/api/tasks
  curl -X POST http://localhost:${PORT}/api/search/ask \\
    -d '{"query":"emergency procedures"}' \\
    -H "Content-Type: application/json"
`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

// Error handling
server.on('error', (err) => {
  console.error('Server error:', err);
});
