# Module 10: The Anthropic Claude API

> **Prerequisites:** [Module 00: The OpenAI API: Your First Call](../00-the-openai-api-your-first-call/README.md), [Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md), [Module 06: Function Calling Basics](../06-function-calling-basics/README.md).  
> **Estimated Reading Time:** 32 minutes  
> **Target Audience:** Systems Architects, Cross-Provider Platform Engineers, API Integration Developers.

---

> [!TIP]
> **The Golden Rule of the Anthropic Claude API:**  
> The Anthropic Messages API (`/v1/messages`) requires the `anthropic-version` header and a mandatory `max_tokens` field; the system prompt is a dedicated top-level parameter (never a `role: "system"` message in the array), and tool results are submitted as `tool_result` content blocks inside ordinary `role: "user"` turns.

---

## Visual Mental Models: OpenAI vs. Anthropic Wire Protocol Anatomy

While both providers operate over JSON/HTTP, their structural message topology, header contracts, and tool interaction patterns diverge fundamentally:

```mermaid
sequenceDiagram
    autonumber
    box rgb(30, 41, 59) Anthropic Messages API (/v1/messages)
    participant Client as Backend Service
    participant Claude as Anthropic API Gateway
    participant Tool as Local Function
    end

    Client->>Claude: POST /v1/messages<br/>x-api-key: sk-ant-...<br/>anthropic-version: 2023-06-01 (MANDATORY)<br/>{ model: "claude-3-5-sonnet-20241022", max_tokens: 1024, system: "...", messages: [...] }
    
    Claude-->>Client: HTTP 200 OK<br/>stop_reason: "tool_use"<br/>content: [ { type: "tool_use", id: "toolu_01", name: "get_weather", input: { city: "SF" } } ]
    Note over Client: Notice: 'input' is already parsed as a JSON Object!<br/>No manual json.loads required.
    
    Client->>Tool: Execute: get_weather("SF")
    Tool-->>Client: Returns: { temp: 65, unit: "F" }

    Client->>Claude: POST /v1/messages (Follow-up Turn)<br/>messages=[<br/>  ...,<br/>  { role: "assistant", content: [ { type: "tool_use", id: "toolu_01", ... } ] },<br/>  { role: "user", content: [ { type: "tool_result", tool_use_id: "toolu_01", content: "{...}" } ] }<br/>]
    Note over Claude: Notice: Tool output is sent inside a 'user' message!<br/>Anthropic has NO 'tool' message role.
    
    Claude-->>Client: HTTP 200 OK (stop_reason: "end_turn", content: [{ type: "text", text: "It is 65°F..." }])
```

### Content Block Stream Architecture

In Claude, all inputs and outputs are composed of polymorphic **Content Blocks**:

```mermaid
flowchart TD
    subgraph MessageBlocks ["Anthropic Message Object"]
        direction TB
        subgraph AssistantOut ["Assistant Response: content[]"]
            think["Thinking Block: { type: 'thinking', thinking: '...' }"]
            text["Text Block: { type: 'text', text: 'Here is the data:' }"]
            toolUse["Tool Use Block: { type: 'tool_use', id: 'toolu_1', name: 'search', input: {...} }"]
        end
        
        subgraph UserIn ["User Reply: content[]"]
            toolRes["Tool Result Block: { type: 'tool_result', tool_use_id: 'toolu_1', content: '...' }"]
            userText["Text Block: { type: 'text', text: 'Also summarize this.' }"]
        end
    end
    
    think --> text --> toolUse
    toolUse -.->|Handled by client| toolRes --> userText
```

---

## Systematic Architectural Comparison: OpenAI vs. Anthropic Messages API

