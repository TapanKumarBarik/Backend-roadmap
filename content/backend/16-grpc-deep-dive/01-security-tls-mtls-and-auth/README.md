# Module 01: Security — TLS, mTLS and Auth

## Why this matters

Every gRPC example you've written so far — including track 11's — used
`grpc.insecure_channel(...)`. The name is not a warning label the library
authors added for fun: that channel is plaintext HTTP/2, readable and
modifiable by anything on the path. gRPC has no equivalent of "well, it's
behind a firewall" — service-to-service traffic inside a cluster is exactly
the traffic that lateral-movement attacks target.

gRPC's security model has two distinct layers that are easy to conflate:
**channel credentials** (who the *connection* is, established once by TLS)
and **call credentials** (who the *caller* is, presented per-RPC in
metadata). This module builds both, and shows why you need both.

## Concepts

### Channel credentials vs call credentials

| | Channel credentials | Call credentials |
|---|---|---|
| Established | Once, at connection time | Per RPC |
| Mechanism | TLS handshake / certificates | Metadata headers |
| Answers | "Is this the right *server*, and is the pipe encrypted?" | "Who is *making this call*, and may they?" |
| Example | Server TLS cert, client cert (mTLS) | Bearer token, API key, JWT |

They compose: a channel can be TLS-secured *and* carry a per-call token.
gRPC deliberately refuses to attach call credentials to an insecure channel
by default — sending a bearer token over plaintext would leak it.

### Server-side TLS

For local work you need a certificate whose SAN covers the hostname you
dial. A self-signed cert is fine, but it must be a **SAN** cert — modern TLS
stacks ignore the legacy CN field entirely.

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout server.key -out server.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

```python
import grpc
from concurrent import futures

with open("server.key", "rb") as f: key = f.read()
with open("server.crt", "rb") as f: crt = f.read()

creds = grpc.ssl_server_credentials([(key, crt)])   # note: (key, cert) order

server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
shop_pb2_grpc.add_OrderServiceServicer_to_server(OrderService(), server)
server.add_secure_port("[::]:50051", creds)         # not add_insecure_port
server.start()
server.wait_for_termination()
```

The `(private_key, certificate_chain)` tuple order is a genuine and common
mistake — it is key first, cert second, which is the opposite of how most
tools list them.

Client side:

```python
with open("server.crt", "rb") as f: root = f.read()

creds = grpc.ssl_channel_credentials(root_certificates=root)
with grpc.secure_channel("localhost:50051", creds) as channel:
    stub = shop_pb2_grpc.OrderServiceStub(channel)
    stub.GetOrder(shop_pb2.GetOrderRequest(id="A-1"))
```

In production you omit `root_certificates` so the system trust store is used;
you only pass it explicitly for private CAs or self-signed development certs.

### Mutual TLS: the server authenticates the client too

Standard TLS proves the *server's* identity to the client. mTLS adds the
reverse — the client presents a certificate, and the server refuses the
connection if it isn't signed by a trusted CA. This is the backbone of
zero-trust service-to-service auth, and it's what a service mesh
(`learn/13-service-mesh`) automates for you.

You need a CA to sign both sides:

```bash
# 1. CA
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout ca.key -out ca.crt -subj "/CN=dev-ca"

# 2. server cert signed by that CA
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr \
  -subj "/CN=localhost"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365 \
  -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1")

# 3. client cert signed by the same CA
openssl req -newkey rsa:2048 -nodes -keyout client.key -out client.csr \
  -subj "/CN=orders-client"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 365
```

```python
# server: require and verify a client certificate
creds = grpc.ssl_server_credentials(
    [(server_key, server_crt)],
    root_certificates=ca_crt,
    require_client_auth=True,          # <-- this is what makes it mTLS
)
```

```python
# client: present its own certificate
creds = grpc.ssl_channel_credentials(
    root_certificates=ca_crt,
    private_key=client_key,
    certificate_chain=client_crt,
)
```

`require_client_auth=True` is the entire difference between "encrypted" and
"mutually authenticated." Without it, passing `root_certificates` on the
server does nothing useful — clients may still connect anonymously.

### Reading the peer identity on the server

Once mTLS is on, the client's certificate is the strongest identity you
have. It's available through the call context:

```python
def GetOrder(self, request, context):
    peer_identities = context.peer_identities()          # list of bytes, or None
    identity_key    = context.peer_identity_key()        # e.g. "x509_subject_alternative_name"
    if not peer_identities:
        context.abort(grpc.StatusCode.UNAUTHENTICATED, "client certificate required")
    caller = peer_identities[0].decode()
    ...
```

Note that `peer_identities()` reflects the certificate's **SAN entries**, not
its CN. If you intend to identify clients by name, put that name in the SAN
when issuing the cert.

