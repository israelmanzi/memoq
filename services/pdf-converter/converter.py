"""PDF/DOCX conversion utilities using LibreOffice and python-docx."""

import tempfile
import subprocess
import os
import logging
import glob
import zipfile
import io
from xml.etree import ElementTree as ET
from typing import Dict

import re
import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

# XML namespaces used in DOCX
NAMESPACES = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
}

# Register namespaces to preserve them in output
for prefix, uri in NAMESPACES.items():
    ET.register_namespace(prefix, uri)

# Also register common namespaces that might appear
ET.register_namespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
ET.register_namespace('v', 'urn:schemas-microsoft-com:vml')
ET.register_namespace('o', 'urn:schemas-microsoft-com:office:office')
ET.register_namespace('wpc', 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas')
ET.register_namespace('w10', 'urn:schemas-microsoft-com:office:word')


def get_paragraph_text(para):
    """Extract text content from a paragraph element."""
    texts = []
    for t in para.iter(f'{{{NAMESPACES["w"]}}}t'):
        if t.text:
            texts.append(t.text)
    return ''.join(texts).strip()


def flatten_textboxes(docx_bytes: bytes) -> bytes:
    """Post-process DOCX to flatten text boxes into normal paragraphs.

    LibreOffice creates text boxes when converting PDFs, which places text
    inside nested structures like:
        <w:p><w:drawing>...<wps:txbx><w:txbxContent><w:p>...

    This function extracts paragraphs from text boxes and replaces the
    text box containers with the extracted paragraphs directly in the
    document body. It also removes duplicate paragraphs.

    Args:
        docx_bytes: Raw DOCX file bytes

    Returns:
        Modified DOCX file bytes with flattened structure
    """
    # Open the DOCX (ZIP) file
    docx_zip = zipfile.ZipFile(io.BytesIO(docx_bytes), 'r')

    # Read document.xml
    try:
        document_xml = docx_zip.read('word/document.xml')
    except KeyError:
        logger.warning("No word/document.xml found, returning original")
        return docx_bytes

    # Parse XML
    root = ET.fromstring(document_xml)

    # Find the body element
    body = root.find('.//w:body', NAMESPACES)
    if body is None:
        logger.warning("No w:body found, returning original")
        return docx_bytes

    # Track seen paragraph texts to avoid duplicates
    seen_texts = set()

    # Process body children and build new list
    # We need to replace paragraphs containing text boxes with their content
    new_body_children = []
    paragraphs_extracted = 0
    textboxes_removed = 0
    duplicates_removed = 0

    for child in list(body):
        # Check if this is a paragraph with a drawing/text box
        if child.tag == f'{{{NAMESPACES["w"]}}}p':
            # Find all txbxContent elements in this paragraph
            txbx_contents = child.findall('.//' + f'{{{NAMESPACES["w"]}}}txbxContent')

            if txbx_contents:
                # This paragraph contains text boxes - extract their content
                for txbx_content in txbx_contents:
                    for para in txbx_content.findall('w:p', NAMESPACES):
                        # Check for duplicate text
                        para_text = get_paragraph_text(para)
                        if para_text and para_text in seen_texts:
                            duplicates_removed += 1
                            continue
                        if para_text:
                            seen_texts.add(para_text)

                        # Clone the paragraph
                        para_copy = ET.fromstring(ET.tostring(para))
                        new_body_children.append(para_copy)
                        paragraphs_extracted += 1
                textboxes_removed += 1
                # Don't add the original paragraph (it contained the text box)
            else:
                # Regular paragraph without text boxes - check for duplicates
                para_text = get_paragraph_text(child)
                if para_text and para_text in seen_texts:
                    duplicates_removed += 1
                    continue
                if para_text:
                    seen_texts.add(para_text)
                new_body_children.append(child)
        else:
            # Non-paragraph element (tables, etc.) - keep it
            new_body_children.append(child)

    if paragraphs_extracted > 0 or duplicates_removed > 0:
        logger.info(f"Extracted {paragraphs_extracted} paragraphs from {textboxes_removed} text boxes, removed {duplicates_removed} duplicates")

        # Clear body and add new children
        # Keep sectPr (section properties) at the end if present
        sect_pr = body.find('w:sectPr', NAMESPACES)

        # Remove all children from body
        for child in list(body):
            body.remove(child)

        # Add the new children
        for child in new_body_children:
            body.append(child)

        # Re-add section properties at the end if they existed
        if sect_pr is not None:
            body.append(sect_pr)

        logger.info(f"Flattened document now has {len(list(body))} direct children in body")
    else:
        logger.info("No text boxes found, document structure is already flat")

    # Rebuild the DOCX
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as out_zip:
        for item in docx_zip.namelist():
            if item == 'word/document.xml':
                # Write modified document.xml
                modified_xml = ET.tostring(root, encoding='unicode')
                # Add XML declaration
                modified_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + modified_xml
                out_zip.writestr(item, modified_xml.encode('utf-8'))
            else:
                # Copy other files unchanged
                out_zip.writestr(item, docx_zip.read(item))

    docx_zip.close()

    result = output.getvalue()
    logger.info(f"Flattened DOCX size: {len(result)} bytes")
    return result


def pdf_to_docx(pdf_bytes: bytes, ocr: bool = False) -> bytes:
    """Convert PDF bytes to DOCX bytes using LibreOffice.

    LibreOffice provides better accuracy than pdf2docx for most documents,
    with proper paragraph structure and formatting preservation.

    Args:
        pdf_bytes: Raw PDF file bytes
        ocr: Whether to use OCR for scanned PDFs (not yet implemented)

    Returns:
        DOCX file bytes
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        pdf_path = os.path.join(tmp_dir, "input.pdf")

        # Write PDF to temp file
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        # Convert using LibreOffice headless
        # The writer_pdf_import filter allows LibreOffice to import PDFs
        logger.info(f"Converting PDF ({len(pdf_bytes)} bytes) to DOCX using LibreOffice")

        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--infilter=writer_pdf_import",
                "--convert-to", "docx",
                "--outdir", tmp_dir,
                pdf_path
            ],
            capture_output=True,
            timeout=180  # 3 minute timeout for large documents
        )

        if result.returncode != 0:
            stderr = result.stderr.decode() if result.stderr else "Unknown error"
            logger.error(f"LibreOffice PDF to DOCX failed: {stderr}")
            raise RuntimeError(f"PDF to DOCX conversion failed: {stderr}")

        # Find the output file (LibreOffice names it based on input)
        docx_path = os.path.join(tmp_dir, "input.docx")

        if not os.path.exists(docx_path):
            # Try to find any .docx file in the output directory
            docx_files = glob.glob(os.path.join(tmp_dir, "*.docx"))
            if docx_files:
                docx_path = docx_files[0]
            else:
                raise RuntimeError("Conversion completed but output file not found")

        # Read DOCX bytes
        with open(docx_path, "rb") as f:
            docx_bytes = f.read()
            logger.info(f"LibreOffice conversion complete, DOCX size: {len(docx_bytes)} bytes")

        # Post-process to flatten text boxes and remove duplicates
        try:
            flattened_bytes = flatten_textboxes(docx_bytes)
            return flattened_bytes
        except Exception as e:
            logger.warning(f"Failed to flatten text boxes: {e}, returning original DOCX")
            return docx_bytes


def docx_to_pdf(docx_bytes: bytes) -> bytes:
    """Convert DOCX bytes to PDF bytes using LibreOffice.

    Args:
        docx_bytes: Raw DOCX file bytes

    Returns:
        PDF file bytes
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        docx_path = os.path.join(tmp_dir, "input.docx")

        # Write DOCX to temp file
        with open(docx_path, "wb") as f:
            f.write(docx_bytes)

        # Convert using LibreOffice headless with high-quality PDF export
        logger.info(f"Converting DOCX ({len(docx_bytes)} bytes) to PDF")

        # Use PDF export filter with quality options
        # See: https://wiki.documentfoundation.org/Faq/General/PDF_Export
        pdf_filter = (
            "pdf:writer_pdf_Export:"
            "UseLosslessCompression=true,"
            "Quality=100,"
            "SelectPdfVersion=1,"  # PDF 1.5
            "UseTaggedPDF=true"    # Accessibility tags
        )

        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to", pdf_filter,
                "--outdir", tmp_dir,
                docx_path
            ],
            capture_output=True,
            timeout=180  # 3 minute timeout for large documents
        )

        if result.returncode != 0:
            stderr = result.stderr.decode() if result.stderr else "Unknown error"
            logger.error(f"LibreOffice DOCX to PDF failed: {stderr}")
            raise RuntimeError(f"DOCX to PDF conversion failed: {stderr}")

        # Read and return PDF bytes
        pdf_path = os.path.join(tmp_dir, "input.pdf")

        if not os.path.exists(pdf_path):
            # Try to find any .pdf file in the output directory
            pdf_files = glob.glob(os.path.join(tmp_dir, "*.pdf"))
            if pdf_files:
                pdf_path = pdf_files[0]
            else:
                raise RuntimeError("Conversion completed but output file not found")

        with open(pdf_path, "rb") as f:
            result_bytes = f.read()
            logger.info(f"Conversion complete, PDF size: {len(result_bytes)} bytes")
            return result_bytes


