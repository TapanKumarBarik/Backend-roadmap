# System Design Interview Prep: From Requirements to Distributed Systems

A short-lecture course on the ideas that every system design interview is built on. Each lecture is a video of a few minutes on [the YouTube channel](https://www.youtube.com/@tapankumarbarik9454) and a written lecture here: the example in code, a diagram, exercises with answers, and the interview questions with what a strong answer covers. Watch first and read to keep it, or read first and watch to check yourself. On the site, the lecture's page plays the video at the top.

This is a large course, being built out one lecture at a time. A lecture whose text is still to come keeps its video: it is marked *Soon* in the sidebar and plays the video until the text arrives.

## How this course fits with the rest of the site

- [`backend/`](../backend/README.md) is where the depth is. Every idea here is a short version of something taught properly there, and its last track, [System Design Interview Practice](../backend/14-system-design-interview-practice/README.md), is the whiteboard practice this course leads to.
- [`lld/`](../lld/README.md) is the other half of the interview. System design in the sense of this course is high-level design (services, storage, data flow); low-level design is how the classes inside one service are shaped, and has its own course.
- The second playlist on the channel, [Phase 2: Networking, APIs & Databases](https://www.youtube.com/playlist?list=PLEBaLYrJs0lI), is not repeated here. Each of its videos plays at the top of the `backend/` or `learn/` module that covers the same ground, so the text and the video are in one place. Open the Videos page of the site for the whole list.

## Naming convention

Same convention as `backend/`:

- **Tracks** are top-level folders under `system-design/`, named `NN-track-name`, in the order you do them in.
- **Lectures** are subfolders of a track, named `NN-lecture-name`. Here `NN` is the lesson's number on the channel, so "Lesson 12" in the video is `12-…` on the site.
- Every lecture folder contains exactly one `README.md`, and a lecture's video is attached to it in `content/videos.json` (`docs/VIDEOS.md` explains how), not written into the file.
- This file is the index of the course.

## Tracks

| # | Track | What you'll be able to do after | Depends on |
|---|-------|---------------------------------|------------|
| 1 | [01-core-fundamentals](01-core-fundamentals/README.md) | Start a design by clarifying requirements, describe a system's layers, scale it out, reason about latency, throughput, availability, CAP and consistency, and design for failure | nothing |

Start here → [01-core-fundamentals/01-what-is-system-design/README.md](01-core-fundamentals/01-what-is-system-design/README.md)
