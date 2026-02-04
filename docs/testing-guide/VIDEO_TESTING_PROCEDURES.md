# OXY TMS - Video Recording Testing Procedures

## Overview

This document provides step-by-step testing procedures for each role with prepared test data. Follow these scripts to record professional demonstration videos.

**App URLs:**
- Frontend: http://localhost:5173
- API: http://localhost:5064/api/v1

**Test Password for All Accounts:** `Test@1234`

---

## Test Accounts Summary

**All emails go to:** `manziisrael99@gmail.com` (using Gmail + addressing)

| Name | Email | Role | Use Case |
|------|-------|------|----------|
| Sarah Chen | manziisrael99+admin@gmail.com | Org Admin | System administration, user management |
| Marcus Rodriguez | manziisrael99+pm@gmail.com | Project Manager | Project creation, resource assignment |
| Elena Petrov | manziisrael99+translator@gmail.com | Translator | Translation work, MT usage, TM leverage |
| David Park | manziisrael99+reviewer1@gmail.com | Reviewer 1 | First-level quality review |
| Maria Santos | manziisrael99+reviewer2@gmail.com | Reviewer 2 | Final quality approval |

---

# Role 1: Organization Administrator (Sarah Chen)

## Login
1. Navigate to http://localhost:5173
2. Click "Sign In"
3. Email: `manziisrael99+admin@gmail.com`
4. Password: `Test@1234`
5. **(If MFA enabled)**: Enter TOTP code from authenticator app

## Test Scenario: System Administration

### Part A: Dashboard Overview
1. **After login, observe the main dashboard**
   - Should show organization: "Global Translations Inc."
   - View active projects count
   - See recent activity feed

### Part B: User Management
1. **Navigate to "Organization" → "Members"**
   - View list of team members
   - Observe roles: Project Manager, Translators, Reviewers

2. **Invite New User** *(Optional)*
   - Click "Invite Member"
   - Enter email: `newuser@oxytest.com`
   - Select role: "Translator"
   - Click "Send Invitation"
   - **Expected:** Invitation email sent (check logs if email disabled)

3. **Modify User Role** *(Optional)*
   - Find any team member
   - Click "Edit" or role dropdown
   - Change role (e.g., Translator → Reviewer)
   - Save changes
   - **Expected:** Role updated successfully

### Part C: Translation Memory Management
1. **Navigate to "Resources" → "Translation Memories"**
   - View existing TM: "English to French - Software & Marketing"
   - Click on TM name to view details
   - **Observe:**
     - TM statistics (number of units)
     - Language pair: EN → FR
     - Last updated timestamp

2. **Browse TM Units**
   - Click "Browse Units" or "View Content"
   - See list of source/target pairs
   - Use search to find specific translations
   - Example search: "welcome"
   - **Expected:** Matching units displayed

3. **Export TM** *(Optional)*
   - Click "Export" button
   - Select format: TMX
   - Download file
   - **Expected:** TMX file downloaded

### Part D: Term Base Management
1. **Navigate to "Resources" → "Term Bases"**
   - View TB: "Software & Business Terminology"
   - Click to view details
   - **Observe:**
     - Number of terms
     - Language pair
     - Term categories

2. **Browse Terminology**
   - View terms list
   - Example terms: "dashboard", "workflow", "API"
   - Check definitions
   - **Expected:** Terms displayed with source, target, and definitions

### Part E: Organization Settings
1. **Navigate to "Settings" → "Organization"**
   - View organization name: "Global Translations Inc."
   - Review general settings
   - *(Optional)* Update organization details

2. **View Activity Logs**
   - Navigate to "Activity" tab
   - See chronological log of:
     - Project creations
     - User invitations
     - Document uploads
     - Translation completions
   - **Expected:** Activity feed displays recent actions

---

# Role 2: Project Manager (Marcus Rodriguez)

## Login
1. Navigate to http://localhost:5173
2. Email: `manziisrael99+pm@gmail.com`
3. Password: `Test@1234`

