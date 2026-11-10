# Module 01: Security — TLS, mTLS and Auth

> **The Golden Rule of gRPC Security**
> Channel credentials verify the transport pipe and peer identity at connection time via TLS/mTLS; call credentials authenticate the caller per-RPC via metadata. Never conflate the two: mTLS proves which *service* is talking, while a signed JWT in metadata proves which *end-user* they are acting on behalf of. Always fail closed in auth interceptors and exempt `/grpc.health.v1.Health/Check` to prevent cluster-wide health probe blackouts.

```mermaid
sequenceDiagram
    autonumber
    participant Client as Microservice A (Client)
    participant Channel as TLS / mTLS Transport Layer
    participant Interceptor as Server Auth Interceptor
    participant Handler as OrderService Handler
    participant HealthSvc as gRPC Health Service

    Note over Client,Channel: STEP 1: Handshake (Channel Credentials)
    Client->>Channel: Present client.crt (Signed by Private CA, SAN: "svc-orders")
    Channel->>Channel: Validate Server Cert SAN & Client Cert CA Chain
    Channel-->>Client: Mutual TLS Established (Encrypted HTTP/2 Pipe)

    Note over Client,Interceptor: STEP 2: Per-RPC Execution (Call Credentials)
    Client->>Interceptor: RPC GetOrder() [Metadata: "authorization: Bearer eyJ..."]
    alt Method == "/grpc.health.v1.Health/Check"
        Interceptor->>HealthSvc: Bypass Auth Interceptor (Exempt Path)
        HealthSvc-->>Client: 200 OK (SERVING)
    else Invalid or Missing Token
        Interceptor-->>Client: UNAUTHENTICATED (16): Short-circuit & Abort
    else Valid JWT & Authorized SAN
        Interceptor->>Handler: Forward Request with Claims in Context
        Handler-->>Client: 200 OK (Order Payload)
    end
```

---

## 1. Dual-Layer Security: Channel vs. Call Credentials

In gRPC, security operates across two distinct operational boundaries that compose into a single secure channel:

```mermaid
flowchart TD
    subgraph ChannelSecurity["1. Channel Credentials (Transport Layer)"]
        direction TB
        C1["TLS / Mutual TLS (mTLS)"]
        C2["Answers: 'Is this the genuine server?'<br/>'Is this an authenticated microservice peer?'"]
        C3["Configured ONCE at socket connection time"]
    end

    subgraph CallSecurity["2. Call Credentials (Application Layer)"]
        direction TB
        A1["Per-RPC Metadata Headers ('authorization: Bearer ...')"]
        A2["Answers: 'Which tenant/user is making this call?'<br/>'Do they possess read/write scope?'"]
        A3["Evaluated on EVERY single RPC request"]
    end

    ChannelSecurity -->|Composite Channel| CallSecurity
    CallSecurity -->|gRPC Server Interceptor| Handler["Business Logic Servicer"]
```

### Credential Taxonomy & Comparison

| Dimension | Channel Credentials (TLS / mTLS) | Call Credentials (Metadata Auth) |
| :--- | :--- | :--- |
| **Lifecycle** | Connection establishment (TLS Handshake) | Per-call invocation (HTTP/2 Header Frames) |
| **Mechanism** | X.509 Certificates (Private CA, SANs) | Signed JWTs, OAuth2 Tokens, API Keys |
| **Identity Level** | Service Identity (e.g., `spiffe://cluster.local/ns/prod/sa/order-svc`) | End-User / Principal Identity (`sub: "usr_4812"`) |
| **Enforcement Point** | Socket transport engine (C-Core / OpenSSL / Go crypto/tls) | gRPC Server Interceptors |
| **Tamper Resistance** | Cryptographic session encryption prevents MitM | Asymmetric digital signatures (RS256/ES256) |
| **Insecure Channels** | Disables all encryption (`grpc.insecure_channel`) | **Blocked by default**: gRPC refuses tokens over plaintext |

---

## 2. Server Interceptors: Fail-Closed Architecture

All incoming RPCs pass through a global interceptor before reaching service logic. If an interceptor fails open, unauthorized requests will silently penetrate handlers.

