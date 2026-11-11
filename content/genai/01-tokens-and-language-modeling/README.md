# Track 01: Tokens & Language Modeling

Every input and output of an LLM — a prompt, a response, an image
description, a tool call — is, underneath, a sequence of **tokens**.
Context window limits, API pricing, why a model can't count the letters
in a word, why non-English text costs more: all of it traces back to
tokenization. This track goes from raw bytes through the tokenization
algorithms, then through how a model turns token probabilities into the
text you actually see.

## Modules

1. [What Is a Token](00-what-is-a-token/README.md)
2. [Text Encoding: Bytes, Unicode and UTF-8](01-text-encoding-bytes-unicode-and-utf-8/README.md)
3. [Why Not Characters, Why Not Words](02-why-not-characters-why-not-words/README.md)
4. [Byte-Pair Encoding (BPE) Explained](03-byte-pair-encoding-explained/README.md)
5. [Building a BPE Tokenizer From Scratch](04-building-a-bpe-tokenizer-from-scratch/README.md)
6. [WordPiece and SentencePiece](05-wordpiece-and-sentencepiece/README.md)
7. [Unigram Language Model Tokenization](06-unigram-language-model-tokenization/README.md)
8. [Comparing Tokenizers Across Models](07-comparing-tokenizers-across-models/README.md)
9. [Vocabulary Size Tradeoffs](08-vocabulary-size-tradeoffs/README.md)
10. [Special Tokens](09-special-tokens/README.md)
11. [Chat Templates and Message Formatting](10-chat-templates-and-message-formatting/README.md)
12. [Context Windows Explained](11-context-windows-explained/README.md)
13. [Token Cost Economics](12-token-cost-economics/README.md)
14. [Tokenization Pitfalls and Failure Modes](13-tokenization-pitfalls-and-failure-modes/README.md)
15. [Multilingual Tokenization](14-multilingual-tokenization/README.md)
16. [Next-Token Prediction: From Logits to Probabilities](15-next-token-prediction-from-logits-to-probabilities/README.md)
17. [Sampling Strategies: Greedy, Temperature, Top-k, Top-p](16-sampling-strategies-greedy-temperature-top-k-top-p/README.md)
18. [Capstone Project](17-capstone-project/README.md)
