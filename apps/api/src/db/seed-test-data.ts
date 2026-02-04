/**
 * Comprehensive Test Data Seeder
 * Creates realistic test accounts, projects, and content for video recording
 */

import { db, users, projectResources, initDb } from './index.js';
import { eq } from 'drizzle-orm';
import { hash } from 'argon2';
import { createUser } from '../services/auth.service.js';
import { createOrg, addMember } from '../services/org.service.js';
import { createProject, addProjectMember, createDocument } from '../services/project.service.js';
import { createTM, addTranslationUnit } from '../services/tm.service.js';
import { createTB, addTerm } from '../services/tb.service.js';
import { Buffer } from 'buffer';

const TEST_PASSWORD = 'Test@1234'; // Password for all test accounts

// Test accounts by role
const TEST_USERS = [
  {
    name: 'Sarah Chen',
    email: 'manziisrael99+admin@gmail.com',
    role: 'org_admin' as const,
    title: 'Organization Administrator',
  },
  {
    name: 'Marcus Rodriguez',
    email: 'manziisrael99+pm@gmail.com',
    role: 'project_manager' as const,
    title: 'Project Manager',
  },
  {
    name: 'Elena Petrov',
    email: 'manziisrael99+translator@gmail.com',
    role: 'translator' as const,
    title: 'Senior Translator (French)',
  },
  {
    name: 'David Park',
    email: 'manziisrael99+reviewer1@gmail.com',
    role: 'reviewer_1' as const,
    title: 'Quality Reviewer Level 1',
  },
  {
    name: 'Maria Santos',
    email: 'manziisrael99+reviewer2@gmail.com',
    role: 'reviewer_2' as const,
    title: 'Quality Reviewer Level 2',
  },
];

// Sample project content
const SAMPLE_CONTENT = {
  softwareRelease: {
    title: 'Software Release Notes v2.5',
    segments: [
      'Welcome to version 2.5 of our flagship product.',
      'This release includes 15 new features and 47 bug fixes.',
      'The new dashboard provides real-time analytics with customizable widgets.',
      'Performance improvements reduce load time by 40%.',
      'We have added support for 12 additional languages.',
      'Security enhancements include two-factor authentication and encrypted backups.',
      'The mobile app now supports offline mode for seamless field work.',
      'Integration with Salesforce and HubSpot is now available.',
      'Our team has improved the API documentation with interactive examples.',
      'Please contact support@example.com for any questions.',
    ],
  },
  marketingBrochure: {
    title: 'Product Marketing Brochure 2026',
    segments: [
      'Transform Your Business with Our Solutions',
      'Join over 10,000 companies worldwide who trust our platform.',
      'Increase productivity by up to 300% with intelligent automation.',
      'Our award-winning support team is available 24/7 to assist you.',
      'Start your free 30-day trial today - no credit card required.',
      'Seamlessly integrate with your existing tools and workflows.',
      'Enterprise-grade security protects your sensitive data.',
      'Scale effortlessly from 10 to 10,000 users without performance loss.',
      'Get started in minutes with our intuitive setup wizard.',
      'Request a personalized demo from our sales team.',
    ],
  },
  userManual: {
    title: 'User Manual - Chapter 3: Advanced Features',
    segments: [
      'Chapter 3: Advanced Features',
      'This chapter covers advanced functionality for power users.',
      'To configure custom workflows, navigate to Settings > Workflows.',
      'Click the "Add Workflow" button to create a new automation rule.',
      'Select trigger conditions from the dropdown menu.',
      'Define actions to be executed when the trigger conditions are met.',
      'You can add multiple actions and conditional logic using the visual editor.',
      'Test your workflow using the built-in simulator before activating it.',
      'Workflows can be paused, edited, or deleted at any time.',
      'For troubleshooting, check the workflow execution logs in the dashboard.',
    ],
  },
};

