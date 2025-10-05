# ADR-002: Offline-First EFB Architecture

## Status
Accepted

## Context
Electronic Flight Bag (EFB) applications must operate reliably in environments where:
- Network connectivity is intermittent or unavailable (during flight)
- Critical safety documentation must be accessible offline
- Regulatory compliance requires immutable audit trails
- Data integrity cannot be compromised even with network issues
- Multiple pilots may need simultaneous access to same documents

Standard web applications fail in aviation environments because they assume continuous connectivity.

## Decision
Implement an offline-first architecture for EFB applications using:
- Local file-based caching with conflict resolution
- Delta synchronization for incremental updates
- Priority-based sync queues for critical documents
- Cryptographic integrity verification

## Consequences

### Positive
- **Flight safety**: Critical documents available during network outages
- **Regulatory compliance**: Maintains audit trails even offline
- **User experience**: Smooth operation regardless of connectivity
- **Data sovereignty**: All critical data remains on device
- **Performance**: Fast local access without network latency
- **Reliability**: Works in challenging aviation environments

### Negative
- **Complexity**: Conflict resolution and sync logic added
- **Storage overhead**: Local caching requires significant device storage
- **Sync synchronization**: Managing consistency across devices
- **Initial download**: Large initial sync required

## Technical Architecture

### Local Storage Strategy
```typescript
interface EFBStorageArchitecture {
  // Critical documents (Level 1-2 priority)
  criticalDocuments: {
    storage: {
      device: string; // /efb/data/critical/
      format: 'encrypted_sqlite';
      encryption: 'AES-256-GCM';
      retention: 'indefinite';
    };
    documents: ['AFM', 'MMEL', 'EmergencyProcedures'];
    size_limitations: 'first 50MB per manual';
  };
  
  // Operational documents (Level 3-4 priority)  
  operationalDocuments: {
    storage: {
      device: string; // /efb/data/operational/
      format: 'sqlite';
      compression: 'gzip';
    };
    documents: ['SOPs', 'Charts', 'MaintenanceManuals'];
    size_limitations: 'LruCache<500MB>';
  };
  
  // Cache & Metadata
  metadataCache: {
    storage: string; // /efb/data/metadata/
    contents: ['search_index', 'document_versions', 'sync_status'];
    format: 'compressed_json';
  };
}
```

### Conflict Resolution Matrix
| Document Type | Conflict Strategy | Rationale |
|---------------|------------------|-----------|
| Regulatory (AFM/MMEL) | SERVER_WINS | Official documents are authoritative |
| Operational (SOPs) | APPROVAL_REQUIRED | Manager review needed for conflicts |
| User Annotations | CLIENT_WINS | Personal comments belong to user |
| System Metadata | SERVER_WINS | Technical data synchronized from server |

### Sync Priority Levels
```typescript
enum SyncPriority {
  CRITICAL_SAFETY = 1,    // AFM, MMEL, Emergency Procedures
  HIGH_SAFETY = 2,        // SOPs, Checklists, Flight Manuals
  OPERATIONAL = 3,        // Charts, Airport Information
  MAINTENANCE = 4,        // Technical Manuals, Service Bulletins
  POLICY = 5,            // Company Policies, Training Materials
  HISTORICAL = 6         // Archived Documents, References
}

interface SyncScenarios {
  preFlight: {
    timeframe: '2 hours before departure';
    priority: 'CRITICAL_SAFETY + HIGH_SAFETY';
    timeout: '30 minutes';
    fallback: 'DELAY_FLIGHT';
  };
  
  midFlightConnectivity: {
    allowed: ['high_priority_updates', 'user_notes_upload'];
    forbidden: ['document_modifications', 'conflict_resolution'];
    timeout: '5 minutes';
  };
  
  extendedOffline72h: {
    capability: 'full_functionality_maintained';
    critical_maintained: 'true';
    limitations: ['no_document_updates', 'no_user_registration'];
  };
}
```

## Implementation Strategy

### Phase 1: Foundation (Epic-07)
- [x] **Basic offline caching** with SQLite
- [x] **Document chunking** for incremental sync
- [x] **Integrity verification** with SHA-256 hashes

### Phase 2: Conflict Resolution
- [ ] **Server-wins** strategy for regulatory documents
- [ ] **Approval workflow** for operational document conflicts
- [ ] **User annotation** preservation during sync

