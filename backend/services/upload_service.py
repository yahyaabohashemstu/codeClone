"""
File upload handling service.

Provides safe utilities for reading uploaded files, spreadsheets, and ZIP
archives with size-limit enforcement, Zip Slip prevention, and zip-bomb
protection.

All functions are Flask-independent (they operate on file-like stream
objects) except where noted.
"""

from __future__ import annotations

import logging
import os
import tempfile
import zipfile

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Size limits
# ---------------------------------------------------------------------------

MAX_SOURCE_UPLOAD_BYTES: int = 2 * 1024 * 1024        # 2 MB
MAX_SPREADSHEET_UPLOAD_BYTES: int = 5 * 1024 * 1024   # 5 MB
MAX_SPREADSHEET_ARCHIVE_BYTES: int = 25 * 1024 * 1024 # 25 MB

_MAX_SINGLE_FILE_BYTES: int = 5 * 1024 * 1024         # 5 MB
_MAX_PASTE_BYTES: int = 1 * 1024 * 1024               # 1 MB

_ZIP_MAX_UNCOMPRESSED_BYTES: int = 25 * 1024 * 1024   # 25 MB per member
_ZIP_MAX_TOTAL_BYTES: int = 50 * 1024 * 1024          # 50 MB total
_ZIP_MAX_FILE_COUNT: int = 200


# ---------------------------------------------------------------------------
# Stream helpers
# ---------------------------------------------------------------------------


def get_uploaded_stream(uploaded_file):
    """Return the underlying byte stream of an uploaded file object.

    Works with both Werkzeug ``FileStorage`` objects (which expose a
    ``.stream`` attribute) and plain file-like objects.
    """
    return getattr(uploaded_file, "stream", uploaded_file)


def rewind_uploaded_stream(uploaded_file):
    """Seek the uploaded file's stream back to the beginning.

    Silently ignores streams that do not support seeking (e.g. stdin
    wrappers).  Returns the stream for chaining convenience.
    """
    stream = get_uploaded_stream(uploaded_file)
    try:
        stream.seek(0)
    except (AttributeError, OSError, ValueError):
        pass
    return stream


def uploaded_file_size(uploaded_file) -> int:
    """Determine the byte-size of *uploaded_file* without consuming it.

    The stream position is restored after measurement.  Falls back to the
    ``content_length`` attribute when seeking is not supported.
    """
    stream = get_uploaded_stream(uploaded_file)
    fallback_size = getattr(uploaded_file, "content_length", None)

    try:
        current_position = stream.tell()
    except (AttributeError, OSError, ValueError):
        current_position = None

    try:
        stream.seek(0, os.SEEK_END)
        size = stream.tell()
    except (AttributeError, OSError, ValueError):
        size = fallback_size
    finally:
        try:
            if current_position is not None:
                stream.seek(current_position)
            else:
                stream.seek(0)
        except (AttributeError, OSError, ValueError):
            pass

    return int(size or 0)


# ---------------------------------------------------------------------------
# Limit enforcement
# ---------------------------------------------------------------------------


def ensure_uploaded_file_within_limit(uploaded_file, max_bytes: int, label: str) -> None:
    """Raise :class:`ValueError` if *uploaded_file* exceeds *max_bytes*.

    Parameters
    ----------
    uploaded_file:
        A Werkzeug ``FileStorage`` or file-like object.
    max_bytes:
        Maximum allowed size in bytes.
    label:
        Human-readable label used in the error message (e.g.
        ``"Source upload"``).
    """
    size_bytes = uploaded_file_size(uploaded_file)
    if size_bytes and size_bytes > max_bytes:
        max_mb = max_bytes / (1024 * 1024)
        raise ValueError(f"{label} exceeds the {max_mb:.0f} MB upload limit.")


