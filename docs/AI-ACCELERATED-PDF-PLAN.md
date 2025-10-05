# AI-Accelererad PDF-Only Implementation Plan

## Overview

**Reviderad strategi:** AI-accelererad utveckling med PDF-only approach för snabbare time-to-market.

**Total tid: 4-6 veckor** (korrigerat från 8-12 veckor)

---

## **Phase 1: Core Infrastructure (Dag 1-5)**

### Dag 1-2: PDF Upload & Processing

**EPIC-01: Simplified File Processing**

```typescript
// apps/api/src/manuals/manual-processing.service.ts

@Injectable()
export class ManualProcessingService {
  
  async processUploadedPDF(file: Buffer, filename: string): Promise<ProcessedManual> {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(file);
    
    // Extract text and metadata
    const text = data.text;
    const metadata = {
      pages: data.numpages,
      info: data.info,
      version: data.version
    };
    
    // Parse structure using patterns
    const structure = this.parseAviationManualStructure(text);
    
    return {
      title: this.extractTitle(text, metadata),
      chapters: structure.chapters,
      sections: structure.sections,
      blocks: structure.blocks,
      metadata
    };
  }
  
  private parseAviationManualStructure(text: string): ManualStructure {
    // Aviation manuals följer standard patterns:
    // "CHAPTER 1" or "1. CHAPTER TITLE"
    // "Section 1.1" or "1.1 SECTION TITLE"
    
    const chapters = [];
    const chapterRegex = /(?:CHAPTER|Chapter)\s+(\d+)[:\s]+(.+?)(?=(?:CHAPTER|Chapter)\s+\d+|$)/gs;
    
    let match;
    while ((match = chapterRegex.exec(text)) !== null) {
      const chapterNumber = match[1];
      const chapterContent = match[2];
      
      chapters.push({
        number: parseInt(chapterNumber),
        title: this.extractChapterTitle(chapterContent),
        sections: this.extractSections(chapterContent),
        content: chapterContent
      });
    }
    
    return { chapters };
  }
}
```

**Endpoint:**
```typescript
@Post('manuals/upload')
@UseInterceptors(FileInterceptor('file'))
async uploadManual(
  @UploadedFile() file: Express.Multer.File,
  @Body() metadata: ManualMetadata,
  @Req() req: any
) {
  // Validate PDF
  if (file.mimetype !== 'application/pdf') {
    throw new BadRequestException('Only PDF files are supported');
  }
  
  // Process PDF
  const processed = await this.processingService.processUploadedPDF(
    file.buffer,
    file.originalname
  );
  
  // Create manual in database
  const manual = await this.manualService.create({
    ...metadata,
    organizationId: req.user.organizationId,
    createdBy: req.user.id,
    content: processed
  });
  
  // Generate initial changeset
  await this.changesetService.createInitial(manual.id);
  
  return manual;
}
```

**Deliverables:**
- PDF upload endpoint
- Structure parsing (chapters/sections)
- Database creation
- Initial changeset

---

### Dag 3-4: Export & Version Control

**EPIC-01: Export (PDF only för nu)**

```typescript
// apps/api/src/manuals/manual-export.service.ts

@Injectable()
export class ManualExportService {
  
  async exportToPDF(manualId: string): Promise<Buffer> {
    const manual = await this.getManualWithContent(manualId);
    
    // Use puppeteer för PDF generation
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Render HTML
    const html = this.renderManualHTML(manual);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
    });
    
    await browser.close();
    return pdf;
  }
  
  async compareVersions(manualId: string, v1: string, v2: string) {
    // Simple text diff
    const version1 = await this.getVersion(manualId, v1);
    const version2 = await this.getVersion(manualId, v2);
    
    const diff = require('diff');
    const changes = diff.diffLines(
      JSON.stringify(version1.content, null, 2),
      JSON.stringify(version2.content, null, 2)
    );
    
    return {
      changes: changes.filter(c => c.added || c.removed),
      summary: this.generateSummary(changes)
    };
  }
}
```

**Deliverables:**
- PDF export
- Version comparison
- Diff API

---

### Dag 5: Performance Optimization

**EPIC-01: Pagination & Caching**

