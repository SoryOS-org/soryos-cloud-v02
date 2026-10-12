/**
 * @soryos/editor
 * Language support utilities including auto-completion and linting.
 */

import type { Token } from "./syntax-highlighting";
import { LANGUAGE_SYNTAX, getLanguageFromPath } from "./syntax-highlighting";

export interface CompletionItem {
  label: string;
  kind: "keyword" | "builtin" | "variable" | "function" | "class" | "interface" | "property" | "method";
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

export interface CompletionList {
  items: CompletionItem[];
  isIncomplete: boolean;
}

export interface Diagnostic {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  source?: string;
  code?: string;
}

export interface LintResult {
  diagnostics: Diagnostic[];
  version: string;
}

// Language-specific completions
export const LANGUAGE_COMPLETIONS: Record<string, CompletionItem[]> = {
  typescript: [
    { label: "console.log", kind: "method", detail: "console.log(message: any): void", insertText: "console.log(${1:message})" },
    { label: "console.error", kind: "method", detail: "console.error(message: any): void" },
    { label: "console.warn", kind: "method", detail: "console.warn(message: any): void" },
    { label: "setTimeout", kind: "function", detail: "setTimeout(callback: () => void, delay: number): NodeJS.Timeout" },
    { label: "clearTimeout", kind: "function", detail: "clearTimeout(timeoutId: NodeJS.Timeout): void" },
    { label: "setInterval", kind: "function", detail: "setInterval(callback: () => void, delay: number): NodeJS.Timeout" },
    { label: "clearInterval", kind: "function", detail: "clearInterval(intervalId: NodeJS.Timeout): void" },
    { label: "Promise", kind: "class", detail: "Promise<T>" },
    { label: "Array", kind: "class", detail: "Array<T>" },
    { label: "Object", kind: "class", detail: "Object" },
    { label: "String", kind: "class", detail: "String" },
    { label: "Number", kind: "class", detail: "Number" },
    { label: "Boolean", kind: "class", detail: "Boolean" },
    { label: "Symbol", kind: "class", detail: "Symbol" },
    { label: "RegExp", kind: "class", detail: "RegExp" },
    { label: "Date", kind: "class", detail: "Date" },
    { label: "JSON", kind: "class", detail: "JSON" },
    { label: "Math", kind: "class", detail: "Math" },
  ],
  javascript: [
    { label: "console.log", kind: "method", detail: "console.log(message: any): void" },
    { label: "console.error", kind: "method", detail: "console.error(message: any): void" },
    { label: "setTimeout", kind: "function", detail: "setTimeout(callback: () => void, delay: number): number" },
    { label: "clearTimeout", kind: "function", detail: "clearTimeout(timeoutId: number): void" },
    { label: "Array", kind: "class", detail: "Array" },
    { label: "Object", kind: "class", detail: "Object" },
    { label: "String", kind: "class", detail: "String" },
    { label: "Number", kind: "class", detail: "Number" },
    { label: "Boolean", kind: "class", detail: "Boolean" },
    { label: "RegExp", kind: "class", detail: "RegExp" },
    { label: "Date", kind: "class", detail: "Date" },
    { label: "JSON", kind: "class", detail: "JSON" },
    { label: "Math", kind: "class", detail: "Math" },
  ],
  python: [
    { label: "print", kind: "function", detail: "print(*args, sep=' ', end='\\n', file=sys.stdout, flush=False)" },
    { label: "len", kind: "function", detail: "len(obj: Any) -> int" },
    { label: "range", kind: "function", detail: "range(stop: int) -> range | range(start: int, stop: int) -> range | range(start: int, stop: int, step: int) -> range" },
    { label: "open", kind: "function", detail: "open(file: str, mode='r', ...) -> file object" },
    { label: "def", kind: "keyword", detail: "Define a function" },
    { label: "class", kind: "keyword", detail: "Define a class" },
    { label: "import", kind: "keyword", detail: "Import a module" },
    { label: "from", kind: "keyword", detail: "Import from a module" },
    { label: "as", kind: "keyword", detail: "Alias import" },
    { label: "list", kind: "class", detail: "list() -> list" },
    { label: "dict", kind: "class", detail: "dict() -> dict" },
    { label: "set", kind: "class", detail: "set() -> set" },
    { label: "tuple", kind: "class", detail: "tuple() -> tuple" },
    { label: "str", kind: "class", detail: "str() -> str" },
    { label: "int", kind: "class", detail: "int() -> int" },
    { label: "float", kind: "class", detail: "float() -> float" },
    { label: "bool", kind: "class", detail: "bool() -> bool" },
  ],
  java: [
    { label: "System.out.println", kind: "method", detail: "System.out.println(message: String): void" },
    { label: "System.out.print", kind: "method", detail: "System.out.print(message: String): void" },
    { label: "new", kind: "keyword", detail: "Create new instance" },
    { label: "public", kind: "keyword", detail: "Public access modifier" },
    { label: "private", kind: "keyword", detail: "Private access modifier" },
    { label: "protected", kind: "keyword", detail: "Protected access modifier" },
    { label: "static", kind: "keyword", detail: "Static modifier" },
    { label: "final", kind: "keyword", detail: "Final modifier" },
    { label: "String", kind: "class", detail: "String class" },
    { label: "Integer", kind: "class", detail: "Integer class" },
    { label: "ArrayList", kind: "class", detail: "ArrayList<E>" },
    { label: "HashMap", kind: "class", detail: "HashMap<K,V>" },
  ],
  go: [
    { label: "fmt.Println", kind: "function", detail: "fmt.Println(a ...interface{}) (n int, err error)" },
    { label: "fmt.Printf", kind: "function", detail: "fmt.Printf(format string, a ...interface{}) (n int, err error)" },
    { label: "fmt.Sprintf", kind: "function", detail: "fmt.Sprintf(format string, a ...interface{}) string" },
    { label: "func", kind: "keyword", detail: "Define a function" },
    { label: "var", kind: "keyword", detail: "Variable declaration" },
    { label: "const", kind: "keyword", detail: "Constant declaration" },
    { label: "type", kind: "keyword", detail: "Type declaration" },
    { label: "struct", kind: "keyword", detail: "Struct declaration" },
    { label: "interface", kind: "keyword", detail: "Interface declaration" },
    { label: "package", kind: "keyword", detail: "Package declaration" },
    { label: "import", kind: "keyword", detail: "Import declaration" },
    { label: "make", kind: "function", detail: "make(T Type, args ...interface{}) T" },
    { label: "new", kind: "function", detail: "new(T Type) *T" },
    { label: "len", kind: "function", detail: "len(v Type) int" },
    { label: "cap", kind: "function", detail: "cap(v Type) int" },
    { label: "append", kind: "function", detail: "append(slice []T, elems ...T) []T" },
  ],
  rust: [
    { label: "println!", kind: "macro", detail: "println!(format: &str, args: ...)" },
    { label: "print!", kind: "macro", detail: "print!(format: &str, args: ...)" },
    { label: "vec!", kind: "macro", detail: "vec![elements...]" },
    { label: "fn", kind: "keyword", detail: "Define a function" },
    { label: "let", kind: "keyword", detail: "Variable declaration" },
    { label: "const", kind: "keyword", detail: "Constant declaration" },
    { label: "mut", kind: "keyword", detail: "Mutable modifier" },
    { label: "struct", kind: "keyword", detail: "Struct declaration" },
    { label: "enum", kind: "keyword", detail: "Enum declaration" },
    { label: "impl", kind: "keyword", detail: "Implementation" },
    { label: "trait", kind: "keyword", detail: "Trait declaration" },
    { label: "pub", kind: "keyword", detail: "Public modifier" },
    { label: "use", kind: "keyword", detail: "Use declaration" },
    { label: "mod", kind: "keyword", detail: "Module declaration" },
    { label: "Option", kind: "enum", detail: "Option<T>" },
    { label: "Result", kind: "enum", detail: "Result<T, E>" },
    { label: "Vec", kind: "struct", detail: "Vec<T>" },
    { label: "String", kind: "struct", detail: "String" },
    { label: "HashMap", kind: "struct", detail: "HashMap<K, V>" },
  ],
};

// Get completions for a language
export function getCompletions(
  language: string,
  text: string,
  position: { line: number; column: number }
): CompletionList {
  const syntax = LANGUAGE_SYNTAX[language] || LANGUAGE_SYNTAX.javascript;
  const completions = LANGUAGE_COMPLETIONS[language] || [];
  
  // Get keywords from syntax
  const keywordCompletions = syntax.keywords.map((keyword) => ({
    label: keyword,
    kind: "keyword" as const,
    sortText: `0_${keyword}`,
  }));
  
  // Get builtins from syntax
  const builtinCompletions = syntax.builtins.map((builtin) => ({
    label: builtin,
    kind: "builtin" as const,
    sortText: `1_${builtin}`,
  }));
  
  // Combine all completions
  const allCompletions = [
    ...keywordCompletions,
    ...builtinCompletions,
    ...completions,
  ];
  
  // Filter based on current text (simple prefix matching)
  const lines = text.split("\n");
  const currentLine = lines[position.line] || "";
  const textBeforeCursor = currentLine.slice(0, position.column);
  
  // Extract the current word
  const wordMatch = textBeforeCursor.match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/);
  const currentWord = wordMatch ? wordMatch[0] : "";
  
