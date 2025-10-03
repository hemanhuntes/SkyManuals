import { Injectable } from '@nestjs/common';
import { ApprovalLetterSchema, ValidationSignatureSchema } from '@skymanuals/types';

@Injectable()
export class PdfGeneratorService {
  constructor() {}

  async generateApprovalLetter(
    workflowInstanceId: string,
    organizationName: string,
    organizationLogoUrl?: string,
    signerInfo: {
      signerName: string;
      signerRole: string;
      signaturePath?: string;
    }[] = []
  ): Promise<Buffer> {
    console.log(`📄 Generating approval letter for workflow ${workflowInstanceId}`);
    
    // Mock PDF generation - in production, use libraries like Puppeteer, PDFKit, or jsPDF
    const approvalLetter = {
      organizationName,
      organizationLogoUrl,
      documentTitle: `Manual Review Approval - ${workflowInstanceId}`,
      documentType: 'Aviation Manual',
      version: '1.0',
      workflowInstanceId,
      approvalDetails: [
        {
          stageName: 'Technical Review',
          approverName: 'John Smith',
          approverRole: 'Senior Engineer',
          approvedAt: new Date().toISOString(),
          comments: 'Approved after minor revisions',
        },
        {
          stageName: 'Compliance Review',
          approverName: 'Jane Doe',
          approverRole: 'Compliance Officer',
          approvedAt: new Date().toISOString(),
          comments: 'All regulatory requirements met',
        },
      ],
      signatures: signerInfo.map(signer => ({
        signerName: signer.signerName,
        signerRole: signer.signerRole,
        signatureDate: new Date().toISOString(),
        signaturePath: signer.signaturePath,
      })),
      generatedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // Mock PDF content generation
    const htmlContent = this.generateApprovalHtml(approvalLetter);
    
    // In production, convert HTML to PDF using Puppeteer or similar
    // const pdfBuffer = await this.htmlToPdf(htmlContent);
    
    // For now, return mock PDF buffer with metadata
    const mockPdfBuffer = Buffer.from(JSON.stringify({
      type: 'approval_letter',
      workflowInstanceId,
      organizationName,
      content: htmlContent,
      metadata: approvalLetter,
    }));
    
    console.log(`✅ Approval letter generated for workflow ${workflowInstanceId}`);
    return mockPdfBuffer;
  }

  async generateAuditChecklist(
    workflowInstanceId: string,
    organizationName: string,
    checklistItems: Array<{
      title: string;
      description: string;
      isRequired: boolean;
      category: string;
      sortOrder: number;
    }>
  ): Promise<Buffer> {
    console.log(`📋 Generating audit checklist for workflow ${workflowInstanceId}`);
    
    const checklist = {
      title: 'Audit Checklist',
      organizationName,
      workflowInstanceId,
      generatedAt: new Date().toISOString(),
      items: checklistItems.sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => ({
        ...item,
        itemNumber: index + 1,
        checked: false,
        notes: '',
        auditorSignature: '',
        auditDate: '',
      })),
    };

    const htmlContent = this.generateChecklistHtml(checklist);
    
    // In production, convert HTML to PDF
    const mockPdfBuffer = Buffer.from(JSON.stringify({
      type: 'audit_checklist',
      workflowInstanceId,
      organizationName,
      content: htmlContent,
      metadata: checklist,
    }));
    
    console.log(`✅ Audit checklist generated for workflow ${workflowInstanceId}`);
    return mockPdfBuffer;
  }

  private generateApprovalHtml(approvalData: any): string {
    const signaturesSection = approvalData.signatures.map((sig: any, index: number) => `
      <div class="signature-section" style="margin: 20px 0; padding: 15px; border: 1px solid #ddd;">
        <h4>Signature ${index + 1}</h4>
        <p><strong>Name:</strong> ${sig.signerName}</p>
        <p><strong>Role:</strong> ${sig.signerRole}</p>
        <p><strong>Date:</strong> ${new Date(sig.signatureDate).toLocaleDateString()}</p>
        ${sig.signaturePath ? `<div class="signature-line" style="border: 1px solid #ccc; height: 50px; margin-top: 10px;"></div>` : ''}
      </div>
    `).join('');

    const approvalDetailsSection = approvalData.approvalDetails.map((detail: any, index: number) => `
      <div class="approval-detail" style="margin: 15px 0; padding: 10px; background: #f9f9f9;">
        <h5>${detail.stageName}</h5>
        <p><strong>Approver:</strong> ${detail.approverName} (${detail.approverRole})</p>
        <p><strong>Approved:</strong> ${new Date(detail.approvedAt).toLocaleDateString()}</p>
        <p><strong>Comments:</strong> ${detail.comments}</p>
      </div>
    `).join('');

    return `
      <!doctype html>
      <html>
        <head>
          <title>Approval Letter - ${approvalData.documentTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { max-width: 200px; margin-bottom: 20px; }
            .document-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .document-info { background: #f0f0f0; padding: 15px; margin: 20px 0; }
            .signatures-section { margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="header">
            ${approvalData.organizationLogoUrl ? `<img src="${approvalData.organizationLogoUrl}" class="logo" alt="Organization Logo">` : ''}
            <div>Aircraft Manual Approval Letter</div>
          </div>
          
          <div class="document-title">${approvalData.documentTitle}</div>
          
          <div class="document-info">
            <p><strong>Organization:</strong> ${approvalData.organizationName}</p>
            <p><strong>Document Type:</strong> ${approvalData.documentType}</p>
            <p><strong>Version:</strong> ${approvalData.version}</p>
            <p><strong>Workflow ID:</strong> ${approvalData.workflowInstanceId}</p>
            <p><strong>Generated:</strong> ${new Date(approvalData.generatedAt).toLocaleDateString()}</p>
            <p><strong>Valid Until:</strong> ${new Date(approvalData.validUntil).toLocaleDateString()}</p>
          </div>

          <h3>Approval Details</h3>
          ${approvalDetailsSection}

          <div class="signatures-section">
            <h3>Approval Signatures</h3>
            ${signaturesSection}
          </div>
          
          <div style="margin-top: 50px; font-size: 12px; color: #666;">
            This document was automatically generated by SkyManuals approval system.
            For questions regarding this approval, please contact your system administrator.
          </div>
        </body>
      </html>
    `;
  }