## Test Scenario: Project Management & Analytics

### Part A: View Existing Projects
1. **Dashboard → "Projects"**
   - Should see 3 projects:
     1. "Q1 2026 - Software Release Notes" (Full Review)
     2. "Marketing Materials - Q2 2026" (Single Review)
     3. "User Documentation Update" (Simple)
   - **Observe:**
     - Project status
     - Progress percentages
     - Deadlines
     - Assigned team members

### Part B: Project Statistics Dashboard ⭐ NEW FEATURE
1. **Open Project: "Q1 2026 - Software Release Notes"**
   - Click project name from list

2. **View Analytics Dashboard**
   - Click "Analytics" or "Statistics" tab
   - **Observe:**
     - **Total Segments:** Count of all segments
     - **Total Words:** Source and target word counts
     - **Progress Percentage:**
       - Translation: X%
       - Review 1: Y%
       - Review 2: Z%
       - Complete: W%
     - **Quality Metrics:**
       - Total comments
       - Unresolved comments
     - **Timeline:**
       - Project created date
       - Deadline date
       - Days remaining
       - Overdue status (if applicable)

3. **View Segments by Status**
   - See breakdown:
     - Untranslated: X segments
     - Draft: X segments
     - Translated: X segments
     - Reviewed 1: X segments
     - Reviewed 2: X segments
     - Locked: X segments

### Part C: Leverage Analysis ⭐ NEW FEATURE
1. **Open a document (e.g., "Software Release Notes v2.5")**
   - From project view, click document name

2. **Run Leverage Analysis**
   - Click "Analyze Leverage" or "Pre-translation Analysis" button
   - Wait for analysis to complete
   - **Expected Results:**
     - **Match Distribution:**
       - 100% matches (exact): X segments (Y words)
       - 95-99% matches (fuzzy high): X segments (Y words)
       - 85-94% matches (fuzzy mid): X segments (Y words)
       - 75-84% matches (fuzzy low): X segments (Y words)
       - <75% matches (no match): X segments (Y words)
       - Repetitions (duplicates): X segments (Y words)
     - **Estimated Effort:**
       - Total weighted words (shows effort calculation)
       - Example: "This document will require ~450 weighted words of effort"
       - Shows potential time/cost savings from TM leverage

3. **Interpret Results**
   - **High leverage (many exact/fuzzy matches):**
     - "This document has 60% TM leverage - translation will be faster"
   - **Low leverage (mostly new content):**
     - "This document has 20% TM leverage - more translation effort needed"

### Part D: Team Productivity Metrics ⭐ NEW FEATURE
1. **Navigate to "Team" → "Productivity"**
   - View productivity dashboard
   - **For each team member, observe:**
     - **Translation Statistics:**
       - Segments translated
       - Words translated
       - Segments reviewed
       - Words reviewed
       - Comments added
     - **Productivity Metrics:**
       - Words per day average
       - Segments per day average
       - Active days in project
       - Most active day
       - Last activity timestamp

2. **Filter by Date Range** *(If available)*
   - Select date range: Last 7 days / Last 30 days / Custom
   - See productivity trends

3. **Compare Translator Performance**
   - View side-by-side comparison
   - Identify top performers
   - Spot bottlenecks or delays

### Part E: Project Timeline ⭐ NEW FEATURE
1. **View Project Activity Timeline**
   - Click "Timeline" tab
   - **See daily breakdown:**
     - Date
     - Segments completed that day
     - Words translated
     - Comments added
     - Number of active users
   - **Visualize progress over time** *(if chart available)*

### Part F: Assign Work to Team Members
1. **Navigate to "Documents" → Select a document**
   - Click "Assignments" button

2. **Assign Translator**
   - Select "Elena Petrov" as Translator
   - Set deadline: [Date]
   - Click "Assign"
   - **Expected:** Elena can now access this document for translation