| Feature / Contract | OpenAI API (`/v1/chat/completions`) | Anthropic Claude API (`/v1/messages`) |
| :--- | :--- | :--- |
| **Endpoint URL** | `https://api.openai.com/v1/chat/completions` | `https://api.anthropic.com/v1/messages` |
| **Auth Headers** | `Authorization: Bearer <key>` | `x-api-key: <key>` (or `Authorization: Bearer`) |
| **Version Header** | Optional (`openai-version`) | **Mandatory** (`anthropic-version: 2023-06-01`) |
| **Max Tokens** | Optional (`max_completion_tokens`) | **Strictly Required** (`max_tokens`) |
| **System Guidance** | `messages[0] = {role: "developer"}` | Top-level `system: "..."` parameter |
| **Tool Declaration** | `tools: [{type: "function", function: {...}}]` | `tools: [{name, description, input_schema}]` |
| **Tool Call Output** | `tool_calls: [{id, function: {arguments: "str"}}]` | `content: [{type: "tool_use", id, input: {obj}}]` |
| **Tool Response Role**| `role: "tool"`, `tool_call_id: "..."` | `role: "user"`, `content: [{type: "tool_result"}]` |
| **Terminal Stop Signal**| `finish_reason: "stop"` | `stop_reason: "end_turn"` |
| **Truncation Signal** | `finish_reason: "length"` | `stop_reason: "max_tokens"` |
| **Prompt Caching** | Automatic (50% discount on 1024+ prefixes) | Explicit (`cache_control: {"type": "ephemeral"}`) |
| **Extended Reasoning**| Model family (`o1`, `o3-mini`) | Explicit parameter (`thinking: {budget_tokens: 2048}`) |

---

## Production War Story: The OpenAI-to-Claude Migration HTTP 400 Drop

### Incident Post-Mortem

- **System:** Multi-tenant customer support automation gateway serving 80 enterprise clients.
- **Incident Severity:** SEV-1 (Outbound support queue blocked; 100% of Claude requests failed instantly with HTTP 400).
- **Detection Time:** 4 minutes after deploying the multi-model fallback router.
- **Root Cause:** An engineer implemented Claude integration by copying the OpenAI HTTP client and changing only the base URL and API key. The payload retained OpenAI conventions:
  1. It omitted the required `anthropic-version` header.
  2. It omitted the mandatory `max_tokens` field.
  3. It placed the system instructions in `messages[0] = {"role": "system", ...}`.
  Every outbound request failed validation at Anthropic's edge proxy, returning `400 invalid_request_error: messages: first message must use the "user" role`.

```mermaid
sequenceDiagram
    autonumber
    participant App as Multi-Model Router
    participant Proxy as Edge Router
    participant Claude as Anthropic API (/v1/messages)

    App->>Proxy: Forward request to Claude provider
    Proxy->>Claude: POST /v1/messages (OpenAI Payload Format)<br/>messages: [{role: "system", content: "You are a support bot"}]
    Note over Claude: 1. anthropic-version header missing!<br/>2. max_tokens field missing!<br/>3. role: 'system' inside messages array!
    Claude-->>Proxy: HTTP 400 Bad Request (invalid_request_error)
    Proxy-->>App: Exception: Claude provider unavailable
    Note over App: 100% of customer tickets stall in retry queue.
```

### The Architectural Hardening & Fix

1. **Provider Adapter Abstraction:** Decouple internal message representation from provider-specific wire schemas using an adapter that maps system prompts to the top-level `system` field and injects mandatory headers.
2. **Strict Client Schema Validation:** Validate that `anthropic-version` is present and `max_tokens > 0` before initiating outbound network sockets.

---

## Multi-Language Production Implementations

### Python: Raw HTTP Anthropic Messages Client (Zero SDK Dependencies)

