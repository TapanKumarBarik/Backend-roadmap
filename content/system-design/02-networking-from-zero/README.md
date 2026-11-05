# Track 02: Networking from Zero

How the internet really carries your data, explained for someone who has written a little code but never studied networks. Thirty lessons, from "what is a network?" to the timeouts behind a random 502, each with a video of seven to ten minutes and a written lesson here that says the same thing in the same words, with the same pictures and the same numbers.

## Why this series

Networking questions come up in every system design interview, and they are where many people get lost: a diagram full of SYN, ACK, TTL and TLS, with no idea what any of it is for. This series starts from nothing and goes one idea at a time.

- **Every term is explained the first time it appears**, in plain words, before it is used. Each lesson opens with a short list of the words you'll meet.
- **An everyday picture first**, such as a letter by post, a flat number in a building or a parcel tracking page, and then the real thing mapped onto it, part by part.
- **One message at a time, slowly**, in numbered steps, with one worked example in real numbers.
- **What goes wrong**, and how the design copes: a lost packet, a timeout, ports running out.
- **A pause-and-think question** in every lesson, and at the end the sentences to say in an interview.
- The same colours mean the same thing in every picture: **blue** is the client (your phone, the sender), **green** is the server (the receiver), **red** is loss or an error.

## The lessons

Lessons are being published one at a time. Those not yet out are listed so you can see where the series is going.

| # | Lesson | Status |
|---|--------|--------|
| | **Foundations** | |
| 01 | [What is a network? Clients, servers and the conversation between them](01-what-is-a-network/README.md) | available |
| 02 | [Packets: why data travels in small pieces](02-packets/README.md) | available |
| 03 | [IP addresses: the street address of every device](03-ip-addresses/README.md) | available |
| 04 | [Ports and sockets: which app gets the packet](04-ports-and-sockets/README.md) | available |
| 05 | [Protocols and layers: agreed languages, and why we stack them](05-protocols-and-layers/README.md) | available |
| | **Models** | |
| 06 | [The OSI model made simple](06-osi-model/README.md) | available |
| 07 | [The TCP/IP model: what happens when you type a URL](07-what-happens-when-you-type-a-url/README.md) | available |
| | **TCP** | |
| 08 | [TCP part 1: sequence numbers and ACKs, how data is never lost](08-tcp-sequence-numbers-and-acks/README.md) | available |
| 09 | [TCP part 2: the three-way handshake (SYN, SYN-ACK, ACK)](09-tcp-three-way-handshake/README.md) | available |
| 10 | TCP part 3: flow control and congestion control | coming soon |
| 11 | TCP part 4: closing, RST, TIME_WAIT and running out of ports | coming soon |
| 12 | UDP vs TCP: when speed beats reliability | coming soon |
| | **IP in depth** | |
| 13 | Subnets and CIDR: neighbourhoods of addresses | coming soon |
| 14 | Routing and NAT: how packets find their way, and why your phone shares one public address | coming soon |
| | **DNS** | |
| 15 | DNS part 1: the phone book of the internet, one lookup step by step | coming soon |
| 16 | DNS part 2: records, TTL and safe migrations | coming soon |
| 17 | DNS traffic management: GeoDNS, weighted, failover, anycast | coming soon |
| | **HTTP** | |
| 18 | HTTP part 1: requests, responses and methods | coming soon |
| 19 | HTTP part 2: status codes, 401 vs 403, caching and ETags | coming soon |
| | **Security on the wire** | |
| 20 | Why encryption: public and private keys, the mailbox picture | coming soon |
| 21 | The TLS 1.3 handshake step by step | coming soon |
| 22 | Certificates and PKI: why your browser trusts a site it has never met | coming soon |
| | **Modern web** | |
| 23 | HTTP/1.1 vs HTTP/2 vs HTTP/3, and head-of-line blocking from scratch | coming soon |
| 24 | WebSockets | coming soon |
| 25 | SSE vs long polling vs WebSockets | coming soon |
| 26 | HTTP streaming, chunked transfer and backpressure | coming soon |
| | **Infrastructure** | |
| 27 | Forward and reverse proxies | coming soon |
| 28 | CDNs | coming soon |
| 29 | Connection pooling and keep-alive | coming soon |
| 30 | Timeouts: connect, read, deadlines and the random 502 | coming soon |

## How to use it

1. **Go in order.** Each lesson uses only the words taught before it, and the number of a lesson here is its number in the video.
2. **Watch, then read** (or the other way round). The written lesson follows the video step by step, so you can slow down on the part that did not click.
3. **Stop at the pause-and-think question** and answer it before you open the answer. If you get it right, you have understood the lesson.
4. **Say the interview answer out loud.** Every lesson ends with the sentences to use in 30 seconds.
5. **Keep the free PDF notes.** Every lesson has a printable PDF with the same pictures, linked at the bottom of its page.

Start here → [01-what-is-a-network/README.md](01-what-is-a-network/README.md), lesson 1.

Back to the course index: [../README.md](../README.md)