3. **Assign Reviewers**
   - Select "David Park" as Reviewer 1
   - Select "Maria Santos" as Reviewer 2
   - Set review deadlines
   - **Expected:** Reviewers can access after translation stage completes

### Part G: Create New Project
1. **Click "New Project" button**
   - **Project Details:**
     - Name: "Legal Contract Translation - May 2026"
     - Source Language: English
     - Target Language: French
     - Workflow: Full Review
     - **Deadline:** 2026-05-31 ⭐ NEW FIELD
   - Click "Create Project"

2. **Add Team Members**
   - Add translator: Elena Petrov
   - Add reviewers: David Park, Maria Santos
   - **Expected:** Team members assigned

3. **Attach Resources**
   - Add TM: "English to French - Software & Marketing"
   - Add TB: "Software & Business Terminology"
   - Set as writable (allow updates to TM/TB during translation)
   - **Expected:** Resources linked to project

---

# Role 3: Translator (Elena Petrov)

## Login
1. Navigate to http://localhost:5173
2. Email: `manziisrael99+translator@gmail.com`
3. Password: `Test@1234`

## Test Scenario: Translation Workflow with TM/MT/QA

### Part A: View Assigned Documents
1. **Dashboard → "My Tasks"**
   - Should see documents assigned for translation
   - Project: "Q1 2026 - Software Release Notes"
   - Document: "Software Release Notes v2.5"
   - **Observe:**
     - Document status
     - Word count ⭐ NEW
     - Deadline ⭐ NEW
     - Progress percentage

### Part B: Open Translation Editor
1. **Click document name to open editor**
   - **Observe editor layout:**
     - Source segments (left or top)
     - Target segments (right or bottom)
     - Segment navigation (previous/next)
     - **TM matches panel (right sidebar)**
     - **QA panel** ⭐ NEW
     - **Comments panel** ⭐ NEW
     - **Word count display in header** ⭐ NEW

### Part C: Translate with TM Matches
1. **Select first segment:**
   - Source: "Welcome to version 2.5 of our flagship product."
   - **TM Matches panel shows:**
     - **100% match:** "Welcome to version 2.5 of our flagship product." → "Bienvenue dans la version 2.5 de notre produit phare."
     - (This is an exact match from TM)

2. **Apply TM Match:**
   - Click "Apply" or "Insert" button on 100% match
   - **Expected:** Target field populated with translation
   - **Terminology highlights:** "flagship product" underlined (if term exists)
   - Confirm translation is correct
   - Press "Confirm" or Ctrl+Enter to save
   - **Expected:** Segment marked as "Translated"

3. **Fuzzy Match Example:**
   - Move to next segment with fuzzy match
   - Source: "This release includes 15 new features and 47 bug fixes."
   - **TM panel shows:**
     - **95% match:** "This release includes 12 new features and 45 bug fixes." → "Cette version inclut 12 nouvelles fonctionnalités et 45 corrections de bugs."
   - Click to insert fuzzy match
   - **Edit translation to correct the numbers:**
     - Change "12" to "15"
     - Change "45" to "47"
   - Confirm segment
   - **Expected:** Segment saved with corrected translation

### Part D: Machine Translation ⭐ NEW FEATURE
1. **Select untranslated segment:**
   - Source: "The new dashboard provides real-time analytics with customizable widgets."
   - **No TM match available**

2. **Click "MT" or "Translate" button**
   - (Should be near target text area)
   - **Expected:**
     - Button shows "Translating..." briefly
     - Target field fills with DeepL translation
     - Translation appears: "Le nouveau tableau de bord fournit des analyses en temps réel avec des widgets personnalisables."

3. **Review MT output:**
   - Check terminology consistency (look for underlined terms)
   - Edit if necessary
   - Confirm segment
   - **Expected:** Segment marked as "Translated"

### Part E: Quality Assurance Checks ⭐ NEW FEATURE
1. **Open QA Panel**
   - Click "QA" tab or button in sidebar
   - Should show QA checks panel

