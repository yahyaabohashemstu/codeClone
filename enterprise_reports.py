from __future__ import annotations

from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from pygments import lex
from pygments.lexers import (
    CppLexer,
    CSharpLexer,
    GoLexer,
    JavascriptLexer,
    JavaLexer,
    KotlinLexer,
    PhpLexer,
    PythonLexer,
    RubyLexer,
    RustLexer,
    SqlLexer,
    SwiftLexer,
    TextLexer,
    TypeScriptLexer,
)
from pygments.token import Comment, Keyword, Literal, Name, Number, Operator, Punctuation, String, Text, Token
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, StyleSheet1, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    KeepTogether,
    PageBreak,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    XPreformatted,
)


LANGUAGE_TO_LEXER = {
    "python": PythonLexer,
    "javascript": JavascriptLexer,
    "typescript": TypeScriptLexer,
    "java": JavaLexer,
    "csharp": CSharpLexer,
    "go": GoLexer,
    "php": PhpLexer,
    "ruby": RubyLexer,
    "rust": RustLexer,
    "kotlin": KotlinLexer,
    "swift": SwiftLexer,
    "cpp": CppLexer,
    "c": CppLexer,
    "sql": SqlLexer,
}

TOKEN_COLOR_MAP = {
    Keyword: "#6d5efc",
    Keyword.Namespace: "#3b82f6",
    Name.Function: "#0f766e",
    Name.Class: "#7c3aed",
    Name.Namespace: "#1d4ed8",
    Name.Builtin: "#0f766e",
    Name.Decorator: "#ea580c",
    String: "#0f9d58",
    Number: "#c2410c",
    Literal: "#b45309",
    Comment: "#6b7280",
    Operator: "#1f2937",
    Punctuation: "#374151",
    Text: "#111827",
}

PAGE_BACKGROUND = colors.HexColor("#f6f8fc")
CARD_BACKGROUND = colors.HexColor("#ffffff")
CARD_BORDER = colors.HexColor("#dbe2f1")
ACCENT = colors.HexColor("#4f46e5")
ACCENT_DARK = colors.HexColor("#312e81")
SUCCESS = colors.HexColor("#0f9d58")
WARNING = colors.HexColor("#f59e0b")
DANGER = colors.HexColor("#dc2626")
TEXT_PRIMARY = colors.HexColor("#0f172a")
TEXT_SECONDARY = colors.HexColor("#475569")
MUTED = colors.HexColor("#64748b")
CODE_BG = colors.HexColor("#f8fafc")
CODE_BORDER = colors.HexColor("#d4def1")


def _hex(color_value) -> str:
    return "#{:02x}{:02x}{:02x}".format(
        int(round(float(color_value.red) * 255)),
        int(round(float(color_value.green) * 255)),
        int(round(float(color_value.blue) * 255)),
    )


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _truncate(value: str, limit: int) -> str:
    text = _safe_text(value)
    return text if len(text) <= limit else f"{text[: limit - 1]}..."


def _score_badge_color(score: float) -> colors.Color:
    if score >= 85:
        return SUCCESS
    if score >= 70:
        return colors.HexColor("#0f766e")
    if score >= 50:
        return WARNING
    return DANGER


def _build_styles() -> StyleSheet1:
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="EnterpriseTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            textColor=TEXT_PRIMARY,
            alignment=TA_LEFT,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="EnterpriseSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=TEXT_SECONDARY,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=ACCENT_DARK,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9.3,
            leading=14,
            textColor=TEXT_PRIMARY,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Muted",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=MUTED,
        )
    )
    styles.add(
        ParagraphStyle(
            name="MetricValue",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=20,
            textColor=TEXT_PRIMARY,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="MetricLabel",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=MUTED,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableHeader",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.3,
            leading=11,
            textColor=TEXT_PRIMARY,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TableCell",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=11,
            textColor=TEXT_PRIMARY,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CenteredSmall",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.8,
            leading=10,
            textColor=MUTED,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeBlock",
            parent=styles["Code"],
            fontName="Courier",
            fontSize=7.0,
            leading=8.7,
            textColor=TEXT_PRIMARY,
            backColor=CODE_BG,
            borderColor=CODE_BORDER,
            borderWidth=0.6,
            borderPadding=8,
            borderRadius=5,
            leftIndent=0,
            rightIndent=0,
        )
    )
    return styles