def ensure_zip_like_upload_within_limit(
    uploaded_file,
    max_total_bytes: int,
    label: str,
) -> None:
    """If *uploaded_file* is a ZIP archive, validate total decompressed size.

    Non-ZIP files are silently allowed through (they are not zip-like).
    """
    stream = rewind_uploaded_stream(uploaded_file)
    if not zipfile.is_zipfile(stream):
        rewind_uploaded_stream(uploaded_file)
        return
    rewind_uploaded_stream(uploaded_file)

    total_bytes = 0
    with zipfile.ZipFile(stream, "r") as zip_ref:
        for member in zip_ref.infolist():
            total_bytes += member.file_size
            if total_bytes > max_total_bytes:
                max_mb = max_total_bytes / (1024 * 1024)
                raise ValueError(
                    f"{label} expands beyond the {max_mb:.0f} MB processing limit."
                )
    rewind_uploaded_stream(uploaded_file)


# ---------------------------------------------------------------------------
# ZIP extraction
# ---------------------------------------------------------------------------


def extract_zip(zip_file, extract_dir: str | None = None) -> list[str]:
    """Extract files from a ZIP archive and return their text contents.

    Guarded against Zip Slip and zip bombs.  All files are extracted into a
    per-request temporary directory, read into memory, and then removed
    automatically before returning.

    Parameters
    ----------
    zip_file:
        A Werkzeug ``FileStorage`` or file-like object containing the ZIP.
    extract_dir:
        Base directory for temporary extraction.  Defaults to the system
        temp directory.  In production this should be set to the application
        ``UPLOAD_FOLDER``.

    Returns
    -------
    list[str]
        The text contents of every file in the archive, concatenated into a
        flat list.
    """
    extracted_files: list[str] = []
    zip_stream = rewind_uploaded_stream(zip_file)

    with tempfile.TemporaryDirectory(prefix="zip_extract_", dir=extract_dir) as extract_to:
        real_extract_to = os.path.realpath(extract_to)
        with zipfile.ZipFile(zip_stream, "r") as zip_ref:
            members = zip_ref.infolist()
            if len(members) > _ZIP_MAX_FILE_COUNT:
                raise ValueError(
                    f"ZIP archive contains too many files "
                    f"({len(members)} > {_ZIP_MAX_FILE_COUNT})."
                )

            total_bytes = 0
            for member in members:
                if member.file_size > _ZIP_MAX_UNCOMPRESSED_BYTES:
                    raise ValueError(
                        f"ZIP member {member.filename!r} exceeds the per-file size limit."
                    )
                total_bytes += member.file_size
                if total_bytes > _ZIP_MAX_TOTAL_BYTES:
                    raise ValueError(
                        "ZIP archive total uncompressed size exceeds the allowed limit."
                    )

                member_path = os.path.realpath(
                    os.path.join(extract_to, member.filename)
                )
                try:
                    is_within_extract_dir = (
                        os.path.commonpath([real_extract_to, member_path])
                        == real_extract_to
                    )
                except ValueError:
                    is_within_extract_dir = False

                if not is_within_extract_dir:
                    raise ValueError(f"Zip Slip detected: {member.filename}")

                zip_ref.extract(member, extract_to)

            for file_name in zip_ref.namelist():
                full_path = os.path.join(extract_to, file_name)
                if not os.path.isfile(full_path):
                    continue
                with open(full_path, "r", encoding="utf-8", errors="replace") as fh:
                    extracted_files.append(fh.read())

    return extracted_files


# ---------------------------------------------------------------------------
# Spreadsheet reading
# ---------------------------------------------------------------------------