2. **Translate segment with number:**
   - Source: "Performance improvements reduce load time by 40%."
   - Target (incorrect): "Les améliorations de performance réduisent le temps de chargement." (missing "40%")
   - Confirm segment

3. **Run QA Check:**
   - Click "Run QA Checks" button
   - **Expected QA Issues:**
     - ⚠️ **Numbers Mismatch:** Source has "40" but target is missing it
     - Click on issue to jump to segment
     - **Fix:** Add "de 40%" to target
     - Re-run QA check
     - ✅ **No issues found**

4. **Test Other QA Checks:**
   - **Empty Target:**
     - Leave target empty → ⚠️ "Empty target segment"
   - **Punctuation Mismatch:**
     - Source: "Hello world."
     - Target: "Bonjour le monde" (missing period) → ⚠️ "Punctuation mismatch"
   - **Terminology Check:**
     - Source contains "dashboard" (term exists in TB)
     - Target uses "panel" instead of "tableau de bord" → ⚠️ "Incorrect terminology"

### Part F: Comments & Collaboration ⭐ NEW FEATURE
1. **Select a segment with uncertainty:**
   - Source: "Seamlessly integrate with your existing tools and workflows."
   - Target translation entered

2. **Add Comment:**
   - Click "Comments" tab or icon
   - Click "Add Comment" button
   - Text: "@David - Please review this segment. Unsure if 'seamlessly' should be translated as 'facilement' or 'sans effort'."
   - Click "Post Comment"
   - **Expected:** Comment appears with your name and timestamp

3. **Mention User in Comment:**
   - Use @ symbol to mention reviewer
   - **Expected:** Reviewer gets notification (if notifications enabled)

### Part G: Find & Replace ⭐ NEW FEATURE
1. **Press Ctrl+H** to open Find & Replace dialog
   - (Or click menu: Edit → Find & Replace)

2. **Find text:**
   - Find: "version"
   - **Expected:** All instances highlighted in editor

3. **Replace text:**
   - Find: "color"
   - Replace with: "colour"
   - Click "Replace" (single) or "Replace All"
   - **Expected:** Text replaced in target segments

4. **Case-sensitive search:**
   - Enable "Match case" checkbox
   - Find: "API"
   - **Expected:** Only matches "API", not "api"

5. **Close dialog:**
   - Press Escape or click X
   - **Expected:** Dialog closes

### Part H: Track Progress
1. **View document header:**
   - **Source words:** X words ⭐ NEW
   - **Target words:** Y words ⭐ NEW
   - **Progress:** "15/30 segments completed (50%)"

2. **Save and exit:**
   - Progress auto-saves after each segment confirmation
   - Click "Close" or navigate away
   - **Expected:** Progress persists

---

# Role 4: Reviewer 1 (David Park)

## Login
1. Navigate to http://localhost:5173
2. Email: `manziisrael99+reviewer1@gmail.com`
3. Password: `Test@1234`

## Test Scenario: First-Level Quality Review

### Part A: View Documents for Review
1. **Dashboard → "My Tasks"**
   - Filter by "Ready for Review"
   - Should see documents where translation is complete
   - **Note:** Document must have all segments translated before appearing here

### Part B: Open Document for Review
1. **Click document name**
   - Opens in review mode
   - Source and target segments visible
   - **Cannot edit segments marked as locked or not yet reviewed**

### Part C: Review Translation Quality
1. **Read through translations:**
   - Check accuracy against source
   - Verify terminology consistency (terms underlined)
   - Look for grammatical errors

2. **Use QA Panel ⭐ NEW**
   - Click "Run QA Checks"
   - Review all issues flagged:
     - Empty targets
     - Number mismatches
     - Punctuation issues
     - Terminology inconsistencies
   - **For each issue:**
     - Click to navigate to problematic segment
     - Verify if it's a real issue
     - Suggest corrections via comments