```mermaid
flowchart TD
    Req["Incoming RPC Call"] --> ExtCheck{"Is Method in Exempt Set?<br/>(/grpc.health.v1.Health/Check)"}
    ExtCheck -->|Yes| Bypass["Bypass Auth: Allow Health Probes to Pass"]
    ExtCheck -->|No| CheckHeader{"Header 'authorization' Present?<br/>(Must be lowercase!)"}
    
    CheckHeader -->|No / Capitalized| Deny["ABORT: Code UNAUTHENTICATED (16)<br/>Do NOT invoke continuation()"]
    CheckHeader -->|Yes| VerifyToken{"Verify JWT Signature & Expiry"}
    
    VerifyToken -->|Invalid / Expired| Deny
    VerifyToken -->|Valid| AttachContext["Inject Claims & Peer Identity into Context"]
    AttachContext --> Continue["Invoke continuation() -> Handler Executes"]
```

### gRPC Status Codes for Security Violations

| Status Code | Enum Integer | Exact Semantic | When to Use |
| :--- | :--- | :--- | :--- |
| `UNAUTHENTICATED` | `16` | Missing, malformed, or expired credentials | Token invalid, signature failed, missing header. |
| `PERMISSION_DENIED` | `7` | Valid identity, but caller lacks permissions | Valid user attempting admin operation. |
| `NOT_FOUND` | `5` | Resource does not exist | **Defense-in-depth**: Return `NOT_FOUND` instead of `PERMISSION_DENIED` if revealing existence leaks confidential data. |

---

## 3. Production War Story: The Health Check Blackout Outage

```mermaid
sequenceDiagram
    autonumber
    participant AWS_ALB as AWS Application Load Balancer
    participant Interceptor as Production Auth Interceptor
    participant HealthSvc as grpc.health.v1.Health
    participant K8s as Kubernetes Ingress / Nodes

    Note over Interceptor: PR Merged: "Enforce JWT on all gRPC routes"
    AWS_ALB->>Interceptor: Health Check Probe: /grpc.health.v1.Health/Check
    Note over Interceptor: Interceptor does NOT exempt health check path!
    Interceptor-->>AWS_ALB: UNAUTHENTICATED (16): Missing Bearer Token
    AWS_ALB->>AWS_ALB: Marks Pod 1 UNHEALTHY
    AWS_ALB->>Interceptor: Probes Pod 2, Pod 3, Pod 4...
    Interceptor-->>AWS_ALB: UNAUTHENTICATED (16) across entire cluster
    AWS_ALB->>K8s: 0 Healthy Backends! Dropping 100% of Production Traffic!
    Note over AWS_ALB,K8s: OUTAGE: 502 Bad Gateway across all customer endpoints!
```

### Incident Post-Mortem

- **Root Cause**: An auth interceptor was refactored to enforce bearer tokens unconditionally. The developer omitted an exemption whitelist for the standard gRPC Health Checking Protocol (`/grpc.health.v1.Health/Check`).
- **The Cascade**: Within 30 seconds, the cloud load balancers received `UNAUTHENTICATED` responses to health probes, concluded all backend pods were dead, and removed all instances from rotation.
- **The Fix**:
  1. Updated the interceptor to maintain an immutable set of unauthenticated route exemptions (`/grpc.health.v1.Health/Check`, `/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo`).
  2. Implemented CI automated smoke tests that explicitly dial health endpoints over mTLS without bearer tokens.

---

## 4. Multi-Language Implementation: mTLS Server & Auth Interceptor

Below is the complete implementation of:
1. Mutual TLS (requiring CA verification of client certificates).
2. Extracting client SAN identity from TLS context.
3. A fail-closed bearer token auth interceptor with health check exemption.