```typescript
// Prisma optimization
@Get(':id/chapters')
async getChapters(
  @Param('id') id: string,
  @Query('page') page: number = 1,
  @Query('size') size: number = 20
) {
  const skip = (page - 1) * size;
  
  const [chapters, total] = await Promise.all([
    this.prisma.chapter.findMany({
      where: { manualId: id },
      skip,
      take: size,
      select: {
        id: true,
        number: true,
        title: true,
        _count: { select: { sections: true } }
      }
    }),
    this.prisma.chapter.count({ where: { manualId: id } })
  ]);
  
  return { chapters, total, page, size };
}

// Redis caching
@Injectable()
export class CacheInterceptor {
  async getManual(id: string) {
    const cacheKey = `manual:${id}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    // Fetch from DB
    const manual = await this.prisma.manual.findUnique({ where: { id } });
    
    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(manual));
    
    return manual;
  }
}
```

**Deliverables:**
- Paginated endpoints
- Redis caching
- Database query optimization

---

## **Phase 2: Notifications & Workflow (Dag 6-12)**

### Dag 6-8: Email System

**EPIC-02: AWS SES + Templates**

```typescript
// Simple email templates
const TEMPLATES = {
  taskAssigned: {
    subject: 'New Approval Task: {{taskTitle}}',
    html: `
      <h2>New Task Assigned</h2>
      <p>Hi {{userName}},</p>
      <p>You have been assigned: <strong>{{taskTitle}}</strong></p>
      <p>Manual: {{manualTitle}}</p>
      <p>Due: {{dueDate}}</p>
      <a href="{{taskUrl}}">Review Task</a>
    `
  },
  workflowStatusChange: {
    subject: 'Workflow Status Changed: {{manualTitle}}',
    html: `
      <h2>Status Update</h2>
      <p>{{manualTitle}} is now {{status}}</p>
    `
  }
};

// Send email
async sendEmail(templateName: string, to: string, data: any) {
  const template = TEMPLATES[templateName];
  const subject = this.render(template.subject, data);
  const html = this.render(template.html, data);
  
  await this.sesClient.send(new SendEmailCommand({
    Source: 'noreply@skymanuals.com',
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: html } }
    }
  }));
}
```

**Deliverables:**
- AWS SES setup
- 5 core email templates
- Email queue (Bull)

---

### Dag 9-10: Slack + WebSocket

**EPIC-02: Real-time Notifications**

```typescript
// Slack webhooks
async notifySlack(channel: string, message: string) {
  await axios.post(process.env.SLACK_WEBHOOK_URL, {
    channel,
    text: message,
    username: 'SkyManuals',
    icon_emoji: ':airplane:'
  });
}

// WebSocket gateway
@WebSocketGateway()
export class NotificationGateway {
  @WebSocketServer() server: Server;
  
  sendToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
```

**Deliverables:**
- Slack integration
- WebSocket notifications
- Notification center

---

### Dag 11-12: Workflow State Machine

**EPIC-02: Validation Logic**

```typescript
// State machine
const TRANSITIONS = {
  DRAFT: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['APPROVED', 'REJECTED', 'SUSPENDED'],
  SUSPENDED: ['IN_PROGRESS', 'CANCELLED'],
  APPROVED: ['COMPLETED'],
  REJECTED: ['DRAFT', 'CANCELLED']
};

function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// Validation
async validateWorkflowTransition(workflowId: string, newStatus: string) {
  const workflow = await this.getWorkflow(workflowId);
  
  if (!canTransition(workflow.status, newStatus)) {
    throw new BadRequestException('Invalid state transition');
  }
  
  if (newStatus === 'APPROVED') {
    const pending = await this.getPendingTasks(workflowId);
    if (pending.length > 0) {
      throw new BadRequestException('Tasks still pending');
    }
  }
  
  return true;
}
```

**Deliverables:**
- State machine
- Transition validation
- Permission checks

---

## **Phase 3: Distribution & CDN (Dag 13-20)**

### Dag 13-15: Bundle Generation

**EPIC-03: Publication Pipeline**

```typescript
async generateBundle(manualId: string): Promise<ReaderBundle> {
  // 1. Snapshot
  const snapshot = await this.createSnapshot(manualId);
  
  // 2. Generate chunks (1MB each)
  const chunks = await this.chunkContent(snapshot, 1024 * 1024);
  
  // 3. Upload to S3
  for (const chunk of chunks) {
    const key = `bundles/${snapshot.id}/chunk-${chunk.index}.json.gz`;
    const compressed = zlib.gzipSync(JSON.stringify(chunk.data));
    
    await this.s3.upload(key, compressed);
  }
  
  // 4. Create manifest
  const manifest = {
    version: snapshot.version,
    chunks: chunks.map(c => ({
      index: c.index,
      checksum: c.checksum,
      size: c.size
    }))
  };
  
  await this.s3.upload(`bundles/${snapshot.id}/manifest.json`, JSON.stringify(manifest));
  
  return this.createBundleRecord(snapshot.id, manifest);
}
```

**Deliverables:**
- Bundle generation
- Chunking algorithm
- S3 upload

---

### Dag 16-18: CloudFront Setup

**EPIC-03: CDN Distribution**

```bash
# Terraform för CloudFront
resource "aws_cloudfront_distribution" "bundles" {
  origin {
    domain_name = aws_s3_bucket.bundles.bucket_regional_domain_name
    origin_id   = "S3-bundles"
    
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.bundles.cloudfront_access_identity_path
    }
  }
  
