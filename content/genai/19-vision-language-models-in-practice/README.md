# Track 19: Vision-Language Models in Practice

Track 16 showed how a hosted model sees an image and what the tokens cost. This track opens the model up: how a vision encoder is joined to a
language model (Module 00), how to tell whether a vision-language model is any good (Module 01), how to adapt and serve one (Module 02), and
a capstone that builds the evaluation of a hallucination probe and its release gate, checked by 19 automated checks (Module 03).

Every measurement in these modules is either taken from a cited paper, model card or config, or computed by a script that is in the module and
was run before the module was published, with real models where a model is involved (SmolVLM-256M, and the configs and processors of
LLaVA-1.5-7B and Qwen2-VL-7B). Where a number comes from a scripted stand-in for a model, the module says so. The case
studies use public, sourced material and real runs, and no invented incidents.

## Modules

1. [From Vision Encoder to Language Model: Connectors and Training Recipes](00-connectors-and-training-recipes/README.md)
2. [Evaluating Vision-Language Models: Benchmarks, Hallucination and Polling](01-evaluating-vlms-benchmarks-hallucination-and-polling/README.md)
3. [Adapting and Serving Vision-Language Models](02-adapting-and-serving-vlms/README.md)
4. [Capstone Project: A Hallucination Probe and Release Gate](03-capstone-project/README.md)
