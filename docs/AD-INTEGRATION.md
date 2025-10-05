# Active Directory Integration Guide

## 🎯 **Översikt**
Flygbolag vill använda sina befintliga AD-credentials för att logga in på SkyManuals. Detta dokument beskriver olika integrationstrategier.

## 🔐 **Integration Alternativ**

### **1. SAML 2.0 (Rekommenderat)**
**Fördelar:**
- Standard för enterprise SSO
- Stöd för flera identity providers
- Centraliserad användarhantering
- Stark säkerhet med digitala certifikat

**Implementation:**
```javascript
// SAML Service Provider (SP) integration
const saml = require('passport-saml');
const passport = require('passport');

// SAML Strategy
passport.use(new saml.Strategy({
  entryPoint: process.env.AD_SAML_ENTRY_POINT, // https://ad.company.com/saml/sso
  issuer: 'skymanuals-sp',
  callbackUrl: 'https://skymanuals.com/auth/saml/callback',
  cert: process.env.AD_SAML_CERT, // AD server certificate
  signatureAlgorithm: 'sha256'
}, (profile, done) => {
  // Map AD user to SkyManuals user
  const user = mapADUserToSkyManuals(profile);
  return done(null, user);
}));
```

### **2. OAuth 2.0 / OpenID Connect**
**Fördelar:**
- Modern standard
- Stöd för mobile apps
- Granular permissions

**Implementation:**
```javascript
// OAuth 2.0 with AD as provider
const OAuth2Strategy = require('passport-oauth2');

passport.use('azure-ad', new OAuth2Strategy({
  authorizationURL: 'https://login.microsoftonline.com/{tenant}/oauth2/authorize',
  tokenURL: 'https://login.microsoftonline.com/{tenant}/oauth2/token',
  clientID: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  callbackURL: 'https://skymanuals.com/auth/azure/callback'
}, (accessToken, refreshToken, profile, done) => {
  // Handle Azure AD user
  const user = mapAzureADUserToSkyManuals(profile);
  return done(null, user);
}));
```

### **3. LDAP Integration**
**Fördelar:**
- Direkt integration med AD
- Real-time user validation
- Group-based role mapping

**Implementation:**
```javascript
const ldap = require('ldapjs');

async function authenticateWithLDAP(username, password) {
  const client = ldap.createClient({
    url: process.env.AD_LDAP_URL // ldap://ad.company.com:389
  });

  return new Promise((resolve, reject) => {
    client.bind(`CN=${username},OU=Users,DC=company,DC=com`, password, (err) => {
      if (err) {
        client.unbind();
        return reject(err);
      }
      
      // Get user details from AD
      client.search('DC=company,DC=com', {
        filter: `(sAMAccountName=${username})`,
        scope: 'sub'
      }, (err, res) => {
        if (err) return reject(err);
        
        let userData = {};
        res.on('searchEntry', (entry) => {
          userData = {
            username: entry.object.sAMAccountName,
            email: entry.object.mail,
            name: entry.object.displayName,
            groups: entry.object.memberOf
          };
        });
        
        res.on('end', () => {
          client.unbind();
          resolve(userData);
        });
      });
    });
  });
}
```

## 🏗️ **Arkitektur för AD Integration**

### **Hybrid Approach (Rekommenderat)**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   BFF/API        │    │   External AD   │
│                 │    │                  │    │                 │
│ Login Page      │◄──►│ Auth Service     │◄──►│ SAML/OAuth/LDAP │
│ - SAML Redirect │    │ - User Mapping   │    │ - User Store    │
│ - Token Storage │    │ - Role Mapping   │    │ - Group Store   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🔧 **Implementation Plan**

### **Phase 1: SAML Integration**
1. **Install Dependencies**
   ```bash
   npm install passport-saml express-session
   ```

2. **SAML Configuration**
   ```javascript
   // bff/saml-config.js
   module.exports = {
     saml: {
       entryPoint: process.env.AD_SAML_ENTRY_POINT,
       issuer: 'skymanuals',
       callbackUrl: `${process.env.BFF_URL}/auth/saml/callback`,
       cert: process.env.AD_SAML_CERT,
       acceptedClockSkewMs: -1,
       identifierFormat: null,
       signatureAlgorithm: 'sha256'
     }
   };
   ```