### Call credentials: per-request identity

mTLS answers "which *service* is calling." It does not answer "which *user*
is this request on behalf of" — one service handles many users over the same
connection. That's what call credentials carry.

```python
class BearerAuth(grpc.AuthMetadataPlugin):
    def __init__(self, token): self._token = token
    def __call__(self, context, callback):
        # metadata keys MUST be lowercase; gRPC rejects uppercase keys
        callback((("authorization", f"Bearer {self._token}"),), None)

call_creds    = grpc.metadata_call_credentials(BearerAuth("eyJhbGciOi..."))
channel_creds = grpc.ssl_channel_credentials(root_certificates=ca_crt)
combined      = grpc.composite_channel_credentials(channel_creds, call_creds)

with grpc.secure_channel("localhost:50051", combined) as ch:
    ...
```

Using an `AuthMetadataPlugin` rather than passing metadata by hand on every
call means you cannot forget it on one RPC, and it lets the plugin refresh
an expiring token centrally.

### Enforcing auth with a server interceptor

Track 11 introduced interceptors. This is their most important production
use: one place that every RPC must pass through, so no handler can forget.

```python
class AuthInterceptor(grpc.ServerInterceptor):
    def __init__(self, verify, exempt=()):
        self._verify = verify
        self._exempt = set(exempt)
        self._deny = grpc.unary_unary_rpc_method_handler(
            lambda req, ctx: ctx.abort(grpc.StatusCode.UNAUTHENTICATED, "invalid or missing token")
        )

    def intercept_service(self, continuation, handler_call_details):
        method = handler_call_details.method          # "/shop.v1.OrderService/GetOrder"
        if method in self._exempt:
            return continuation(handler_call_details)

        md = dict(handler_call_details.invocation_metadata or ())
        auth = md.get("authorization", "")
        if not auth.startswith("Bearer ") or not self._verify(auth[7:]):
            return self._deny                          # short-circuit: handler never runs
        return continuation(handler_call_details)

server = grpc.server(
    futures.ThreadPoolExecutor(max_workers=10),
    interceptors=[AuthInterceptor(verify_jwt, exempt={"/grpc.health.v1.Health/Check"})],
)
```

Two details that matter. The interceptor must **fail closed** — an unknown
method or missing metadata is a denial, never a pass-through. And the health
check must be exempt, or your load balancer's probes will be rejected and it
will pull the instance out of rotation (module 02 covers this).

### Which status code to return

| Situation | Status |
|---|---|
| No credentials, or credentials invalid/expired | `UNAUTHENTICATED` (16) |
| Valid identity, but not allowed to do this | `PERMISSION_DENIED` (7) |
| Valid identity, resource doesn't exist | `NOT_FOUND` (5) |

Getting this wrong is a real information leak: returning `PERMISSION_DENIED`
for a resource that doesn't exist tells an attacker it *does* exist. When
existence itself is sensitive, return `NOT_FOUND` for both cases.

### What this doesn't cover

TLS terminating at a proxy (an ingress, service mesh sidecar, or L7 load
balancer) means the hop from proxy to your process may be plaintext. That is
a deliberate architecture, not a bug — but you should know which model you're
in, because `peer_identities()` will then report the *proxy*, not the client.
`learn/13-service-mesh` covers the sidecar model in depth.

## Command reference

| Concern | Command / API |
|---|---|
| Self-signed SAN cert | `openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout k.key -out c.crt -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"` |
| Inspect a cert | `openssl x509 -in server.crt -noout -text` |
| Server TLS creds | `grpc.ssl_server_credentials([(key, cert)])` — key first |
| Require client certs (mTLS) | `grpc.ssl_server_credentials([...], root_certificates=ca, require_client_auth=True)` |
| Client TLS creds | `grpc.ssl_channel_credentials(root_certificates=ca)` |
| Client cert (mTLS) | `grpc.ssl_channel_credentials(ca, private_key=k, certificate_chain=c)` |
| Combine channel + call creds | `grpc.composite_channel_credentials(chan, call)` |
| Read peer identity | `context.peer_identities()`, `context.peer_identity_key()` |
| Secure port | `server.add_secure_port("[::]:50051", creds)` |
| Test TLS with grpcurl | `grpcurl -cacert ca.crt localhost:50051 list` |
| Test mTLS with grpcurl | `grpcurl -cacert ca.crt -cert client.crt -key client.key localhost:50051 list` |

## Hands-on exercises

```bash
pip install grpcio grpcio-tools pyjwt
```

Reuse the `shop.v1` proto and service from module 00 / track 11.

### 1. Prove plaintext gRPC is readable

Run an insecure server, then capture a call:

```bash
sudo tcpdump -i lo -A -s 0 'port 50051' | grep -i "A-1"
```