def escape_xml(text: str) -> str:
    """Escape special XML characters."""
    return (text
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&apos;'))


def unescape_xml(text: str) -> str:
    """Unescape XML entities."""
    return (text
        .replace('&apos;', "'")
        .replace('&quot;', '"')
        .replace('&gt;', '>')
        .replace('&lt;', '<')
        .replace('&amp;', '&'))


def replace_text_in_docx(docx_bytes: bytes, replacements: Dict[str, str]) -> bytes:
    """Replace text in a DOCX file using raw XML manipulation.

    This approach:
    1. Opens the DOCX as a ZIP file
    2. Reads document.xml as raw text
    3. Does surgical string replacement on <w:t> elements
    4. Writes back to ZIP without modifying anything else

    This preserves all formatting, layout, and structure because we never
    parse or rebuild the XML - just do targeted string replacements.

    Args:
        docx_bytes: Raw DOCX file bytes
        replacements: Dict mapping source text to target text

    Returns:
        Modified DOCX file bytes
    """
    if not replacements:
        logger.info("No replacements provided, returning original document")
        return docx_bytes

    logger.info(f"Applying {len(replacements)} text replacements to DOCX (raw XML)")

    # Open the DOCX as a ZIP file
    docx_zip = zipfile.ZipFile(io.BytesIO(docx_bytes), 'r')

    # Read document.xml
    try:
        document_xml = docx_zip.read('word/document.xml').decode('utf-8')
    except KeyError:
        logger.warning("No word/document.xml found, returning original")
        docx_zip.close()
        return docx_bytes

    original_xml = document_xml
    total_replacements = 0

    # For each replacement, find and replace in <w:t> elements
    for old_text, new_text in replacements.items():
        if not old_text or old_text == new_text:
            continue

        # Escape for XML
        old_escaped = escape_xml(old_text)
        new_escaped = escape_xml(new_text)

        # Strategy 1: Direct replacement if text is in a single <w:t> element
        # Pattern: <w:t>...old_text...</w:t> or <w:t xml:space="preserve">...old_text...</w:t>
        # We need to be careful to only replace the text content, not the tags

        # Find all <w:t> elements and their contents
        # Pattern matches: <w:t>content</w:t> or <w:t xml:space="preserve">content</w:t>
        pattern = r'(<w:t(?:\s[^>]*)?>)([^<]*(?:' + re.escape(old_escaped) + r')[^<]*)(</w:t>)'

        def replace_in_element(match):
            nonlocal total_replacements
            open_tag = match.group(1)
            content = match.group(2)
            close_tag = match.group(3)

            if old_escaped in content:
                new_content = content.replace(old_escaped, new_escaped, 1)  # Replace first occurrence
                total_replacements += 1
                return open_tag + new_content + close_tag
            return match.group(0)

        # Apply replacement
        new_xml = re.sub(pattern, replace_in_element, document_xml)

        if new_xml != document_xml:
            document_xml = new_xml
            logger.debug(f"Replaced '{old_text}' with '{new_text}'")

    if total_replacements == 0:
        logger.info("No text matches found for replacement")
        docx_zip.close()
        return docx_bytes

    logger.info(f"Made {total_replacements} text replacements")

    # Rebuild the DOCX with modified document.xml
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as out_zip:
        for item in docx_zip.namelist():
            if item == 'word/document.xml':
                # Write modified document.xml
                out_zip.writestr(item, document_xml.encode('utf-8'))
            else:
                # Copy other files unchanged
                out_zip.writestr(item, docx_zip.read(item))

    docx_zip.close()

    result = output.getvalue()
    logger.info(f"Text replacement complete, output size: {len(result)} bytes")

    return result


def map_to_base14_font(font_name: str, flags: int = 0) -> str:
    """Map a PDF font name to a Base-14 font that PyMuPDF can use.

    Base-14 fonts: helv, heit, hebo, hebi, tiro, tiit, tibo, tibi, cour, coit, cobo, cobi, symb, zadb

    Args:
        font_name: Original font name from PDF (e.g., "AAAAAA+TimesNewRoman-Bold")
        flags: Font flags from span (bit 0=superscript, 1=italic, 2=serif, 3=monospace, 4=bold)

    Returns:
        Base-14 font name
    """
    font_lower = font_name.lower()

    # Detect font family
    is_times = any(x in font_lower for x in ['times', 'tiro', 'serif', 'roman', 'georgia', 'palatino', 'cambria'])
    is_courier = any(x in font_lower for x in ['courier', 'cour', 'mono', 'consola', 'menlo', 'fixed'])
    is_symbol = any(x in font_lower for x in ['symbol', 'symb'])
    is_zapf = any(x in font_lower for x in ['zapf', 'dingbat', 'zadb'])

    # Detect style from font name or flags
    is_bold = 'bold' in font_lower or 'black' in font_lower or 'heavy' in font_lower or (flags & 16)
    is_italic = 'italic' in font_lower or 'oblique' in font_lower or (flags & 2)

    # Map to Base-14 font
    if is_symbol:
        return "symb"
    elif is_zapf:
        return "zadb"
    elif is_courier:
        if is_bold and is_italic:
            return "cobi"
        elif is_bold:
            return "cobo"
        elif is_italic:
            return "coit"
        else:
            return "cour"
    elif is_times:
        if is_bold and is_italic:
            return "tibi"
        elif is_bold:
            return "tibo"
        elif is_italic:
            return "tiit"
        else:
            return "tiro"
    else:
        # Default to Helvetica
        if is_bold and is_italic:
            return "hebi"
        elif is_bold:
            return "hebo"
        elif is_italic:
            return "heit"
        else:
            return "helv"


def replace_text_in_pdf(pdf_bytes: bytes, replacements: Dict[str, str]) -> bytes:
    """Replace text in a PDF file using PyMuPDF.

    Strategy:
    1. For each replacement, search for the text in the PDF
    2. Get the exact position, font, size, and color of the original text
    3. Redact (white out) the original text
    4. Insert the new text at the same position with same styling

    This preserves the original PDF layout and formatting.

    Args:
        pdf_bytes: Raw PDF file bytes
        replacements: Dict mapping source text to target text

    Returns:
        Modified PDF file bytes
    """
    if not replacements:
        logger.info("No replacements provided, returning original PDF")
        return pdf_bytes

    logger.info(f"Applying {len(replacements)} text replacements to PDF (PyMuPDF)")

    # Open PDF from bytes
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_replacements = 0

    for old_text, new_text in replacements.items():
        if not old_text or old_text == new_text:
            continue

        # Search for text across all pages
        for page_num in range(len(doc)):
            page = doc[page_num]

            # Find all instances of the text
            text_instances = page.search_for(old_text)

            for inst in text_instances:
                # inst is a Rect (rectangle) where the text was found

                # Get text properties at this location
                blocks = page.get_text("dict", clip=inst)["blocks"]

                # Default styling (fallback)
                base14_font = "helv"  # Helvetica
                font_size = 11
                text_color = (0, 0, 0)  # Black

                # Try to extract original styling from any span in the area
                for block in blocks:
                    if "lines" in block:
                        for line in block["lines"]:
                            for span in line["spans"]:
                                # Get font info from any span in the search area
                                orig_font = span.get("font", "")
                                flags = span.get("flags", 0)
                                base14_font = map_to_base14_font(orig_font, flags)
                                font_size = span.get("size", 11)

                                # Color handling
                                color = span.get("color", 0)
                                if isinstance(color, int):
                                    # Convert int color to RGB tuple (0-1 range)
                                    r = ((color >> 16) & 255) / 255
                                    g = ((color >> 8) & 255) / 255
                                    b = (color & 255) / 255
                                    text_color = (r, g, b)
                                elif isinstance(color, (list, tuple)) and len(color) == 3:
                                    text_color = tuple(color)

                                # Found styling, break out
                                break
                            else:
                                continue
                            break
                    else:
                        continue
                    break

                logger.debug(f"Replacing '{old_text}' with '{new_text}' using font={base14_font}, size={font_size}")

                # Step 1: Add redaction annotation to remove old text
                page.add_redact_annot(inst, fill=(1, 1, 1))  # White fill

                # Apply redactions (actually removes the text)
                page.apply_redactions()

                # Step 2: Insert new text at the same position
                # Use the bottom-left of the rect as baseline reference
                # PyMuPDF insert_text uses bottom-left as the reference point
                insert_point = fitz.Point(inst.x0, inst.y1 - 2)

                page.insert_text(
                    insert_point,
                    new_text,
                    fontname=base14_font,
                    fontsize=font_size,
                    color=text_color,
                )

                total_replacements += 1
                logger.debug(f"Replaced '{old_text}' on page {page_num + 1}")

    if total_replacements == 0:
        logger.info("No text matches found in PDF")
        doc.close()
        return pdf_bytes

    logger.info(f"Made {total_replacements} text replacements in PDF")

    # Save to bytes
    output = doc.tobytes(garbage=4, deflate=True)
    doc.close()

    logger.info(f"PDF text replacement complete, output size: {len(output)} bytes")
    return output
