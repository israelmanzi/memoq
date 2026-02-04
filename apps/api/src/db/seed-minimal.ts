/**
 * Minimal Test Data Seeder - Users, Org, TM, TB only
 * Documents can be uploaded through the UI
 */

import { db, users, projectResources, initDb } from './index.js';
import { eq } from 'drizzle-orm';
import { createUser } from '../services/auth.service.js';
import { createOrg, addMember } from '../services/org.service.js';
import { createTM, addTranslationUnit } from '../services/tm.service.js';
import { createTB, addTerm } from '../services/tb.service.js';

const TEST_PASSWORD = 'Test@1234';

const TEST_USERS = [
  { name: 'Sarah Chen', email: 'manziisrael99+admin@gmail.com', role: 'org_admin' as const },
  { name: 'Marcus Rodriguez', email: 'manziisrael99+pm@gmail.com', role: 'project_manager' as const },
  { name: 'Elena Petrov', email: 'manziisrael99+translator@gmail.com', role: 'translator' as const },
  { name: 'David Park', email: 'manziisrael99+reviewer1@gmail.com', role: 'reviewer' as const },
  { name: 'Maria Santos', email: 'manziisrael99+reviewer2@gmail.com', role: 'reviewer' as const },
];

const TM_UNITS = [
  { source: 'Welcome to version 2.5 of our flagship product.', target: 'Bienvenue dans la version 2.5 de notre produit phare.' },
  { source: 'Please contact support@example.com for any questions.', target: 'Veuillez contacter support@example.com pour toute question.' },
  { source: 'This release includes 15 new features and 47 bug fixes.', target: 'Cette version inclut 15 nouvelles fonctionnalités et 47 corrections de bugs.' },
  { source: 'Performance improvements reduce load time by 40%.', target: 'Les améliorations de performance réduisent le temps de chargement de 40%.' },
  { source: 'Start your free trial today.', target: 'Commencez votre essai gratuit aujourd\'hui.' },
];

const TERMINOLOGY = [
  { source: 'dashboard', target: 'tableau de bord', definition: 'Main control panel interface' },
  { source: 'widget', target: 'widget', definition: 'Customizable UI component' },
  { source: 'API', target: 'API', definition: 'Application Programming Interface' },
  { source: 'workflow', target: 'flux de travail', definition: 'Automated process sequence' },
  { source: 'support', target: 'support', definition: 'Customer assistance' },
];

async function seedMinimal() {
  console.log('🌱 Seeding minimal test data...\n');

  try {
    await initDb();

    // Create users
    console.log('👥 Creating test users...');
    const createdUsers = [];
    for (const userData of TEST_USERS) {
      const user = await createUser({
        name: userData.name,
        email: userData.email,
        password: TEST_PASSWORD,
      });
      await db.update(users).set({ emailVerified: true, mfaEnabled: false }).where(eq(users.id, user.id));
      createdUsers.push({ ...user, role: userData.role });
      console.log(`  ✓ ${userData.name} (${userData.email})`);
    }

    // Create organization
    console.log('\n🏢 Creating organization...');
    const org = await createOrg({
      name: 'Global Translations Inc.',
      slug: 'global-translations',
      createdBy: createdUsers[0].id,
    });
    console.log(`  ✓ ${org.name}`);

    // Add members
    console.log('\n👤 Adding members...');
    for (let i = 1; i < createdUsers.length; i++) {
      await addMember({
        orgId: org.id,
        userId: createdUsers[i].id,
        role: createdUsers[i].role,
      });
      console.log(`  ✓ ${createdUsers[i].name}`);
    }

    // Create TM
    console.log('\n💾 Creating translation memory...');
    const tm = await createTM({
      orgId: org.id,
      name: 'English → French TM',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      createdBy: createdUsers[0].id,
    });
    for (const unit of TM_UNITS) {
      await addTranslationUnit({
        tmId: tm.id,
        sourceText: unit.source,
        targetText: unit.target,
        createdBy: createdUsers[0].id,
      });
    }
    console.log(`  ✓ Added ${TM_UNITS.length} translation units`);

    // Create TB
    console.log('\n📖 Creating term base...');
    const tb = await createTB({
      orgId: org.id,
      name: 'Software Terminology',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      createdBy: createdUsers[0].id,
    });
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

    console.log('\n═══════════════════════════════════════════');
    console.log('✅ SEED COMPLETE!');
    console.log('═══════════════════════════════════════════\n');
    console.log('Test Accounts (Password: Test@1234):');
    TEST_USERS.forEach(u => console.log(`  • ${u.email} (${u.name})`));
    console.log('\nLogin: http://localhost:5173');
    console.log('\nNext: Create projects and upload documents through UI\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

if (import.meta.url.endsWith(process.argv[1])) {
  seedMinimal();
}

export { seedMinimal };