### Part D: Add Review Comments ⭐ NEW
1. **Select segment with issue:**
   - Click "Comments" tab

2. **Add Comment:**
   - Click "Add Comment"
   - Text: "The translation of 'workflow' should use the approved term 'flux de travail' from the term base."
   - Click "Post"
   - **Expected:** Comment thread created

3. **Reply to Translator's Comment:**
   - Find existing comment from Elena
   - Click "Reply"
   - Text: "I think 'sans effort' is more appropriate in this context."
   - Post reply
   - **Expected:** Reply appears nested under original comment

4. **Resolve Comment:**
   - After issue is addressed, click "Resolve" button
   - **Expected:** Thread marked as resolved (grayed out or hidden)

### Part E: Approve or Reject Segments
1. **Approve Segment:**
   - Review segment
   - If correct, click "Approve" or change status to "Reviewed 1"
   - **Expected:** Segment advances to next stage

2. **Reject Segment (Send back to translator):**
   - If translation needs work, add comment explaining issue
   - Change status to "Draft" or click "Reject"
   - **Expected:** Segment returns to translator's queue

3. **Edit Segment (if allowed):**
   - Some workflows allow reviewers to edit directly
   - Make minor corrections
   - Confirm changes
   - **Expected:** Segment updated and marked as reviewed

### Part F: Complete Review
1. **Review all segments in document**
   - Go through each segment systematically
   - Use Previous/Next buttons to navigate

2. **Final QA Check:**
   - Run QA one more time on entire document
   - Verify all critical issues resolved
   - **Expected:** Minimal or no QA issues

3. **Mark Document as Review 1 Complete:**
   - If all segments approved, document status changes automatically
   - **Expected:** Document moves to Review 2 stage (if full review workflow)

---

# Role 5: Reviewer 2 (Maria Santos)

## Login
1. Navigate to http://localhost:5173
2. Email: `manziisrael99+reviewer2@gmail.com`
3. Password: `Test@1234`

## Test Scenario: Final Quality Approval

### Part A: View Documents for Final Review
1. **Dashboard → "My Tasks"**
   - Filter by "Ready for Review 2"
   - Should see documents that passed Review 1
   - **Note:** Only available in "Full Review" workflow projects

### Part B: Open Document for Final Review
1. **Click document name**
   - Review mode opens
   - All segments should be marked as "Reviewed 1"

### Part C: Final Quality Check
1. **Perform comprehensive review:**
   - Check overall translation quality
   - Verify consistency across entire document
   - Check formatting and structure
   - Ensure all terminology follows term base

2. **Run Final QA Check ⭐ NEW**
   - Click "Run QA Checks"
   - **Expected:** Minimal or no issues (should have been caught in Review 1)
   - Address any remaining issues

3. **Review Comments History ⭐ NEW**
   - Open Comments panel
   - View all comment threads
   - Check that critical issues from Review 1 were addressed
   - **Verify resolved comments:**
     - Click "Show Resolved" to see fixed issues
     - Confirm fixes are satisfactory
   - **Unresolve if necessary:**
     - If issue not properly fixed, click "Unresolve"
     - Add follow-up comment

### Part D: Final Approval
1. **Approve Segments:**
   - Go through all segments
   - Click "Approve" or mark as "Reviewed 2"
   - **Expected:** Segments advance to "Locked" status

2. **Lock Final Segments:**
   - Once approved, segments become locked
   - **Locked segments cannot be edited** (prevents accidental changes)

### Part E: Complete Final Review
1. **Verify Document Complete:**
   - All segments marked as "Reviewed 2" or "Locked"
   - Document status changes to "Complete"
   - **Expected:** Document ready for export/delivery

2. **Export Final Document (PM or Admin):**
   - *(Usually done by PM or Admin)*
   - Click "Export" button
   - Select format: XLIFF / DOCX / TXT
   - Download translated document
   - **Expected:** File downloaded with all translations

---

## Common Features Across All Roles