Expected: your order ID appears in cleartext in the capture. This is the
baseline the rest of the module removes.

### 2. Turn on server TLS

Generate the SAN cert, switch to `add_secure_port` and
`grpc.secure_channel`. Confirm the call still succeeds, then re-run the
`tcpdump` from exercise 1.

Expected: the call works; the payload no longer appears in the capture.

### 3. Break it three ways deliberately

Each of these should fail, and you should be able to name *why* from the
error:

- Client uses `grpc.insecure_channel` against the TLS server.
- Client dials `127.0.0.1:50051` when the cert's SAN lists only
  `DNS:localhost` (omit the `IP:` entry when generating).
- Client passes no `root_certificates` for a self-signed cert.

Expected errors, in order: an `UNAVAILABLE` with a protocol/handshake
failure; a certificate-verification failure naming the hostname mismatch;
and a "unable to get local issuer certificate" style failure. Write down
which is which — telling these apart from the error text is the actual skill.

### 4. Add mutual TLS

Build the CA, re-issue server and client certs from it, and set
`require_client_auth=True`. Confirm:

- A client presenting `client.crt`/`client.key` succeeds.
- The *same* client with the cert arguments removed is now rejected at
  connection time, not at the handler.

### 5. Read the caller's identity from its certificate

Issue the client cert with `subjectAltName=DNS:orders-client`, then in the
handler print `context.peer_identities()` and `context.peer_identity_key()`.

Expected: identities contains `b"orders-client"` and the key is
`x509_subject_alternative_name`. Then re-issue the client cert with the name
only in the CN and *no* SAN, and confirm `peer_identities()` no longer
reports it — proving the SAN, not the CN, is what carries identity.

### 6. Add a bearer-token interceptor

Implement `AuthInterceptor` with a real JWT check (`pyjwt`, HS256, a shared
dev secret). Confirm:

- A call with a valid token succeeds.
- A call with no `authorization` metadata gets `UNAUTHENTICATED`.
- A call with an expired token gets `UNAUTHENTICATED`.
- The handler never executes in the failing cases (add a `print` to prove it).

### 7. Prove call credentials are refused on an insecure channel

Attach `metadata_call_credentials` to an `insecure_channel`.

Expected: gRPC raises rather than silently sending your token in the clear.
Write one sentence on why this default is correct.

### 8. Diagnose and fix: the interceptor that authenticated nothing

A team ships this interceptor and their tests pass:

```python
def intercept_service(self, continuation, handler_call_details):
    md = dict(handler_call_details.invocation_metadata or ())
    if md.get("Authorization", "").startswith("Bearer "):
        return continuation(handler_call_details)
    return continuation(handler_call_details)      # "let it through, handler will check"
```

Two independent bugs. Find both.

<details>
<summary>Solution</summary>

**Bug 1 — it fails open.** Both branches call `continuation(...)`, so every
request reaches the handler regardless of its token. The check computes a
value and discards it. An interceptor that doesn't return a short-circuit
handler on failure provides no enforcement at all — this is the reason the
`AuthInterceptor` above returns `self._deny` rather than falling through.

**Bug 2 — the metadata key is capitalized.** gRPC normalizes all metadata
keys to lowercase on the wire, so `md.get("Authorization")` is always
`None`; the lookup could never have matched even if the branch logic were
right. Use `"authorization"`.

Notice that either bug alone would have been caught by a test asserting
"a call without a token is rejected" — and that no test asserted it, because
the team tested only the happy path. The fix is exercise 6's version plus a
negative test for each failure mode.

</details>

## Independent challenge

No solution given. Design and implement authentication for a three-service
system: a public API gateway (reachable from the internet, authenticates
*end users* by JWT), and two internal services it calls over gRPC that must
only accept traffic from the gateway.

Decide and justify: does the gateway→internal hop use mTLS, bearer tokens,
both, or neither? How does an internal service know *which end user* a call
is on behalf of, given the connection identity is the gateway? What stops a
compromised internal service from impersonating the gateway to the other
internal service? Implement your design, and write a negative test for each
attack you claim to prevent.

<details>
<summary>Stuck? One hint</summary>

The common production answer uses both layers, because they answer different
questions: mTLS establishes *which service* is on the connection (and
prevents anything without a CA-signed cert from connecting at all), while a
propagated, short-lived token — minted or forwarded by the gateway — carries
*which end user* the call is on behalf of. The subtle part is the third
question: if internal services simply trust a user-ID header, any service
that can connect can forge one. That's why the end-user assertion should be
a signed token the receiving service verifies independently, rather than
plain metadata it takes on faith from its peer.

</details>

## Common mistakes & troubleshooting

- **`grpc.ssl_server_credentials` argument order.** It's
  `[(private_key, certificate_chain)]` — key first. Swapping them produces a
  confusing handshake failure rather than a clear error.