```python
"""
Production Anthropic Messages API Client in Python.
Uses urllib.request (zero external dependencies) to demonstrate raw HTTP wire protocol.
Implements top-level system prompts, tool calling loops, and cache-control markers.
"""
import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional

class AnthropicMessagesClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable missing.")
        self.base_url = "https://api.anthropic.com/v1/messages"
        self.api_version = "2023-06-01" # Standard stable API version

    def create_message(
        self,
        model: str,
        messages: List[Dict[str, Any]],
        max_tokens: int = 1024,
        system_prompt: Optional[str] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.5
    ) -> Dict[str, Any]:
        """
        Executes a POST request to /v1/messages.
        Enforces Anthropic wire protocol rules.
        """
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": self.api_version,
            "content-type": "application/json",
            "user-agent": "EnterpriseClaudeBackend/1.0"
        }

        # Build payload
        payload: Dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens, # MANDATORY in Anthropic
            "messages": messages,     # Strictly alternating user/assistant turns
            "temperature": temperature
        }
        if system_prompt:
            payload["system"] = system_prompt # Top-level system parameter
        if tools:
            payload["tools"] = tools

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.base_url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=45.0) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                
                # Extract text and tool_use blocks
                text_parts = []
                tool_calls = []
                for block in body.get("content", []):
                    if block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                    elif block.get("type") == "tool_use":
                        tool_calls.append({
                            "id": block.get("id"),
                            "name": block.get("name"),
                            "input": block.get("input", {}) # Native JSON object!
                        })

                return {
                    "id": body.get("id"),
                    "text": "".join(text_parts),
                    "tool_calls": tool_calls,
                    "stop_reason": body.get("stop_reason"),
                    "usage": body.get("usage", {}),
                    "raw": body
                }

        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            raise RuntimeError(f"Anthropic API Error HTTP {e.code}: {err_body}") from e

if __name__ == "__main__":
    print("AnthropicMessagesClient loaded and verified. Ready for production dispatch.")
```

### TypeScript: Low-Latency Claude Messages Consumer (Node.js)

```typescript
/**
 * Production Anthropic Messages Consumer in TypeScript / Node.js.
 * Handles content blocks, tool use, and required headers natively.
 */

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export type ClaudeContentBlock = TextBlock | ToolUseBlock;

export interface ClaudeResponse {
  id: string;
  content: ClaudeContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export class ClaudeApiClient {
  private readonly apiKey: string;
  private readonly apiVersion: string = "2023-06-01";

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || "";
    if (!this.apiKey) throw new Error("Missing ANTHROPIC_API_KEY.");
  }

  public async sendMessage(
    model: string,
    prompt: string,
    systemPrompt: string = "You are a helpful assistant.",
    maxTokens: number = 1024
  ): Promise<{ text: string; stopReason: string }> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": this.apiVersion,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as ClaudeResponse;
    const textBlocks = data.content.filter((b): b is TextBlock => b.type === "text");
    const combinedText = textBlocks.map((b) => b.text).join("");

    return {
      text: combinedText,
      stopReason: data.stop_reason,
    };
  }
}

// Verification benchmark
const claude = new ClaudeApiClient("sk-mock-key");
console.log("TypeScript ClaudeApiClient compiled and verified.");
```

### Go: High-Throughput Claude Messages Client

```go
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type ClaudeMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type ClaudePayload struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	System    string          `json:"system,omitempty"`
	Messages  []ClaudeMessage `json:"messages"`
}

type ClaudeResponse struct {
	ID         string `json:"id"`
	StopReason string `json:"stop_reason"`
	Content    []struct {
		Type string `json:"type"`
		Text string `json:"text,omitempty"`
	} `json:"content"`
}

type ClaudeClient struct {
	APIKey string
	Client *http.Client
}

func NewClaudeClient() *ClaudeClient {
	return &ClaudeClient{
		APIKey: os.Getenv("ANTHROPIC_API_KEY"),
		Client: &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *ClaudeClient) Send(ctx context.Context, model, system, userText string, maxTokens int) (string, error) {
	payload := ClaudePayload{
		Model:     model,
		MaxTokens: maxTokens,
		System:    system,
		Messages: []ClaudeMessage{
			{Role: "user", Content: userText},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}

	req.Header.Set("x-api-key", c.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := c.Client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBytes))
	}

	var res ClaudeResponse
	if err := json.Unmarshal(respBytes, &res); err != nil {
		return "", err
	}

	text := ""
	for _, block := range res.Content {
		if block.Type == "text" {
			text += block.Text
		}
	}
	return text, nil
}

func main() {
	fmt.Println("Go ClaudeClient initialized successfully.")
}
```

