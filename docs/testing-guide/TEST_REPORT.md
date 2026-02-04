# OXY TMS - Feature Testing Report

**Date:** 2026-02-04
**Tester:** Claude Code
**Version:** Pre-release (commits not yet pushed)

---

## Executive Summary

✅ **All Structural Tests PASSED**

### Services Status
- ✅ API running on http://localhost:5064
- ✅ Web running on http://localhost:5174
- ✅ PostgreSQL database connected
- ✅ Redis connected
- ✅ MinIO storage connected
- ✅ PDF converter service healthy

### Database Schema
- ✅ `segment_comments` table created (2 comments exist)
- ✅ `projects.deadline` column added
- ✅ `documents.deadline` column added
- ✅ `documents.source_word_count` column added
- ✅ `documents.target_word_count` column added

### Backend Implementation
| Feature | Service | Routes | Status |
|---------|---------|--------|--------|
| Machine Translation | mt.service.ts (277 lines) | mt.ts | ✅ |
| QA Checks | qa.service.ts (459 lines) | qa.ts | ✅ |
| Comments | comments.service.ts (344 lines) | comments.ts | ✅ |

### Frontend Implementation
| Component | Lines | Status |
|-----------|-------|--------|
| QA Panel | 194 | ✅ |
| Comments Panel | 369 | ✅ |
| Find & Replace Modal | 370 | ✅ |

### Configuration
- ✅ DeepL API Key configured: `free:f9f51eb8-28a5-4e4c-8...`
- ✅ All environment variables set

---

## Features to Test Manually

### 1. Machine Translation (DeepL)

**Test Cases:**

#### TC-MT-01: Single Segment Translation
1. Login to http://localhost:5174
2. Open a project with documents
3. Open a document for translation
4. Click on a segment to edit
5. Look for "MT" or "Translate" button
6. Click to translate using DeepL
7. **Expected:** Segment fills with translation from DeepL

#### TC-MT-02: Check MT Status
**API Test:**
```bash
# Get auth token first (requires login)
curl -X GET http://localhost:5064/api/v1/mt/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```
**Expected Response:**
```json
{
  "enabled": true,
  "provider": "deepl",
  "usage": {
    "used": 12345,
    "limit": 500000,
    "percentUsed": 2
  }
}
```

#### TC-MT-03: Batch Translation
1. Open document with multiple empty segments
2. Look for "Translate All" or batch translate option
3. Select segments or translate all empty
4. **Expected:** Multiple segments translated at once

---

### 2. QA Checks

**Test Cases:**

#### TC-QA-01: Empty Target Detection
1. Open document
2. Leave target segment empty
3. Open QA Panel (should be in sidebar or toolbar)
4. Run QA checks
5. **Expected:** Warning about empty target

#### TC-QA-02: Numbers Mismatch
1. Source: "There are 10 items"
2. Target: "Il y a items" (missing number)
3. Run QA check
4. **Expected:** Error about missing number

#### TC-QA-03: Punctuation Mismatch
1. Source: "Hello world."
2. Target: "Hola mundo" (missing period)
3. Run QA check
4. **Expected:** Warning about punctuation

#### TC-QA-04: Terminology Consistency
1. Create term base with terms
2. Translate segment without using approved term
3. Run QA check
4. **Expected:** Warning about terminology mismatch

#### TC-QA-05: Length Difference
1. Source: "Hi" (2 chars)
2. Target: "This is a very long translation" (>50% difference)
3. Run QA check
4. **Expected:** Warning about length difference

#### TC-QA-06: Untranslated Segments
1. Source: "Hello world"
2. Target: "Hello world" (same as source)
3. Run QA check
4. **Expected:** Warning about untranslated segment

---

### 3. Threaded Comments

**Test Cases:**

#### TC-COM-01: Create Comment
1. Open document
2. Select a segment
3. Open Comments Panel
4. Add a comment: "Please review this translation"
5. **Expected:** Comment appears with username and timestamp

#### TC-COM-02: Reply to Comment
1. Find existing comment
2. Click "Reply" button
3. Add reply: "I've reviewed it, looks good"
4. **Expected:** Reply appears nested under original comment

