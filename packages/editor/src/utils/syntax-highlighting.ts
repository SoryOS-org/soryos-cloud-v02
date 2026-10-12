/**
 * @soryos/editor
 * Syntax highlighting utilities for multi-language support.
 */

import type { SyntaxHighlightingOptions } from "../types";

// Language keywords and syntax patterns
export interface LanguageSyntax {
  keywords: string[];
  builtins: string[];
  literals: string[];
  operators: string[];
  punctuation: string[];
  comments: {
    singleLine: string;
    multiLine?: { start: string; end: string };
  };
  stringPatterns: string[];
  numberPatterns: string[];
}

// Syntax definitions for supported languages
export const LANGUAGE_SYNTAX: Record<string, LanguageSyntax> = {
  typescript: {
    keywords: [
      "break", "case", "catch", "class", "const", "continue", "debugger", "default",
      "delete", "do", "else", "enum", "export", "extends", "false", "finally",
      "for", "function", "if", "import", "in", "instanceof", "new", "null",
      "return", "super", "switch", "this", "throw", "true", "try", "typeof",
      "var", "void", "while", "with", "as", "implements", "interface", "let",
      "package", "private", "protected", "public", "static", "yield", "any",
      "boolean", "number", "string", "symbol", "type", "from", "of",
    ],
    builtins: [
      "Array", "Date", "RegExp", "Promise", "String", "Number", "Boolean",
      "Object", "Function", "Symbol", "Math", "JSON", "console", "setTimeout",
      "clearTimeout", "setInterval", "clearInterval", "isNaN", "isFinite",
      "parseInt", "parseFloat", "encodeURI", "decodeURI", "eval",
    ],
    literals: ["true", "false", "null", "undefined"],
    operators: [
      "+", "-", "*", "/", "%", "==", "!=", "===", "!==", ">", "<", ">=", "<=",
      "&&", "||", "!", "&", "|", "^", "~", "<<", ">>", ">>>", "+", "-", "*",
      "/", "%", "**", "??", "?.", "=>", "...", "??=", "&&=", "||", "??",
    ],
    punctuation: ["(", ")", "{", "}", "[", "]", ".", ",", ";", ":", "..."],
    comments: {
      singleLine: "//",
      multiLine: { start: "/*", end: "*/" },
    },
    stringPatterns: ["`", '"', "'"],
    numberPatterns: [
      /\b\d+\b/g,
      /\b0[xX][0-9a-fA-F]+\b/g,
      /\b0[oO][0-7]+\b/g,
      /\b0[bB][01]+\b/g,
      /\b\d+\.\d+\b/g,
      /\b\d+e\d+\b/gi,
    ],
  },
  javascript: {
    keywords: [
      "break", "case", "catch", "class", "const", "continue", "debugger", "default",
      "delete", "do", "else", "enum", "export", "extends", "false", "finally",
      "for", "function", "if", "import", "in", "instanceof", "new", "null",
      "return", "super", "switch", "this", "throw", "true", "try", "typeof",
      "var", "void", "while", "with", "as", "implements", "interface", "let",
      "package", "private", "protected", "public", "static", "yield",
    ],
    builtins: [
      "Array", "Date", "RegExp", "Promise", "String", "Number", "Boolean",
      "Object", "Function", "Symbol", "Math", "JSON", "console",
    ],
    literals: ["true", "false", "null", "undefined"],
    operators: [
      "+", "-", "*", "/", "%", "==", "!=", "===", "!==", ">", "<", ">=", "<=",
      "&&", "||", "!", "&", "|", "^", "~", "<<", ">>", ">>>",
    ],
    punctuation: ["(", ")", "{", "}", "[", "]", ".", ",", ";", ":", "..."],
    comments: {
      singleLine: "//",
      multiLine: { start: "/*", end: "*/" },
    },
    stringPatterns: ["`", '"', "'"],
    numberPatterns: [/\b\d+\b/g, /\b\d+\.\d+\b/g, /\b0[xX][0-9a-fA-F]+\b/g],
  },
  python: {
    keywords: [
      "and", "as", "assert", "async", "await", "break", "class", "continue",
      "def", "del", "elif", "else", "except", "finally", "for", "from",
      "global", "if", "import", "in", "is", "lambda", "nonlocal", "not",
      "or", "pass", "raise", "return", "try", "while", "with", "yield",
      "True", "False", "None",
    ],
    builtins: [
      "abs", "all", "any", "ascii", "bin", "bool", "bytearray", "bytes",
      "callable", "chr", "classmethod", "compile", "complex", "delattr",
      "dict", "dir", "divmod", "enumerate", "eval", "exec", "filter",
      "float", "format", "frozenset", "getattr", "globals", "hasattr",
      "hash", "help", "hex", "id", "input", "int", "isinstance",
      "issubclass", "iter", "len", "list", "locals", "map", "max", "min",
      "memoryview", "next", "object", "oct", "open", "ord", "pow", "print",
      "property", "range", "repr", "reversed", "round", "set", "setattr",
      "slice", "sorted", "staticmethod", "str", "sum", "super", "tuple",
      "type", "vars", "zip", "__import__",
    ],
    literals: ["True", "False", "None"],
    operators: [
      "+", "-", "*", "/", "%", "**", "//", "@", "&", "|", "^", "~", "<<",
      ">>", "==", "!=", ">", "<", ">=", "<=", "and", "or", "not", "is", "in",
    ],
    punctuation: ["(", ")", "{", "}", "[", "]", ".", ",", ":", ";"],
    comments: {
      singleLine: "#",
      multiLine: { start: '"""', end: '"""' },
    },
    stringPatterns: ['"', "'", '"""', "'''"],
    numberPatterns: [/\b\d+\b/g, /\b\d+\.\d+\b/g, /\b0[xX][0-9a-fA-F]+\b/g, /\b0[oO][0-7]+\b/g, /\b0[bB][01]+\b/g],
  },
  java: {
    keywords: [
      "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
      "class", "const", "continue", "default", "do", "double", "else", "enum",
      "extends", "final", "finally", "float", "for", "goto", "if", "implements",
      "import", "instanceof", "int", "interface", "long", "native", "new",
      "package", "private", "protected", "public", "return", "short", "static",
      "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
      "transient", "try", "void", "volatile", "while", "true", "false", "null",
    ],
    builtins: [
      "String", "Integer", "Double", "Boolean", "Long", "Float", "Short",
      "Byte", "Character", "Object", "Class", "System", "Math", "Arrays",
      "Collections", "List", "Map", "Set", "HashMap", "ArrayList",
    ],
    literals: ["true", "false", "null"],
    operators: [
      "+", "-", "*", "/", "%", "==", "!=", ">", "<", ">=", "<=", "&&", "||",
      "!", "&", "|", "^", "~", "<<", ">>", ">>>", "+", "-", "*", "/", "%",
      "instanceof", "new", ".",
    ],
    punctuation: ["(", ")", "{", "}", "[", "]", ".", ",", ";", ":"],
    comments: {
      singleLine: "//",
      multiLine: { start: "/*", end: "*/" },
    },
    stringPatterns: ['"', "'"],
    numberPatterns: [/\b\d+\b/g, /\b\d+\.\d+\b/g, /\b\d+[LlFfDd]\b/g, /\b0[xX][0-9a-fA-F]+\b/g],
  },
  go: {
    keywords: [
      "break", "case", "chan", "const", "continue", "default", "defer", "else",
      "fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
      "map", "package", "range", "return", "select", "struct", "switch", "type", "var",
    ],
    builtins: [
      "append", "cap", "close", "complex", "copy", "delete", "imag", "len",
      "make", "new", "panic", "print", "println", "real", "recover",
      "bool", "byte", "complex64", "complex128", "error", "float32", "float64",
      "int", "int8", "int16", "int32", "int64", "rune", "string", "uint",
      "uint8", "uint16", "uint32", "uint64", "uintptr",
    ],
    literals: ["true", "false", "nil", "iota"],
    operators: [
      "+", "-", "*", "/", "%", "==", "!=", ">", "<", ">=", "<=", "&&", "||",
      "!", "&", "|", "^", "~", "<<", ">>", "+", "-", "*", "/", "%",
      "<-", ":=", "...",
    ],
    punctuation: ["(", ")", "{", "}", "[", "]", ".", ",", ";", ":", "..."],
    comments: {
      singleLine: "//",
      multiLine: { start: "/*", end: "*/" },
    },
    stringPatterns: ['"', "'"],
    numberPatterns: [/\b\d+\b/g, /\b\d+\.\d+\b/g, /\b0[xX][0-9a-fA-F]+\b/g, /\b0[oO][0-7]+\b/g, /\b0[bB][01]+\b/g],
  },
  rust: {
    keywords: [
      "as", "async", "await", "break", "const", "continue", "crate", "dyn",
      "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in",
      "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return",
      "self", "Self", "static", "struct", "super", "trait", "true", "type",
      "unsafe", "use", "where", "while", "yield",
    ],
    builtins: [
      "i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64",
      "u128", "usize", "f32", "f64", "bool", "char", "str", "String", "Vec",
      "Option", "Result", "Box", "Rc", "Arc", "Mutex", "Atomic", "drop",
      "println", "print", "panic", "unreachable", "todo", "unimplemented",
    ],
    literals: ["true", "false"],
    operators: [
      "+", "-", "*", "/", "%", "==", "!=", ">", "<", ">=", "<=", "&&", "||",
      "!", "&", "|", "^", "~", "<<", ">>", "+", "-", "*", "/", "%",
      "..", "..=", "=>", "@", ".", "::", "->", "|",
    ],
    punctuation: ["(", ")", "{", "}", "[", "]", ".", ",", ";", ":", "..."],
    comments: {
      singleLine: "//",
      multiLine: { start: "/*", end: "*/" },
    },
    stringPatterns: ['"', "'"],
    numberPatterns: [
      /\b\d+\b/g,
      /\b\d+\.\d+\b/g,
      /\b0[xX][0-9a-fA-F]+\b/g,
      /\b0[oO][0-7]+\b/g,
      /\b0[bB][01]+\b/g,
      /\b\d+[uif](8|16|32|64|128)?\b/gi,
    ],
  },
  // Add more languages as needed...
};