  const filteredCompletions = allCompletions.filter((completion) =>
    completion.label.startsWith(currentWord)
  );
  
  return {
    items: filteredCompletions,
    isIncomplete: true, // Always incomplete for now
  };
}

// Simple linting based on syntax
export function lintCode(
  code: string,
  language: string = "javascript"
): LintResult {
  const diagnostics: Diagnostic[] = [];
  const lines = code.split("\n");
  const syntax = LANGUAGE_SYNTAX[language] || LANGUAGE_SYNTAX.javascript;
  
  // Check for unmatched brackets
  const bracketPairs = [
    { open: "(", close: ")", name: "parenthesis" },
    { open: "{", close: "}", name: "brace" },
    { open: "[", close: "]", name: "bracket" },
  ];
  
  for (const pair of bracketPairs) {
    const openCount = (code.match(new RegExp(`\\${pair.open}`, "g")) || []).length;
    const closeCount = (code.match(new RegExp(`\\${pair.close}`, "g")) || []).length;
    
    if (openCount !== closeCount) {
      diagnostics.push({
        severity: "error",
        message: `Unmatched ${pair.name}: ${openCount} open, ${closeCount} close`,
        range: {
          start: { line: 0, column: 0 },
          end: { line: lines.length - 1, column: lines[lines.length - 1].length },
        },
        source: "syntax",
        code: `UNMATCHED_${pair.name.toUpperCase()}`,
      });
    }
  }
  
  // Check for unmatched string literals
  const stringPatterns = syntax.stringPatterns || ['"', "'"];
  for (const pattern of stringPatterns) {
    const openCount = (code.match(new RegExp(`\\${pattern}`, "g")) || []).length;
    if (openCount % 2 !== 0) {
      diagnostics.push({
        severity: "error",
        message: `Unterminated string literal: ${pattern}`,
        range: {
          start: { line: 0, column: 0 },
          end: { line: lines.length - 1, column: lines[lines.length - 1].length },
        },
        source: "syntax",
        code: "UNTERMINATED_STRING",
      });
    }
  }
  
  // Check for multi-line comments
  if (syntax.comments.multiLine) {
    const openCount = (code.match(new RegExp(`\\${syntax.comments.multiLine.start}`, "g")) || []).length;
    const closeCount = (code.match(new RegExp(`\\${syntax.comments.multiLine.end}`, "g")) || []).length;
    
    if (openCount !== closeCount) {
      diagnostics.push({
        severity: "error",
        message: `Unterminated multi-line comment`,
        range: {
          start: { line: 0, column: 0 },
          end: { line: lines.length - 1, column: lines[lines.length - 1].length },
        },
        source: "syntax",
        code: "UNTERMINATED_COMMENT",
      });
    }
  }
  
  return {
    diagnostics,
    version: "1.0.0",
  };
}