def _lexer_for_language(language: str):
    lexer_type = LANGUAGE_TO_LEXER.get((language or "").strip().lower(), TextLexer)
    return lexer_type()


def _token_color(token_type) -> str:
    for parent, color_value in TOKEN_COLOR_MAP.items():
        if token_type in parent:
            return color_value
    return "#111827"


def _normalize_whitespace(fragment: str) -> str:
    return escape(fragment).replace(" ", "&#160;").replace("\t", "&#160;" * 4)


def _highlight_markup_lines(source_text: str, language: str, start_line: int = 1) -> list[str]:
    lexer = _lexer_for_language(language)
    lines: list[list[str]] = [[]]
    for token_type, token_value in lex(source_text, lexer):
        parts = token_value.split("\n")
        for index, part in enumerate(parts):
            if part:
                rendered = _normalize_whitespace(part)
                color_value = _token_color(token_type)
                lines[-1].append(f'<font color="{color_value}">{rendered}</font>')
            if index < len(parts) - 1:
                lines.append([])
    result: list[str] = []
    width = max(3, len(str(start_line + len(lines))))
    for offset, fragments in enumerate(lines):
        line_number = str(start_line + offset).rjust(width, " ")
        line_prefix = f'<font color="#94a3b8">{_normalize_whitespace(line_number)}</font><font color="#cbd5e1">&#160;|&#160;</font>'
        body = "".join(fragments) if fragments else '<font color="#94a3b8">&#160;</font>'
        result.append(f"{line_prefix}{body}")
    return result


def _code_chunks(source_text: str, language: str, start_line: int, lines_per_chunk: int = 28) -> list[XPreformatted]:
    source_lines = source_text.splitlines()
    if not source_lines:
        source_lines = [""]
    styles = _build_styles()
    blocks: list[XPreformatted] = []
    for index in range(0, len(source_lines), lines_per_chunk):
        chunk_lines = source_lines[index : index + lines_per_chunk]
        chunk_text = "\n".join(chunk_lines)
        markup_lines = _highlight_markup_lines(chunk_text, language, start_line + index)
        blocks.append(XPreformatted("\n".join(markup_lines), styles["CodeBlock"]))
    return blocks


def _severity_chip(text: str) -> tuple[str, colors.Color]:
    normalized = (text or "").strip().lower()
    if normalized in {"critical", "high"}:
        return normalized.upper(), DANGER if normalized == "critical" else colors.HexColor("#ef4444")
    if normalized in {"medium", "review"}:
        return normalized.upper(), WARNING
    if normalized in {"low", "benign"}:
        return normalized.upper(), SUCCESS
    return (normalized or "OPEN").upper(), ACCENT


def _case_status_narrative(case_payload: dict[str, Any]) -> str:
    match_payload = case_payload["match"]
    evidence = match_payload.get("evidence", {})
    summary = evidence.get("summary", {})
    clone_type = _safe_text(match_payload.get("cloneType")).replace("_", " ")
    cross_language = "This appears to be a cross-language semantic match." if match_payload.get("isCrossLanguage") else "Both samples operate within the same language family."
    score = float(match_payload.get("similarityScore") or 0.0)
    semantic = float(match_payload.get("semanticScore") or 0.0)
    token_score = float(match_payload.get("tokenScore") or 0.0)
    structural = float(match_payload.get("structuralScore") or 0.0)
    strongest_signal = max(
        [
            ("semantic alignment", semantic),
            ("token overlap", token_score),
            ("structural alignment", structural),
        ],
        key=lambda item: item[1],
    )
    confidence_band = "high-confidence" if score >= 85 else "moderate-confidence" if score >= 70 else "preliminary"
    shared_tokens = evidence.get("sharedTokens", [])
    shared_text = ", ".join(shared_tokens[:8]) if shared_tokens else "no shared tokens were preserved after normalization"
    return (
        f"This review case is a {confidence_band} {clone_type} finding with an aggregate similarity score of {score:.2f}%. "
        f"The strongest contributor is {strongest_signal[0]} at {strongest_signal[1]:.2f}%. {cross_language} "
        f"Normalized evidence indicates {shared_text}. The review workflow currently marks the case as "
        f"{_safe_text(case_payload.get('status') or 'open').replace('_', ' ')}."
    )


