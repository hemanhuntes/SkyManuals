#!/usr/bin/env node

/**
 * SkyManuals BFF (Backend for Frontend)
 * Hanterar kommunikation mellan frontend och backend API
 * Sköter data polishing, säkerhet och API aggregation
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('./auth-middleware');
const adIntegrationService = require('./services/ad-integration.service');

const app = express();
const PORT = process.env.BFF_PORT || 3002;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3003'], // Frontend ports
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files for frontend
app.use('/frontend', express.static(path.join(__dirname, '../frontend')));

// Multer för file uploads with local storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    // Generate unique filename: manual-{timestamp}-{originalname}
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `manual-${timestamp}-${sanitizedName}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit - suitable for aviation manuals
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/xml', 'text/xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and XML files are allowed'), false);
    }
  }
});

// File Storage System
class FileStorage {
  static fileMap = new Map(); // Maps manual ID to file info
  
  static storeFile(manualId, fileInfo) {
    this.fileMap.set(manualId, fileInfo);
    console.log(`📁 File stored: ${manualId} -> ${fileInfo.filename}`);
  }
  
  static getFile(manualId) {
    const fileInfo = this.fileMap.get(manualId);
    if (!fileInfo) {
      console.log(`❌ File not found: ${manualId}`);
      return null;
    }
    return fileInfo;
  }
  
  static deleteFile(manualId) {
    const fileInfo = this.fileMap.get(manualId);
    if (fileInfo) {
      try {
        const fs = require('fs');
        fs.unlinkSync(fileInfo.filepath);
        this.fileMap.delete(manualId);
        console.log(`🗑️ File deleted: ${manualId}`);
        return true;
      } catch (error) {
        console.error(`❌ Error deleting file: ${error.message}`);
        return false;
      }
    }
    return false;
  }
  
  static listFiles() {
    return Array.from(this.fileMap.entries()).map(([id, info]) => ({
      manualId: id,
      filename: info.filename,
      originalName: info.originalName,
      size: info.size,
      mimetype: info.mimetype,
      uploadedAt: info.uploadedAt
    }));
  }
}

// Utility functions för data sanitization
class DataSanitizer {
  static sanitizeManual(manual) {
    if (!manual) return null;
    
    const sanitized = {
      id: manual.id,
      title: manual.title,
      description: manual.description || '',
      version: manual.version,
      status: manual.status,
      createdAt: manual.createdAt || manual.lastUpdated,
      updatedAt: manual.lastUpdated,
      organizationId: manual.organizationId,
      // File information
      hasFile: !!manual.filename,
      filename: manual.filename,
      originalName: manual.originalName,
      fileSize: manual.fileSize,
      downloadUrl: `/api/manuals/${manual.id}/download`,
      viewUrl: `/api/manuals/${manual.id}/view`,
      // Hide sensitive fields
      // createdBy, updatedBy, internalNotes, etc. are hidden
    };
    
    return sanitized;
  }

  static sanitizeUser(user) {
    if (!user) return null;
    
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.roles ? user.roles[0] : 'user',
      organizationId: user.organizationId,
      // Hide sensitive fields
      // password, internalId, etc. are hidden
    };
  }

  static sanitizeWorkflow(workflow) {
    if (!workflow) return null;
    
    return {
      id: workflow.id,
      manualId: workflow.manualId,
      status: workflow.status,
      currentStage: workflow.currentStage,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      // Hide internal workflow details
    };
  }

  static sanitizeTask(task) {
    if (!task) return null;
    
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      // Hide internal task details and assignments
    };
  }

  static sanitizeSearchResults(results) {
    if (!results || !results.results) return results;
    
    return {
      ...results,
      results: results.results.map(result => ({
        id: result.id,
        title: result.title,
        content: result.content?.substring(0, 500) + '...', // Truncate long content
        relevanceScore: result.relevanceScore,
        citations: result.citations?.map(citation => ({
          title: citation.title,
          source: citation.source,
          confidence: citation.confidence
          // Hide internal citation details
        }))
      }))
    };
  }
}

// API Client för backend communication
class APIClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async get(endpoint, options = {}) {
    try {
      const response = await this.client.get(endpoint, options);
      return response.data;
    } catch (error) {
      console.error(`API GET Error for ${endpoint}:`, error.message);
      throw this.handleError(error);
    }
  }

  async post(endpoint, data, options = {}) {
    try {
      const response = await this.client.post(endpoint, data, options);
      return response.data;
    } catch (error) {
      console.error(`API POST Error for ${endpoint}:`, error.message);
      throw this.handleError(error);
    }
  }

  async put(endpoint, data, options = {}) {
    try {
      const response = await this.client.put(endpoint, data, options);
      return response.data;
    } catch (error) {
      console.error(`API PUT Error for ${endpoint}:`, error.message);
      throw this.handleError(error);
    }
  }

  async delete(endpoint, options = {}) {
    try {
      const response = await this.client.delete(endpoint, options);
      return response.data;
    } catch (error) {
      console.error(`API DELETE Error for ${endpoint}:`, error.message);
      throw this.handleError(error);
    }
  }

  async uploadFile(endpoint, file, additionalData = {}) {
    try {
      // Use form-data package for Node.js multipart uploads
      const FormData = require('form-data');
      const formData = new FormData();
      
      // Append file buffer directly
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
      
      Object.keys(additionalData).forEach(key => {
        formData.append(key, additionalData[key]);
      });

      const response = await axios.post(`${this.baseURL}${endpoint}`, formData, {
        headers: {
          ...formData.getHeaders(),
          ...additionalData.headers
        },
        timeout: 60000 // 60 seconds for file uploads
      });

      return response.data;
    } catch (error) {
      console.error(`API Upload Error for ${endpoint}:`, error.message);
      throw this.handleError(error);
    }
  }

  handleError(error) {
    if (error.response) {
      // Server responded with error status
      return {
        status: error.response.status,
        message: error.response.data?.message || error.message,
        code: error.response.data?.code || 'API_ERROR'
      };
    } else if (error.request) {
      // Request made but no response
      return {
        status: 503,
        message: 'Backend service unavailable',
        code: 'SERVICE_UNAVAILABLE'
      };
    } else {
      // Something else happened
      return {
        status: 500,
        message: error.message,
        code: 'INTERNAL_ERROR'
      };
    }
  }
}

const apiClient = new APIClient(API_BASE_URL);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'skymanuals-bff',
    timestamp: new Date().toISOString(),
    backend: API_BASE_URL
  });
});

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, organizationId, password } = req.body;
    
    if (!email || !organizationId) {
      return res.status(400).json({
        error: 'Email and organizationId are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Check if organization supports AD integration
    const authMethod = adIntegrationService.getAuthMethod(organizationId);
    
    if (authMethod === 'ldap' && password) {
      // LDAP authentication
      const result = await adIntegrationService.authenticateWithLDAP(email, password, organizationId);
      adIntegrationService.logADAuthenticationEvent(req, 'LDAP_LOGIN_SUCCESS', {
        authMethod: 'ldap',
        organizationId: organizationId,
        userId: result.user.id,
        email: result.user.email,
        adGroups: result.user.adGroups,
        roles: result.user.roles
      });
      
      res.json({
        success: true,
        user: result.user,
        token: result.token,
        expiresIn: '24h',
        authMethod: 'ldap'
      });
      return;
    }

    // Fallback to internal authentication
    const result = await authMiddleware.loginUser(email, organizationId);
    
    if (!result) {
      authMiddleware.logSecurityEvent(req, 'LOGIN_FAILED', { email, organizationId });
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    authMiddleware.logSecurityEvent(req, 'LOGIN_SUCCESS', { userId: result.user.id });
    
    res.json({
      success: true,
      user: result.user,
      token: result.token,
      expiresIn: '24h',
      authMethod: 'internal'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, name, organizationId, roles } = req.body;
    
    if (!email || !name || !organizationId) {
      return res.status(400).json({
        error: 'Email, name and organizationId are required',
        code: 'MISSING_FIELDS'
      });
    }

    const result = await authMiddleware.registerUser({
      email,
      name,
      organizationId,
      roles: roles || ['user']
    });

    authMiddleware.logSecurityEvent(req, 'USER_REGISTERED', { userId: result.user.id });
    
    res.status(201).json({
      success: true,
      user: result.user,
      token: result.token,
      expiresIn: '24h'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

app.get('/api/auth/me', authMiddleware.requireAuth(), (req, res) => {
  res.json({
    user: req.user
  });
});

// AD Integration endpoints
app.get('/api/auth/organizations', (req, res) => {
  try {
    const organizations = adIntegrationService.getSupportedOrganizations();
    res.json({
      success: true,
      organizations: organizations
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({
      error: 'Failed to fetch organizations',
      code: 'FETCH_ERROR'
    });
  }
});

app.get('/api/auth/saml/login/:organizationId', (req, res) => {
  try {
    const { organizationId } = req.params;
    const authMethod = adIntegrationService.getAuthMethod(organizationId);
    
    if (authMethod !== 'saml') {
      return res.status(400).json({
        error: 'SAML authentication not configured for this organization',
        code: 'SAML_NOT_CONFIGURED'
      });
    }

    const samlLoginUrl = adIntegrationService.generateSAMLLoginURL(organizationId);
    res.redirect(samlLoginUrl);
    
  } catch (error) {
    console.error('SAML login error:', error);
    res.status(500).json({
      error: 'Failed to initiate SAML login',
      code: 'SAML_ERROR'
    });
  }
});

app.post('/api/auth/saml/callback', async (req, res) => {
  try {
    const { SAMLResponse, RelayState } = req.body;
    
    if (!SAMLResponse || !RelayState) {
      return res.status(400).json({
        error: 'Invalid SAML response',
        code: 'INVALID_SAML_RESPONSE'
      });
    }

    const result = await adIntegrationService.processSAMLResponse(SAMLResponse, RelayState);
    
    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3002'}/auth/callback?token=${result.token}`;
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('SAML callback error:', error);
    res.status(500).json({
      error: 'Failed to process SAML callback',
      code: 'SAML_CALLBACK_ERROR'
    });
  }
});

app.get('/api/auth/oauth/login/:organizationId', (req, res) => {
  try {
    const { organizationId } = req.params;
    const config = adIntegrationService.getOrganizationConfig(organizationId);
    
    if (!config || config.authType !== 'oauth') {
      return res.status(400).json({
        error: 'OAuth authentication not configured for this organization',
        code: 'OAUTH_NOT_CONFIGURED'
      });
    }

    const oauthUrl = `${config.oauth.authorizationURL}?` +
      `client_id=${config.oauth.clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(process.env.BFF_URL + '/api/auth/oauth/callback')}&` +
      `scope=openid profile email&` +
      `state=${organizationId}`;
    
    res.redirect(oauthUrl);
    
  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({
      error: 'Failed to initiate OAuth login',
      code: 'OAUTH_ERROR'
    });
  }
});

app.get('/api/auth/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).json({
        error: 'Invalid OAuth callback',
        code: 'INVALID_OAUTH_CALLBACK'
      });
    }

    const result = await adIntegrationService.processOAuthCallback(code, state, state);
    
    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3002'}/auth/callback?token=${result.token}`;
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      error: 'Failed to process OAuth callback',
      code: 'OAUTH_CALLBACK_ERROR'
    });
  }
});

// Manual Management Endpoints
app.get('/api/manuals', authMiddleware.requireAuth(), async (req, res) => {
  try {
    const manuals = await apiClient.get('/api/manuals');
    const sanitizedManuals = manuals.manuals?.map(DataSanitizer.sanitizeManual) || [];
    
    res.json({
      manuals: sanitizedManuals,
      total: sanitizedManuals.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching manuals:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch manuals',
      code: error.code || 'FETCH_ERROR'
    });
  }
});

// Get pending manuals for reviewers
app.get('/api/manuals/pending', authMiddleware.requireAuth(), async (req, res) => {
  try {
    const data = await apiClient.get('/api/manuals/pending');
    const sanitizedManuals = data.manuals?.map(DataSanitizer.sanitizeManual) || [];
    
    res.json({
      manuals: sanitizedManuals,
      total: sanitizedManuals.length,
      timestamp: data.timestamp
    });
  } catch (error) {
    console.error('Error fetching pending manuals:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch pending manuals',
      code: error.code || 'FETCH_ERROR'
    });
  }
});

// Admin Management Endpoints - Must be before /api/manuals/:id
app.get('/api/manuals/all', async (req, res) => {
  try {
    const data = await apiClient.get('/api/manuals/all');
    const sanitizedManuals = data.manuals?.map(DataSanitizer.sanitizeManual) || [];
    
    res.json({
      manuals: sanitizedManuals,
      total: sanitizedManuals.length,
      timestamp: data.timestamp
    });
  } catch (error) {
    console.error('Error fetching all manuals:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch all manuals',
      code: error.code || 'FETCH_ERROR'
    });
  }
});

app.get('/api/manuals/:id', async (req, res) => {
  try {
    const manual = await apiClient.get(`/api/manuals/${req.params.id}`);
    const sanitizedManual = DataSanitizer.sanitizeManual(manual);
    
    res.json(sanitizedManual);
  } catch (error) {
    console.error(`Error fetching manual ${req.params.id}:`, error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch manual',
      code: error.code || 'FETCH_ERROR'
    });
  }
});

// Document Upload Endpoint
app.post('/api/manuals/upload', 
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission('create:manuals'),
  upload.single('file'), 
  async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file provided',
        code: 'NO_FILE'
      });
    }

    const uploadData = {
      title: req.body.title,
      description: req.body.description,
      version: req.body.version || '1.0.0',
      organizationId: req.body.organizationId || 'default-org'
    };

    // Generate unique manual ID
    const manualId = `manual-${Date.now()}`;
    
    // Store file information
    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      filepath: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString()
    };
    
    FileStorage.storeFile(manualId, fileInfo);
    
    // Send to backend API
    const manualData = {
      id: manualId,
      title: uploadData.title || 'Uploaded Document',
      description: uploadData.description || 'Document uploaded via file upload',
      version: uploadData.version || '1.0.0',
      status: 'PENDING_REVIEW',
      organizationId: uploadData.organizationId || 'org-1',
      createdBy: req.user.id,
      approvedBy: null,
      approvedAt: null,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size
    };
    
    // Send to backend API to sync data
    try {
      await apiClient.post('/api/manuals', manualData);
    } catch (error) {
      console.error('Failed to sync with backend:', error);
      // Continue anyway - file is stored locally
    }
    
    res.json({
      success: true,
      manual: DataSanitizer.sanitizeManual(manualData),
      message: 'Document uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to upload document',
      code: error.code || 'UPLOAD_ERROR'
    });
  }
});

// Manual approval endpoints
app.put('/api/manuals/:id/approve', authMiddleware.requireAuth(), async (req, res) => {
  try {
    const result = await apiClient.put(`/api/manuals/${req.params.id}/approve`, req.body);
    res.json(result);
  } catch (error) {
    console.error(`Error approving manual ${req.params.id}:`, error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to approve manual',
      code: error.code || 'APPROVAL_ERROR'
    });
  }
});

app.put('/api/manuals/:id/reject', authMiddleware.requireAuth(), async (req, res) => {
  try {
    const result = await apiClient.put(`/api/manuals/${req.params.id}/reject`, req.body);
    res.json(result);
  } catch (error) {
    console.error(`Error rejecting manual ${req.params.id}:`, error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to reject manual',
      code: error.code || 'REJECTION_ERROR'
    });
  }
});

// Admin Management Endpoints

app.put('/api/manuals/:id', 
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission('update:manuals'),
  async (req, res) => {
  try {
    const result = await apiClient.put(`/api/manuals/${req.params.id}`, req.body);
    res.json(result);
  } catch (error) {
    console.error(`Error updating manual ${req.params.id}:`, error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to update manual',
      code: error.code || 'UPDATE_ERROR'
    });
  }
});

app.put('/api/manuals/:id/status', 
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission('manage:manuals'),
  async (req, res) => {
  try {
    const result = await apiClient.put(`/api/manuals/${req.params.id}/status`, req.body);
    res.json(result);
  } catch (error) {
    console.error(`Error changing manual status ${req.params.id}:`, error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to change manual status',
      code: error.code || 'STATUS_ERROR'
    });
  }
});

app.delete('/api/manuals/:id', 
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission('delete:manuals'),
  async (req, res) => {
  try {
    const result = await apiClient.delete(`/api/manuals/${req.params.id}`);
    res.json(result);
  } catch (error) {
    console.error(`Error deleting manual ${req.params.id}:`, error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to delete manual',
      code: error.code || 'DELETE_ERROR'
    });
  }
});

// File Download Endpoints
app.get('/api/manuals/:id/download', async (req, res) => {
  // Check auth from header or query parameter
  const authHeader = req.headers.authorization;
  const tokenParam = req.query.token;
  
  if (!authHeader && !tokenParam) {
    return res.status(401).json({
      error: 'Authorization required',
      code: 'AUTH_REQUIRED'
    });
  }
  
  // Add token to headers if provided as query param
  if (tokenParam && !authHeader) {
    req.headers.authorization = `Bearer ${tokenParam}`;
  }
  
  // Use auth middleware
  return authMiddleware.requireAuth()(req, res, async () => {
  try {
    const manualId = req.params.id;
    const fileInfo = FileStorage.getFile(manualId);
    
    if (!fileInfo) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }
    
    // Check if file exists on disk
    const fs = require('fs');
    if (!fs.existsSync(fileInfo.filepath)) {
      return res.status(404).json({
        error: 'File not found on disk',
        code: 'FILE_NOT_FOUND'
      });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', fileInfo.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.originalName}"`);
    res.setHeader('Content-Length', fileInfo.size);
    
    // Stream file to response
    const fileStream = fs.createReadStream(fileInfo.filepath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Error reading file',
          code: 'FILE_READ_ERROR'
        });
      }
    });
    
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      error: error.message || 'Failed to download file',
      code: 'DOWNLOAD_ERROR'
    });
  }
  });
});

app.get('/api/manuals/:id/view', async (req, res) => {
  // Check auth from header or query parameter
  const authHeader = req.headers.authorization;
  const tokenParam = req.query.token;
  
  if (!authHeader && !tokenParam) {
    return res.status(401).json({
      error: 'Authorization required',
      code: 'AUTH_REQUIRED'
    });
  }
  
  // Add token to headers if provided as query param
  if (tokenParam && !authHeader) {
    req.headers.authorization = `Bearer ${tokenParam}`;
  }
  
  // Use auth middleware
  return authMiddleware.requireAuth()(req, res, async () => {
  try {
    const manualId = req.params.id;
    const fileInfo = FileStorage.getFile(manualId);
    
    if (!fileInfo) {
      return res.status(404).json({
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      });
    }
    
    // Check if file exists on disk
    const fs = require('fs');
    if (!fs.existsSync(fileInfo.filepath)) {
      return res.status(404).json({
        error: 'File not found on disk',
        code: 'FILE_NOT_FOUND'
      });
    }
    
    // For PDF files, serve with inline disposition
    if (fileInfo.mimetype === 'application/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${fileInfo.originalName}"`);
      res.setHeader('Content-Length', fileInfo.size);
      
      // Stream file to response
      const fileStream = fs.createReadStream(fileInfo.filepath);
      fileStream.pipe(res);
      
      fileStream.on('error', (error) => {
        console.error('Error streaming file:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Error reading file',
            code: 'FILE_READ_ERROR'
          });
        }
      });
    } else {
      // For other file types, force download
      res.setHeader('Content-Type', fileInfo.mimetype);
      res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.originalName}"`);
      res.setHeader('Content-Length', fileInfo.size);
      
      const fileStream = fs.createReadStream(fileInfo.filepath);
      fileStream.pipe(res);
    }
    
  } catch (error) {
    console.error('Error viewing file:', error);
    res.status(500).json({
      error: error.message || 'Failed to view file',
      code: 'VIEW_ERROR'
    });
  }
  });
});

// File management endpoints
app.get('/api/files', authMiddleware.requireAuth(), async (req, res) => {
  try {
    const files = FileStorage.listFiles();
    res.json({
      success: true,
      files: files,
      total: files.length
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({
      error: error.message || 'Failed to list files',
      code: 'LIST_ERROR'
    });
  }
});

// Search Endpoints
app.post('/api/search/ask', 
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission('search:manuals'),
  async (req, res) => {
  try {
    const { query, searchType = 'AI', filters = {} } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Search query is required',
        code: 'MISSING_QUERY'
      });
    }

    const searchResults = await apiClient.post('/api/search/ask', {
      query,
      searchType,
      filters
    });

    const sanitizedResults = DataSanitizer.sanitizeSearchResults(searchResults);
    
    res.json(sanitizedResults);
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Search failed',
      code: error.code || 'SEARCH_ERROR'
    });
  }
});

// Workflow Endpoints
app.get('/api/workflows', async (req, res) => {
  try {
    const workflows = await apiClient.get('/api/workflows');
    const sanitizedWorkflows = workflows.workflows?.map(DataSanitizer.sanitizeWorkflow) || [];
    
    res.json({
      workflows: sanitizedWorkflows,
      total: sanitizedWorkflows.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch workflows',
      code: error.code || 'FETCH_ERROR'
    });
  }
});

// Task Endpoints
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await apiClient.get('/api/tasks');
    const sanitizedTasks = tasks.tasks?.map(DataSanitizer.sanitizeTask) || [];
    
    res.json({
      tasks: sanitizedTasks,
      total: sanitizedTasks.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch tasks',
      code: error.code || 'FETCH_ERROR'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('BFF Error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large. Maximum size is 10MB.',
        code: 'FILE_TOO_LARGE'
      });
    }
  }
  
  res.status(500).json({
    error: error.message || 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// Regulations Endpoints
app.get('/api/regulations', 
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission('read:regulations'),
  async (req, res) => {
  try {
    const result = await apiClient.get('/api/regulations', { params: req.query });
    res.json(result);
  } catch (error) {
    console.error('Regulations list error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch regulations',
      code: error.code || 'REGULATIONS_ERROR'
    });
  }
});

app.get('/api/regulations/:id', 
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission('read:regulations'),
  async (req, res) => {
  try {
    const result = await apiClient.get(`/api/regulations/${req.params.id}`);
    res.json(result);
  } catch (error) {
    console.error('Regulation detail error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch regulation',
      code: error.code || 'REGULATION_ERROR'
    });
  }
});

app.post('/api/regulations/compliance-check', 
  authMiddleware.requireAuth(),
  authMiddleware.requirePermission('read:regulations'),
  async (req, res) => {
  try {
    const result = await apiClient.post('/api/regulations/compliance-check', req.body);
    res.json(result);
  } catch (error) {
    console.error('Compliance check error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to check compliance',
      code: error.code || 'COMPLIANCE_ERROR'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SkyManuals BFF Server running on port ${PORT}`);
  console.log(`📡 Backend API: ${API_BASE_URL}`);
  console.log(`🔒 CORS enabled for frontend ports`);
  console.log(`📁 File upload limit: 100MB`);
  console.log(`⏱️  API timeout: 30s`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down BFF server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down BFF server...');
  process.exit(0);
});