- **CN-only certificates.** Modern TLS ignores CN for hostname verification;
  without a `subjectAltName` the handshake fails no matter what CN says.
  This is also why `peer_identities()` reads SANs.
- **`root_certificates` on the server without `require_client_auth=True`.**
  Looks like mTLS, isn't — clients can still connect without a certificate.
- **Uppercase metadata keys.** gRPC lowercases keys on the wire; a lookup
  for `"Authorization"` silently never matches.
- **Interceptors that fail open.** If the failure path still calls
  `continuation(...)`, the interceptor enforces nothing. Return a
  short-circuiting handler that aborts.
- **Not exempting the health service from auth.** Probes get
  `UNAUTHENTICATED`, the load balancer marks the instance unhealthy, and you
  take an outage that looks like a networking problem.
- **`PERMISSION_DENIED` where existence is sensitive.** It confirms the
  resource exists. Return `NOT_FOUND` when that fact itself is protected.
- **Assuming TLS end-to-end when a proxy terminates it.** Know whether your
  process or an ingress/sidecar owns the handshake, because it changes what
  `peer_identities()` means.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. What's the difference between channel credentials and call credentials,
   and what question does each answer?
2. What single argument turns TLS into mTLS on a Python gRPC server, and
   what happens if you supply `root_certificates` without it?
3. Why must a development certificate include `subjectAltName`, and how does
   that relate to `context.peer_identities()`?
4. Why does gRPC refuse to attach call credentials to an insecure channel?
5. Your auth interceptor is deployed and every request still reaches the
   handler. Name the two most likely causes.
6. When should a server return `NOT_FOUND` instead of `PERMISSION_DENIED`,
   and why?
7. In a gateway → internal-service architecture with mTLS, why is mTLS alone
   insufficient to know which end user a request belongs to?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Channel credentials are established once at connection time via the TLS
   handshake and answer "is this the right server, is the pipe encrypted,
   and (with mTLS) is the client a trusted peer?" Call credentials are
   presented per-RPC in metadata and answer "who is making this particular
   call, and are they allowed to?" They compose via
   `composite_channel_credentials`.
2. `require_client_auth=True`. Supplying `root_certificates` without it does
   not enforce anything — the server will still accept clients that present
   no certificate at all, so you get encryption but not mutual
   authentication, while appearing configured for mTLS.
3. Modern TLS implementations ignore the legacy CN field for hostname
   verification and use `subjectAltName` exclusively, so a CN-only cert
   fails the handshake. The same field carries identity in the other
   direction: `peer_identities()` returns the client certificate's SAN
   entries, so a name present only in the CN won't be reported.
4. Because call credentials are typically bearer tokens, and sending one
   over a plaintext connection would expose it to anyone on the path —
   failing closed by default prevents accidentally leaking credentials in an
   environment someone assumed was secure.
5. Either the interceptor fails open (the failure branch still calls
   `continuation(...)` instead of returning a short-circuiting handler that
   aborts), or it reads a capitalized metadata key such as `"Authorization"`
   when gRPC has normalized it to lowercase, so the check never matches.
6. When the existence of the resource is itself sensitive information.
   `PERMISSION_DENIED` confirms the resource exists, letting an unauthorized
   caller enumerate valid IDs; returning `NOT_FOUND` for both "absent" and
   "not yours" removes that signal.
7. Because the mTLS identity is the *connection's* identity — the gateway —
   and one gateway connection carries requests for many different end users.
   The per-user identity has to travel per-call, and it should be a signed
   assertion the internal service verifies itself rather than a plain header,
   since any peer able to connect could otherwise forge one.

</details>

## Further reading & sources

- [gRPC: Authentication](https://grpc.io/docs/guides/auth/) - the official overview of channel vs call credentials across languages.
- [gRPC Python: `grpc` module reference](https://grpc.github.io/grpc/python/grpc.html) - exact signatures for `ssl_server_credentials`, `ssl_channel_credentials`, and the credential composition helpers.
- [gRPC: Status codes and their use](https://grpc.io/docs/guides/status-codes/) - the canonical mapping this module's `UNAUTHENTICATED` / `PERMISSION_DENIED` guidance follows.
- [RFC 6125](https://datatracker.ietf.org/doc/html/rfc6125) - why hostname verification uses `subjectAltName` rather than CN.
- [Track 03: Authentication and authorization](../../03-authentication-and-authorization/README.md) - the JWT/OAuth2 foundation the call-credentials half of this module assumes.

## Next

[02-production-serving-health-lb-and-keepalive](../02-production-serving-health-lb-and-keepalive/README.md) —
a secure service still needs to survive contact with a load balancer, which
is where gRPC's use of long-lived HTTP/2 connections stops being an
advantage and starts being a problem.
