// The languages a code block in an article can be marked with. `id` is what is stored in the document (it must look like a
// language name: LANGUAGE_PATTERN in limits.js) and what the highlighter and the diagram renderer recognise
// (lib/markdown/highlighter.js, lib/markdown/mermaidRender.js); a test keeps the three in step. "" is plain text.
export const CODE_LANGUAGES = [
  { id: '', label: 'Plain text' },
  { id: 'bash', label: 'Bash / shell' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'sql', label: 'SQL' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'xml', label: 'HTML / XML' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'nginx', label: 'Nginx config' },
  { id: 'http', label: 'HTTP' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'protobuf', label: 'Protocol Buffers' },
  { id: 'ini', label: 'INI / TOML' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'mermaid', label: 'Diagram (Mermaid)' }
];

/** The block that is drawn as a diagram, not as code. */
export const DIAGRAM_LANGUAGE = 'mermaid';
