# PDF Conversion Microservice

## Overview

A lightweight Python microservice using **LibreOffice** for PDF ↔ DOCX conversion, providing accurate document conversion with proper paragraph structure and formatting preservation.

## Architecture

```
┌─────────────┐      HTTP       ┌─────────────────────┐
│   OXY API   │ ──────────────► │  PDF Convert Service │
│  (Node.js)  │                 │      (Python)        │
└─────────────┘                 └─────────────────────┘
      │                                   │
      │                                   │
      ▼                                   ▼
┌─────────────┐                 ┌─────────────────────┐
│    MinIO    │                 │  pdf2docx + PyMuPDF │
└─────────────┘                 └─────────────────────┘
```

## Tech Stack

- **Framework**: FastAPI (async, fast, auto-docs)
- **Conversion Engine**: LibreOffice (headless mode)
- **Container**: Python 3.11+ slim image with LibreOffice

## API Design

### Endpoints

#### `POST /convert/pdf-to-docx`

Convert PDF buffer to DOCX.

**Request:**
```
Content-Type: multipart/form-data

file: <pdf binary>
ocr: boolean (optional, default: false)
```

**Response:**
```
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document

<docx binary>
```

**Error Response:**
```json
{
  "error": "Conversion failed",
  "detail": "PDF appears to be scanned/image-only. Enable OCR."
}
```

#### `POST /convert/docx-to-pdf`

Convert DOCX buffer to PDF.

**Request:**
```
Content-Type: multipart/form-data

file: <docx binary>
```

**Response:**
```
Content-Type: application/pdf

<pdf binary>
```

#### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

---

## Implementation

### Directory Structure

```
services/
└── pdf-converter/
    ├── Dockerfile
    ├── requirements.txt
    ├── main.py
    └── converter.py
```

### requirements.txt

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6
pdf2docx==0.5.8
python-docx==1.1.0

# For DOCX to PDF (uses LibreOffice)
# Alternative: use reportlab or weasyprint for simpler cases
```

### main.py

```python
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from converter import pdf_to_docx, docx_to_pdf
import tempfile
import os

app = FastAPI(title="PDF Converter Service", version="1.0.0")

@app.get("/health")
async def health():
    return {"status": "healthy", "version": "1.0.0"}

@app.post("/convert/pdf-to-docx")
async def convert_pdf_to_docx(file: UploadFile = File(...), ocr: bool = False):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "File must be a PDF")

    try:
        pdf_bytes = await file.read()
        docx_bytes = pdf_to_docx(pdf_bytes, ocr=ocr)

        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f"attachment; filename=converted.docx"}
        )
    except Exception as e:
        raise HTTPException(500, f"Conversion failed: {str(e)}")

@app.post("/convert/docx-to-pdf")
async def convert_docx_to_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.docx'):
        raise HTTPException(400, "File must be a DOCX")

    try:
        docx_bytes = await file.read()
        pdf_bytes = docx_to_pdf(docx_bytes)

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=converted.pdf"}
        )
    except Exception as e:
        raise HTTPException(500, f"Conversion failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

### converter.py

```python
from pdf2docx import Converter
import tempfile
import os
import subprocess

def pdf_to_docx(pdf_bytes: bytes, ocr: bool = False) -> bytes:
    """Convert PDF bytes to DOCX bytes."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        pdf_path = os.path.join(tmp_dir, "input.pdf")
        docx_path = os.path.join(tmp_dir, "output.docx")

        # Write PDF to temp file
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        # Convert using pdf2docx
        cv = Converter(pdf_path)
        cv.convert(docx_path)
        cv.close()

        # Read and return DOCX bytes
        with open(docx_path, "rb") as f:
            return f.read()

def docx_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX bytes to PDF bytes using LibreOffice."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        docx_path = os.path.join(tmp_dir, "input.docx")

        # Write DOCX to temp file
        with open(docx_path, "wb") as f:
            f.write(docx_bytes)

        # Convert using LibreOffice headless
        subprocess.run([
            "libreoffice",
            "--headless",
            "--convert-to", "pdf",
            "--outdir", tmp_dir,
            docx_path
        ], check=True, capture_output=True)

        # Read and return PDF bytes
        pdf_path = os.path.join(tmp_dir, "input.pdf")
        with open(pdf_path, "rb") as f:
            return f.read()
```

### Dockerfile

```dockerfile
FROM python:3.11-slim

# Install LibreOffice for DOCX to PDF conversion
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

---

## Docker Compose Integration

Add to `docker-compose.yml`:

```yaml
services:
  # ... existing services ...

  pdf-converter:
    build: ./services/pdf-converter
    ports:
      - "8001:8001"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Node.js Integration

### Update `apps/api/src/config/env.ts`

```typescript
// Add to env schema
PDF_CONVERTER_URL: z.string().default('http://localhost:8001'),
```

### Update `apps/api/src/services/conversion.service.ts`

```typescript
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const PDF_CONVERTER_URL = env.PDF_CONVERTER_URL;

export function isConversionEnabled(): boolean {
  return !!PDF_CONVERTER_URL;
}

export async function convertPdfToDocx(pdfBuffer: Buffer): Promise<{ docxBuffer: Buffer }> {
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer]), 'document.pdf');

  const response = await fetch(`${PDF_CONVERTER_URL}/convert/pdf-to-docx`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(`PDF conversion failed: ${error.detail}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { docxBuffer: Buffer.from(arrayBuffer) };
}

