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
Raven SHALL pass sanitized search titles, snippets, and URLs to Ollama as untrusted evidence and instruct the model to answer concisely, reconcile meeting constraints, prefer primary or official evidence, omit unsupported implementation details, and cite only supporting sources as Markdown links.

Raven SHALL reserve enough local generation budget for a concise grounded answer so tool-assisted responses are not clipped at the ordinary live-reply limit.

#### Scenario: Tool-assisted answer
- **WHEN** Ollama requests web search and results are returned
- **THEN** Raven completes the response locally using the evidence and displays source links in the answer

### Requirement: Selective automatic search
Raven SHALL limit automatic mode to one concise search query and instruct Ollama not to search for timeless concepts, ordinary coding/debugging questions, math, or facts it can answer confidently from supplied context.

#### Scenario: Timeless coding question
- **WHEN** automatic mode is enabled and the user asks an ordinary coding question that does not require current information
- **THEN** Ollama is instructed to answer locally without invoking web search

#### Scenario: Responsive search selection
- **WHEN** Raven asks Ollama whether a live request needs web search
- **THEN** the tool-selection pass disables model thinking so hidden reasoning cannot delay the visible answer

#### Scenario: Explicit mode direct answer
- **WHEN** explicit mode is enabled without an explicit search request and Ollama thinking is disabled
- **THEN** Raven begins the direct answer without running a web-search tool-selection pass

#### Scenario: Current technical question
- **WHEN** automatic mode is enabled and a technical answer depends on information that may have changed
- **THEN** Ollama may issue one concise query that prefers the relevant primary or official source

#### Scenario: Verification or citation request
- **WHEN** the user asks Raven to verify a claim against current documentation or provide official web citations
- **THEN** Raven permits one search even when the underlying technical concept is otherwise timeless and, if the tool-selection pass omits a query, locally compresses the request into a short search query before contacting the backend

#### Scenario: Verification search has no results
- **WHEN** an explicit verification query returns no evidence
- **THEN** Raven may retry once without a restrictive site filter and, if evidence is still empty, instructs the model to disclose that verification failed instead of inventing sources or verified facts
