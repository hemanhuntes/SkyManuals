# 👥 SkyManuals - Användarhantering & Säkerhet

## 🔐 Autentiseringssystem

### **JWT-baserad Autentisering**
SkyManuals använder JWT (JSON Web Tokens) för säker användarautentisering:

- **Token Expiration**: 24 timmar
- **Secret Key**: Konfigurerbar via `JWT_SECRET` environment variable
- **Issuer**: `skymanuals-bff`
- **Audience**: `skymanuals-frontend`

### **Användarroller & Behörigheter**

#### **👨‍✈️ Pilot**
- **Behörigheter**: 
  - `read:manuals` - Läsa manuals
  - `read:procedures` - Läsa procedures
  - `search:manuals` - Söka i manuals
- **Användning**: Flygpersonal som behöver tillgång till operations manuals

#### **✍️ Author**
- **Behörigheter**:
  - `read:manuals` - Läsa manuals
  - `read:workflows` - Läsa workflows
  - `create:manuals` - Skapa nya manuals
  - `update:manuals` - Uppdatera befintliga manuals
- **Användning**: Tekniska skribenter som skapar och uppdaterar dokumentation

#### **🔍 Reviewer**
- **Behörigheter**:
  - `read:manuals` - Läsa manuals
  - `read:workflows` - Läsa workflows
  - `review:manuals` - Granska manuals
  - `approve:manuals` - Godkänna manuals
- **Användning**: Kvalitetssäkring och godkännande av dokumentation

#### **👑 Admin**
- **Behörigheter**:
  - `*` - Alla behörigheter
- **Användning**: Systemadministratörer med full tillgång

## 🔑 Demo-användare

### **Test Airlines (org-1)**

#### **Pilot**
- **Email**: `pilot@testairlines.com`
- **Roller**: `pilot`
- **Behörigheter**: Läsa och söka manuals

#### **Author**
- **Email**: `author@testairlines.com`
- **Roller**: `author`
- **Behörigheter**: Skapa och uppdatera manuals

#### **Reviewer**
- **Email**: `reviewer@testairlines.com`
- **Roller**: `reviewer`
- **Behörigheter**: Granska och godkänna manuals

#### **Admin**
- **Email**: `admin@testairlines.com`
- **Roller**: `admin`
- **Behörigheter**: Alla behörigheter

## 🛡️ Säkerhetsfunktioner

### **Autentiseringsmiddleware**
```javascript
// Kräver autentisering
authMiddleware.requireAuth()

// Kräver specifik behörighet
authMiddleware.requirePermission('create:manuals')

// Kräver specifik roll
authMiddleware.requireRole('admin')

// Organisation-baserad åtkomst
authMiddleware.requireOrganizationAccess()
```

### **Data Sanitization**
BFF filtrerar automatiskt bort känslig data:

```javascript
// Exempel: Manual data före och efter sanitization
// FÖRE (Backend API):
{
  id: "manual-123",
  title: "Boeing 737 Manual",
  createdBy: "user-456",        // ❌ Känslig data
  internalNotes: "Secret info", // ❌ Känslig data
  auditTrail: [...],            // ❌ Känslig data
  organizationId: "org-1"
}

// EFTER (Frontend):
{
  id: "manual-123",
  title: "Boeing 737 Manual",
  organizationId: "org-1"
  // Känslig data är bortfiltrerad
}
```

### **Säkerhetshändelser**
Alla säkerhetshändelser loggas:

- **LOGIN_SUCCESS** - Framgångsrik inloggning
- **LOGIN_FAILED** - Misslyckad inloggning
- **USER_REGISTERED** - Ny användarregistrering
- **TOKEN_EXPIRED** - Utgången token
- **INVALID_TOKEN** - Ogiltig token
- **PERMISSION_DENIED** - Behörighetsnekat

## 📱 Frontend Integration

### **Login Flow**
1. Användare besöker login-sidan
2. Väljer organisation och anger email
3. System verifierar credentials
4. JWT token genereras och sparas i localStorage
5. Användare omdirigeras till relevant app

### **Authentication Check**
Varje frontend-app kontrollerar autentisering vid sidladdning:

```javascript
// Kontrollera om användare är inloggad
const token = localStorage.getItem('skymanuals_token');
const user = localStorage.getItem('skymanuals_user');

if (!token || !user) {
    // Omdirigera till login
    window.location.href = '/login';
}
```

