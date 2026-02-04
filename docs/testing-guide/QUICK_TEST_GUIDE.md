# Quick Testing Guide - OXY TMS

## 🚀 Services Running
- ✅ API: http://localhost:5064
- ✅ Web: http://localhost:5174
- ✅ All containers healthy

## 📝 Quick Start Testing (5 minutes)

### Step 1: Login
1. Open http://localhost:5174
2. Login with: **manziisrael99@gmail.com**
3. Enter MFA code when prompted

### Step 2: Test MT (Machine Translation)
1. Open any project → Open a document
2. Click on an empty segment
3. Look for **"MT"** or **"Translate"** button
4. Click it → Should fill with DeepL translation
5. ✅ Pass if translation appears

### Step 3: Test QA Checks
1. In the same document, look for **"QA"** button or panel
2. Click to run QA checks
3. Should show issues like:
   - Empty targets
   - Number mismatches
   - Punctuation issues
4. ✅ Pass if issues are displayed

### Step 4: Test Comments
1. Select a segment
2. Look for **"Comments"** panel (sidebar/toolbar)
3. Add comment: "Test comment"
4. Try replying to it
5. Try resolving the thread
6. ✅ Pass if comment appears and threading works

### Step 5: Test Find & Replace
1. In document editor, press **Ctrl+H**
2. Should open Find & Replace modal
3. Find: "the"
4. Replace with: "THE"
5. Click "Replace" or "Replace All"
6. ✅ Pass if modal opens and replace works

### Step 6: Test Word Counts
1. Look at document header/details
2. Should show: "Source: X words" and "Target: Y words"
3. ✅ Pass if counts are visible

### Step 7: Test Deadlines
1. Create new project or edit existing
2. Look for "Deadline" date picker
3. Set a date
4. Save
5. ✅ Pass if deadline saves and displays

---

## 🐛 If Something Fails

### Check API Logs:
```bash
tail -f /tmp/claude-1000/-home-zozin-Projects-oxy/tasks/b0a46ed.output
```

### Check Browser Console:
Press F12 → Console tab → Look for errors

### Check Database:
```bash
docker exec -it oxy-postgres psql -U oxy -d oxy
\dt  # List tables
SELECT COUNT(*) FROM segment_comments;  # Check comments
```

### Restart Services:
```bash
# Stop current services (Ctrl+C on running terminal)
# Or kill the background task
cd /home/zozin/Projects/oxy
pnpm dev
```

---

## 📊 Test Results Template

Copy this and fill in after testing:

```
TESTING COMPLETED: [DATE/TIME]

✅ Services Running
[ ] MT Translation - Single segment
[ ] MT Translation - Status/usage display
[ ] QA Checks - Panel opens
[ ] QA Checks - Shows issues
[ ] Comments - Create comment
[ ] Comments - Reply/threading
[ ] Comments - Resolve
[ ] Find & Replace - Opens (Ctrl+H)
[ ] Find & Replace - Find works
[ ] Find & Replace - Replace works
[ ] Word Counts - Display
[ ] Deadlines - Set deadline
[ ] Deadlines - Display deadline

ISSUES FOUND:
1. [Describe any issues]
2. [...]

NOTES:
- [Any observations]
```

---

## 📄 Full Test Report

See detailed test cases in:
`/tmp/claude-1000/-home-zozin-Projects-oxy/4f504845-a948-418d-a28b-1764eea4addf/scratchpad/TEST_REPORT.md`

## 🔧 Environment

- Node: v20+
- API Port: 5064
- Web Port: 5174
- DeepL API: Configured (free tier)
- Database: PostgreSQL (Docker)
- Redis: Port 5065
