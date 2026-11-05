# Lesson 11: TCP Part 4, Closing, RST, TIME_WAIT and Running Out of Ports

## Roadmap

You are in **System Design Interview Prep**, Track 02, **Networking from Zero**: lesson 11 of 30. It builds on [lesson 9](../09-tcp-three-way-handshake/README.md), where a connection opened, and [lesson 4](../04-ports-and-sockets/README.md), ports and sockets. Here we see how connections end, and why that can use up all your ports. The next lesson, UDP vs TCP: when speed beats reliability, is coming soon. See [the track overview](../README.md) for the whole plan.

These are the written notes for the lesson's video. Prefer paper? The same notes are a free, printable PDF: [download SD-N-011.pdf](https://backendroadmap.com/notes/system-design/SD-N-011.pdf).

## Concept

> [!key] A connection closes in both directions with FIN and ACK; the side that closes first waits in TIME_WAIT, 60 seconds on Linux; a reset ends a connection at once, and many short connections can use up all your client ports.

## Words you'll meet today

| Word | In plain words |
|---|---|
| **FIN** | finish: I'm done sending |
| **RST** | reset: stop this connection right now |
| **TIME_WAIT** | the wait, after closing, before a connection is really gone (60 s on Linux) |
| **CLOSE_WAIT** | the other side said goodbye, and our app hasn't closed yet |
| **Ephemeral port** | the temporary port a client picks for each connection |
| **Half-close** | one direction closed while the other can still send |
| **Connection pool** | a few open connections reused for many requests |
| **Keep-alive** | keeping a connection open for the next request |

## The question: why did it run out of ports?

A busy service calls another service thousands of times a second. Suddenly every new call fails with *cannot assign requested address*. The CPU is fine, the memory is fine: it has run out of ports. To understand why, we need the end of a TCP connection, not the start.

## An everyday picture first: ending a phone call

Ending a call politely: you say, that's all from me. Your friend says, okay. Then your friend says, that's all from me too, and you say, okay, bye. Each person says they're done and the other confirms: four messages, because there are two directions, just like the handshake in lesson 9. The rude way: you just hang up, and anything your friend was still saying is lost.

![Two people on a call: you say that's all from me, your friend says okay, your friend says that's all from me too, you say okay, bye. Four numbered messages.](images/figure-1.svg)

*Figure 1. The analogy: ending a call politely takes four messages, because each person says they're done and the other confirms; hanging up is the reset.*

## The polite close: FIN and ACK, both ways

Your phone is done sending, so it sends a segment with the **FIN** flag. The server answers ACK, and one direction is closed. But the server may still have data to send. When it's done, it sends its own FIN, and your phone answers ACK. Both directions are closed. Often the server's ACK and FIN travel together, so you see three segments, not four.

Between the two halves the server is in **CLOSE_WAIT**: it got the goodbye and is waiting for its own app to close. If the app never closes, the connection stays there forever; thousands of them mean a bug in your code, someone forgot to close.

![A sequence diagram: your phone sends FIN, the server ACKs, then sends its own FIN, and the phone ACKs. CLOSE_WAIT is marked on the server between the halves, TIME_WAIT on the phone at the end.](images/figure-2.svg)

*Figure 2. The polite close: FIN and ACK in each direction. The server sits in CLOSE_WAIT until its app closes; the side that closed first waits in TIME_WAIT.*

## TIME_WAIT: why the closer waits

The side that closed first, your phone, doesn't forget the connection right away. It enters **TIME_WAIT**; on Linux it waits 60 seconds. Two reasons. One: the final ACK might be lost; then the server sends its FIN again, and your phone must still be there to answer. Two: old, delayed segments from this connection might still be wandering the network; waiting lets them die out, so they are never mistaken for a new connection on the same ports.

![Left: the final ACK is lost, the server sends FIN again, and the phone answers with ACK. Right: an old, delayed segment, with a note that waiting lets it expire.](images/figure-3.svg)

*Figure 3. Why TIME_WAIT exists: a lost final ACK makes the server repeat its FIN, and the closer must still answer; and delayed old segments need time to die out.*

## The rude way: RST

A **reset** is one segment, no goodbye, and the connection is gone at once. Any data not yet read is thrown away, and you see *connection reset by peer*. Resets happen when a program crashes or is killed, when a load balancer or firewall drops an idle connection, or (lesson 9) when nobody listens on that port.

![The server sends RST to the phone. Notes: one segment, gone at once, unread data thrown away, connection reset by peer. Causes listed below.](images/figure-4.svg)

*Figure 4. The rude way: a reset (RST) ends the connection at once and throws away unread data; you see “connection reset by peer”.*

## Running out of ports

From lesson 4: a connection is named by four values, client address, client port, server address and server port. When your service calls one database at one address and one port, three of the four never change; only the client port can. So each connection to that database needs its own client port.

![Four cards: client address 10.0.0.5 fixed, client port 51,234 changes, server address 10.0.0.9 fixed, server port 5432 fixed.](images/figure-5.svg)

*Figure 5. A connection is named by four values. To one database address and port, only the client port changes, so each connection needs its own.*

**Real numbers.** Linux hands out client ports from 32,768 to 60,999: about 28,000. Every connection your service closes keeps its port busy, in TIME_WAIT, for 60 seconds. So at most about 28,000 ports every 60 seconds: roughly **470 new connections per second** to that one address and port. Open and close faster than that, and the ports run out.

![A bar for the port range 32,768 to 60,999, about 28,000 ports, and the arithmetic: 28,000 ports divided by 60 seconds is about 470 new connections per second.](images/figure-6.svg)

*Figure 6. Running out of ports: about 28,000 client ports, each held for 60 seconds in TIME_WAIT, allow roughly 470 new connections per second to one server address and port.*

