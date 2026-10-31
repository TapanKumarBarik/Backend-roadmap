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
2. Text Encoding: Bytes, Unicode and UTF-8
3. Why Not Characters, Why Not Words
4. Byte-Pair Encoding (BPE) Explained
5. Building a BPE Tokenizer From Scratch
6. WordPiece and SentencePiece
7. Unigram Language Model Tokenization
8. Comparing Tokenizers Across Models
9. Vocabulary Size Tradeoffs
10. Special Tokens
11. Chat Templates and Message Formatting
12. Context Windows Explained
13. Token Cost Economics
14. Tokenization Pitfalls and Failure Modes
15. Multilingual Tokenization
16. Next-Token Prediction: From Logits to Probabilities
17. Sampling Strategies: Greedy, Temperature, Top-k, Top-p
18. Capstone Project