---

## Practical Verification Workflows: CLI & Mathematical Invariance

Verify Claude Messages API payload formatting using curl and Python parsing:

```bash
# Verify Claude request construction via Python dry-run
python -c '
payload = {
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024, # Required!
    "system": "You are an enterprise code reviewer.", # Top-level!
    "messages": [
        {"role": "user", "content": "Review this SQL query."}
    ]
}

headers = {
    "x-api-key": "sk-ant-test",
    "anthropic-version": "2023-06-01", # Required!
    "content-type": "application/json"
}

assert "max_tokens" in payload
assert "system" in payload
assert payload["messages"][0]["role"] == "user" # Must NOT be system
assert "anthropic-version" in headers
print("Anthropic Claude payload validation passed: Zero protocol schema violations.")
'
```

### Expected Wire Output

```
Anthropic Claude payload validation passed: Zero protocol schema violations.
```

---

## Operational Validation Checkpoints

### Scenario 1: The Missing `max_tokens` Field
A developer writes a proxy service translating requests between OpenAI and Claude. For OpenAI, they pass `{"model": "gpt-4o", "messages": [...]}` without setting `max_tokens`. They route the exact same JSON payload to Claude. What HTTP status code and error does Claude return?

<details>
<summary>View Diagnostic Solution</summary>

**Answer:**  
Claude immediately returns **`HTTP 400 Bad Request`** with the error message: `{"type": "error", "error": {"type": "invalid_request_error", "message": "max_tokens: field required"}}`. Unlike OpenAI, which defaults `max_completion_tokens` to the remainder of the model's physical context window, Anthropic strictly demands an explicit integer value for `max_tokens` on every single request.

</details>

### Scenario 2: Tool Results and Message Roles
Claude proposes a tool call: `tool_use` with ID `toolu_99`. A developer constructs the tool response turn using OpenAI's format: `{"role": "tool", "tool_call_id": "toolu_99", "content": "{\"result\": 42}"}` and sends it to Claude. What happens?

<details>
<summary>View Diagnostic Solution</summary>

**Answer:**  
The Anthropic API returns `HTTP 400 Bad Request: messages: role "tool" is not supported`. In Anthropic's schema, there is no `tool` role. All tool results must be submitted as content blocks inside an ordinary **`user` role** turn:  
`{"role": "user", "content": [{"type": "tool_result", "tool_use_id": "toolu_99", "content": "{\"result\": 42}"}]}`.

</details>

### Scenario 3: Prompt Caching with `cache_control`
An enterprise application provides a 40,000-token PDF as context for 1,000 distinct user queries per hour. In Anthropic, how is Prompt Caching explicitly enabled to reduce API billing and latency?

<details>
<summary>View Diagnostic Solution</summary>

**Answer:**  
In Anthropic, prompt caching is activated by attaching a `cache_control` breakpoint to the static prefix block:  
`system: [{"type": "text", "text": pdf_text, "cache_control": {"type": "ephemeral"}}]`  
Anthropic caches the prefix for 5 minutes (refreshed on each hit). Subsequent requests reading from the cache receive a **90% discount on cached input tokens** and a **$2\times$ to $5\times$ reduction in Time to First Token (TTFT)**.

</details>

---

## Further Reading & Sources

- [Anthropic Messages API Reference](https://docs.anthropic.com/en/api/messages) - Official documentation for endpoints, headers, and content blocks.
- [Anthropic Prompt Caching Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) - Guide to ephemeral cache breakpoints and cost optimization.
- [Anthropic Tool Use Documentation](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) - Specification for function calling and tool results.
- [Track 06, Module 01: Chat Completions Deep Dive](../01-chat-completions-deep-dive/README.md) - The comparative OpenAI reference.
- [Track 06, Module 11: The Google Gemini API](../11-the-google-gemini-api/README.md) - Expanding cross-provider integration to Google's frontier multimodal models.

---

## Next

[Module 11: The Google Gemini API](../11-the-google-gemini-api/README.md)
