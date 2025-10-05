# 🏗️ SkyManuals Frontend + BFF Architecture

## 📋 Översikt

Denna arkitektur implementerar en **Backend for Frontend (BFF)** pattern som säkert hanterar kommunikationen mellan frontend-applikationer och backend-API:et.

## 🎯 Arkitektur Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Upload FE     │    │   Viewer FE     │    │   Admin FE      │
│   Port: 3003    │    │   Port: 3004    │    │   Port: 3005    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │        BFF Gateway        │
                    │       Port: 3002          │
                    │  • Data Sanitization      │
                    │  • API Aggregation        │
                    │  • Security Layer         │
                    │  • Error Handling         │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │     Backend API           │
                    │     Port: 3001            │
                    │  • Business Logic         │
                    │  • Database Access        │
                    │  • External Services      │
                    └───────────────────────────┘
```

## 🔧 Komponenter

### **1. BFF (Backend for Frontend)**
- **Port**: 3002
- **Funktioner**:
  - Data sanitization och säkerhet
  - API aggregation
  - Error handling och retry logic
  - File upload handling
  - CORS management
  - Rate limiting

### **2. Upload Frontend**
- **Port**: 3003
- **Funktioner**:
  - Drag & drop file upload
  - PDF/XML validation
  - Progress tracking
  - File metadata input

### **3. Manual Viewer Frontend**
- **Port**: 3004
- **Funktioner**:
  - Browse all manuals
  - AI-powered search
  - Workflow status
  - Task management

### **4. Backend API**
- **Port**: 3001
- **Funktioner**:
  - Business logic
  - Database operations
  - External service integration

## 🚀 Starta Systemet

```bash
# Starta hela systemet
./start-system.sh

# Eller manuellt:
# 1. Starta Backend API
cd apps/api && node start-basic.js

# 2. Starta BFF
cd bff && npm install && node server.js

# 3. Starta Frontend apps
cd frontend/upload && python3 -m http.server 3003
cd frontend/viewer && python3 -m http.server 3004
```

## 📡 API Endpoints

### **BFF Endpoints (Port 3002)**

#### **Manual Management**
```bash
GET  /api/manuals              # Lista alla manuals
GET  /api/manuals/:id          # Hämta specifik manual
POST /api/manuals/upload       # Upload dokument
```

#### **Search & AI**
```bash
POST /api/search/ask           # AI-powered search
```

#### **Workflow Management**
```bash
GET  /api/workflows            # Lista workflows
GET  /api/workflows/:id        # Hämta specifik workflow
```

#### **Task Management**
```bash
GET  /api/tasks                # Lista tasks
GET  /api/tasks/:id            # Hämta specifik task
```

## 🔒 Säkerhetsfunktioner

### **Data Sanitization**
BFF filtrerar bort känslig data innan den skickas till frontend:

```javascript
// Exempel: Manual data sanitization
{
  // ✅ Visas i frontend
  id: "manual-123",
  title: "Boeing 737 Manual",
  version: "1.0.0",
  status: "RELEASED",
  
  // ❌ Dold från frontend
  // createdBy: "user-456",
  // internalNotes: "Sensitive info",
  // auditTrail: [...]
}
```

### **File Upload Security**
- File type validation (PDF, XML only)
- File size limits (10MB max)
- Virus scanning (simulerat)
- Secure file handling

### **API Security**
- CORS protection
- Rate limiting
- Input validation
- Error message sanitization

## 📊 Frontend Features

### **Upload Frontend**
- **Drag & Drop**: Intuitiv filuppladdning
- **File Validation**: Automatisk validering av filtyp och storlek
- **Progress Tracking**: Visuell progress bar
- **Metadata Input**: Titel, beskrivning, version
- **Organization Selection**: Välj organisation

### **Viewer Frontend**
- **Manual Grid**: Visuell översikt av alla manuals
- **AI Search**: Sök i manuals med naturligt språk
- **Workflow Status**: Se status på approval-processer
- **Task Management**: Visa pending tasks
- **Responsive Design**: Fungerar på alla enheter

## 🔄 Data Flow

### **Upload Process**
1. User väljer fil i Upload FE
2. File valideras i frontend
3. File + metadata skickas till BFF
4. BFF validerar och skickar till Backend API
5. Backend API processerar och sparar
6. BFF returnerar sanitized response
7. Frontend visar success/error

### **Search Process**
1. User skriver query i Viewer FE
2. Query skickas till BFF
3. BFF skickar till Backend API för AI search
4. Backend API returnerar results
5. BFF sanitizerar och returnerar
6. Frontend visar results med highlighting

## 🛠️ Development

### **BFF Development**
```bash
cd bff
npm install
npm run dev  # Med nodemon för auto-reload
```

### **Frontend Development**
```bash
# Upload Frontend
cd frontend/upload
python3 -m http.server 3003

# Viewer Frontend  
cd frontend/viewer
python3 -m http.server 3004
```

### **Testing**
```bash
# Test BFF endpoints
curl http://localhost:3002/health
curl http://localhost:3002/api/manuals

# Test Backend API
curl http://localhost:3001/health
curl http://localhost:3001/api/manuals
```

## 📈 Performance

### **BFF Optimizations**
- Request aggregation
- Response caching
- Error handling med retry
- Connection pooling

### **Frontend Optimizations**
- Lazy loading av manuals
- Search debouncing
- Progressive image loading
- Responsive images

## 🔧 Configuration

### **Environment Variables**
```bash
# BFF Configuration
BFF_PORT=3002
API_BASE_URL=http://localhost:3001

# Backend Configuration
API_PORT=3001
```

### **CORS Settings**
```javascript
// BFF CORS configuration
cors({
  origin: ['http://localhost:3003', 'http://localhost:3004'],
  credentials: true
})
```

## 🎯 Benefits

### **För Frontend**
- Enkel integration
- Säker data access
- Error handling
- Performance optimization

### **För Backend**
- Skyddad från frontend changes
- Centraliserad business logic
- Bättre säkerhet
- Lättare testing

### **För Systemet**
- Loose coupling
- Scalability
- Maintainability
- Security

## 🚀 Nästa Steg

1. **Authentication**: Lägg till JWT authentication
2. **Real-time**: WebSocket integration för live updates
3. **Caching**: Redis caching för bättre performance
4. **Monitoring**: ELK Stack integration
5. **Testing**: Unit och integration tests
6. **CI/CD**: Automated deployment pipeline

---

**Denna arkitektur ger dig en professionell, säker och skalerbar lösning för SkyManuals systemet!** 🎉