// Translation memory content (for creating matches)
const TM_UNITS = [
  // Exact matches (100%)
  {
    source: 'Welcome to version 2.5 of our flagship product.',
    target: 'Bienvenue dans la version 2.5 de notre produit phare.',
  },
  {
    source: 'Please contact support@example.com for any questions.',
    target: 'Veuillez contacter support@example.com pour toute question.',
  },
  // High fuzzy matches (95-99%)
  {
    source: 'Welcome to version 2.4 of our flagship product.',
    target: 'Bienvenue dans la version 2.4 de notre produit phare.',
  },
  {
    source: 'This release includes 12 new features and 45 bug fixes.',
    target: 'Cette version inclut 12 nouvelles fonctionnalités et 45 corrections de bugs.',
  },
  // Mid fuzzy matches (85-94%)
  {
    source: 'The dashboard provides analytics with widgets.',
    target: 'Le tableau de bord fournit des analyses avec des widgets.',
  },
  {
    source: 'Performance improvements reduce load time significantly.',
    target: 'Les améliorations de performance réduisent considérablement le temps de chargement.',
  },
  // Additional TM content
  {
    source: 'Start your free trial today.',
    target: 'Commencez votre essai gratuit aujourd\'hui.',
  },
  {
    source: 'No credit card required.',
    target: 'Aucune carte de crédit requise.',
  },
  {
    source: 'Contact our sales team for more information.',
    target: 'Contactez notre équipe commerciale pour plus d\'informations.',
  },
  {
    source: 'Available in multiple languages.',
    target: 'Disponible en plusieurs langues.',
  },
];

// Terminology base
const TERMINOLOGY = [
  { source: 'dashboard', target: 'tableau de bord', definition: 'Main control panel interface' },
  { source: 'widget', target: 'widget', definition: 'Customizable UI component' },
  { source: 'API', target: 'API', definition: 'Application Programming Interface' },
  { source: 'workflow', target: 'flux de travail', definition: 'Automated process sequence' },
  { source: 'trigger', target: 'déclencheur', definition: 'Event that initiates an action' },
  { source: 'integration', target: 'intégration', definition: 'Connection between systems' },
  { source: 'security', target: 'sécurité', definition: 'Data protection measures' },
  { source: 'performance', target: 'performance', definition: 'System speed and efficiency' },
  { source: 'support', target: 'support', definition: 'Customer assistance' },
  { source: 'enterprise', target: 'entreprise', definition: 'Large-scale business' },
];