// Auto-indentation based on language
export function getAutoIndentation(
  language: string,
  line: string,
  previousLine: string = ""
): string {
  const syntax = LANGUAGE_SYNTAX[language] || LANGUAGE_SYNTAX.javascript;
  const tabSize = 2; // Default tab size
  
  // Count leading whitespace in previous line
  const leadingWhitespace = previousLine.match(/^[ \t]*/)?.[0] || "";
  const indentSize = leadingWhitespace.length;
  
  // Check if previous line ends with a bracket that requires indentation
  const trimmedPrevious = previousLine.trim();
  
  if (trimmedPrevious.endsWith("{") || trimmedPrevious.endsWith("(") || trimmedPrevious.endsWith("[")) {
    return leadingWhitespace + " ".repeat(tabSize);
  }
  
  // Check if current line starts with a closing bracket
  const trimmedLine = line.trim();
  if (trimmedLine.startsWith("}") || trimmedLine.startsWith(")") || trimmedLine.startsWith("]")) {
    return leadingWhitespace.slice(0, Math.max(0, indentSize - tabSize));
  }
  
  // Check for language-specific patterns
  if (language === "python") {
    if (trimmedPrevious.endsWith(":")) {
      return leadingWhitespace + " ".repeat(tabSize);
    }
  }
  
  if (language === "javascript" || language === "typescript") {
    if (trimmedPrevious.endsWith("{") || trimmedPrevious.endsWith("(") || trimmedPrevious.endsWith("[")) {
      return leadingWhitespace + " ".repeat(tabSize);
    }
  }
  
  // Default: keep same indentation
  return leadingWhitespace;
}

