# Track 17: Agent Harness Engineering

An agent is a model plus a **harness**, and the harness is everything that is not the model: the loop, the tools, the context, the safety
controls, the orchestration and the extension points. Track 10 built an agent by hand; this track is about the program around the model,
which is where most of the reliability, cost and risk of a real agent comes from. It follows the seven subsystems that a 2026 source-code
study of eleven production coding agents found in all of them, builds a minimum viable harness in four languages, and studies OpenClaw, a
self-hosted agent platform, as a worked example of a harness that became a product.

Every measurement in these modules is either taken from a cited paper or document, or computed by a script that is in the module and was run
before the module was published. Where a number is a model rather than a measurement, the module says so. The case studies use public,
sourced material (a published ablation, vendor engineering articles, a security audit and a CVE report) and no invented incidents.

## Modules

1. [What an Agent Harness Is](00-what-an-agent-harness-is/README.md)
2. [Tools and the Agent-Computer Interface](01-tools-and-the-agent-computer-interface/README.md)
3. [Context Engineering, Memory and Long-Running Agents](02-context-engineering-memory-and-long-running-agents/README.md)
4. [Safety, Permissions and Sandboxing](03-safety-permissions-and-sandboxing/README.md)
5. [Skills, Hooks and Extensibility](04-skills-hooks-and-extensibility/README.md)
6. [OpenClaw, a Harness as a Platform](05-openclaw-a-harness-as-a-platform/README.md)
7. [Capstone Project: Build and Test a Harness](06-capstone-project/README.md)