### Phase 3: Advanced Features
- [ ] **Conflict prediction** using machine learning
- [ ] **Intelligent prefetching** based on flight schedules
- [ ] **Bandwidth optimization** for cellular networks

## Security Architecture

### Data Protection
```typescript
interface EFBSecurityModel {
  storageEncryption: {
    algorithm: 'AES-256-GCM';
    keyDerivation: 'PBKDF2-SHA512-100000';
    keyStorage: 'KeyChain (iOS) / Keystore (Android)';
  };
  
  transportSecurity: {
    protocol: 'TLS 1.3';
    certificatePinning: 'SkyManuals-Certificate';
    mutualTLS: 'required_for_sync';
  };
  
  accessControl: {
    deviceBinding: 'hardware_id + biometric';
    sessionTimeout: '30_minutes_inactive';
    remoteWipeCapability: 'organization_admin';
  };
}
```

### Integrity Verification
- **Chain of custody**: SHA-256 hash chain across all document versions
- **Tamper detection**: Cryptographic signatures on critical documents  
- **Sync verification**: MD5 checksums for all transferred chunks
- **Audit logging**: All offline operations logged for regulatory compliance

## Regulatory Compliance

### EASA/FAA Requirements
- **Data retention**: 7+ year audit trail for all aviation documents
- **Immutable history**: Document changes cannot be backdated
- **Chain of custody**: Complete provenance tracking for all modifications
- **Backup verification**: Regular integrity checks on cached documents

### Audit Trail Requirements
```sql
CREATE TABLE efb_audit_log (
  id UUID PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  document_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'ACCESS', 'MODIFY', 'SYNC', 'DELETE'
  offline_timestamp TIMESTAMP WITH TIME ZONE,
  network_timestamp TIMESTAMP WITH TIME ZONE,
  hash_chain VARCHAR(64) NOT NULL, -- Links to previous audit entry
  signature VARCHAR(256) NOT NULL,  -- Cryptographic signature
  regulatory_framework VARCHAR(10) NOT NULL -- 'EASA', 'FAA', etc.
);
```

## Performance Requirements

### Sync Performance
- **Critical documents**: <5 minutes for 100MB of MMEL/AFM data
- **Operational documents**: <15 minutes for 500MB of SOPs/charts
- **Conflict resolution**: <2 minutes for 95% of automatic conflicts
- **Integrity verification**: <30 seconds for full document validation

### Storage Optimization
```typescript
interface StorageManagement {
  compressionRatio: '3:1 for documents, 5:1 for metadata';
  lruEviction: 'operational documents after 30 days inactive';
  criticalRetention: 'indefinite until manually cleared';
  
  sizeLimits: {
    criticalDocuments: '200MB per aircraft type';
    operationalDocuments: '500MB total device cache';
    metadataIndex: '50MB maximum';
  };
}
```

## Monitoring & Observability

### Aviation KPIs
- **Sync success rate**: Target >99% voor critical documents
- **Offline availability**: Target >99.95% voor approved documents
- **Conflict resolution time**: Target <5 minutes voor automatic resolution
- **Storage health**: Alert when >85% device storage utilized

### Incident Response
```typescript
interface EFBIncidentResponse {
  criticalSyncFailure: {
    threshold: '<95% success rate for 1 hour';
    actions: ['alert_flight_ops', 'manual_procedure_activation'];
    escalation: 'immediate_flight_operations_manager';
  };
  
  integrityViolation: {
    detection: 'hash_mismatch_in_cache';
    actions: ['mark_document_corrupted', 'force_re_sync', 'log_security_event'];
    compliance: 'immediate_regulatory_notification';
  };
}
```

## Alternatives Considered

### Custom Binary Protocol
**Rejected because:**
- Higher complexity vs HTTP REST
- Limited debugging capabilities
- Difficult integration with existing web APIs

### Git-Based Sync
**Rejected because:**
- Not designed for aviation documents
- Conflict resolution too simplistic
- Performance issues with large files

### Database Sync Frameworks
**Rejected because:**
- EFB runs on mobile devices with limited resources
- Complex backend integration requirements
- Not aviation-compliance aware

This offline-first architecture ensures EFB applications meet aviation requirements for reliability, compliance, and operational safety while providing excellent user experience regardless of connectivity.