### **API Requests med Authentication**
Alla API-anrop inkluderar JWT token:

```javascript
fetch('/api/manuals', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
})
```

## 🔄 Användarhantering API

### **Login**
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "pilot@testairlines.com",
  "organizationId": "org-1"
}

# Response:
{
  "success": true,
  "user": {
    "id": "user-1",
    "email": "pilot@testairlines.com",
    "name": "Test Pilot",
    "organizationId": "org-1",
    "roles": ["pilot"]
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "24h"
}
```

### **Registrering**
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "newuser@airline.com",
  "name": "New User",
  "organizationId": "org-1",
  "roles": ["user"]
}
```

### **Användarinfo**
```bash
GET /api/auth/me
Authorization: Bearer <token>

# Response:
{
  "user": {
    "userId": "user-1",
    "email": "pilot@testairlines.com",
    "organizationId": "org-1",
    "roles": ["pilot"],
    "permissions": ["read:manuals", "search:manuals"]
  }
}
```

## 🚫 Säkerhetsåtgärder

### **Rate Limiting**
- **Login attempts**: Max 5 försök per IP per timme
- **API requests**: Max 1000 requests per användare per timme
- **File uploads**: Max 10 uploads per användare per dag

### **Token Security**
- **Secure cookies**: I production
- **HTTPS only**: I production
- **Token rotation**: Automatisk förnyelse vid användning
- **Logout**: Token invalideras vid utloggning

### **Organization Isolation**
- Användare kan endast komma åt data från sin egen organisation
- Admin-användare kan komma åt alla organisationer
- Cross-organization access blockeras automatiskt

## 🎯 Användningsscenarier

### **Scenario 1: Pilot behöver läsa manual**
1. Pilot loggar in med `pilot@testairlines.com`
2. System verifierar pilot-roll och organisation
3. Pilot får tillgång till Manual Viewer
4. Kan söka och läsa manuals för sin organisation
5. Kan INTE ladda upp eller redigera manuals

### **Scenario 2: Author laddar upp ny manual**
1. Author loggar in med `author@testairlines.com`
2. System verifierar author-roll och organisation
3. Author får tillgång till Upload App
4. Kan ladda upp PDF/XML dokument
5. System loggar upload-händelse för audit

### **Scenario 3: Reviewer godkänner manual**
1. Reviewer loggar in med `reviewer@testairlines.com`
2. System verifierar reviewer-roll och organisation
3. Reviewer får tillgång till Workflow Management
4. Kan granska och godkänna manuals
5. System loggar approval-händelse för compliance

## 🔧 Konfiguration

### **Environment Variables**
```bash
# JWT Secret (CHANGE IN PRODUCTION!)
JWT_SECRET=your-super-secret-key-here

# Token expiration
JWT_EXPIRATION=24h

# Rate limiting
RATE_LIMIT_WINDOW_MS=3600000  # 1 hour
RATE_LIMIT_MAX_REQUESTS=1000

# File upload limits
MAX_FILE_SIZE=10485760        # 10MB
MAX_FILES_PER_DAY=10
```

### **Production Security Checklist**
- [ ] Ändra JWT_SECRET till stark, slumpmässig nyckel
- [ ] Aktivera HTTPS för alla endpoints
- [ ] Konfigurera rate limiting
- [ ] Aktivera audit logging
- [ ] Sätta upp monitoring för säkerhetshändelser
- [ ] Konfigurera backup av användardata
- [ ] Testa säkerhetsåtgärder

## 📊 Monitoring & Auditing

### **Säkerhetshändelser som loggas**
- Alla inloggningsförsök (framgångsrika och misslyckade)
- Behörighetsändringar
- API-anrop med känslig data
- File uploads och downloads
- Token-generering och förnyelse

### **Compliance & Audit**
- **EASA Compliance**: Alla händelser loggas för regulatory compliance
- **Chain of Custody**: Fullständig spårning av dokumenthantering
- **User Activity**: Detaljerad loggning av användaraktivitet
- **Security Events**: Alla säkerhetshändelser för incident response

---

**Denna användarhantering ger dig en komplett, säker och skalerbar lösning för SkyManuals systemet!** 🔐✈️
