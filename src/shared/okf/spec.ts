// A concise, authoritative OKF v0.1 reference. Pure string (no deps) so it can be
// served to agents via MCP (get_okf_spec) and shown in the app's About screen.
// Distilled from okf/SPEC.md in GoogleCloudPlatform/knowledge-catalog (Apache-2.0).

export const OKF_SPEC_VERSION = '0.1'
export const OKF_SPEC_URL =
  'https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md'

export const OKF_SPEC_SUMMARY = `# Open Knowledge Format (OKF) v0.1 — reference

A bundle is **a directory of UTF-8 Markdown files**, each with **YAML frontmatter**.
No manifest, no schema registry, no required tooling. The graph is built from
ordinary Markdown links between files.

## Concept documents
- One Markdown file = one **concept**. Its **id** is the file path minus \`.md\`
  (e.g. \`tables/users.md\` → \`tables/users\`).
- Frontmatter is a YAML block delimited by \`---\` at the very top of the file.

### Frontmatter fields
- \`type\` — **REQUIRED**. A short free-form string (e.g. \`BigQuery Table\`, \`Metric\`,
  \`Playbook\`). Not centrally registered; consumers tolerate unknown types.
- \`title\` — recommended. Human display name.
- \`description\` — recommended. One-sentence summary.
- \`resource\` — recommended. A URI for the underlying asset (omit for abstract concepts).
- \`tags\` — recommended. YAML list of short strings.
- \`timestamp\` — recommended. ISO 8601 datetime of last meaningful change.
- Producers MAY add any additional keys; consumers MUST preserve them.

### Body
Standard Markdown. Conventional (optional) section headings:
- \`# Schema\` — columns/fields of an asset.
- \`# Examples\` — usage examples.
- \`# Citations\` — external sources, numbered.

## Links (the knowledge graph)
Concepts link with normal Markdown links. Two forms:
- **Absolute (bundle-relative)**: \`/tables/customers.md\` (recommended — stable).
- **Relative**: \`./other.md\`, \`../x/y.md\`.
Links are untyped; meaning comes from surrounding prose. Broken links are allowed
(they may be not-yet-written knowledge) and MUST NOT be rejected.

## Reserved filenames
- \`index.md\` — a directory's table of contents (progressive disclosure). Contains
  **no frontmatter**, EXCEPT the bundle-root \`index.md\`, which may carry exactly
  \`okf_version: "0.1"\`.
- \`log.md\` — change history: \`## YYYY-MM-DD\` headings (newest first), bulleted prose
  entries with a leading bold verb (\`**Update**\`, \`**Creation**\`, \`**Deprecation**\`).
All other \`.md\` files are concept documents.

## Conformance (§9)
A bundle is conformant iff:
1. Every non-reserved \`.md\` file has a parseable YAML frontmatter block.
2. Every such block has a non-empty \`type\`.
3. Reserved files follow their structure when present.
Consumers MUST NOT reject a bundle for: missing optional fields, unknown \`type\`
values, unknown extra keys, broken cross-links, or missing \`index.md\` files.

## Distribution
Just files — a git repo (recommended), a tarball/zip, or a subdirectory of a repo.
`
