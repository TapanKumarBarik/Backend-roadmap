# Capstone: Production-Grade Resilient Identity & Access Gateway

> [!TIP]
> **The Golden Rule:** A production authentication and authorization gateway must provide unified identity abstraction across heterogeneous clients. Whether a request originates from a browser with `HttpOnly` session cookies or an external machine via an `Authorization: Bearer` JWT, both must resolve into a single, immutable `Principal` domain object before any business handler is reached.

---

## 1. System Architecture: The Unified Auth & Authorization Gateway

This capstone integrates every defense mastered in Track 3 into a single, cohesive security boundary:

```mermaid
flowchart TD
    Browser["Web Browser (Cookies)"] --> Ingress["Ingress / Load Balancer"]
    APIClient["API / Mobile Client (Bearer JWT)"] --> Ingress
    
    Ingress --> RateLimiter["1. Sliding-Window Rate Limiter\n(Dual IP + Account Velocity)"]
    RateLimiter --> AuthGate{"2. Identity Resolver\n(Cookie Session or Bearer JWT?)"}
    
    subgraph IdentityResolution ["Stage 1: Unified Authentication"]
        AuthGate -- "Has sid Cookie" --> SessionValidator["Session Engine:\nVerify sid in Redis -> Resolve User"]
        AuthGate -- "Has Bearer JWT" --> JWTValidator["JWT Engine:\nVerify RS256 Signature + Check JTI Denylist"]
        AuthGate -- "Neither / Invalid" --> Anonymous["Unauthenticated Context"]
    end
    
    SessionValidator & JWTValidator --> PrincipalBuilder["Construct Immutable Principal\n{ UserID, TenantID, Roles, Scopes }"]
    
    subgraph AccessControl ["Stage 2: Authorization & BOLA Defense"]
        PrincipalBuilder --> PolicyEngine{"Role & Scope Check\n(RBAC / ABAC Policies)"}
        PolicyEngine -- Insufficient Permissions --> Err403["403 Forbidden"]
        PolicyEngine -- Authorized --> ScopedQuery["Data Layer Scoping:\nWHERE id = :id AND tenant_id = :tenant_id"]
    end
    
    ScopedQuery --> BusinessHandler["Execute Business Logic"]
    Anonymous --> PublicOnly{"Route Public?"}
    PublicOnly -- No --> Err401["401 Unauthorized\nWWW-Authenticate: Bearer"]
    PublicOnly -- Yes --> BusinessHandler

    classDef proc fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef check fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef reject fill:#ef4444,stroke:#991b1b,stroke-width:2px,color:#fff;
    classDef success fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;

    class Browser,APIClient,Ingress,SessionValidator,JWTValidator,PrincipalBuilder,ScopedQuery,BusinessHandler proc;
    class RateLimiter,AuthGate,PolicyEngine,PublicOnly check;
    class Err403,Err401 reject;
```

---

## 2. Security Invariants & Acceptance Specification

| Component | Invariant Requirement | Failure Mode & Defense |
| :--- | :--- | :--- |
| **Password Storage** | Argon2id ($m=65536, t=3, p=4$) with CSPRNG 128-bit salt | Pre-computed dummy hash computation on non-existent accounts to eliminate timing oracles |
| **Multi-Factor Auth** | RFC 6238 TOTP with single-use replay prevention | Redis `SETNX` burns consumed 6-digit codes for the 30-second window |
| **Session Cookies** | `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`, 128-bit CSPRNG | Session ID rotated immediately upon authentication to eliminate session fixation |
| **JWT Access Tokens** | Short-lived (10 mins), asymmetric RS256/ES256, explicit algorithm pinning | Refresh token rotation with immediate family invalidation on detected reuse |
| **Authorization Layer** | Deny-by-default, object-level scoping (`WHERE id = :id AND tenant_id = :tenant_id`) | Constant `404 Not Found` returned on missing or cross-tenant objects to prevent enumeration |

---

## 3. Production War Story: The Dual-Auth Session Desynchronization