export async function convertDocxToPdf(docxBuffer: Buffer): Promise<{ pdfBuffer: Buffer }> {
  const formData = new FormData();
  formData.append('file', new Blob([docxBuffer]), 'document.docx');

  const response = await fetch(`${PDF_CONVERTER_URL}/convert/docx-to-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(`DOCX to PDF conversion failed: ${error.detail}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { pdfBuffer: Buffer.from(arrayBuffer) };
}
```

---

## Environment Variables

```env
# PDF Converter Service
PDF_CONVERTER_URL=http://pdf-converter:8001
```

---

## Implementation Status

1. [x] Create `services/pdf-converter/` directory
2. [x] Implement `requirements.txt`, `main.py`, `converter.py`
3. [x] Create `Dockerfile`
4. [x] Add service to `docker-compose.yml`
5. [x] Update `env.ts` with `PDF_CONVERTER_URL`
6. [x] Replace ConvertAPI calls in `conversion.service.ts`
7. [ ] Test PDF upload and export flow
8. [ ] (Optional) Add OCR support with Tesseract

---

## License Consideration

**LibreOffice uses MPL/LGPL license** which is permissive for use as a conversion tool. No licensing concerns for using it as a document converter in a microservice architecture.

---

## Performance Notes

- LibreOffice is CPU-bound; consider running multiple workers for high load
- Large PDFs (100+ pages) may take 30-60 seconds
- LibreOffice provides excellent accuracy compared to pdf2docx
- Consider adding a job queue (Redis + Celery) for async processing if needed

---

## Post-Processing: Text Box Flattening

LibreOffice creates text boxes when converting PDFs, which places text inside nested structures:

```xml
<w:p><w:drawing>...<wps:txbx><w:txbxContent><w:p>...
```

The `flatten_textboxes()` function in `converter.py` post-processes the DOCX to:
1. Extract paragraphs from `<w:txbxContent>` elements
2. Replace text box containers with the extracted paragraphs
3. Deduplicate paragraphs with identical text
4. Preserve section properties (`w:sectPr`)

This ensures segments are properly extracted by the DOCX parser.

---

## Known Issues & Solutions

### Duplication in Parsed Segments

**Symptom**: Same text appears twice in the segment list.

**Causes & Solutions**:
1. **Text boxes not flattened**: The Python `flatten_textboxes()` function handles this
2. **Recursive parsing finds same paragraphs**: The TypeScript DOCX parser has deduplication via `seenParagraphTexts` Set
3. **Multiple runs in same paragraph**: Parser joins all `<w:t>` elements within a paragraph

### Export Quality Issues

**Symptom**: Exported document has different formatting, fonts, or spacing.

**Root Cause**: PDF → DOCX → PDF conversion is lossy. LibreOffice recreates the document structure from PDF visual layout, which doesn't preserve original fonts, exact spacing, or page breaks.

**Current Solution**: For PDF documents with converted DOCX, we offer DOCX export only (not PDF back-conversion). This preserves the best possible quality from the LibreOffice conversion.

```typescript
// In documents.ts export route:
if (pdfHasConvertedDocx) {
  allFormats = ['txt', 'xliff', 'docx']; // No PDF option
}
```

### Page Numbers as Segments

**Symptom**: Page numbers like "1", "- 2 -", "Page 3" appear as segments.

**Solution**: The DOCX parser filters these patterns:
```typescript
if (/^[-–—]?\s*\d+\s*[-–—]?$/.test(trimmedText) ||
    /^(Page|Pg\.?|P\.?)\s*\d+(\s*(of|\/)\s*\d+)?$/i.test(trimmedText)) {
  continue; // Skip page numbers
}
```

---

## TM Matching Troubleshooting

TM matching works identically for PDF documents and other file types. If TM matches aren't appearing:

### Check Project Resources
1. Go to Project Settings → Resources
2. Verify at least one TM is attached to the project
3. Confirm the TM's source/target languages match the project

### Check TM Content
1. The attached TM must contain translation units
2. Source text must be similar enough to score ≥50% match
3. PDF extraction may produce slightly different text (spacing, line breaks) affecting match scores

### Verify in Code
The flow for TM matching:
1. `DocumentPage.tsx` calls `listSegments(documentId, true)` with `includeMatches=true`
2. Backend in `documents.ts` (line 891-926) fetches TM IDs from project resources
3. For each segment, calls `findMatches()` from `tm.service.ts`
4. Returns `bestMatchPercent` and `hasContextMatch` for each segment

### Common Issues
- **Empty TMs**: TM exists but has no translation units
- **Language mismatch**: TM is EN→FR but project is EN→DE
- **Low scores**: PDF text differs enough from TM entries to score below 50%

---

## Alternative: Adobe PDF Services API

For better conversion quality, consider Adobe PDF Services API.

### Pricing
- **Free Tier**: 500 document transactions/month (perpetual, no credit card)
- 1 transaction = up to 50 pages for most operations
- Paid plans available for higher volume

### Pros
- Native Adobe technology - best PDF fidelity
- Better font, layout, and formatting preservation
- OCR support for scanned PDFs
- Cloud-based - no LibreOffice dependency

### Cons
- 500 transactions/month limit on free tier
- Requires internet connectivity
- Data sent to Adobe servers (privacy consideration)
- External API dependency

### Implementation Consideration
Could implement as primary converter with LibreOffice fallback:
```typescript
async function convertPdfToDocx(pdfBuffer: Buffer): Promise<Buffer> {
  if (env.ADOBE_PDF_SERVICES_KEY) {
    try {
      return await adobeConvert(pdfBuffer);
    } catch (e) {
      logger.warn('Adobe conversion failed, falling back to LibreOffice');
    }
  }
  return await libreOfficeConvert(pdfBuffer);
}
```

### Resources
- [Adobe PDF Services API](https://developer.adobe.com/document-services/apis/pdf-services/)
- [Pricing](https://developer.adobe.com/document-services/pricing/)
- [Node.js SDK](https://github.com/adobe/pdfservices-node-sdk)
