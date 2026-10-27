"""Parse source text only. Never import or execute the submitted program."""
import ast
import json
import sys

source = sys.stdin.read(100001)
def column(line, offset):
    lines = source.splitlines()
    text = lines[line - 1] if 0 < line <= len(lines) else ""
    return len(text[:max(0, (offset or 1) - 1)].encode("utf-16-le")) // 2 + 1
try:
    ast.parse(source, filename="submission.py")
    print(json.dumps({"diagnostics": []}))
except SyntaxError as error:
    print(json.dumps({"diagnostics": [{"line": error.lineno or 1, "column": column(error.lineno or 1, error.offset),
        "endLine": error.end_lineno or error.lineno or 1, "endColumn": column(error.end_lineno or error.lineno or 1, error.end_offset or error.offset),
        "severity": "error", "message": error.msg, "code": type(error).__name__, "source": "Python AST"}]}))
except (ValueError, RecursionError) as error:
    print(json.dumps({"diagnostics": [{"line": 1, "column": 1, "severity": "error", "message": str(error), "source": "Python AST"}]}))