````carousel
```go
// secure_server.go (Go Implementation)
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"

	pb "github.com/backendroadmap/gen/shop/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func AuthInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	// 1. Mandatory Exemption for Health Checks
	if info.FullMethod == "/grpc.health.v1.Health/Check" {
		return handler(ctx, req)
	}

	// 2. Extract lower-cased metadata
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "metadata missing")
	}

	authHeaders := md.Get("authorization")
	if len(authHeaders) == 0 || !strings.HasPrefix(authHeaders[0], "Bearer ") {
		return nil, status.Error(codes.Unauthenticated, "bearer token required")
	}

	token := strings.TrimPrefix(authHeaders[0], "Bearer ")
	if token != "secret-production-token" {
		return nil, status.Error(codes.Unauthenticated, "invalid or expired token")
	}

	return handler(ctx, req)
}

func main() {
	// Load Server Certificate & Key
	serverCert, err := tls.LoadX509KeyPair("server.crt", "server.key")
	if err != nil {
		panic(err)
	}

	// Load CA pool for client certificate validation (mTLS)
	caCert, err := os.ReadFile("ca.crt")
	if err != nil {
		panic(err)
	}
	caPool := x509.NewCertPool()
	caPool.AppendCertsFromPEM(caCert)

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientAuth:   tls.RequireAndVerifyClientCert, // Enforces mTLS
		ClientCAs:    caPool,
	}

	s := grpc.NewServer(
		grpc.Creds(credentials.NewTLS(tlsConfig)),
		grpc.UnaryInterceptor(AuthInterceptor),
	)

	// Register Health Service
	healthServer := health.NewServer()
	healthpb.RegisterHealthServer(s, healthServer)
	healthServer.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)

	lis, _ := net.Listen("tcp", ":50051")
	fmt.Println("Secure mTLS gRPC Server listening on :50051")
	s.Serve(lis)
}
```
<!-- slide -->
```typescript
// secureServer.ts (Node.js / TypeScript Implementation)
import * as fs from 'fs';
import * as grpc from '@grpc/grpc-js';
import { ServerUnaryCall, sendUnaryData, status } from '@grpc/grpc-js';

const serverCert = fs.readFileSync('server.crt');
const serverKey = fs.readFileSync('server.key');
const caCert = fs.readFileSync('ca.crt');

// Fail-closed Auth Interceptor definition
function authInterceptor(
  call: ServerUnaryCall<any, any>,
  methodDefinition: any,
  next: (call: ServerUnaryCall<any, any>) => void
) {
  const methodPath = methodDefinition.path;

  // 1. Exempt health checks
  if (methodPath === '/grpc.health.v1.Health/Check') {
    return next(call);
  }

  // 2. Validate metadata
  const md = call.metadata.getMap();
  const authHeader = md['authorization'] as string; // gRPC normalizes to lowercase

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return call.emit('error', {
      code: status.UNAUTHENTICATED,
      details: 'Missing or invalid Bearer token',
    });
  }

  const token = authHeader.substring(7);
  if (token !== 'secret-production-token') {
    return call.emit('error', {
      code: status.UNAUTHENTICATED,
      details: 'Token signature or expiration invalid',
    });
  }

  next(call);
}

const server = new grpc.Server();

// Configure mTLS credentials (requireClientCert = true)
const credentials = grpc.ServerCredentials.createSsl(
  caCert,
  [{ private_key: serverKey, cert_chain: serverCert }],
  true // checkClientCertificate (Enforces mTLS)
);

server.bindAsync('0.0.0.0:50051', credentials, (err, port) => {
  if (err) throw err;
  console.log(`mTLS Server running on port ${port}`);
  server.start();
});
```
<!-- slide -->
```python
# secure_server.py (Python Implementation)
from concurrent import futures
import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from gen.shop.v1 import order_pb2, order_pb2_grpc

class AuthInterceptor(grpc.ServerInterceptor):
    def __init__(self, exempt_methods=None):
        self._exempt = set(exempt_methods or [])
        self._deny = grpc.unary_unary_rpc_method_handler(
            lambda req, ctx: ctx.abort(grpc.StatusCode.UNAUTHENTICATED, "Missing or invalid token")
        )

    def intercept_service(self, continuation, handler_call_details):
        # 1. Exempt Health Check routes
        if handler_call_details.method in self._exempt:
            return continuation(handler_call_details)

        # 2. Extract lower-cased metadata
        md = dict(handler_call_details.invocation_metadata or ())
        auth = md.get("authorization", "")

        if not auth.startswith("Bearer ") or auth[7:] != "secret-production-token":
            return self._deny # Short-circuit: fails closed

        return continuation(handler_call_details)

def serve():
    with open("server.key", "rb") as f: server_key = f.read()
    with open("server.crt", "rb") as f: server_crt = f.read()
    with open("ca.crt", "rb") as f: ca_crt = f.read()

    # mTLS configuration: key first in tuple, require_client_auth=True
    server_creds = grpc.ssl_server_credentials(
        [(server_key, server_crt)],
        root_certificates=ca_crt,
        require_client_auth=True
    )

    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=10),
        interceptors=[AuthInterceptor(exempt_methods=["/grpc.health.v1.Health/Check"])]
    )

    # Add Health Service
    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)

    server.add_secure_port("[::]:50051", server_creds)
    print("Serving secure mTLS gRPC on [::]:50051")
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
```
````