// Get language-specific snippets
export const LANGUAGE_SNIPPETS: Record<string, Record<string, string>> = {
  typescript: {
    "class": "class ${1:ClassName} {\n  constructor(${2:params}) {\n    $3\n  }\n\n  ${4:method}() {\n    $5\n  }\n}",
    "function": "function ${1:name}(${2:params}) {\n  $3\n}",
    "arrow": "const ${1:name} = (${2:params}) => {\n  $3\n};",
    "interface": "interface ${1:InterfaceName} {\n  ${2:property}: ${3:type};\n}",
    "for": "for (let ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n  $3\n}",
    "foreach": "${1:array}.forEach((${2:item}) => {\n  $3\n});",
    "try": "try {\n  $1\n} catch (${2:error}) {\n  $3\n}",
  },
  javascript: {
    "function": "function ${1:name}(${2:params}) {\n  $3\n}",
    "for": "for (var ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++) {\n  $3\n}",
    "foreach": "${1:array}.forEach(function(${2:item}) {\n  $3\n});",
  },
  python: {
    "class": "class ${1:ClassName}:\n    def __init__(self, ${2:params}):\n        $3",
    "function": "def ${1:name}(${2:params}):\n    $3",
    "for": "for ${1:i} in ${2:iterable}:\n    $3",
    "while": "while ${1:condition}:\n    $2",
    "if": "if ${1:condition}:\n    $2",
    "try": "try:\n    $1\nexcept ${2:Exception} as ${3:e}:\n    $4",
  },
  // Add more languages as needed...
};

// Get snippet for a language and trigger
export function getSnippet(
  language: string,
  trigger: string
): string | undefined {
  const snippets = LANGUAGE_SNIPPETS[language] || {};
  return snippets[trigger];
}