### The Incident
A enterprise B2B SaaS platform supported both single-page application (SPA) browser sessions and API access via JWTs. An enterprise client reported that an employee fired for fraud was still accessing proprietary contracts via their automated Zapier integration.

When the customer administrator pressed "Suspend User" in the admin dashboard:
1. The backend executed `DELETE FROM sessions WHERE user_id = :id`, successfully terminating the user's browser cookie sessions.
2. However, the user had previously generated a 30-day API JWT token for third-party integrations.
3. Because the API gateway verified JWTs purely statelessly without consulting a central revocation list or token version timestamp, the terminated employee continued querying sensitive corporate endpoints via their API token for two weeks.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Corporate Admin
    actor Rogue as Fired Rogue Employee
    participant Web as Web Dashboard Backend
    participant Gateway as API Gateway (Stateless)
    participant Redis as Central Revocation Cache

    Admin->>Web: POST /v1/users/42/suspend
    Web->>Web: Deletes Cookie Sessions in DB OK!
    Note over Web: BUG: Failed to broadcast JWT Revocation / Token Version Increment!
    Rogue->>Gateway: GET /v1/contracts (Authorization: Bearer <30-day JWT>)
    Gateway->>Gateway: Verify RS256 Signature (Valid!)<br/>Check Expiration (Valid for 14 more days!)
    Gateway-->>Rogue: 200 OK + Confidential Contract PDF Data Dump!
```

### The Root Cause
1. **Asymmetric Revocation:** The platform maintained separate lifecycle semantics for cookies (stateful, instantly revocable) and JWTs (stateless, non-revocable).
2. **Missing Distributed Revocation Signal:** The user suspension workflow failed to publish a revocation event or update a Redis `user_token_version` timestamp.

### The Verified Fix
- **Unified Revocation Pipeline:** Whenever an account is suspended or has its password changed, publish an invalidation event that writes `revoked_before:<user_id> = now()` in a distributed Redis cache.
- **Enforce Revocation Checks at API Edge:** The API gateway's JWT validation pipeline compares the token's `iat` (issued at) claim against the user's `revoked_before` timestamp. If $iat \le \text{revoked\_before}$, reject with `401 Unauthorized`.

---

## 4. Multi-Language Production Implementation

### Go: Unified Identity Resolver & Dual Auth Gateway

```go
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

type PrincipalContextKey struct{}

type Principal struct {
	UserID   string   `json:"user_id"`
	TenantID string   `json:"tenant_id"`
	Roles    []string `json:"roles"`
	AuthType string   `json:"auth_type"` // "session" or "jwt"
}

// UnifiedAuthMiddleware inspects both cookies and Bearer headers
func UnifiedAuthMiddleware(sessionStore map[string]Principal, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var principal *Principal

		// 1. Check for Bearer Token
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			p, err := resolveJWT(token)
			if err == nil {
				principal = p
			}
		}

		// 2. Check for Session Cookie if no valid Bearer token
		if principal == nil {
			if cookie, err := r.Cookie("__Host-sid"); err == nil {
				if p, exists := sessionStore[cookie.Value]; exists {
					principal = &p
				}
			}
		}

		if principal != nil {
			ctx := context.WithValue(r.Context(), PrincipalContextKey{}, principal)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		next.ServeHTTP(w, r)
	})
}

func resolveJWT(token string) (*Principal, error) {
	if token == "valid-mock-jwt-token" {
		return &Principal{
			UserID:   "usr_api_99",
			TenantID: "tenant_acme",
			Roles:    []string{"editor"},
			AuthType: "jwt",
		}, nil
	}
	return nil, errors.New("invalid token")
}

// RequirePermission verifies role and scopes (AuthZ)
func RequirePermission(requiredRole string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := r.Context().Value(PrincipalContextKey{}).(*Principal)
		if !ok || principal == nil {
			w.Header().Set("WWW-Authenticate", `Bearer error="unauthorized"`)
			http.Error(w, `{"error":"unauthenticated"}`, http.StatusUnauthorized)
			return
		}

		hasRole := false
		for _, role := range principal.Roles {
			if role == requiredRole || role == "admin" {
				hasRole = true
				break
			}
		}

		if !hasRole {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}

		next(w, r)
	}
}