  enabled = true
  
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-bundles"
    
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
  }
}
```

**TypeScript:**
```typescript
// Signed URLs
getSignedUrl(bundleId: string, chunkIndex: number): string {
  const signer = new CloudFrontSigner({
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
    privateKey: process.env.CLOUDFRONT_PRIVATE_KEY
  });
  
  return signer.getSignedUrl({
    url: `https://${CDN_DOMAIN}/bundles/${bundleId}/chunk-${chunkIndex}.json.gz`,
    expires: Date.now() + 24 * 60 * 60 * 1000
  });
}
```

**Deliverables:**
- CloudFront distribution
- Signed URLs
- Cache invalidation

---

### Dag 19-20: Reader API

**EPIC-03: Reader Endpoints**

```typescript
@Get('bundles/:id')
async getBundle(@Param('id') id: string) {
  const bundle = await this.prisma.readerBundle.findUnique({
    where: { id },
    include: { manual: true }
  });
  
  // Get signed URLs for chunks
  const manifest = await this.s3.getObject(`bundles/${id}/manifest.json`);
  const chunks = JSON.parse(manifest.Body.toString());
  
  return {
    id,
    title: bundle.manual.title,
    version: bundle.version,
    chunks: chunks.map((c, i) => ({
      index: i,
      url: this.getSignedUrl(id, i),
      checksum: c.checksum
    }))
  };
}

@Post('sessions/progress')
async updateProgress(@Body() data: ProgressUpdate) {
  await this.prisma.readerSession.upsert({
    where: { userId_bundleId: { userId: data.userId, bundleId: data.bundleId } },
    update: {
      currentChapter: data.chapter,
      progress: data.progress,
      readingTime: { increment: data.timeSpent }
    },
    create: data
  });
}
```

**Deliverables:**
- Reader API
- Progress tracking
- Analytics

---

## **Phase 4: AI & Compliance (Dag 21-28)**

### Dag 21-24: OpenAI Integration

**EPIC-04: AI Matching**

```typescript
async matchRegulations(content: string): Promise<Match[]> {
  // 1. Generate embedding
  const embedding = await this.openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: content
  });
  
  // 2. Vector search
  const results = await this.prisma.$queryRaw`
    SELECT id, title, content, 
      1 - (embedding <=> ${embedding.data[0].embedding}::vector) as similarity
    FROM regulations
    WHERE 1 - (embedding <=> ${embedding.data[0].embedding}::vector) > 0.7
    ORDER BY similarity DESC
    LIMIT 5
  `;
  
  // 3. GPT-4 validation
  const validated = await this.openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{
      role: 'system',
      content: 'You are an aviation compliance expert. Analyze if these regulations apply to the given content.'
    }, {
      role: 'user',
      content: `Content: ${content}\n\nRegulations: ${JSON.stringify(results)}`
    }]
  });
  
  return this.parseGPTResponse(validated);
}
```

**Deliverables:**
- OpenAI API integration
- Vector search
- GPT-4 validation

---

### Dag 25-26: Regulation Library

**EPIC-04: Ingest & Index**

```typescript
async ingestRegulation(source: 'EASA' | 'FAA', document: Buffer) {
  // Parse PDF
  const parsed = await pdfParse(document);
  
  // Split into chunks
  const chunks = this.splitIntoChunks(parsed.text, 1000);
  
  // Generate embeddings
  for (const chunk of chunks) {
    const embedding = await this.generateEmbedding(chunk);
    
    await this.prisma.regulation.create({
      data: {
        source,
        content: chunk,
        embedding,
        metadata: { page: chunk.page }
      }
    });
  }
}
```

**Deliverables:**
- Regulation ingestion
- Embedding generation
- Vector index

---

### Dag 27-28: Impact Analysis & Dashboard

**EPIC-04: Compliance Monitoring**

```typescript
async analyzeImpact(regulationId: string) {
  const regulation = await this.getRegulation(regulationId);
  
  // Find all documents that reference this regulation
  const affected = await this.prisma.complianceLink.findMany({
    where: { regulationId },
    include: { document: true }
  });
  
  // Generate impact report
  return {
    regulationId,
    title: regulation.title,
    affectedDocuments: affected.length,
    documents: affected.map(a => ({
      id: a.document.id,
      title: a.document.title,
      confidence: a.confidenceScore,
      requiresReview: a.confidenceScore < 0.85
    })),
    recommendations: await this.generateRecommendations(affected)
  };
}