def _metric_card(value: str, label: str, accent_color: colors.Color, styles: StyleSheet1) -> Table:
    card = Table(
        [[Paragraph(value, styles["MetricValue"])], [Paragraph(label, styles["MetricLabel"])]],
        colWidths=[42 * mm],
    )
    card.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CARD_BACKGROUND),
                ("BOX", (0, 0), (-1, -1), 0.8, accent_color),
                ("LINEBEFORE", (0, 0), (0, -1), 4, accent_color),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return card


def _metadata_table(rows: list[tuple[str, str]], styles: StyleSheet1) -> Table:
    data = [[Paragraph(f"<b>{escape(label)}</b>", styles["TableHeader"]), Paragraph(escape(value or "—"), styles["TableCell"])] for label, value in rows]
    table = Table(data, colWidths=[48 * mm, 120 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CARD_BACKGROUND),
                ("BOX", (0, 0), (-1, -1), 0.7, CARD_BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, CARD_BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def _evidence_table(evidence_rows: list[dict[str, Any]], styles: StyleSheet1) -> Table:
    data = [[Paragraph("Evidence Type", styles["TableHeader"]), Paragraph("Title", styles["TableHeader"]), Paragraph("Detail", styles["TableHeader"])]]
    for row in evidence_rows:
        payload = row.get("payload") or {}
        if isinstance(payload, dict):
            detail = _truncate(", ".join(f"{key}: {_safe_text(value)}" for key, value in payload.items() if value not in (None, "", [], {})), 200)
        else:
            detail = _truncate(_safe_text(payload), 200)
        data.append(
            [
                Paragraph(escape(_safe_text(row.get("evidenceType") or "evidence").replace("_", " ").title()), styles["TableCell"]),
                Paragraph(escape(_safe_text(row.get("title") or "")), styles["TableCell"]),
                Paragraph(escape(detail or "—"), styles["TableCell"]),
            ]
        )
    table = Table(data, colWidths=[34 * mm, 46 * mm, 100 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
                ("TEXTCOLOR", (0, 0), (-1, 0), ACCENT_DARK),
                ("BACKGROUND", (0, 1), (-1, -1), CARD_BACKGROUND),
                ("BOX", (0, 0), (-1, -1), 0.7, CARD_BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, CARD_BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _audit_table(audit_rows: list[dict[str, Any]], styles: StyleSheet1) -> Table:
    rows = [[Paragraph("Timestamp", styles["TableHeader"]), Paragraph("Actor", styles["TableHeader"]), Paragraph("Action", styles["TableHeader"]), Paragraph("Entity", styles["TableHeader"]), Paragraph("Request ID", styles["TableHeader"])]]
    for row in audit_rows[:20]:
        rows.append(
            [
                Paragraph(escape(_safe_text(row.get("createdAt") or "—")), styles["TableCell"]),
                Paragraph(escape(_safe_text(row.get("actorLegacyUserId") or row.get("actorType") or "system")), styles["TableCell"]),
                Paragraph(escape(_safe_text(row.get("action") or "—")), styles["TableCell"]),
                Paragraph(escape(f"{_safe_text(row.get('entityType') or 'entity')}#{_safe_text(row.get('entityId') or '')}".strip("#")), styles["TableCell"]),
                Paragraph(escape(_safe_text(row.get("requestId") or "—")), styles["TableCell"]),
            ]
        )
    table = Table(rows, colWidths=[40 * mm, 22 * mm, 50 * mm, 38 * mm, 36 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eff6ff")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
                ("BACKGROUND", (0, 1), (-1, -1), CARD_BACKGROUND),
                ("BOX", (0, 0), (-1, -1), 0.7, CARD_BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, CARD_BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def _comparison_chunk_table(left_block: XPreformatted, right_block: XPreformatted, left_title: str, right_title: str, styles: StyleSheet1) -> Table:
    header_left = Paragraph(escape(left_title), styles["TableHeader"])
    header_right = Paragraph(escape(right_title), styles["TableHeader"])
    table = Table([[header_left, header_right], [left_block, right_block]], colWidths=[86 * mm, 86 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
                ("TEXTCOLOR", (0, 0), (-1, 0), ACCENT_DARK),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#fbfdff")),
                ("BOX", (0, 0), (-1, -1), 0.7, CODE_BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, CODE_BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _document_header(canvas, document) -> None:
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(PAGE_BACKGROUND)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(15 * mm, height - 18 * mm, width - (30 * mm), 5, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColor(TEXT_PRIMARY)
    canvas.drawString(15 * mm, height - 11 * mm, "Code Similarity Enterprise Platform")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 15 * mm, 10 * mm, f"Page {document.page}")
    canvas.restoreState()


def _case_cover(case_payload: dict[str, Any], styles: StyleSheet1) -> list[Any]:
    severity_text, severity_color = _severity_chip(case_payload.get("severity") or "open")
    match_payload = case_payload["match"]
    score = float(match_payload.get("similarityScore") or 0.0)
    cards = Table(
        [
            [
                _metric_card(f"{score:.1f}%", "Similarity", _score_badge_color(score), styles),
                _metric_card(f"{float(match_payload.get('semanticScore') or 0.0):.1f}%", "Semantic", colors.HexColor("#2563eb"), styles),
                _metric_card(f"{float(match_payload.get('tokenScore') or 0.0):.1f}%", "Token", colors.HexColor("#ea580c"), styles),
                _metric_card(f"{float(match_payload.get('structuralScore') or 0.0):.1f}%", "Structural", colors.HexColor("#0f766e"), styles),
            ]
        ],
        colWidths=[46 * mm, 46 * mm, 46 * mm, 46 * mm],
    )
    cards.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return [
        Paragraph("Enterprise Review Case Report", styles["EnterpriseTitle"]),
        Paragraph(
            f"Case #{escape(_safe_text(case_payload.get('id')))} · "
            f"<font color='{_hex(severity_color)}'><b>{severity_text}</b></font> · "
            f"{escape(_safe_text(case_payload.get('status') or 'open').replace('_', ' ').title())}",
            styles["EnterpriseSubtitle"],
        ),
        cards,
        Spacer(1, 8),
    ]


def generate_review_case_pdf(report_payload: dict[str, Any]) -> bytes:
    styles = _build_styles()
    buffer = BytesIO()
    document = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=24 * mm,
        bottomMargin=14 * mm,
        title=f"Review Case {report_payload['case']['id']}",
        author="Code Similarity Enterprise Platform",
    )
    from reportlab.platypus import Frame, PageTemplate

    frame = Frame(document.leftMargin, document.bottomMargin, document.width, document.height, id="normal")
    document.addPageTemplates([PageTemplate(id="enterprise", frames=[frame], onPage=_document_header)])

    case_payload = report_payload["case"]
    match_payload = case_payload["match"]
    artifact_a = match_payload["artifactA"]
    artifact_b = match_payload["artifactB"]
    repository = report_payload.get("repository") or {}
    workspace = report_payload.get("workspace") or {}
    snapshot = report_payload.get("snapshot") or {}
    policy_rule = report_payload.get("policyRule") or {}
    evidence_rows = case_payload.get("evidence") or []
    audit_rows = report_payload.get("auditTrail") or []

    story: list[Any] = []
    story.extend(_case_cover(case_payload, styles))
    story.append(Paragraph("Executive Summary", styles["SectionHeading"]))
    story.append(Paragraph(_case_status_narrative(case_payload), styles["Body"]))

    story.append(Spacer(1, 4))
    story.append(Paragraph("Case Metadata", styles["SectionHeading"]))
    story.append(
        _metadata_table(
            [
                ("Workspace", _safe_text(workspace.get("name") or "—")),
                ("Repository", _safe_text(repository.get("name") or "—")),
                ("Snapshot", _safe_text(snapshot.get("commitSha") or snapshot.get("id") or "—")),
                ("Clone Type", _safe_text(match_payload.get("cloneType") or "—").replace("_", " ")),
                ("Policy Rule", _safe_text(policy_rule.get("name") or "No policy rule recorded")),
                ("Generated At", _safe_text(report_payload.get("generatedAt") or "—")),
            ],
            styles,
        )
    )

    story.append(Spacer(1, 10))
    story.append(Paragraph("AI Evidence Narrative", styles["SectionHeading"]))
    story.append(
        Paragraph(
            "The narrative below is generated from the platform's semantic, structural, and normalized-token evidence to support reviewer judgment.",
            styles["Muted"],
        )
    )
    story.append(Paragraph(_case_status_narrative(case_payload), styles["Body"]))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Evidence Register", styles["SectionHeading"]))
    story.append(_evidence_table(evidence_rows, styles))

    story.append(PageBreak())
    story.append(Paragraph("Side-by-Side Code Comparison", styles["SectionHeading"]))
    story.append(
        Paragraph(
            f"Source A: {_safe_text(artifact_a.get('logicalPath'))} ({_safe_text(artifact_a.get('language'))}) · "
            f"Source B: {_safe_text(artifact_b.get('logicalPath'))} ({_safe_text(artifact_b.get('language'))})",
            styles["Muted"],
        )
    )
    story.append(Spacer(1, 6))

    chunks_a = _code_chunks(_safe_text(artifact_a.get("rawSource") or ""), _safe_text(artifact_a.get("language") or "text"), int(artifact_a.get("startLine") or 1))
    chunks_b = _code_chunks(_safe_text(artifact_b.get("rawSource") or ""), _safe_text(artifact_b.get("language") or "text"), int(artifact_b.get("startLine") or 1))
    max_chunks = max(len(chunks_a), len(chunks_b))
    if not chunks_a:
        chunks_a = _code_chunks("", "text", 1)
    if not chunks_b:
        chunks_b = _code_chunks("", "text", 1)

    for chunk_index in range(max_chunks):
        left_block = chunks_a[chunk_index] if chunk_index < len(chunks_a) else _code_chunks("", "text", 1)[0]
        right_block = chunks_b[chunk_index] if chunk_index < len(chunks_b) else _code_chunks("", "text", 1)[0]
        story.append(
            KeepTogether(
                [
                    Paragraph(f"Comparison Slice {chunk_index + 1}", styles["TableHeader"]),
                    Spacer(1, 4),
                    _comparison_chunk_table(
                        left_block,
                        right_block,
                        _truncate(_safe_text(artifact_a.get("symbolQualifiedName") or artifact_a.get("logicalPath") or "Source A"), 70),
                        _truncate(_safe_text(artifact_b.get("symbolQualifiedName") or artifact_b.get("logicalPath") or "Source B"), 70),
                        styles,
                    ),
                    Spacer(1, 8),
                ]
            )
        )
        if chunk_index < max_chunks - 1:
            story.append(Spacer(1, 4))

    story.append(PageBreak())
    story.append(Paragraph("Audit Trail", styles["SectionHeading"]))
    story.append(
        Paragraph(
            "This section captures recent enterprise audit events associated with the workspace and review workflow for traceability and compliance.",
            styles["Muted"],
        )
    )
    story.append(Spacer(1, 4))
    story.append(_audit_table(audit_rows, styles))
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            f"Report integrity marker: case-{escape(_safe_text(case_payload.get('id')))} / "
            f"match-{escape(_safe_text(match_payload.get('id')))} / snapshot-{escape(_safe_text(snapshot.get('id') or 'n/a'))}",
            styles["CenteredSmall"],
        )
    )

    document.build(story)
    return buffer.getvalue()