func DocumentHandler(w http.ResponseWriter, r *http.Request) {
	principal := r.Context().Value(PrincipalContextKey{}).(*Principal)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"message":   "Access granted to protected resource",
		"principal": principal,
	})
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	sessionStore := map[string]Principal{
		"sess_cookie_abc": {
			UserID:   "usr_web_12",
			TenantID: "tenant_acme",
			Roles:    []string{"admin"},
			AuthType: "session",
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/v1/documents", RequirePermission("editor", DocumentHandler))

	pipeline := UnifiedAuthMiddleware(sessionStore, mux)

	logger.Info("Auth Gateway active on :8080")
	_ = http.ListenAndServe(":8080", pipeline)
}
```

---

### Node.js (TypeScript): Complete Anti-Fixation & Scoped Access Engine

```typescript
import express, { Request, Response, NextFunction } from 'express';

export interface UserPrincipal {
  userId: string;
  tenantId: string;
  role: 'viewer' | 'editor' | 'admin';
  authType: 'cookie' | 'bearer';
}

declare global {
  namespace Express {
    interface Request {
      principal?: UserPrincipal;
    }
  }
}

const app = express();
app.use(express.json());

// In-memory mock sessions
const sessionDB = new Map<string, UserPrincipal>([
  ['s_cookie_123', { userId: 'usr_1', tenantId: 'tenant_omega', role: 'admin', authType: 'cookie' }],
]);

// 1. Unified Authentication Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === 'jwt_token_valid') {
      req.principal = { userId: 'usr_2', tenantId: 'tenant_omega', role: 'editor', authType: 'bearer' };
      return next();
    }
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/__Host-sid=([^;]+)/);
    if (match && sessionDB.has(match[1])) {
      req.principal = sessionDB.get(match[1]);
      return next();
    }
  }

  next();
});

// 2. Object-Level BOLA Defense Middleware
function requireResourceOwnership(req: Request, res: Response, next: NextFunction) {
  if (!req.principal) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const resourceId = req.params.id;
  // Simulated database lookup with tenant and owner check
  const document = { id: 'doc_99', tenantId: 'tenant_omega', ownerId: 'usr_2', content: 'Secret' };

  if (document.tenantId !== req.principal.tenantId) {
    return res.status(404).json({ error: 'Document not found' }); // Constant 404
  }

  if (req.principal.role !== 'admin' && document.ownerId !== req.principal.userId) {
    return res.status(404).json({ error: 'Document not found' });
  }

  (req as any).document = document;
  next();
}

app.get('/v1/documents/:id', requireResourceOwnership, (req: Request, res: Response) => {
  res.json({ document: (req as any).document, accessedBy: req.principal });
});

app.listen(3000, () => console.log('Auth Gateway listening on port 3000'));
```

---

### Python: FastAPI Complete Dual-Auth & Object Authorization

```python
from typing import Annotated, Optional
from fastapi import FastAPI, Depends, HTTPException, Request, Header, Cookie, status
from pydantic import BaseModel

app = FastAPI(title="Capstone Identity Gateway")

class Principal(BaseModel):
    user_id: str
    tenant_id: str
    role: str
    auth_method: str

# Mock Session DB
active_sessions = {
    "sess_alpha_99": Principal(user_id="usr_web_1", tenant_id="tenant_x", role="admin", auth_method="session"),
}

async def get_current_principal(
    request: Request,
    authorization: Annotated[Optional[str], Header()] = None,
    sid: Annotated[Optional[str], Cookie(alias="__Host-sid")] = None,
) -> Principal:
    # 1. Bearer JWT Path
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        if token == "mock_jwt_token_secret":
            return Principal(user_id="usr_api_2", tenant_id="tenant_x", role="editor", auth_method="jwt")

    # 2. Stateful Cookie Session Path
    if sid and sid in active_sessions:
        return active_sessions[sid]

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid authentication credential",
        headers={"WWW-Authenticate": "Bearer"},
    )

