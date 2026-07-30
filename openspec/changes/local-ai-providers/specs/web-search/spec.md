## ADDED Requirements

### Requirement: Explicit web-search boundary
Raven SHALL keep Ollama web access disabled by default and support `off`, `explicit`, and `automatic` permission modes. Search SHALL execute in Electron main through a configured backend and SHALL send only a bounded search query, never the complete meeting transcript, audio, screenshot, prompt, or AI conversation history.

#### Scenario: Explicit search request
- **WHEN** permission is `explicit` and the user asks to search, browse, look up, or retrieve current web information
- **THEN** Raven permits a bounded web-search tool call and returns grounded results to the local model

#### Scenario: No search request
- **WHEN** permission is `explicit` and the conversation contains no explicit web-search intent
- **THEN** Raven makes no request to a web-search backend

#### Scenario: Search disabled
- **WHEN** permission is `off`
- **THEN** Raven exposes no web-search tool to Ollama and creates no search network request

### Requirement: Safe search backends
Raven SHALL support Brave Search over its fixed HTTPS endpoint and SearXNG only through an HTTP loopback URL. Raven SHALL store the Brave API key using protected key storage, reject redirects, bound time and response size, sanitize returned text and URLs, and never log queries, keys, snippets, or result content.

#### Scenario: Unsafe SearXNG URL
- **WHEN** SearXNG is configured with credentials, HTTPS, or a non-loopback host
- **THEN** Raven rejects the URL before sending a request

### Requirement: Grounded local answers
Raven SHALL pass sanitized search titles, snippets, and URLs to Ollama as untrusted evidence and instruct the model to cite the sources as Markdown links.

#### Scenario: Tool-assisted answer
- **WHEN** Ollama requests web search and results are returned
- **THEN** Raven completes the response locally using the evidence and displays source links in the answer
