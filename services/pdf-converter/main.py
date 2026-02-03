"""PDF Converter Microservice.

A lightweight FastAPI service for PDF <-> DOCX conversion using LibreOffice.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from converter import pdf_to_docx, docx_to_pdf
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PDF Converter Service",
    description="PDF to DOCX and DOCX to PDF conversion service using LibreOffice",
    version="2.0.0"
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "version": "2.0.0", "engine": "libreoffice"}


@app.post("/convert/pdf-to-docx")
async def convert_pdf_to_docx(
    file: UploadFile = File(...),
):
    """Convert a PDF file to DOCX format using LibreOffice.

    LibreOffice provides accurate conversion with proper paragraph structure,
    formatting, and layout preservation.

    Args:
        file: PDF file to convert

    Returns:
        DOCX file as binary response
    """
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "File must be a PDF")

    try:
        logger.info(f"Received PDF conversion request: {file.filename}")
        pdf_bytes = await file.read()

        if len(pdf_bytes) == 0:
            raise HTTPException(400, "Empty file received")

        docx_bytes = pdf_to_docx(pdf_bytes)

        # Generate output filename
        output_filename = file.filename.rsplit('.', 1)[0] + '.docx'

        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{output_filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"PDF to DOCX conversion failed: {e}")
        raise HTTPException(500, f"Conversion failed: {str(e)}")


@app.post("/convert/docx-to-pdf")
async def convert_docx_to_pdf(file: UploadFile = File(...)):
    """Convert a DOCX file to PDF format using LibreOffice.

    Args:
        file: DOCX file to convert

    Returns:
        PDF file as binary response
    """
    if not file.filename or not file.filename.lower().endswith('.docx'):
        raise HTTPException(400, "File must be a DOCX")

    try:
        logger.info(f"Received DOCX conversion request: {file.filename}")
        docx_bytes = await file.read()

        if len(docx_bytes) == 0:
            raise HTTPException(400, "Empty file received")

        pdf_bytes = docx_to_pdf(docx_bytes)

        # Generate output filename
        output_filename = file.filename.rsplit('.', 1)[0] + '.pdf'

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{output_filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"DOCX to PDF conversion failed: {e}")
        raise HTTPException(500, f"Conversion failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
