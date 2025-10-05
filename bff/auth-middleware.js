/**
 * Authentication Middleware för SkyManuals BFF
 * Hanterar JWT tokens, användarroller och säkerhet
 */

const jwt = require('jsonwebtoken');

class AuthMiddleware {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'skymanuals-secret-key-change-in-production';
    this.tokenExpiration = '24h';
  }

  // Generera JWT token för användare
  generateToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.roles || ['user'],
      permissions: this.getUserPermissions(user.roles || ['user'])
    };

    return jwt.sign(payload, this.JWT_SECRET, { 
      expiresIn: this.tokenExpiration,
      issuer: 'skymanuals-bff',
      audience: 'skymanuals-frontend'
    });
  }

  // Verifiera JWT token
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'skymanuals-bff',
        audience: 'skymanuals-frontend'
      });
      return { valid: true, user: decoded };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message,
        expired: error.name === 'TokenExpiredError'
      };
    }
  }

  // Hämta användarroller och permissions
  getUserPermissions(roles) {
    const permissions = {
      user: ['read:manuals', 'read:workflows'],
      author: ['read:manuals', 'read:workflows', 'create:manuals', 'update:manuals', 'read:regulations', 'search:manuals'],
      reviewer: ['read:manuals', 'read:workflows', 'review:manuals', 'approve:manuals', 'read:regulations', 'search:manuals'],
      admin: ['*'], // All permissions
      pilot: ['read:manuals', 'read:procedures', 'search:manuals']
    };

    let userPermissions = [];
    roles.forEach(role => {
      if (permissions[role]) {
        if (permissions[role].includes('*')) {
          userPermissions = ['*']; // Admin gets all permissions
        } else {
          userPermissions = [...userPermissions, ...permissions[role]];
        }
      }
    });

    return [...new Set(userPermissions)]; // Remove duplicates
  }

  // Middleware för att kräva autentisering
  requireAuth() {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Authorization token required',
          code: 'MISSING_TOKEN'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer '
      const verification = this.verifyToken(token);

      if (!verification.valid) {
        if (verification.expired) {
          return res.status(401).json({
            error: 'Token expired',
            code: 'TOKEN_EXPIRED'
          });
        }
        
        return res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      // Lägg till användarinfo i request
      req.user = verification.user;
      next();
    };
  }

  // Middleware för att kräva specifika permissions
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userPermissions = req.user.permissions || [];
      
      if (!userPermissions.includes('*') && !userPermissions.includes(permission)) {
        return res.status(403).json({
          error: `Permission '${permission}' required`,
          code: 'INSUFFICIENT_PERMISSIONS',
          required: permission,
          userPermissions: userPermissions
        });
      }

      next();
    };
  }

  // Middleware för att kräva specifika roller
  requireRole(roles) {
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userRoles = req.user.roles || [];
      const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        return res.status(403).json({
          error: `Role '${requiredRoles.join(' or ')}' required`,
          code: 'INSUFFICIENT_ROLE',
          required: requiredRoles,
          userRoles: userRoles
        });
      }

      next();
    };
  }

  // Middleware för organisation-baserad åtkomst
  requireOrganizationAccess() {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // För admin-användare, tillåt åtkomst till alla organisationer
      if (req.user.roles.includes('admin')) {
        return next();
      }

      // För andra användare, kontrollera organisation
      const requestedOrgId = req.params.organizationId || req.body.organizationId || req.query.organizationId;
      const userOrgId = req.user.organizationId;

      if (requestedOrgId && requestedOrgId !== userOrgId) {
        return res.status(403).json({
          error: 'Access denied to this organization',
          code: 'ORGANIZATION_ACCESS_DENIED',
          userOrganization: userOrgId,
          requestedOrganization: requestedOrgId
        });
      }

      next();
    };
  }

  // Simulera användarregistrering (i riktig app skulle detta vara i databas)
  async registerUser(userData) {
    const user = {
      id: `user-${Date.now()}`,
      email: userData.email,
      name: userData.name,
      organizationId: userData.organizationId,
      roles: userData.roles || ['user'],
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    // Generera token för den nya användaren
    const token = this.generateToken(user);
    
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        roles: user.roles
      },
      token
    };
  }

  // Simulera användarinloggning
  async loginUser(email, organizationId) {
    // Simulerade användare för demo
    const mockUsers = [
      {
        id: 'user-1',
        email: 'pilot@testairlines.com',
        name: 'Test Pilot',
        organizationId: 'org-1',
        roles: ['pilot']
      },
      {
        id: 'user-2',
        email: 'author@testairlines.com',
        name: 'Test Author',
        organizationId: 'org-1',
        roles: ['author']
      },
      {
        id: 'user-3',
        email: 'reviewer@testairlines.com',
        name: 'Test Reviewer',
        organizationId: 'org-1',
        roles: ['reviewer']
      },
      {
        id: 'user-4',
        email: 'admin@testairlines.com',
        name: 'Test Admin',
        organizationId: 'org-1',
        roles: ['admin']
      }
    ];

    const user = mockUsers.find(u => 
      u.email === email && u.organizationId === organizationId
    );

    if (!user) {
      return null;
    }

    const token = this.generateToken(user);
    
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        roles: user.roles
      },
      token
    };
  }

  // Audit log för säkerhetshändelser
  logSecurityEvent(req, event, details = {}) {
    const securityEvent = {
      timestamp: new Date().toISOString(),
      event: event,
      userId: req.user?.userId,
      email: req.user?.email,
      organizationId: req.user?.organizationId,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      endpoint: req.path,
      method: req.method,
      details: details
    };

    console.log('🔒 Security Event:', JSON.stringify(securityEvent, null, 2));
    
    // I riktig app skulle detta skickas till audit log system
    return securityEvent;
  }
}

module.exports = new AuthMiddleware();
