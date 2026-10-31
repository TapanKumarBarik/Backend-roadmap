# Track 13: Model Context Protocol (MCP)

The open protocol that standardizes how an LLM application connects to
external tools and data. Instead of every app writing bespoke
integrations, an MCP server exposes tools/resources/prompts once and any
MCP-compatible client can use them. This track goes down to the wire
protocol, then back up through building a real server and client, with a
full module on the trust boundaries MCP introduces.

## Modules

1. What MCP Is and Why It Exists
2. The M×N Integration Problem
3. MCP vs. Function Calling vs. Plugins
4. Architecture: Hosts, Clients and Servers
5. The Protocol: JSON-RPC Foundations
6. Transports: stdio
7. Transports: Streamable HTTP and SSE
8. The Initialization Handshake
9. Primitive: Tools
10. Primitive: Resources
11. Primitive: Prompts
12. Sampling and Roots
13. Building Your First MCP Server (Python SDK)
14. Building an MCP Client
15. Testing and Debugging MCP Servers
16. Security and Trust Boundaries
17. The MCP Ecosystem
18. Capstone Project
