"""
Flask-independent code-smell analysis via pylint.

Runs pylint as a subprocess on temporary files and parses the structured JSON
and plain-text output into human-readable result strings.
"""

import json
import logging
import os
import subprocess
from tempfile import NamedTemporaryFile

logger = logging.getLogger(__name__)


class CodeSmellAnalyzer:
    """Static-method container for pylint-based code quality analysis."""

    @staticmethod
    def python_code_smell_analysis(code1, file1_name, code2, file2_name):
        """Run pylint on two Python code inputs and return structured results.

        Each code/file pair is analyzed independently.  For each pair at least
        one of *code* (a ``str``) or *file_name* (a ``str`` file path or
        file-like object with a ``.read()`` method) should be provided.

        Parameters
        ----------
        code1 : str or None
            Raw source text for the first snippet.
        file1_name : str, file-like, or None
            Uploaded file / path for the first snippet (used when *code1* is
            falsy).
        code2 : str or None
            Raw source text for the second snippet.
        file2_name : str, file-like, or None
            Uploaded file / path for the second snippet (used when *code2* is
            falsy).

        Returns
        -------
        dict
            ``{"code1_analysis": str, "code2_analysis": str}`` where each
            value is a multi-line human-readable pylint report.
        """

        def _analyze_code(code, file_input):
            """Analyze a single code/file pair via pylint."""
            if not code and not file_input:
                return "Please provide code or upload a file."

            temp_file_path = None
            try:
                if code:
                    code = code.replace("\r\n", "\n").replace("\r", "\n")
                    with NamedTemporaryFile(
                        delete=False, suffix=".py", mode="w", encoding="utf-8"
                    ) as temp_file:
                        temp_file.write(code)
                        temp_file_path = temp_file.name
                elif file_input:
                    if hasattr(file_input, "read"):
                        file_content = (
                            file_input.read()
                            .decode("utf-8")
                            .replace("\r\n", "\n")
                            .replace("\r", "\n")
                        )
                    else:
                        file_content = str(file_input)
                    with NamedTemporaryFile(
                        delete=False, suffix=".py", mode="w", encoding="utf-8"
                    ) as tmp:
                        tmp.write(file_content)
                        temp_file_path = tmp.name

                try:
                    pylint_json_command = [
                        "pylint",
                        temp_file_path,
                        "--output-format=json",
                    ]
                    pylint_text_command = [
                        "pylint",
                        temp_file_path,
                        "--output-format=text",
                    ]

                    try:
                        process_json = subprocess.run(
                            pylint_json_command,
                            shell=False,
                            capture_output=True,
                            text=True,
                            encoding="utf-8",
                            timeout=30,
                        )
                        process_text = subprocess.run(
                            pylint_text_command,
                            shell=False,
                            capture_output=True,
                            text=True,
                            encoding="utf-8",
                            timeout=30,
                        )
                    except FileNotFoundError:
                        return (
                            "Unable to generate quality report because pylint "
                            "is not installed on the server."
                        )
                    except subprocess.TimeoutExpired:
                        return "Quality analysis timed out while running pylint."

                    result_lines = []
                    json_stdout = (process_json.stdout or "").strip()
                    if json_stdout:
                        try:
                            parsed_messages = json.loads(json_stdout)
                        except json.JSONDecodeError:
                            parsed_messages = None

                        if isinstance(parsed_messages, list):
                            for message in parsed_messages:
                                if not isinstance(message, dict):
                                    continue
                                message_type = str(
                                    message.get("type") or "info"
                                ).capitalize()
                                symbol = str(message.get("symbol") or "unknown")
                                text = str(
                                    message.get("message") or "No message provided"
                                )
                                line = message.get("line")
                                column = message.get("column")
                                location = []
                                if line is not None:
                                    location.append(f"Line {line}")
                                if column is not None:
                                    location.append(f"Column {column}")
                                location_suffix = (
                                    f" ({', '.join(location)})" if location else ""
                                )
                                result_lines.append(
                                    f"{message_type} [{symbol}]: {text}{location_suffix}"
                                )

                    rating_line = ""
                    for line in reversed(
                        (process_text.stdout or "").splitlines()
                    ):
                        if "Your code has been rated at" in line:
                            rating_line = line.strip()
                            break

                    stderr_output = "\n".join(
                        part.strip()
                        for part in [
                            process_json.stderr or "",
                            process_text.stderr or "",
                        ]
                        if part and part.strip()
                    )

                    if not result_lines:
                        if stderr_output:
                            result_lines.append(
                                f"Pylint did not return structured issue data. "
                                f"Details: {stderr_output}"
                            )
                        elif process_json.returncode == 0:
                            result_lines.append("No pylint issues were reported.")
                        else:
                            result_lines.append(
                                "Pylint completed without structured issue output."
                            )

                    if rating_line:
                        result_lines.extend(["", rating_line])

                    return "\n".join(result_lines).strip()
                finally:
                    if temp_file_path and os.path.exists(temp_file_path):
                        os.remove(temp_file_path)

            except Exception as exc:
                logger.error(
                    "Unable to generate quality report: %s", exc, exc_info=True
                )
                return "Unable to generate quality report."

        result_code1 = _analyze_code(code1, file1_name)
        result_code2 = _analyze_code(code2, file2_name)

        return {
            "code1_analysis": result_code1,
            "code2_analysis": result_code2,
        }
