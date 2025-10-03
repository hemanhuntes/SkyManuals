import { PrismaClient } from '@skymanuals/prisma';
import {
  AddonType,
  AddonStatus,
  LicenseTier,
  HookType,
} from '@skymanuals/types';

export async function seedExampleAddons(prisma: PrismaClient) {
  console.log('🌱 Seeding example add-ons...');

  // Template Pack Add-on
  const templatePackAddon = await prisma.addon.create({
    data: {
      name: 'Aircraft Template Pack',
      slug: 'aircraft-template-pack',
      description: 'Professional aircraft manual templates for commercial aviation',
      longDescription: `
        The Aircraft Template Pack provides professional-grade manual templates 
        for commercial aviation operations. Includes pre-built structures for:
        
        - Flight Operations Manuals (FOM)
        - Aircraft Maintenance Manuals (AMM)
        - Minimum Equipment Lists (MEL)
        - Standard Operating Procedures (SOPs)
        - Emergency Procedures
        
        Each template includes compliance checklists, regulatory references,
        and industry best practices. Templates are validated against ICAO
        Standards and Recommended Practices (SARPs).
        
        Perfect for airlines, charter operations, and flight training organizations.
      `,
      version: '1.2.0',
      author: 'SkyManuals Aviation Team',
      authorEmail: 'aviation@skymanuals.com',
      authorWebsite: 'https://skymanuals.com',
      
      type: 'TEMPLATE_PACK',
      status: 'PUBLISHED',
      
      iconUrl: 'https://cdn.skymanuals.com/addons/icons/template-pack.png',
      screenshots: [
        'https://cdn.skymanuals.com/addons/screenshots/template-pack-1.png',
        'https://cdn.skymanuals.com/addons/screenshots/template-pack-2.png',
        'https://cdn.skymanuals.com/addons/screenshots/template-pack-3.png',
      ],
      
      documentation: 'https://docs.skymanuals.com/addons/template-pack',
      readme: `
# Aircraft Template Pack

## Installation
1. Install the add-on from the SkyManuals store
2. Navigate to Templates → Browse Templates
3. Select Aircraft Template Pack
4. Choose templates and import to your organization

## Available Templates
- Flight Operations Manual (FOM)
- Aircraft Maintenance Manual (AMM)
- Minimum Equipment List (MEL)
- Standard Operating Procedures
- Emergency Procedures
- Weight & Balance Manual
- MEL Operations Manual
- Configuration Deviation List (CDL)

## Features
- ICAO-compliant structure
- Built-in compliance checklists
- Regulatory reference links
- Industry best practices
- Easy customization
- Version control support
- Collaboration tools

## Support
For support and documentation, visit: https://docs.skymanuals.com/addons/template-pack
      `,
      
      minVersion: '1.0.0',
      dependencies: ['compliance-base'],
      permissions: ['manual:read', 'manual:write', 'template:read'],
      hooks: ['ON_MANUAL_CREATE', 'ON_PUBLISH'],
      
      tags: ['templates', 'aviation', 'compliance', 'professional'],
      categories: ['productivity', 'templates'],
      
      publishedAt: new Date(),
    },
  });

  // Add pricing tiers for Template Pack
  await prisma.addonPricingTier.createMany({
    data: [
      {
        addonId: templatePackAddon.id,
        tier: 'FREE',
        price: 0,
        features: [
          'Access to 3 basic templates',
          'Community support',
          'Basic documentation',
        ],
      },
      {
        addonId: templatePackAddon.id,
        tier: 'BASIC',
        price: 49.99,
        billingPeriod: 'MONTHLY',
        features: [
          'Access to all 8 professional templates',
          'Priority support',
          'Compliance checklists',
          'Regulatory reference links',
          'Custom branding',
        ],
        trialDays: 14,
      },
      {
        addonId: templatePackAddon.id,
        tier: 'PROFESSIONAL',
        price: 149.99,
        billingPeriod: 'MONTHLY',
        features: [
          'All Basic features',
          'Custom template creation',
          'Team collaboration tools',
          'API access',
          'Advanced compliance monitoring',
          'Integration with compliance connectors',
        ],
        trialDays: 30,
      },
      {
        addonId: templatePackAddon.id,
        tier: 'ENTERPRISE',
        price: 499.99,
        billingPeriod: 'MONTHLY',
        features: [
          'All Professional features',
          'White-label solution',
          'Dedicated support',
          'Custom integrations',
          'Advanced analytics',
          'Unlimited users',
        ],
        trialDays: 45,
      },
    ],
  });

  // Compliance Connector Add-on
  const complianceConnectorAddon = await prisma.addon.create({
    data: {
      name: 'FAA Compliance Connector',
      slug: 'faa-compliance-connector',
      description: 'Automated FAA regulation monitoring and compliance linking',
      longDescription: `
        The FAA Compliance Connector automatically monitors FAA regulatory 
        updates and integrates them with your SkyManuals documentation.
        
        Features:
        - Real-time regulation change monitoring
        - Automatic impact analysis for your manuals
        - Compliance gap identification
        - Oneclick rule linking
        - Automated alert notifications
        - Historical compliance tracking
        
        Connects to:
        - 14 CFR (Code of Federal Regulations)
        - FAA Advisory Circulars (ACs)
        - FAA Orders and Notices
        - FAA Safety Alerts
        - ICAO Annexes
        
        Perfect for Part 121 & 135 operators, maintenance providers,
        and aviation businesses requiring regulatory compliance.
      `,
      version: '2.1.0',
      author: 'SkyManuals Compliance Team',
      authorEmail: 'compliance@skymanuals.com',
      authorWebsite: 'https://skymanuals.com',
      
      type: 'COMPLIANCE_CONNECTOR',
      status: 'PUBLISHED',
      
      iconUrl: 'https://cdn.skymanuals.com/addons/icons/compliance-connector.png',
      screenshots: [
        'https://cdn.skymanuals.com/addons/screenshots/compliance-connector-1.png',
        'https://cdn.skymanuals.com/addons/screenshots/compliance-connector-2.png',
      ],
      
      documentation: 'https://docs.skymanuals.com/addons/compliance-connector',
      readme: `
# FAA Compliance Connector

## Setup
1. Install the Compliance Connector from the store
2. Configure your organization's compliance requirements
3. Select relevant regulation categories (14 CFR Parts)
4. Enable automatic monitoring and alerts

## Configuration
Configure the connector by organization:
- **Regulation Categories**: Select relevant FAA regulation parts
- **Update Frequency**: Choose how often to check for updates (daily/weekly)
- **Alert Settings**: Configure notification preferences
- **Impact Threshold**: Set sensitivity for change alerts

## Integration Points
The Compliance Connector integrates with:
- Manual content via webhooks
- Compliance dashboards
- Regulatory libraries
- Audit trail systems

## Webhook Events
- **ON_PUBLISH**: Analyzes new content for compliance
- **ON_MANUAL_CREATE**: Checks new manuals against regulations
- **ON_INGEST**: Processes imported content for compliance gaps

## Regulation Sources
- FAA.gov regulatory feed
- Federal Register notifications
- ICAO Annex updates
- Part 121/135 specific rules
- Maintenance regulations (43 CFR)
      `,
      
      minVersion: '1.5.0',
      dependencies: ['compliance-base'],
      permissions: ['compliance:read', 'compliance:write', 'compliance:manage'],
      hooks: ['ON_PUBLISH', 'ON_MANUAL_CREATE', 'ON_INGEST', 'ON_DATA_IMPORT'],
      
      tags: ['compliance', 'faa', 'regulations', 'monitoring'],
      categories: ['compliance', 'automation'],
      
      publishedAt: new Date(),
    },
  });

  // Add pricing tiers for Compliance Connector
  await prisma.addonPricingTier.createMany({
    data: [
      {
        addonId: complianceConnectorAddon.id,
        tier: 'FREE',
        price: 0,
        features: [
          'Basic regulation monitoring',
          '5 compliance checks per month',
          'Community support',
        ],
      },
      {
        addonId: complianceConnectorAddon.id,
        tier: 'BASIC',
        price: 99.99,
        billingPeriod: 'MONTHLY',
        features: [
          'Unlimited compliance monitoring',
          'Automated compliance linking',
          'Email alerts for regulatory changes',
          'Compliance dashboard',
          'Priority support',
        ],
        trialDays: 14,
      },
      {
        addonId: complianceConnectorAddon.id,
        tier: 'PROFESSIONAL',
        price: 299.99,
        billingPeriod: 'MONTHLY',
        features: [
          'All Basic features',
          'Advanced impact analysis',
          'Custom compliance workflows',
          'API integration',
          'Bulk compliance operations',
          'Custom alert rules',
        ],
        trialDays: 30,
      },
      {
        addonId: complianceConnectorAddon.id,
        tier: 'ENTERPRISE',
        price: 999.99,
        billingPeriod: 'MONTHLY',
        features: [
          'All Professional features',
          'Dedicated compliance specialist',
          'Custom regulation feeds',
          'White-label reporting',
          'Compliance consulting hours',
          'Unlimited users',
        ],
        trialDays: 45,
      },
    ],
  });

  // Data Connector Add-on
  const dataConnectorAddon = await prisma.addon.create({
    data: {
      name: 'ACARS Data Connector',
      slug: 'acars-data-connector',
      description: 'Import ACARS and flight data into SkyManuals documentation',
      longDescription: `
        The ACARS Data Connector allows seamless import of ACARS messages,
        flight data records, and operational metrics into your SkyManuals
        documentation ecosystem.
        
        Supported Data Sources:
        - ACARS Messages (Aircraft Communications Addressing and Reporting System)
        - CVR/FDR Data (Cockpit Voice Recorder / Flight Data Recorder)
        - FOM Data (Flight Operations Monitoring)
        - Maintenance records (AOG, MEL discrepancies)
        - Fuel planning data
        - Weather reports
        
        Use Cases:
        - Incident documentation
        - Training material creation
        - Operational analysis
        - Compliance reporting
        - Safety data analysis
      `,
      version: '1.0.0',
      author: 'SkyManuals Data Team',
      authorEmail: 'data@skymanuals.com',
      
      type: 'DATA_CONNECTOR',
      status: 'PUBLISHED',
      
      tags: ['data', 'acars', 'flight-data', 'integration'],
      categories: ['data', 'integration'],
      
      publishedAt: new Date(),
    },
  });

  // Workflow Extension Add-on
  const workflowExtensionAddon = await prisma.addon.create({
    data: {
      name: 'Multi-Language Workflow',
      slug: 'multi-language-workflow',
      description: 'Enable simultaneous documentation in multiple languages',
      longDescription: `
        Manage multilingual documentation workflows with automatic translation
        capabilities and multi-language approval processes.
        
        Features:
        - Automated translation workflows
        - Multi-language approval chains
        - Translation quality checks
        - Cultural adaptation tools
        - Synchronized updates across languages
        - Language-specific compliance requirements
      `,
      version: '1.5.0',
      author: 'SkyManuals i18n Team',
      authorEmail: 'i18n@skymanuals.com',
      
      type: 'WORKFLOW_EXTENSION',
      status: 'PUBLISHED',
      
      tags: ['workflow', 'translation', 'multilingual', 'i18n'],
      categories: ['productivity', 'workflow'],
      
      publishedAt: new Date(),
    },
  });

  console.log('✅ Example addons seeded successfully!');
  console.log(`   📦 Created ${await prisma.addon.count()} add-ons`);
  console.log(`   💰 Created ${await prisma.addonPricingTier.count()} pricing tiers`);
}
