/**
 * Active Directory Integration Service
 * Handles SAML, OAuth, and LDAP authentication with external AD systems
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');

class ADIntegrationService {
  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'skymanuals-secret-key-change-in-production';
    this.tokenExpiration = '24h';
    
    // Organization-specific AD configurations
    this.organizationConfigs = {
      'org-sas': {
        name: 'SAS',
        authType: 'saml',
        saml: {
          entryPoint: process.env.SAS_SAML_ENTRY_POINT || 'https://sts.sas.se/saml/sso',
          issuer: 'skymanuals-sas',
          cert: process.env.SAS_SAML_CERT,
          groupMapping: {
            'CN=Pilots,OU=SAS,DC=sas,DC=se': ['pilot'],
            'CN=Maintenance,OU=SAS,DC=sas,DC=se': ['author', 'reviewer'],
            'CN=IT,OU=SAS,DC=sas,DC=se': ['admin']
          }
        }
      },
      'org-norwegian': {
        name: 'Norwegian Air',
        authType: 'oauth',
        oauth: {
          clientId: process.env.NORWEGIAN_CLIENT_ID,
          clientSecret: process.env.NORWEGIAN_CLIENT_SECRET,
          authorizationURL: 'https://login.microsoftonline.com/norwegian.onmicrosoft.com/oauth2/authorize',
          tokenURL: 'https://login.microsoftonline.com/norwegian.onmicrosoft.com/oauth2/token',
          groupMapping: {
            'Cockpit Crew': ['pilot'],
            'Maintenance Staff': ['author', 'reviewer'],
            'IT Administration': ['admin']
          }
        }
      },
      'org-finnair': {
        name: 'Finnair',
        authType: 'ldap',
        ldap: {
          url: process.env.FINNAIR_LDAP_URL || 'ldap://ad.finnair.com:389',
          baseDN: 'DC=finnair,DC=com',
          groupMapping: {
            'CN=Pilots,OU=Finnair,DC=finnair,DC=com': ['pilot'],
            'CN=Technical,OU=Finnair,DC=finnair,DC=com': ['author', 'reviewer'],
            'CN=Administration,OU=Finnair,DC=finnair,DC=com': ['admin']
          }
        }
      }
    };
  }

  /**
   * Determine authentication method for organization
   */
  getAuthMethod(organizationId) {
    const config = this.organizationConfigs[organizationId];
    if (!config) {
      return 'internal'; // Fallback to internal auth
    }
    return config.authType;
  }

  /**
   * Generate SAML login URL for organization
   */
  generateSAMLLoginURL(organizationId) {
    const config = this.organizationConfigs[organizationId];
    if (!config || config.authType !== 'saml') {
      throw new Error(`SAML not configured for organization: ${organizationId}`);
    }

    const params = new URLSearchParams({
      SAMLRequest: this.generateSAMLRequest(config.saml.issuer),
      RelayState: organizationId
    });

    return `${config.saml.entryPoint}?${params.toString()}`;
  }

  /**
   * Generate SAML AuthnRequest
   */
  generateSAMLRequest(issuer) {
    const samlRequest = `
      <samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                         xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                         ID="_${Date.now()}"
                         Version="2.0"
                         IssueInstant="${new Date().toISOString()}"
                         Destination=""
                         AssertionConsumerServiceURL="${process.env.BFF_URL}/auth/saml/callback"
                         ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
        <saml:Issuer>${issuer}</saml:Issuer>
        <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
                           AllowCreate="true"/>
      </samlp:AuthnRequest>
    `;
    
    // Base64 encode the SAML request
    return Buffer.from(samlRequest).toString('base64');
  }

  /**
   * Process SAML response from AD
   */
  async processSAMLResponse(samlResponse, relayState) {
    try {
      // In a real implementation, you would:
      // 1. Validate the SAML response signature
      // 2. Parse the XML response
      // 3. Extract user attributes
      
      // For demo purposes, we'll simulate the response
      const mockUserProfile = {
        nameID: 'pilot@sas.se',
        email: 'pilot@sas.se',
        displayName: 'SAS Pilot',
        memberOf: [
          'CN=Pilots,OU=SAS,DC=sas,DC=se',
          'CN=Users,OU=SAS,DC=sas,DC=se'
        ]
      };

      const user = this.mapADUserToSkyManuals(mockUserProfile, relayState);
      const token = this.generateToken(user);

      return {
        success: true,
        user: user,
        token: token,
        authMethod: 'saml'
      };

    } catch (error) {
      console.error('SAML processing error:', error);
      throw new Error('Failed to process SAML response');
    }
  }

  /**
   * Process OAuth callback from Azure AD
   */
  async processOAuthCallback(code, state, organizationId) {
    try {
      const config = this.organizationConfigs[organizationId];
      if (!config || config.authType !== 'oauth') {
        throw new Error(`OAuth not configured for organization: ${organizationId}`);
      }

      // Exchange code for token
      const tokenResponse = await axios.post(config.oauth.tokenURL, {
        grant_type: 'authorization_code',
        client_id: config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
        code: code,
        redirect_uri: `${process.env.BFF_URL}/auth/oauth/callback`
      });

      const accessToken = tokenResponse.data.access_token;

      // Get user profile from Microsoft Graph
      const profileResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const userProfile = {
        id: profileResponse.data.id,
        email: profileResponse.data.mail || profileResponse.data.userPrincipalName,
        displayName: profileResponse.data.displayName,
        groups: [] // Would need separate API call to get groups
      };

      const user = this.mapADUserToSkyManuals(userProfile, organizationId);
      const token = this.generateToken(user);

      return {
        success: true,
        user: user,
        token: token,
        authMethod: 'oauth'
      };

    } catch (error) {
      console.error('OAuth processing error:', error);
      throw new Error('Failed to process OAuth callback');
    }
  }

  /**
   * Authenticate user via LDAP
   */
  async authenticateWithLDAP(username, password, organizationId) {
    try {
      const config = this.organizationConfigs[organizationId];
      if (!config || config.authType !== 'ldap') {
        throw new Error(`LDAP not configured for organization: ${organizationId}`);
      }

      // In a real implementation, you would use ldapjs or similar
      // For demo purposes, we'll simulate LDAP authentication
      
      if (username === 'pilot' && password === 'password') {
        const mockUserProfile = {
          username: username,
          email: `${username}@finnair.com`,
          displayName: 'Finnair Pilot',
          memberOf: [
            'CN=Pilots,OU=Finnair,DC=finnair,DC=com',
            'CN=Users,OU=Finnair,DC=finnair,DC=com'
          ]
        };

        const user = this.mapADUserToSkyManuals(mockUserProfile, organizationId);
        const token = this.generateToken(user);

        return {
          success: true,
          user: user,
          token: token,
          authMethod: 'ldap'
        };
      } else {
        throw new Error('Invalid LDAP credentials');
      }

    } catch (error) {
      console.error('LDAP authentication error:', error);
      throw new Error('LDAP authentication failed');
    }
  }

  /**
   * Map AD user profile to SkyManuals user
   */
  mapADUserToSkyManuals(adProfile, organizationId) {
    const config = this.organizationConfigs[organizationId];
    
    // Extract roles from AD groups
    const roles = this.mapADGroupsToRoles(adProfile.memberOf || adProfile.groups || [], config);
    
    return {
      id: `ad-${adProfile.id || adProfile.nameID || adProfile.username}`,
      email: adProfile.email,
      name: adProfile.displayName || adProfile.email.split('@')[0],
      organizationId: organizationId,
      roles: roles,
      adGroups: adProfile.memberOf || adProfile.groups || [],
      authMethod: config.authType,
      lastLogin: new Date().toISOString()
    };
  }

  /**
   * Map AD groups to SkyManuals roles
   */
  mapADGroupsToRoles(adGroups, config) {
    const roleMapping = config[config.authType].groupMapping || {};
    const roles = [];

    adGroups.forEach(group => {
      if (roleMapping[group]) {
        roles.push(...roleMapping[group]);
      }
    });

    // Remove duplicates
    return [...new Set(roles.length > 0 ? roles : ['user'])];
  }

  /**
   * Generate JWT token for authenticated user
   */
  generateToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roles: user.roles,
      authMethod: user.authMethod,
      adGroups: user.adGroups
    };

    return jwt.sign(payload, this.JWT_SECRET, { 
      expiresIn: this.tokenExpiration,
      issuer: 'skymanuals-bff',
      audience: 'skymanuals-frontend'
    });
  }

  /**
   * Get organization configuration
   */
  getOrganizationConfig(organizationId) {
    return this.organizationConfigs[organizationId];
  }

  /**
   * List supported organizations
   */
  getSupportedOrganizations() {
    return Object.keys(this.organizationConfigs).map(orgId => ({
      id: orgId,
      name: this.organizationConfigs[orgId].name,
      authMethod: this.organizationConfigs[orgId].authType
    }));
  }

  /**
   * Validate organization access
   */
  validateOrganizationAccess(organizationId, userEmail) {
    const config = this.organizationConfigs[organizationId];
    if (!config) {
      return false;
    }

    // Extract domain from email
    const emailDomain = userEmail.split('@')[1];
    
    // Organization-specific domain validation
    const domainMapping = {
      'org-sas': ['sas.se', 'sas.dk', 'sas.no'],
      'org-norwegian': ['norwegian.com', 'norwegian.no'],
      'org-finnair': ['finnair.com']
    };

    const allowedDomains = domainMapping[organizationId] || [];
    return allowedDomains.includes(emailDomain);
  }

  /**
   * Log AD authentication events
   */
  logADAuthenticationEvent(req, event, details = {}) {
    const auditEvent = {
      timestamp: new Date().toISOString(),
      event: event,
      authMethod: details.authMethod,
      organizationId: details.organizationId,
      userId: details.userId,
      email: details.email,
      adGroups: details.adGroups,
      mappedRoles: details.roles,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      endpoint: req.path,
      method: req.method
    };

    console.log('🔐 AD Authentication Event:', JSON.stringify(auditEvent, null, 2));
    
    // In production, send to audit system
    return auditEvent;
  }
}

module.exports = new ADIntegrationService();