// Token types for syntax highlighting
export type TokenType = 
  | "keyword"
  | "builtin"
  | "literal"
  | "operator"
  | "punctuation"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "variable"
  | "type"
  | "class"
  | "interface"
  | "decorator"
  | "import"
  | "regex";

// Token with position and type
export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

// Highlight result
export interface HighlightResult {
  tokens: Token[];
  lines: Token[][];
  language: string;
}

// Tokenizer function
export function tokenize(
  code: string,
  language: string = "javascript"
): HighlightResult {
  const syntax = LANGUAGE_SYNTAX[language] || LANGUAGE_SYNTAX.javascript;
  const tokens: Token[] = [];
  const lines: Token[][] = [];
  
  const linesText = code.split("\n");
  let currentLine = 0;
  let currentColumn = 0;
  let currentIndex = 0;
  
  // Process each line
  for (let lineIndex = 0; lineIndex < linesText.length; lineIndex++) {
    const lineText = linesText[lineIndex];
    const lineTokens: Token[] = [];
    currentColumn = 0;
    currentIndex = lineIndex === 0 ? 0 : currentIndex + lineText.length + 1; // +1 for newline
    
    let index = 0;
    while (index < lineText.length) {
      // Check for comments
      if (syntax.comments.singleLine && lineText.slice(index).startsWith(syntax.comments.singleLine)) {
        const commentEnd = lineText.indexOf("\n", index);
        const commentValue = lineText.slice(index, commentEnd === -1 ? lineText.length : commentEnd);
        lineTokens.push({
          type: "comment",
          value: commentValue,
          start: currentIndex + index,
          end: currentIndex + index + commentValue.length,
          line: currentLine,
          column: currentColumn + index,
        });
        index += commentValue.length;
        continue;
      }
      
      // Check for multi-line comments
      if (syntax.comments.multiLine && lineText.slice(index).startsWith(syntax.comments.multiLine.start)) {
        const commentEndIndex = lineText.indexOf(syntax.comments.multiLine.end, index);
        const commentValue = lineText.slice(
          index,
          commentEndIndex === -1 ? lineText.length : commentEndIndex + syntax.comments.multiLine.end.length
        );
        lineTokens.push({
          type: "comment",
          value: commentValue,
          start: currentIndex + index,
          end: currentIndex + index + commentValue.length,
          line: currentLine,
          column: currentColumn + index,
        });
        index += commentValue.length;
        continue;
      }
      
      // Check for strings
      const stringMatch = lineText.slice(index).match(/^["'`](?:\\.|[^\\"'`])*["'`]/);
      if (stringMatch) {
        lineTokens.push({
          type: "string",
          value: stringMatch[0],
          start: currentIndex + index,
          end: currentIndex + index + stringMatch[0].length,
          line: currentLine,
          column: currentColumn + index,
        });
        index += stringMatch[0].length;
        continue;
      }
      
      // Check for numbers
      const numberMatch = lineText.slice(index).match(/^\d+(\.\d+)?([eE][+-]?\d+)?([fFdDlL])?/);
      if (numberMatch) {
        lineTokens.push({
          type: "number",
          value: numberMatch[0],
          start: currentIndex + index,
          end: currentIndex + index + numberMatch[0].length,
          line: currentLine,
          column: currentColumn + index,
        });
        index += numberMatch[0].length;
        continue;
      }
      
      // Check for keywords
      const keywordMatch = lineText.slice(index).match(new RegExp(`^(${syntax.keywords.join("|")})\\b`));
      if (keywordMatch) {
        lineTokens.push({
          type: "keyword",
          value: keywordMatch[0],
          start: currentIndex + index,
          end: currentIndex + index + keywordMatch[0].length,
          line: currentLine,
          column: currentColumn + index,
        });
        index += keywordMatch[0].length;
        continue;
      }
      
      // Check for builtins
      const builtinMatch = lineText.slice(index).match(new RegExp(`^(${syntax.builtins.join("|")})\\b`));
      if (builtinMatch) {
        lineTokens.push({
          type: "builtin",
          value: builtinMatch[0],
          start: currentIndex + index,
          end: currentIndex + index + builtinMatch[0].length,
          line: currentLine,
          column: currentColumn + index,
        });
        index += builtinMatch[0].length;
        continue;
      }
      
      // Check for operators
      const operatorMatch = lineText.slice(index).match(new RegExp(`^(${syntax.operators.map(op => op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|")})`));
      if (operatorMatch) {
        lineTokens.push({
          type: "operator",
          value: operatorMatch[0],
          start: currentIndex + index,
          end: currentIndex + index + operatorMatch[0].length,
          line: currentLine,
          column: currentColumn + index,
        });
        index += operatorMatch[0].length;
        continue;
      }
      
      // Check for punctuation
      const punctuationMatch = lineText.slice(index).match(new RegExp(`^(${syntax.punctuation.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|")})`));
      if (punctuationMatch) {
        lineTokens.push({
          type: "punctuation",
          value: punctuationMatch[0],
          start: currentIndex + index,
          end: currentIndex + index + punctuationMatch[0].length,
          line: currentLine,
          column: currentColumn + index,
        });
        index += punctuationMatch[0].length;
        continue;
      }
      
      // If nothing matched, skip this character
      index++;
    }
    
    lines.push(lineTokens);
    tokens.push(...lineTokens);
    currentLine++;
  }
  
  return {
    tokens,
    lines,
    language,
  };
}

// Get syntax highlighting CSS classes for a token type
export function getTokenClass(tokenType: TokenType): string {
  const tokenClasses: Record<TokenType, string> = {
    keyword: "text-keyword",
    builtin: "text-builtin",
    literal: "text-literal",
    operator: "text-operator",
    punctuation: "text-punctuation",
    string: "text-string",
    number: "text-number",
    comment: "text-comment",
    function: "text-function",
    variable: "text-variable",
    type: "text-type",
    class: "text-class",
    interface: "text-interface",
    decorator: "text-decorator",
    import: "text-import",
    regex: "text-regex",
  };
  
  return tokenClasses[tokenType] || "";
}

// Generate CSS for syntax highlighting
export function generateSyntaxHighlightingCSS(theme: "light" | "dark" = "dark"): string {
  const isDark = theme === "dark";
  
  const colors = {
    keyword: isDark ? "#c586c0" : "#d73a49",
    builtin: isDark ? "#88c0d0" : "#005cc5",
    literal: isDark ? "#ce9178" : "#001080",
    operator: isDark ? "#dcdcaa" : "#d73a49",
    punctuation: isDark ? "#d4d4d4" : "#3e3e42",
    string: isDark ? "#ce9178" : "#032f62",
    number: isDark ? "#b5cea8" : "#098658",
    comment: isDark ? "#6a9955" : "#6a9955",
    function: isDark ? "#dcdcaa" : "#795548",
    variable: isDark ? "#9cdcfe" : "#001080",
    type: isDark ? "#4ec9b0" : "#2b91af",
    class: isDark ? "#4ec9b0" : "#569cd6",
    interface: isDark ? "#88c0d0" : "#4ec9b0",
    decorator: isDark ? "#ce9178" : "#795548",
    import: isDark ? "#c586c0" : "#569cd6",
    regex: isDark ? "#ce9178" : "#032f62",
  };
  
  return Object.entries(colors)
    .map(([tokenType, color]) => `.text-${tokenType} { color: ${color}; }`)
    .join("\n");
}