  private generateChecklistHtml(checklistData: any): string {
    const itemsHtml = checklistData.items.map((item: any) => `
      <div class="checklist-item" style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; page-break-inside: avoid;">
        <div style="display: flex; align-items: start;">
          <div style="width: 30px; text-align: center;">${item.itemNumber}</div>
          <div style="flex: 1;">
            <strong>${item.title}</strong>
            ${item.description ? `<p style="margin: 5px 0; color: #666;">${item.description}</p>` : ''}
            ${item.isRequired ? `<span style="color: red; font-weight: bold;">[REQUIRED]</span>` : ''}
            ${item.category ? `<span style="background: #e0e0e0; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${item.category}</span>` : ''}
          </div>
        </div>
        
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
          <div style="margin-bottom: 5px;">
            ☐ Satisfactory ☐ Requires Attention ☐ Not Applicable
          </div>
          <div style="margin-bottom: 5px;">
            <strong>Notes:</strong>
            <div style="border: 1px solid #ccc; height: 40px; margin-top: 2px;"></div>
          </div>
          <div style="display: flex; gap: 20px;">
            <div style="flex: 1;"><strong>Auditor:</strong><br><div style="border-bottom: 1px solid #000; width: 80%; margin-top: 2px;"></div></div>
            <div style="flex: 1;"><strong>Date:</strong><br><div style="border-bottom: 1px solid #000; width: 80%; margin-top: 2px;"></div></div>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <!doctype html>
      <html>
        <head>
          <title>Audit Checklist - ${checklistData.title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; font-size: 14px; }
            .header { text-align: center; margin-bottom: 30px; }
            .checklist-item { page-break-inside: avoid; }
            .summary-section { margin-top: 40px; background: #f9f9f9; padding: 20px; }
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${checklistData.title}</h1>
            <h2>${checklistData.organizationName}</h2>
            <p><strong>Workflow ID:</strong> ${checklistData.workflowInstanceId}</p>
            <p><strong>Generated:</strong> ${new Date(checklistData.generatedAt).toLocaleDateString()}</p>
          </div>

          <div class="checklist-items">
            ${itemsHtml}
          </div>

          <div class="summary-section">
            <h3>Summary</h3>
            <div class="summary-grid">
              <div><strong>Total Items:</strong> ${checklistData.items.length}</div>
              <div><strong>Required Items:</strong> ${checklistData.items.filter((i: any) => i.isRequired).length}</div>
              <div><strong>Completed:</strong> __ / ${checklistData.items.length}</div>
            </div>
            
            <div style="margin-top: 20px;">
              <h4>Final Assessment</h4>
              <div style="margin: 10px 0;">
                ☐ Passed Inspection ☐ Passed with Minor Deficiencies ☐ Failed Inspection
              </div>
              <div style="margin: 10px 0;">
                <strong>Overall Comments:</strong>
                <div style="border: 1px solid #ccc; height: 60px; margin-top: 5px;"></div>
              </div>
              
              <div style="margin-top: 20px;">
                <div style="display: flex; gap: 40px;">
                  <div><strong>Inspector Name:</strong><br><div style="border-bottom: 1px solid #000; width: 150px; margin-top: 2px;"></div></div>
                  <div><strong>Signature:</strong><br><div style="border-bottom: 1px solid #000; width: 150px; margin-top: 2px;"></div></div>
                  <div><strong>Date:</strong><br><div style="border-bottom: 1px solid #000; width: 100px; margin-top: 2px;"></div></div>
                </div>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 50px; font-size: 12px; color: #666;">
            This audit checklist was automatically generated by SkyManuals approval system.
          </div>
        </body>
      </html>
    `;
  }

  // Placeholder for HTML to PDF conversion
  private async htmlToPdf(html: string): Promise<Buffer> {
    // In production, this would use Puppeteer or similar:
    // const browser = await puppeteer.launch();
    // const page = await browser.newPage();
    // await page.setContent(html);
    // const pdf = await page.pdf({ format: 'A4' });
    // await browser.close();
    // return pdf;
    
    return Buffer.from('Mock PDF content');
  }
}