### Document Analytics ⭐ NEW
- **Available to:** All roles
- **Location:** Document view → "Analytics" tab
- **Shows:**
  - Total segments / Source words / Target words
  - Completion percentage
  - Average TM match percentage
  - MT usage count
  - QA issue count
  - Comment count
  - Time spent on document
  - List of contributors with their contribution counts

### Activity Feed
- **Available to:** All roles
- **Location:** Dashboard → "Activity" tab or sidebar
- **Shows:**
  - Recent actions in projects
  - User activities (who translated what, when)
  - Document uploads
  - Review completions
  - Comment additions

### Notifications
- **Types:**
  - Document assigned to you
  - Comment mentions (@username)
  - Review completed
  - QA issues found
  - Deadline approaching

---

## Video Recording Tips

### Preparation
1. **Clear browser cache** before recording
2. **Use incognito/private window** for clean session
3. **Close unnecessary tabs** to avoid distractions
4. **Set browser zoom to 100%** for best visibility
5. **Disable browser extensions** that modify page appearance

### Recording Flow
1. **Start with login** for the role you're demonstrating
2. **Narrate what you're doing** as you go
3. **Pause briefly** after each major action to show result
4. **Highlight new features** (MT, QA, Comments, Analytics)
5. **Show before/after states** (e.g., before QA check, after fixing issues)
6. **Demonstrate error states** (what happens when QA finds issues)
7. **End with summary** of what was accomplished

### Segment Timing
- **Org Admin demo:** 8-10 minutes
- **Project Manager demo:** 10-12 minutes (focus on analytics)
- **Translator demo:** 12-15 minutes (most features to show)
- **Reviewer demos:** 8-10 minutes each

### Key Points to Emphasize

#### For Stakeholders/Clients:
- **Translation Memory leverage** = cost savings
- **Quality assurance automation** = fewer errors
- **Analytics & reporting** = project visibility
- **Collaboration features** = better communication
- **Deadline tracking** = on-time delivery

#### For Technical Users:
- **Efficient workflow** with keyboard shortcuts
- **TM/TB integration** for consistency
- **MT integration** for speed
- **Real-time collaboration** via comments
- **Comprehensive QA** catches issues early

---

## Troubleshooting During Recording

### Issue: TM matches not appearing
- **Fix:** Ensure project has TM attached (check project resources)
- Run leverage analysis to verify TM is being queried

### Issue: MT button not working
- **Fix:** Check `DEEPL_API_KEY` is set in `.env`
- Verify API key is valid (not rate-limited)

### Issue: QA checks not running
- **Fix:** Ensure segments have both source and target text
- Check that QA service is running (API logs)

### Issue: Comments not saving
- **Fix:** Verify user is authenticated
- Check network tab for API errors

### Issue: Analytics not loading
- **Fix:** Ensure project has segment history data
- Check that analytics routes are registered

---

## Success Criteria Checklist

After recording all roles, verify you demonstrated:

### Features
- [ ] User login (all roles)
- [ ] Project dashboard
- [ ] Document list with word counts and deadlines
- [ ] Translation editor with TM matches
- [ ] Machine translation (MT button)
- [ ] Quality assurance (QA panel with all 6 check types)
- [ ] Threaded comments (create, reply, resolve)
- [ ] Find & Replace (Ctrl+H)
- [ ] Leverage analysis (match distribution, estimated effort)
- [ ] Project statistics (progress, segments by status)
- [ ] User productivity metrics
- [ ] Document analytics
- [ ] Term base integration (term highlighting)
- [ ] Workflow stages (Translation → Review 1 → Review 2)

### User Interactions
- [ ] Creating projects
- [ ] Uploading documents
- [ ] Assigning team members
- [ ] Translating with TM/MT
- [ ] Running QA checks and fixing issues
- [ ] Adding and resolving comments
- [ ] Reviewing and approving translations
- [ ] Viewing analytics and reports
- [ ] Exporting final documents

---

**Good luck with your video recording! 🎬**