#### TC-COM-03: Resolve Comment Thread
1. Find a comment thread
2. Click "Resolve" button
3. **Expected:** Thread marked as resolved (grayed out or hidden)

#### TC-COM-04: Unresolve Comment
1. Find resolved comment
2. Click "Unresolve" button
3. **Expected:** Thread becomes active again

#### TC-COM-05: Edit Comment
1. Find your own comment
2. Click "Edit" button
3. Change text
4. **Expected:** Comment updated with new text

#### TC-COM-06: Delete Comment
1. Find your own comment
2. Click "Delete" button
3. Confirm deletion
4. **Expected:** Comment removed (or children orphaned if parent)

#### TC-COM-07: Comment Count
1. Add multiple comments to a segment
2. Check document view
3. **Expected:** Comment badge/count shows number of comments

---

### 4. Find & Replace

**Test Cases:**

#### TC-FR-01: Open Dialog
1. Open document editor
2. Press **Ctrl+H**
3. **Expected:** Find & Replace modal opens

#### TC-FR-02: Find Text
1. Open Find & Replace (Ctrl+H)
2. Enter search term: "hello"
3. **Expected:** All instances highlighted in editor

#### TC-FR-03: Replace Single
1. Find text: "color"
2. Replace with: "colour"
3. Click "Replace" (next occurrence)
4. **Expected:** Single instance replaced, cursor moves to next

#### TC-FR-04: Replace All
1. Find text: "color"
2. Replace with: "colour"
3. Click "Replace All"
4. **Expected:** All instances replaced at once

#### TC-FR-05: Case Sensitivity
1. Find text: "Hello" (with case-sensitive enabled)
2. **Expected:** Only matches "Hello", not "hello"

#### TC-FR-06: Close Dialog
1. Open dialog (Ctrl+H)
2. Press Escape
3. **Expected:** Dialog closes

---

### 5. Word Count Display

**Test Cases:**

#### TC-WC-01: Source Word Count
1. Upload a document
2. View document details/header
3. **Expected:** Shows "Source: 1,234 words"

#### TC-WC-02: Target Word Count
1. Translate some segments
2. View document details
3. **Expected:** Shows "Target: 567 words" (or 0 if nothing translated)

#### TC-WC-03: Word Count in Document List
1. Go to project documents list
2. **Expected:** Each document shows word counts

---

### 6. Deadline Fields

**Test Cases:**

#### TC-DL-01: Set Project Deadline
1. Create new project
2. Look for "Deadline" date picker
3. Set deadline: 2026-03-01
4. Save project
5. **Expected:** Deadline saved and displayed

#### TC-DL-02: Set Document Deadline
1. Upload document to project
2. Open document settings
3. Set deadline (overrides project deadline)
4. **Expected:** Document deadline saved

#### TC-DL-03: View Deadlines
1. Go to project/document list
2. **Expected:** Deadlines displayed (possibly with warning if approaching)

#### TC-DL-04: Edit Deadline
1. Open existing project settings
2. Change deadline
3. Save
4. **Expected:** Updated deadline saved

---

## API Endpoint Tests

### Authentication Required
All endpoints below require `Authorization: Bearer <token>` header.

### Machine Translation
```bash
# Get MT status
GET /api/v1/mt/status

# Translate single segment
POST /api/v1/mt/translate/segment
{
  "segmentId": "uuid"
}

# Batch translate document
POST /api/v1/mt/translate/batch
{
  "documentId": "uuid",
  "segmentIds": ["uuid1", "uuid2"], // optional
  "overwrite": false // optional
}

# Get supported languages
GET /api/v1/mt/languages
```

### QA Checks
```bash
# Run QA on segment
POST /api/v1/qa/check/segment
{
  "segmentId": "uuid",
  "checks": {
    "emptyTarget": true,
    "numbersMismatch": true,
    "punctuationMismatch": true,
    "terminology": true,
    "lengthDifference": true,
    "untranslated": true
  }
}

# Run QA on entire document
POST /api/v1/qa/check/document
{
  "documentId": "uuid",
  "checks": { ... }
}
```

