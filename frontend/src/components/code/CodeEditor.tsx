import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { cpp } from "@codemirror/lang-cpp";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

type CodeEditorProps = {
  value: string;
  language?: string | null;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  minHeight?: number;
  ariaLabel?: string;
  darkMode?: boolean;
};

const normalizeLanguage = (language: string | null | undefined) =>
  (language ?? "").trim().toLowerCase().replace(/\s+/g, "");

const getLanguageExtension = (language: string | null | undefined) => {
  switch (normalizeLanguage(language)) {
    case "javascript":
    case "js":
      return javascript({ jsx: true });
    case "typescript":
    case "ts":
      return javascript({ typescript: true, jsx: true });
    case "python":
    case "py":
      return python();
    case "java":
      return java();
    case "c":
    case "c++":
    case "cpp":
    case "c#":
    case "csharp":
    case "dart":
      return cpp();
    case "html":
      return html();
    case "css":
      return css();
    case "php":
      return php();
    case "sql":
      return sql();
    default:
      return [];
  }
};

const darkEditorHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c084fc" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#38bdf8" },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: "#4ade80" },
  { tag: [tags.variableName, tags.propertyName], color: "#93c5fd" },
  { tag: [tags.string, tags.special(tags.string)], color: "#fbbf24" },
  { tag: [tags.number, tags.bool, tags.null], color: "#fb7185" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "#2dd4bf" },
  { tag: [tags.comment, tags.docComment], color: "#94a3b8", fontStyle: "italic" },
  { tag: [tags.operator, tags.punctuation], color: "#cbd5e1" },
  { tag: [tags.tagName, tags.attributeName], color: "#f472b6" },
]);

const lightEditorHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#7c3aed", fontWeight: "600" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#0369a1" },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: "#15803d" },
  { tag: [tags.variableName, tags.propertyName], color: "#1d4ed8" },
  { tag: [tags.string, tags.special(tags.string)], color: "#a16207" },
  { tag: [tags.number, tags.bool, tags.null], color: "#be123c" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "#0f766e" },
  { tag: [tags.comment, tags.docComment], color: "#64748b", fontStyle: "italic" },
  { tag: [tags.operator, tags.punctuation], color: "#334155" },
  { tag: [tags.tagName, tags.attributeName], color: "#be185d" },
]);

export function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
  minHeight = 420,
  ariaLabel = "Code editor",
  darkMode = false,
}: CodeEditorProps) {
  const editorHighlightStyle = darkMode
    ? darkEditorHighlightStyle
    : lightEditorHighlightStyle;
  const extensions = useMemo(
    () => [
      getLanguageExtension(language),
      syntaxHighlighting(editorHighlightStyle),
      EditorView.theme(
        {
          "&": {
            minHeight: `${minHeight}px`,
            backgroundColor: "var(--app-surface)",
            color: "var(--app-text)",
            fontSize: "14px",
          },
          ".cm-scroller": {
            minHeight: `${minHeight}px`,
            backgroundColor: "var(--app-surface)",
            color: "var(--app-text)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineHeight: "1.6",
          },
          ".cm-content": {
            padding: "14px 0",
            caretColor: "var(--app-accent)",
          },
          ".cm-line": { padding: "0 16px" },
          ".cm-gutters": {
            backgroundColor: "var(--app-surface-strong)",
            color: "var(--app-muted)",
            borderRight: "1px solid var(--app-border)",
          },
          ".cm-activeLine, .cm-activeLineGutter": {
            backgroundColor: "color-mix(in srgb, var(--app-accent) 12%, transparent)",
          },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--app-accent)",
          },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
            backgroundColor: "color-mix(in srgb, var(--app-accent) 30%, transparent) !important",
          },
          "&.cm-focused": { outline: "none" },
          ".cm-tooltip": {
            backgroundColor: "var(--app-surface-strong)",
            color: "var(--app-text)",
            border: "1px solid var(--app-border)",
          },
          ".cm-tooltip-autocomplete > ul > li": {
            color: "var(--app-text)",
          },
          ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
            backgroundColor: "color-mix(in srgb, var(--app-accent) 22%, var(--app-surface-strong))",
            color: "var(--app-text)",
          },
        },
        { dark: darkMode },
      ),
    ],
    [darkMode, editorHighlightStyle, language, minHeight],
  );

  return (
    <div className="overflow-hidden rounded-lg border theme-border" aria-label={ariaLabel}>
      <CodeMirror
        value={value}
        onChange={onChange}
      readOnly={readOnly}
      editable={!readOnly}
      theme={darkMode ? "dark" : "light"}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          indentOnInput: true,
          syntaxHighlighting: true,
        }}
      />
    </div>
  );
}