def read_spreadsheet_code(
    excel_file,
    excel_row: int | str | None = None,
) -> str:
    """Read a code snippet from the first column of a spreadsheet row.

    Parameters
    ----------
    excel_file:
        A Werkzeug ``FileStorage`` or file-like object (CSV or Excel).
    excel_row:
        1-based row number.  Defaults to 1.

    Returns
    -------
    str
        The cell value as a string.

    Raises
    ------
    ValueError
        On invalid row number, empty spreadsheet, or processing errors.
    """
    ensure_uploaded_file_within_limit(
        excel_file, MAX_SPREADSHEET_UPLOAD_BYTES, "Spreadsheet upload"
    )
    ensure_zip_like_upload_within_limit(
        excel_file, MAX_SPREADSHEET_ARCHIVE_BYTES, "Spreadsheet upload"
    )

    row_number = 1
    if excel_row not in (None, ""):
        try:
            row_number = int(excel_row)
        except (TypeError, ValueError) as exc:
            raise ValueError("Spreadsheet row must be a whole number.") from exc

    if row_number < 1:
        raise ValueError("Spreadsheet row numbers start at 1.")

    spreadsheet_stream = rewind_uploaded_stream(excel_file)
    filename = (getattr(excel_file, "filename", "") or "").lower()
    extension = os.path.splitext(filename)[1]

    try:
        if extension == ".csv":
            dataframe = pd.read_csv(spreadsheet_stream, dtype=str)
        else:
            dataframe = pd.read_excel(spreadsheet_stream, dtype=str)
    except Exception as exc:
        raise ValueError(
            "Error processing spreadsheet file. "
            "Ensure the file is a valid CSV or Excel document."
        ) from exc

    if dataframe.empty or dataframe.shape[1] == 0:
        raise ValueError(
            "Spreadsheet file does not contain any readable rows or columns."
        )

    if row_number > len(dataframe.index):
        raise ValueError(
            f"Spreadsheet row {row_number} is out of range. "
            f"The file contains {len(dataframe.index)} data rows."
        )

    value = dataframe.iloc[row_number - 1, 0]
    if pd.isna(value):
        raise ValueError(
            f"Spreadsheet row {row_number} does not contain code in the first column."
        )

    return str(value)


# ---------------------------------------------------------------------------
# Unified code reader
# ---------------------------------------------------------------------------


def read_uploaded_code(
    existing_code: str | None,
    uploaded_file=None,
    uploaded_zip=None,
    excel_file=None,
    excel_row: int | str | None = None,
    extract_dir: str | None = None,
) -> str:
    """Resolve code input from multiple possible sources.

    Priority order:

    1. ``uploaded_zip`` -- ZIP archive (all files concatenated).
    2. ``uploaded_file`` -- single source file.
    3. ``excel_file`` -- spreadsheet (first column of *excel_row*).
    4. ``existing_code`` -- raw pasted code text.

    Parameters
    ----------
    existing_code:
        Pasted code text (may be empty).
    uploaded_file:
        A Werkzeug ``FileStorage`` for a single source file.
    uploaded_zip:
        A Werkzeug ``FileStorage`` for a ZIP archive.
    excel_file:
        A Werkzeug ``FileStorage`` for a CSV/Excel file.
    excel_row:
        1-based row number for spreadsheet input.
    extract_dir:
        Base directory for temporary ZIP extraction.

    Returns
    -------
    str
        The resolved source code string.

    Raises
    ------
    ValueError
        When any input violates size limits or format requirements.
    """
    code = existing_code or ""
    if code and len(code.encode("utf-8", errors="ignore")) > _MAX_PASTE_BYTES:
        max_mb = _MAX_PASTE_BYTES / (1024 * 1024)
        raise ValueError(f"Pasted source code exceeds the {max_mb:.0f} MB input limit.")

    if uploaded_zip and getattr(uploaded_zip, "filename", ""):
        zip_stream = rewind_uploaded_stream(uploaded_zip)
        if not zipfile.is_zipfile(zip_stream):
            raise ValueError("Uploaded archive must be a valid ZIP file.")
        rewind_uploaded_stream(uploaded_zip)
        code = "\n".join(extract_zip(uploaded_zip, extract_dir=extract_dir))
    elif uploaded_file and getattr(uploaded_file, "filename", None):
        ensure_uploaded_file_within_limit(
            uploaded_file, MAX_SOURCE_UPLOAD_BYTES, "Source upload"
        )
        file_stream = rewind_uploaded_stream(uploaded_file)
        raw = file_stream.read(_MAX_SINGLE_FILE_BYTES + 1)
        if len(raw) > _MAX_SINGLE_FILE_BYTES:
            max_mb = _MAX_SINGLE_FILE_BYTES / (1024 * 1024)
            raise ValueError(f"Uploaded file exceeds the {max_mb:.0f} MB limit.")
        code = raw.decode("utf-8", errors="replace")
    elif excel_file and getattr(excel_file, "filename", ""):
        code = read_spreadsheet_code(excel_file, excel_row)

    return code