### Comments
```bash
# List comments for segment
GET /api/v1/comments/segment/:segmentId

# Create comment
POST /api/v1/comments
{
  "segmentId": "uuid",
  "content": "Comment text",
  "parentId": "uuid" // optional, for replies
}

# Update comment
PATCH /api/v1/comments/:id
{
  "content": "Updated text"
}

# Delete comment
DELETE /api/v1/comments/:id

# Resolve comment thread
POST /api/v1/comments/:id/resolve

# Unresolve comment thread
POST /api/v1/comments/:id/unresolve

# Get comment counts for document
GET /api/v1/comments/document/:documentId/counts
```

---

## Known Issues / Notes

1. **DeepL Free API Limit**: 500,000 characters/month
2. **Port Change**: Web running on 5174 instead of 5173 (port conflict)
3. **Existing Data**: Database has 2 comments already from previous testing
4. **MFA Required**: Users must have 2FA set up to login

---

## Testing Checklist

Use this checklist while testing:

### Machine Translation
- [ ] MT button visible in segment editor
- [ ] Single segment translation works
- [ ] Batch translation available
- [ ] MT status shows usage
- [ ] Handles errors gracefully (API key invalid, rate limit, etc.)

### QA Checks
- [ ] QA Panel accessible
- [ ] All 6 check types work:
  - [ ] Empty target
  - [ ] Numbers mismatch
  - [ ] Punctuation mismatch
  - [ ] Terminology
  - [ ] Length difference
  - [ ] Untranslated
- [ ] QA results clear and actionable
- [ ] Can run QA on single segment
- [ ] Can run QA on entire document

### Comments
- [ ] Can create comment on segment
- [ ] Can reply to comment (threading works)
- [ ] Can resolve/unresolve threads
- [ ] Can edit own comments
- [ ] Can delete own comments
- [ ] Comment count badge visible
- [ ] Comments persist across page refresh

### Find & Replace
- [ ] Ctrl+H opens dialog
- [ ] Find highlights all matches
- [ ] Replace single works
- [ ] Replace all works
- [ ] Case sensitivity toggle works
- [ ] ESC closes dialog

### Word Counts
- [ ] Source word count displayed
- [ ] Target word count displayed
- [ ] Counts accurate
- [ ] Updates when segments translated

### Deadlines
- [ ] Can set project deadline
- [ ] Can set document deadline
- [ ] Deadlines display correctly
- [ ] Can edit deadlines
- [ ] Date picker works correctly

---

## Test Results

Fill in results after manual testing:

| Feature | Status | Issues Found | Notes |
|---------|--------|--------------|-------|
| MT - Single segment | ⬜ | | |
| MT - Batch | ⬜ | | |
| MT - Status/Usage | ⬜ | | |
| QA - Empty target | ⬜ | | |
| QA - Numbers | ⬜ | | |
| QA - Punctuation | ⬜ | | |
| QA - Terminology | ⬜ | | |
| QA - Length | ⬜ | | |
| QA - Untranslated | ⬜ | | |
| Comments - Create | ⬜ | | |
| Comments - Reply | ⬜ | | |
| Comments - Resolve | ⬜ | | |
| Comments - Edit/Delete | ⬜ | | |
| Find & Replace - Find | ⬜ | | |
| Find & Replace - Replace | ⬜ | | |
| Word Counts | ⬜ | | |
| Deadlines | ⬜ | | |

**Legend:** ✅ Pass | ❌ Fail | ⚠️ Partial | ⬜ Not Tested

---

## Next Steps

1. Complete manual UI testing using this report
2. Document any bugs found
3. Fix critical issues
4. Re-test
5. Push commits to repository
6. Deploy to staging/production

---

## Contact

For issues or questions during testing, check:
- API logs: `/tmp/claude-1000/-home-zozin-Projects-oxy/tasks/b0a46ed.output`
- Database: `docker exec -it oxy-postgres psql -U oxy -d oxy`
- Redis: `docker exec -it oxy-redis redis-cli`
