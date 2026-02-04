# Development Progress

## Completed (Session: 2026-02-04)

### Backend - New TMS Features
- **Machine Translation (DeepL)** - `apps/api/src/services/mt.service.ts`
  - Single segment translation
  - Batch translation for documents
  - Usage tracking
  - Configured via `DEEPL_API_KEY` env var (prefix with `free:` for free API)

- **QA Checks** - `apps/api/src/services/qa.service.ts`
  - Empty target detection
  - Numbers mismatch
  - Punctuation mismatch
  - Terminology consistency (checks against term bases)
  - Length difference warnings
  - Untranslated segment detection

- **Threaded Comments** - `apps/api/src/services/comments.service.ts`
  - Create, edit, delete comments on segments
  - Threaded replies
  - Resolve/unresolve threads
  - Comment counts per document

- **Database Migration** - `apps/api/drizzle/0006_amusing_leper_queen.sql`
  - `segment_comments` table
  - `deadline` fields on projects and documents
  - `source_word_count` and `target_word_count` on documents

### Frontend - UI Components
- **MT Button** - In segment editor, calls DeepL API
- **QA Panel** - `apps/web/src/components/QAPanel.tsx`
- **Comments Panel** - `apps/web/src/components/CommentsPanel.tsx`
- **Find & Replace** - `apps/web/src/components/FindReplaceModal.tsx` (Ctrl+H)
- **Word Count Display** - In document header
- **Deadline Field** - In project creation form

### Other Improvements
- Removed unused PDF export code
- Improved DOCX export with LibreOffice conversion
- Added Adobe PDF Services integration (optional)

## Commits (not pushed)
```
377eea7 Improve PDF/DOCX handling and remove unused export code
053b5cb Add word count display and deadline fields for projects/documents
72779b1 Add MT button, QA panel, comments panel, and find/replace UI
c2dc125 Add MT (DeepL), QA checks, and threaded comments backend services
```

## TODO - Next Session

### High Priority
1. **Test the new features** - Run the app and verify:
   - MT translation works with DeepL key
   - QA checks run correctly
   - Comments can be added/resolved
   - Find & Replace works
   - Word counts display correctly

2. **Add `__pycache__/` to `.gitignore`**

3. **Push commits** after testing

### Nice to Have
- Add deadline display in project/document list views
- Add deadline editing in project settings
- Batch MT translation UI (translate all empty segments)
- QA check configuration options in UI
- Export comments with document

## Environment Setup
To enable DeepL MT, add to `.env`:
```
DEEPL_API_KEY=free:your-api-key-here
```
