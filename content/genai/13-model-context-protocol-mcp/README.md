# Track 13: Model Context Protocol (MCP)

The open protocol that standardizes how an LLM application connects to
external tools and data. Instead of every app writing bespoke
integrations, an MCP server exposes tools/resources/prompts once and any
MCP-compatible client can use them. This track goes down to the wire
protocol, then back up through building a real server and client, with a
full module on the trust boundaries MCP introduces.

## Modules

1. [What MCP Is and Why It Exists](00-what-mcp-is-and-why-it-exists/README.md)
2. [The M×N Integration Problem](01-the-mxn-integration-problem/README.md)
3. [MCP vs. Function Calling vs. Plugins](02-mcp-vs-function-calling-vs-plugins/README.md)
4. [Architecture: Hosts, Clients and Servers](03-architecture-hosts-clients-and-servers/README.md)
5. [The Protocol: JSON-RPC Foundations](04-the-protocol-json-rpc-foundations/README.md)
6. [Transports: stdio](05-transports-stdio/README.md)
7. [Transports: Streamable HTTP and SSE](06-transports-streamable-http-and-sse/README.md)
8. [The Initialization Handshake](07-the-initialization-handshake/README.md)
9. [Primitive: Tools](08-primitive-tools/README.md)
10. [Primitive: Resources](09-primitive-resources/README.md)
11. [Primitive: Prompts](10-primitive-prompts/README.md)
12. [Sampling and Roots](11-sampling-and-roots/README.md)
13. [Building Your First MCP Server (Python SDK)](12-building-your-first-mcp-server/README.md)
14. [Building an MCP Client](13-building-an-mcp-client/README.md)
15. [Testing and Debugging MCP Servers](14-testing-and-debugging-mcp-servers/README.md)
16. [Security and Trust Boundaries](15-security-and-trust-boundaries/README.md)
17. [The MCP Ecosystem](16-the-mcp-ecosystem/README.md)
18. [Capstone Project](17-capstone-project/README.md)