@Get('compliance/dashboard')
async getComplianceDashboard() {
  const [total, compliant, pending, overdue] = await Promise.all([
    this.prisma.complianceLink.count(),
    this.prisma.complianceLink.count({ where: { status: 'COMPLIANT' } }),
    this.prisma.complianceLink.count({ where: { status: 'PENDING_REVIEW' } }),
    this.prisma.complianceLink.count({ where: { 
      status: 'PENDING_REVIEW',
      reviewBy: { lt: new Date() }
    } })
  ]);
  
  return { total, compliant, pending, overdue };
}
```

**Deliverables:**
- Impact analysis
- Compliance dashboard API
- Alert system

---

## **Corrected Implementation Status**

### **EPIC-01: Structured Authoring**
**Status:** 60% → 100% (40% kvar)  
**Timeline:** Dag 1-5 (5 dagar)  
**Focus:** PDF-only approach med AI-accelererad parsing

### **EPIC-02: Review & Approval**
**Status:** 75% → 100% (25% kvar)  
**Timeline:** Dag 6-12 (7 dagar)  
**Focus:** Simple email templates + Slack + WebSocket

### **EPIC-03: Distribution & Reader**
**Status:** 50% → 100% (50% kvar)  
**Timeline:** Dag 13-20 (8 dagar)  
**Focus:** Bundle generation + CloudFront + Reader API

### **EPIC-04: Compliance Monitoring**
**Status:** 70% → 100% (30% kvar)  
**Timeline:** Dag 21-28 (8 dagar)  
**Focus:** OpenAI integration + Regulation ingestion

---

## **Resource Requirements (Corrected)**

### **Development Team**
- **Backend Developer:** 1 senior (full-time)
- **Frontend Developer:** 1 mid-level (part-time, dag 13-20)
- **AI/ML Engineer:** 1 senior (part-time, dag 21-28)
- **DevOps Engineer:** 1 mid-level (part-time, dag 16-18)

### **Infrastructure Requirements**
- **OpenAI API access** för AI-powered regulation matching
- **AWS SES** för email delivery
- **Slack App configuration** för webhook integration
- **CloudFront + S3** för CDN
- **Redis cluster** för caching

### **Estimated Costs (Corrected)**
- **Development team:** ~$25,000-35,000 (4-6 weeks)
- **OpenAI API:** ~$200-500/month
- **AWS infrastructure:** ~$300-500/month
- **Third-party services:** ~$100-200/month

---

## **Success Criteria**

### **Week 1: Core Infrastructure Complete**
- [ ] PDF upload och parsing fungerar
- [ ] Export till PDF fungerar
- [ ] Version comparison fungerar
- [ ] Performance optimization implementerat

### **Week 2: Notifications Complete**
- [ ] Email system med AWS SES fungerar
- [ ] Slack integration fungerar
- [ ] WebSocket notifications fungerar
- [ ] Workflow state machine fungerar

### **Week 3: Distribution Complete**
- [ ] Bundle generation fungerar
- [ ] CloudFront distribution fungerar
- [ ] Reader API fungerar
- [ ] Progress tracking fungerar

### **Week 4: AI & Compliance Complete**
- [ ] OpenAI integration fungerar
- [ ] Regulation ingestion fungerar
- [ ] Impact analysis fungerar
- [ ] Compliance dashboard fungerar

---

## **Risk Mitigation**

### **High Risk Items**
1. **PDF Parsing Complexity**
   - Risk: Aviation manuals kan ha komplex struktur
   - Mitigation: Använd proven libraries (pdf-parse, mammoth.js)

2. **OpenAI API Costs**
   - Risk: API costs kan bli höga
   - Mitigation: Implementera caching och rate limiting

3. **CloudFront Setup**
   - Risk: CDN setup kan ta tid
   - Mitigation: Använd existing AWS infrastructure

### **Medium Risk Items**
1. **Email Delivery**
   - Risk: SES setup och deliverability
   - Mitigation: Använd AWS SES med proper domain setup

2. **Slack Integration**
   - Risk: Webhook reliability
   - Mitigation: Implementera retry logic och fallbacks

---

## **Conclusion**

**AI-accelererad PDF-only approach** gör implementationen mycket mer hanterbar:

- **4-6 veckor** istället för 8-12 veckor
- **PDF-only** eliminerar komplexitet med Word/Excel
- **AI-accelererad** development för snabbare implementation
- **Focused scope** på core functionality

**Key Success Factors:**
- PDF-only approach för snabbare development
- AI-accelererad parsing och compliance matching
- Simple email templates istället för complex systems
- CloudFront + S3 för robust CDN

**Recommendation:** Följ denna plan för snabb time-to-market med production-ready system inom 4-6 veckor.