async function seedTestData() {
  console.log('🌱 Starting comprehensive test data seeding...\n');

  try {
    // Initialize database connection
    await initDb();
    console.log('✓ Database initialized\n');

    // Step 1: Create test users
    console.log('👥 Creating test users...');
    const createdUsers = [];

    for (const userData of TEST_USERS) {
      try {
        const user = await createUser({
          name: userData.name,
          email: userData.email,
          password: TEST_PASSWORD,
        });

        // Mark email as verified and disable MFA for testing
        await db.update(users)
          .set({ emailVerified: true, mfaEnabled: false })
          .where(eq(users.id, user.id));

        createdUsers.push({ ...user, role: userData.role, title: userData.title });
        console.log(`  ✓ Created ${userData.name} (${userData.email})`);
      } catch (error: any) {
        if (error.message?.includes('unique')) {
          console.log(`  ⚠ User ${userData.email} already exists, skipping...`);
          // Get existing user
          const existing = await db.query.users.findFirst({
            where: (usersTable, { eq }) => eq(usersTable.email, userData.email),
          });
          if (existing) {
            createdUsers.push({ ...existing, role: userData.role, title: userData.title });
          }
        } else {
          throw error;
        }
      }
    }

    // Step 2: Create organization
    console.log('\n🏢 Creating test organization...');
    const org = await createOrg({
      name: 'Global Translations Inc.',
      slug: 'global-translations-inc',
      createdBy: createdUsers[0].id, // Sarah (org admin)
    });
    console.log(`  ✓ Created organization: ${org.name}`);

    // Step 3: Add members to organization
    console.log('\n👤 Adding members to organization...');
    for (let i = 1; i < createdUsers.length; i++) {
      await addMember({
        orgId: org.id,
        userId: createdUsers[i].id,
        role: createdUsers[i].role === 'reviewer_1' || createdUsers[i].role === 'reviewer_2'
          ? 'reviewer'
          : createdUsers[i].role,
      });
      console.log(`  ✓ Added ${createdUsers[i].name} as ${createdUsers[i].role}`);
    }

    // Step 4: Create Translation Memory
    console.log('\n💾 Creating translation memory...');
    const tm = await createTM({
      orgId: org.id,
      name: 'English to French - Software & Marketing',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      createdBy: createdUsers[0].id,
    });
    console.log(`  ✓ Created TM: ${tm.name}`);

    // Add TM units
    console.log('  📝 Adding TM units...');
    for (const unit of TM_UNITS) {
      await addTranslationUnit({
        tmId: tm.id,
        sourceText: unit.source,
        targetText: unit.target,
        createdBy: createdUsers[0].id,
      });
    }
    console.log(`  ✓ Added ${TM_UNITS.length} TM units`);

    // Step 5: Create Term Base
    console.log('\n📖 Creating term base...');
    const tb = await createTB({
      orgId: org.id,
      name: 'Software & Business Terminology',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      createdBy: createdUsers[0].id,
    });
    console.log(`  ✓ Created TB: ${tb.name}`);

    // Add terms
    console.log('  📝 Adding terms...');
    for (const term of TERMINOLOGY) {
      await addTerm({
        tbId: tb.id,
        sourceTerm: term.source,
        targetTerm: term.target,
        definition: term.definition,
        createdBy: createdUsers[0].id,
      });
    }
    console.log(`  ✓ Added ${TERMINOLOGY.length} terms`);

    // Step 6: Create projects
    console.log('\n📁 Creating test projects...');

    // Project 1: In-progress software release notes
    const project1 = await createProject({
      orgId: org.id,
      name: 'Q1 2026 - Software Release Notes',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      workflowType: 'full_review',
      deadline: new Date('2026-03-15'),
      createdBy: createdUsers[1].id, // Marcus (PM)
    });
    console.log(`  ✓ Created project: ${project1.name}`);

    // Add project members
    await addProjectMember({
      projectId: project1.id,
      userId: createdUsers[2].id, // Elena (translator)
      role: 'translator',
    });
    await addProjectMember({
      projectId: project1.id,
      userId: createdUsers[3].id, // David (reviewer 1)
      role: 'reviewer_1',
    });
    await addProjectMember({
      projectId: project1.id,
      userId: createdUsers[4].id, // Maria (reviewer 2)
      role: 'reviewer_2',
    });

    // Attach TM and TB to project
    await db.insert(projectResources).values([
      {
        projectId: project1.id,
        resourceType: 'translation_memory',
        resourceId: tm.id,
        writable: true,
      },
      {
        projectId: project1.id,
        resourceType: 'term_base',
        resourceId: tb.id,
        writable: true,
      },
    ]);

    // Create documents for project 1
    console.log('\n📄 Creating documents...');

    const doc1 = await createDocument({
      projectId: project1.id,
      name: SAMPLE_CONTENT.softwareRelease.title,
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      format: 'txt',
      content: Buffer.from(SAMPLE_CONTENT.softwareRelease.segments.join('\n\n')),
      uploadedBy: createdUsers[1].id,
    });
    console.log(`  ✓ Created document: ${doc1.name}`);

    // Project 2: Marketing brochure (ready for translation)
    const project2 = await createProject({
      orgId: org.id,
      name: 'Marketing Materials - Q2 2026',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      workflowType: 'single_review',
      deadline: new Date('2026-04-30'),
      createdBy: createdUsers[1].id,
    });
    console.log(`  ✓ Created project: ${project2.name}`);

    await addProjectMember({ projectId: project2.id, userId: createdUsers[2].id, role: 'translator' });
    await addProjectMember({ projectId: project2.id, userId: createdUsers[3].id, role: 'reviewer_1' });

    await db.insert(projectResources).values([
      { projectId: project2.id, resourceType: 'translation_memory', resourceId: tm.id, writable: true },
      { projectId: project2.id, resourceType: 'term_base', resourceId: tb.id, writable: true },
    ]);

    const doc2 = await createDocument({
      projectId: project2.id,
      name: SAMPLE_CONTENT.marketingBrochure.title,
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      format: 'txt',
      content: Buffer.from(SAMPLE_CONTENT.marketingBrochure.segments.join('\n\n')),
      uploadedBy: createdUsers[1].id,
    });
    console.log(`  ✓ Created document: ${doc2.name}`);

    // Project 3: User manual (for demonstration)
    const project3 = await createProject({
      orgId: org.id,
      name: 'User Documentation Update',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      workflowType: 'simple',
      deadline: new Date('2026-05-15'),
      createdBy: createdUsers[1].id,
    });
    console.log(`  ✓ Created project: ${project3.name}`);

    await addProjectMember({ projectId: project3.id, userId: createdUsers[2].id, role: 'translator' });

    await db.insert(projectResources).values([
      { projectId: project3.id, resourceType: 'translation_memory', resourceId: tm.id, writable: true },
      { projectId: project3.id, resourceType: 'term_base', resourceId: tb.id, writable: true },
    ]);

    const doc3 = await createDocument({
      projectId: project3.id,
      name: SAMPLE_CONTENT.userManual.title,
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      format: 'txt',
      content: Buffer.from(SAMPLE_CONTENT.userManual.segments.join('\n\n')),
      uploadedBy: createdUsers[1].id,
    });
    console.log(`  ✓ Created document: ${doc3.name}`);

    // Summary
    console.log('\n✅ Test data seeding completed successfully!\n');
    console.log('═══════════════════════════════════════════');
    console.log('TEST ACCOUNTS (Password: Test@1234)');
    console.log('═══════════════════════════════════════════');
    console.log('\n👤 Users:');
    for (const user of TEST_USERS) {
      console.log(`  • ${user.name}`);
      console.log(`    Email: ${user.email}`);
      console.log(`    Role: ${user.title}`);
      console.log('');
    }
    console.log('═══════════════════════════════════════════');
    console.log('ORGANIZATION & RESOURCES');
    console.log('═══════════════════════════════════════════');
    console.log(`\n🏢 Organization: ${org.name}`);
    console.log(`💾 Translation Memory: ${tm.name} (${TM_UNITS.length} units)`);
    console.log(`📖 Term Base: ${tb.name} (${TERMINOLOGY.length} terms)`);
    console.log('\n═══════════════════════════════════════════');
    console.log('PROJECTS');
    console.log('═══════════════════════════════════════════');
    console.log(`\n1. ${project1.name}`);
    console.log(`   Workflow: Full Review (Translation → Review 1 → Review 2)`);
    console.log(`   Deadline: ${project1.deadline?.toLocaleDateString()}`);
    console.log(`   Document: ${SAMPLE_CONTENT.softwareRelease.title}`);
    console.log('');
    console.log(`2. ${project2.name}`);
    console.log(`   Workflow: Single Review (Translation → Review 1)`);
    console.log(`   Deadline: ${project2.deadline?.toLocaleDateString()}`);
    console.log(`   Document: ${SAMPLE_CONTENT.marketingBrochure.title}`);
    console.log('');
    console.log(`3. ${project3.name}`);
    console.log(`   Workflow: Simple (Translation only)`);
    console.log(`   Deadline: ${project3.deadline?.toLocaleDateString()}`);
    console.log(`   Document: ${SAMPLE_CONTENT.userManual.title}`);
    console.log('\n═══════════════════════════════════════════\n');

    console.log('🎬 Ready for video recording!');
    console.log('   Login URL: http://localhost:5173');
    console.log('   API URL: http://localhost:5064/api/v1\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding test data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url.endsWith(process.argv[1])) {
  seedTestData();
}

export { seedTestData };
