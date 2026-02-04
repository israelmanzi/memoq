# ✅ Data Setup Complete!

## What Was Done

### 1. Data Wipe Script Created ✅
**File:** `/apps/api/src/db/wipe-data.ts`

Completely wipes all data from:
- ✅ PostgreSQL (all 18 tables)
- ✅ Redis cache
- ✅ MinIO storage

**Usage:**
```bash
npx tsx src/db/wipe-data.ts
```

---

### 2. Test Data Seeded ✅
**File:** `/apps/api/src/db/seed-minimal.ts`

Created:
- ✅ 5 test user accounts with verified emails + MFA disabled
- ✅ 1 organization: "Global Translations Inc."
- ✅ Translation Memory with 5 units (EN → FR)
- ✅ Term Base with 5 terms

**Usage:**
```bash
npx tsx src/db/seed-minimal.ts
```

---

## Test Accounts

All accounts use email pattern: `manziisrael99+{role}@gmail.com`

| Name | Email | Password | Role |
|------|-------|----------|------|
| Sarah Chen | manziisrael99+admin@gmail.com | Test@1234 | Org Admin |
| Marcus Rodriguez | manziisrael99+pm@gmail.com | Test@1234 | Project Manager |
| Elena Petrov | manziisrael99+translator@gmail.com | Test@1234 | Translator |
| David Park | manziisrael99+reviewer1@gmail.com | Test@1234 | Reviewer |
| Maria Santos | manziisrael99+reviewer2@gmail.com | Test@1234 | Reviewer |

**Benefits of + addressing:**
- All emails go to single inbox: `manziisrael99@gmail.com`
- Can receive real verification/notification emails
- Easy to filter/organize in Gmail

---

## Translation Memory

**Name:** English → French TM
**Units:** 5 sample translations

Examples:
- "Welcome to version 2.5 of our flagship product." → "Bienvenue dans la version 2.5 de notre produit phare."
- "Performance improvements reduce load time by 40%." → "Les améliorations de performance réduisent le temps de chargement de 40%."

---

## Term Base

**Name:** Software Terminology
**Terms:** 5 common software terms

Examples:
- dashboard → tableau de bord
- API → API
- workflow → flux de travail

---

## Next Steps

### 1. Access the Application
```
http://localhost:5173
```

### 2. Login
Use any of the test accounts above with password: `Test@1234`

**Note:** MFA is disabled for testing convenience.

### 3. Create Content Through UI

Since document parsing/segmentation is complex, create projects and upload documents through the UI:

1. **Login as Sarah (Admin)** or **Marcus (PM)**
2. **Create a Project:**
   - Name: "Q1 2026 - Software Release Notes"
   - Source: English
   - Target: French
   - Workflow: Full Review
   - Deadline: 2026-03-15
   - Attach TM and TB

3. **Upload a Document:**
   - Create a simple .txt file with content like:
   ```txt
   Welcome to version 2.5 of our flagship product.

   This release includes 15 new features and 47 bug fixes.

   Performance improvements reduce load time by 40%.
   ```
   - Upload to project
   - System will automatically segment it

4. **Assign Team Members:**
   - Translator: Elena
   - Reviewer 1: David
   - Reviewer 2: Maria

### 4. Test Features

Now test all the features with real data:
- ✅ TM matches (should show 100% match for first sentence)
- ✅ Machine Translation (MT button)
- ✅ QA Checks
- ✅ Threaded Comments
- ✅ Find & Replace (Ctrl+H)
- ✅ **Analytics** (NEW - API endpoints ready, UI pending)

---

## API Endpoints Available

### Analytics (NEW)
```bash
# Get auth token first
TOKEN="your_jwt_token_after_login"

# Leverage analysis
curl -X POST http://localhost:5064/api/v1/analytics/leverage-analysis \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"documentId":"...","projectId":"..."}'

# Project statistics
curl http://localhost:5064/api/v1/analytics/project/{projectId}/statistics \
  -H "Authorization: Bearer $TOKEN"

# User productivity
curl -X POST http://localhost:5064/api/v1/analytics/project/{projectId}/productivity \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Document analytics
curl http://localhost:5064/api/v1/analytics/document/{documentId}/analytics \
  -H "Authorization: Bearer $TOKEN"
```

---

## Clean Slate Anytime

To wipe everything and start fresh:
```bash
npx tsx src/db/wipe-data.ts && npx tsx src/db/seed-minimal.ts
```

---

## Services Status

- ✅ API: http://localhost:5064
- ✅ Web: http://localhost:5173
- ✅ PostgreSQL: healthy
- ✅ Redis: healthy
- ✅ MinIO: healthy

---

## Email Configuration

**Resend API Key:** Configured in `.env`
**From:** `OXY <noreply@oxy.israelmanzi.com>`

Emails will be sent to:
- manziisrael99+admin@gmail.com
- manziisrael99+pm@gmail.com
- manziisrael99+translator@gmail.com
- etc.

All arrive in single Gmail inbox with automatic labels!

---

## What's Ready for Testing

### ✅ Completed Features
1. User authentication (email + password, MFA disabled for testing)
2. Organization management
3. Translation Memory (browse, search, apply matches)
4. Term Base (browse, search, highlight in editor)
5. Machine Translation (DeepL integration)
6. QA Checks (6 types)
7. Threaded Comments
8. Find & Replace
9. Word Counts
10. Deadlines
11. **Analytics API** (backend only, frontend UI pending)

### ⏳ Pending: Analytics Dashboard UI
- Leverage analysis visualization
- Project statistics dashboard
- Productivity metrics charts
- Timeline graphs

**This is next task (#16)**

---

## Success! 🎉

Fresh database with test accounts and sample data. Ready for manual testing and UI development!