def require_role(allowed_roles: list[str]):
    def checker(principal: Annotated[Principal, Depends(get_current_principal)]) -> Principal:
        if principal.role not in allowed_roles and principal.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return principal
    return checker

@app.get("/v1/secure/summary")
async def get_summary(
    principal: Annotated[Principal, Depends(require_role(["editor", "admin"]))]
):
    return {
        "status": "success",
        "principal": principal.model_dump(),
    }
```

---

## 5. Practical Hands-On Verification Matrix

Execute these commands to verify that both session cookies and JWT bearer tokens correctly resolve into authenticated principals.

### Step 1: Query Protected Endpoint with Bearer JWT
```bash
curl.exe -i http://localhost:8080/v1/documents \
  -H "Authorization: Bearer valid-mock-jwt-token"
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Access granted to protected resource",
  "principal": {
    "user_id": "usr_api_99",
    "tenant_id": "tenant_acme",
    "roles": ["editor"],
    "auth_type": "jwt"
  }
}
```

### Step 2: Query Protected Endpoint with Session Cookie
```bash
curl.exe -i http://localhost:8080/v1/documents \
  -H "Cookie: __Host-sid=sess_cookie_abc"
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "message": "Access granted to protected resource",
  "principal": {
    "user_id": "usr_web_12",
    "tenant_id": "tenant_acme",
    "roles": ["admin"],
    "auth_type": "session"
  }
}
```

### Step 3: Reject Unauthenticated Request
```bash
curl.exe -i http://localhost:8080/v1/documents
```
**Expected Response:**
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="unauthorized"

{"error":"unauthenticated"}
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: The Danger of Storing JWTs in Browser LocalStorage</b></summary>

**Scenario:** A frontend development team suggests storing JWT access tokens in the browser's `localStorage` because "it avoids dealing with CSRF tokens and cookies". What catastrophic vulnerability does this expose?

**Correct Analysis:** Vulnerability to Cross-Site Scripting (XSS). Any third-party npm dependency or injected inline script can execute `localStorage.getItem('jwt_token')` and instantly exfiltrate the user's credential to an attacker server. Session cookies with `HttpOnly` cannot be read or exfiltrated by JavaScript, restricting XSS attacks to the local origin session.
</details>

<details>
<summary><b>Checkpoint 2: The Unified Error Envelope Across Failure Modes</b></summary>

**Scenario:** An API returns `401 {"error": "Invalid password"}` when a password fails, and `404 {"error": "Account does not exist"}` when an email fails. What security flaw does this create?

**Correct Analysis:** Account Enumeration. Threat actors can determine whether an email is registered by simply inspecting the HTTP status code. Both conditions must return an identical `401 Unauthorized` with the generic body `{"detail": "Invalid email or password"}` and uniform processing latency.
</details>

<details>
<summary><b>Checkpoint 3: The Threat of Missing Token Family Invalidation</b></summary>

**Scenario:** An authorization server implements refresh token rotation: each refresh token can only be used once. A client presents Refresh Token A and receives Refresh Token B. Ten minutes later, an attacker presents Refresh Token A again. What must the server do?

**Correct Analysis:** Trigger immediate **Token Reuse / Replay Revocation**. The presentation of an already-invalidated refresh token proves that a credential leak or token theft took place. The authorization server must revoke Refresh Token B, all issued access tokens, and invalidate the entire user's session family, requiring manual re-authentication with password and MFA.
</details>

---

## Further Reading & Sources

- [OWASP API Security Top 10 Full Document](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- [NIST SP 800-63B: Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [RFC 8725: JSON Web Token Best Current Practices](https://datatracker.ietf.org/doc/html/rfc8725)

---

## Next Steps

Congratulations! You have completed **Step 3: Authentication and Authorization**. Next, advance to **Step 4: Databases and Data Layer**:
[../../04-databases-and-data-layer/00-relational-vs-non-relational/README.md](../../04-databases-and-data-layer/00-relational-vs-non-relational/README.md)
Master ACID transaction isolation levels, connection pooling under high load, B-Tree and GIN indexing, deadlock mitigation, and zero-downtime database schema migrations.
