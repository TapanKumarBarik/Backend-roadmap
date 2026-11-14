# Track 18: Evaluation Harnesses and Benchmarks

Track 15 taught what to measure and why a score can mislead. This track is about the program that produces the score: the **evaluation
harness**. A harness loads a dataset, turns each item into a prompt, sends requests to a model, scores the answers, aggregates them and
writes a log, and every one of those steps is a decision that can move a number by more than the gap between two models people argue over.

The track opens one up (Module 00), runs two real ones and builds a regression gate on their logs (Module 01: `lm-evaluation-harness` on
real models, and UK AISI's Inspect against its built-in mock model, so no key is needed), turns to the harder case of evaluating an agent,
where what is scored is a whole run that has to be repeated (Module 02), and ends with a capstone: a trial runner and a release gate, tested
by 17 automated checks (Module 03).

Every measurement in these modules is either taken from a cited paper or document, or computed by a script that is in the module and was run
before the module was published. Where a number comes from a toy model or a scripted stand-in for a model, the module says so. The case
studies use public, sourced material and real runs, and no invented incidents.

## Modules

1. [Anatomy of an Evaluation Harness](00-anatomy-of-an-eval-harness/README.md)
2. [Evaluation in Practice: Harnesses, Inspect and Regression Gates](01-evaluation-in-practice-harnesses-inspect-and-regression-gates/README.md)
3. [Evaluating Agents: Environments, Graders and Reliability](02-evaluating-agents-environments-graders-and-reliability/README.md)
4. [Capstone Project: Build an Evaluation Harness and a Release Gate](03-capstone-project/README.md)