3. **User Mapping Service**
   ```javascript
   // bff/services/user-mapping.service.js
   class UserMappingService {
     mapADUserToSkyManuals(adProfile) {
       return {
         id: adProfile.nameID,
         email: adProfile.email,
         name: adProfile.displayName,
         organizationId: this.extractOrgFromEmail(adProfile.email),
         roles: this.mapADGroupsToRoles(adProfile.memberOf),
         adGroups: adProfile.memberOf,
         lastLogin: new Date().toISOString()
       };
     }
   
     mapADGroupsToRoles(adGroups) {
       const roleMapping = {
         'CN=Pilots,OU=Groups,DC=airline,DC=com': ['pilot'],
         'CN=Authors,OU=Groups,DC=airline,DC=com': ['author'],
         'CN=Reviewers,OU=Groups,DC=airline,DC=com': ['reviewer'],
         'CN=Admins,OU=Groups,DC=airline,DC=com': ['admin']
       };
   
       const roles = [];
       adGroups.forEach(group => {
         if (roleMapping[group]) {
           roles.push(...roleMapping[group]);
         }
       });
   
       return roles.length > 0 ? roles : ['user'];
     }
   
     extractOrgFromEmail(email) {
       const domain = email.split('@')[1];
       const orgMapping = {
         'sas.se': 'org-sas',
         'norwegian.com': 'org-norwegian',
         'finnair.com': 'org-finnair'
       };
       return orgMapping[domain] || 'org-default';
     }
   }
   ```

### **Phase 2: Frontend Integration**
```javascript
// Frontend SAML Login
function initiateSAMLLogin() {
  const samlLoginUrl = `${BFF_URL}/auth/saml/login`;
  window.location.href = samlLoginUrl;
}

// SAML Callback Handler
function handleSAMLCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (token) {
    localStorage.setItem('skymanuals_token', token);
    // Redirect to appropriate dashboard
  }
}
```

### **Phase 3: Configuration Management**
```javascript
// bff/config/organization-config.js
const organizationConfigs = {
  'org-sas': {
    saml: {
      entryPoint: 'https://ad.sas.se/saml/sso',
      cert: '-----BEGIN CERTIFICATE-----\n...',
      groupMapping: {
        'CN=Pilots,OU=SAS,DC=sas,DC=se': ['pilot'],
        'CN=Maintenance,OU=SAS,DC=sas,DC=se': ['author', 'reviewer']
      }
    }
  },
  'org-norwegian': {
    saml: {
      entryPoint: 'https://sts.norwegian.com/saml/sso',
      cert: '-----BEGIN CERTIFICATE-----\n...',
      groupMapping: {
        'CN=Cockpit Crew,OU=Norwegian,DC=norwegian,DC=com': ['pilot'],
        'CN=Technical,OU=Norwegian,DC=norwegian,DC=com': ['author']
      }
    }
  }
};
```

## 🔒 **Säkerhetsaspekter**

### **1. Certificate Management**
```javascript
// Automatic certificate validation
const crypto = require('crypto');

function validateSAMLResponse(response, certificate) {
  try {
    const cert = crypto.X509Certificate(certificate);
    // Validate signature and certificate chain
    return true;
  } catch (error) {
    console.error('Certificate validation failed:', error);
    return false;
  }
}
```

### **2. Session Management**
```javascript
// Secure session handling
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
```

### **3. Audit Logging**
```javascript
// Enhanced audit logging for AD integration
function logADAuthentication(req, user, adProfile) {
  const auditEvent = {
    timestamp: new Date().toISOString(),
    event: 'AD_LOGIN_SUCCESS',
    userId: user.id,
    email: user.email,
    organizationId: user.organizationId,
    adGroups: adProfile.memberOf,
    mappedRoles: user.roles,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Send to audit system
  auditLogger.log(auditEvent);
}
```

## 📋 **Deployment Checklist**

### **Pre-Deployment**
- [ ] SAML certificates configured
- [ ] Organization group mappings defined
- [ ] User role mappings tested
- [ ] Certificate validation working
- [ ] Session security configured

### **Post-Deployment**
- [ ] AD integration tested with each airline
- [ ] User provisioning working
- [ ] Role mapping verified
- [ ] Audit logging functional
- [ ] Fallback authentication available

## 🚀 **Migration Strategy**

### **Phase 1: Parallel Systems**
- Keep existing mock authentication
- Add SAML as alternative login method
- Test with pilot airlines

### **Phase 2: Gradual Migration**
- Migrate airlines one by one
- Monitor authentication success rates
- Provide fallback for issues

### **Phase 3: Full Migration**
- Disable mock authentication
- All airlines use AD integration
- Enhanced monitoring and alerting

## 🔧 **Environment Variables**
```bash
# SAML Configuration
AD_SAML_ENTRY_POINT=https://ad.airline.com/saml/sso
AD_SAML_CERT=-----BEGIN CERTIFICATE-----...
SAML_CALLBACK_URL=https://skymanuals.com/auth/saml/callback

# LDAP Configuration (Alternative)
AD_LDAP_URL=ldap://ad.airline.com:389
AD_LDAP_BASE_DN=DC=airline,DC=com
AD_LDAP_BIND_DN=CN=skymanuals,OU=Service Accounts,DC=airline,DC=com

# OAuth Configuration (Alternative)
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id
```

## 📞 **Support & Troubleshooting**

### **Common Issues**
1. **Certificate Expiration**: Automatic monitoring and alerts
2. **Group Mapping Errors**: Fallback to default roles
3. **Network Issues**: Retry logic and fallback authentication
4. **User Not Found**: Graceful error handling

### **Monitoring**
- Authentication success rates
- Certificate expiration dates
- Group mapping effectiveness
- User provisioning errors