---

## 5. Practical Hands-On Verification CLI

### Step 1: Generate mTLS PKI with SAN Extensions

```bash
# 1. Generate Development CA
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout ca.key -out ca.crt -subj "/CN=Dev-Root-CA"

# 2. Generate Server Cert signed by CA (SAN: localhost)
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=localhost"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365 -extfile <(printf "subjectAltName=DNS:localhost,IP:127.0.0.1")

# 3. Generate Client Cert signed by CA (SAN: orders-worker)
openssl req -newkey rsa:2048 -nodes -keyout client.key -out client.csr -subj "/CN=orders-client"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 365 -extfile <(printf "subjectAltName=DNS:orders-worker")
```

### Step 2: Probe Health Endpoint via `grpcurl` (Exempt Route)

Confirm that health probes succeed with mTLS certificates even **without** a bearer token:

```bash
grpcurl -cacert ca.crt -cert client.crt -key client.key \
  localhost:50051 grpc.health.v1.Health/Check
```

```json
{
  "status": "SERVING"
}
```

### Step 3: Verify Auth Interceptor Rejection (No Bearer Token)

Attempt to call a protected business method without credentials:

```bash
grpcurl -cacert ca.crt -cert client.crt -key client.key \
  -d '{"id": "ORD-1"}' \
  localhost:50051 shop.v1.OrderService/GetOrder
```

```text
ERROR:
  Code: Unauthenticated
  Message: Missing or invalid token
```

### Step 4: Call Protected Service with Composite Credentials

Supply the lowercase authorization header metadata:

```bash
grpcurl -cacert ca.crt -cert client.crt -key client.key \
  -H "authorization: Bearer secret-production-token" \
  -d '{"id": "ORD-1"}' \
  localhost:50051 shop.v1.OrderService/GetOrder
```

```json
{
  "id": "ORD-1",
  "quantity": 10,
  "status": "ORDER_STATUS_PENDING"
}
```

---

## 6. Operational Validation Checkpoints

<details>
<summary><strong>Checkpoint 1: Why does gRPC silently ignore the legacy Common Name (CN) field during peer identity inspection?</strong></summary>

**RFC Compliance:**
Per RFC 6125 and modern TLS security standards (TLS 1.3), the `CommonName` attribute in X.509 certificates has been formally deprecated for host identification. Attackers previously exploited ambiguous CN parsing to bypass host matching. gRPC's underlying TLS engine requires valid Subject Alternative Name (`subjectAltName` / SAN) extensions. `context.peer_identities()` extracts SAN DNS and URI entries; if a cert contains only a CN, `peer_identities()` returns an empty list.
</details>

<details>
<summary><strong>Checkpoint 2: Why must an auth interceptor return a short-circuit handler rather than raising an uncaught exception?</strong></summary>

**gRPC Interceptor Mechanics:**
In gRPC server architectures, calling `continuation(handler_call_details)` delegates execution to the actual service handler. If an interceptor detects an invalid token and simply logs a warning or raises an unhandled generic exception, the RPC thread may crash or cascade into internal server errors (`UNKNOWN` / `INTERNAL`). Returning an explicit `grpc.unary_unary_rpc_method_handler` with `context.abort(StatusCode.UNAUTHENTICATED)` immediately terminates the call safely, sends an HTTP/2 `RST_STREAM` or error trailers frame, and protects backend business logic.
</details>

<details>
<summary><strong>Checkpoint 3: Why does gRPC refuse to transmit call credentials over an `insecure_channel`?</strong></summary>

**Fail-Closed Credential Leak Prevention:**
Call credentials typically encapsulate long-lived or sensitive bearer tokens (JWTs, OAuth2 access tokens). If gRPC permitted these to be appended to an unencrypted plaintext HTTP/2 channel, any intermediate network proxy, packet sniffer, or rogue actor on the local network could harvest those credentials. gRPC mandates that composite channel credentials can only be attached to channels backed by valid TLS credentials.
</details>
