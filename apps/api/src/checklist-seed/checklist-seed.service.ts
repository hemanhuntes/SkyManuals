import { Injectable } from '@nestjs/common';
import { ChecklistTemplateSchema } from '@skymanuals/types';

@Injectable()
export class ChecklistSeedService {
  constructor() {}

  async seedDefaultAuditChecklist(organizationId: string): Promise<any> {
    console.log(`🌱 Seeding default audit checklist for organization ${organizationId}`);

    const defaultAuditChecklist = {
      organizationId,
      name: 'Standard Aviation Manual Audit Checklist',
      description: 'Comprehensive audit checklist for aviation manual compliance review',
      type: 'AUDIT',
      isDefault: true,
      items: [
        {
          id: 'audit-1',
          title: 'Document Structure and Organization',
          description: 'Verify manual follows proper structure with clear chapters and sections',
          isRequired: true,
          category: 'Structure',
          sortOrder: 1,
        },
        {
          id: 'audit-2',
          title: 'Technical Accuracy',
          description: 'Confirm all technical information is accurate and up-to-date',
          isRequired: true,
          category: 'Technical',
          sortOrder: 2,
        },
        {
          id: 'audit-3',
          title: 'Regulatory Compliance',
          description: 'Ensure manual complies with applicable aviation regulations',
          isRequired: true,
          category: 'Compliance',
          sortOrder: 3,
        },
        {
          id: 'audit-4',
          title: 'Safety Information',
          description: 'Verify safety warnings and emergency procedures are present and accurate',
          isRequired: true,
          category: 'Safety',
          sortOrder: 4,
        },
        {
          id: 'audit-5',
          title: 'Pilot Workload Management',
          description: 'Confirm procedures support pilot workload management effectively',
          isRequired: true,
          category: 'Operations',
          sortOrder: 5,
        },
        {
          id: 'audit-6',
          title: 'Cross-Reference Accuracy',