**The fixes, best first.** Reuse connections: open a few and send many requests over each, with keep-alive and connection pools (lesson 29). Widen the port range. Let Linux safely reuse ports in TIME_WAIT for new outgoing connections, with `tcp_tw_reuse`. Spread the calls over more server addresses.

| You see | It means | Do this |
|---|---|---|
| many TIME_WAIT on a client | too many short connections | pool them |
| many CLOSE_WAIT | your app forgets to close | fix the code |
| connection reset by peer | the other side crashed, timed out an idle connection, or refused it | check the other side |

![Left: four numbered fixes, reuse connections, widen the port range, tcp_tw_reuse, more server addresses. Right: a checklist of symptoms and what they mean.](images/figure-7.svg)

*Figure 7. The fixes, best first, and a symptom checklist: TIME_WAIT piles mean short connections, CLOSE_WAIT piles mean an app that forgets to close.*

## Pause and think

> [!exercise] A service opens a new connection to its database for every query and closes it right after. It runs 1,000 queries per second; the port range is 28,000 and TIME_WAIT lasts 60 seconds. Does it run out of ports? Decide before you open the answer.

<details><summary>Answer</summary>

Yes. 1,000 a second, each holding a port for 60 seconds, needs 60,000 ports, and it only has 28,000. After about 28 seconds new connections start to fail. The fix: a connection pool with, say, 20 connections that stay open.

![Two bars: 28,000 ports available, and a bar twice as long, 60,000 ports needed. A note: runs out after about 28 seconds; fix, a pool of about 20 open connections.](images/figure-8.svg)

*Figure 8. The pause-and-think answer: 1,000 connections a second for 60 seconds needs 60,000 ports against about 28,000, so new connections fail after about 28 seconds; a pool fixes it.*

</details>

## Common mistakes

- **"Closing takes one message."** No. Each direction closes on its own: FIN and ACK, both ways.
- **"TIME_WAIT is a bug, so turn it off."** No. It protects you from lost ACKs and old segments. Reuse connections instead.
- **"A reset means an attack."** Usually not. Most resets are crashed programs, idle timeouts or closed ports.

## Recap in three lines

1. A connection closes in both directions: FIN, ACK, FIN, ACK.
2. The side that closes first waits in TIME_WAIT, for 60 seconds on Linux.
3. A reset ends a connection at once, and short connections can use up all your ports.

## Interview questions

> [!interview] How does a TCP connection close? (Basic)

<details><summary>What to say in 30 seconds</summary>

Each direction closes separately. The side that's done sends a FIN and the other ACKs it; later the other side sends its FIN and gets an ACK. That's four segments, often three because the second ACK and FIN travel together. The side that closed first then waits in TIME_WAIT.

</details>

> [!interview] What is TIME_WAIT and why does it exist? (Basic)

<details><summary>What to say in 30 seconds</summary>

The state the side that closed first stays in after the final ACK, 60 seconds on Linux (two maximum segment lifetimes in the standard). It lets the closer answer a repeated FIN if its last ACK was lost, and lets old delayed segments expire so they can't be mistaken for a new connection with the same addresses and ports.

</details>

> [!interview] A service starts failing with “cannot assign requested address”. What's going on? (Scenario)

<details><summary>What to say in 30 seconds</summary>

It's out of ephemeral ports. Each new connection to the same server address and port needs a distinct client port, and closed connections hold theirs in TIME_WAIT for 60 s: about 28,000 ports means roughly 470 new connections per second. Fix the cause with keep-alive and connection pools; widening the range, tcp_tw_reuse and more destination addresses help too.

</details>

> [!interview] You see thousands of connections in CLOSE_WAIT. What does it tell you? (Scenario)

<details><summary>What to say in 30 seconds</summary>

The peer has closed, but your application never closed its side: a leak in your code, such as a missing close in an error path or a connection not returned to the pool. The kernel can't fix it; the app must close the socket.

</details>

> [!interview] What's the difference between FIN and RST? (Tricky)

<details><summary>What to say in 30 seconds</summary>

FIN is a graceful close of one direction: data already sent is delivered and acknowledged, and the other side can keep sending. RST aborts the whole connection immediately, discards data not yet read, and the other side sees “connection reset by peer”. Crashes, idle timeouts on load balancers and connections to a closed port cause resets.

</details>

> [!interview] Should you turn off TIME_WAIT to fix port exhaustion? (Tricky)

<details><summary>What to say in 30 seconds</summary>

No. It protects against lost ACKs and stray old segments. Reuse connections so you open fewer; on Linux, tcp_tw_reuse safely reuses TIME_WAIT ports for new outgoing connections using timestamps. The old tcp_tw_recycle was unsafe behind NAT and was removed.

</details>

## Free PDF notes

Download these notes as a printable PDF, with every picture, the port arithmetic and the interview answers: [SD-N-011.pdf](https://backendroadmap.com/notes/system-design/SD-N-011.pdf).

## Sources

- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293), closing with FIN, TIME_WAIT, CLOSE_WAIT and RST.
- [RFC 6056: Recommendations for Transport-Protocol Port Randomization](https://www.rfc-editor.org/rfc/rfc6056), ephemeral ports.
- [RFC 7323: TCP Extensions for High Performance](https://www.rfc-editor.org/rfc/rfc7323), the timestamps that let tcp_tw_reuse work safely.
- [Linux kernel: IP sysctl documentation](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html), ip_local_port_range and tcp_tw_reuse.
- [Linux tcp(7) manual page](https://man7.org/linux/man-pages/man7/tcp.7.html), TCP states and settings.

## Next

Next comes lesson 12, UDP vs TCP: when speed matters more than reliability, and why video calls and games often choose UDP (coming soon). Until then, the [track overview](../README.md) lists the whole series.
