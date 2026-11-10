# JWT Deep Dive: Cryptographic Signatures, Vulnerabilities & Token Rotation

> [!TIP]
> **The Golden Rule:** A JWT is signed, **not encrypted**. Anyone can read the payload; the signature only guarantees integrity. Never trust the `alg` header supplied by an untrusted client, never use symmetric secrets across untrusted microservices (prefer asymmetric RS256/ES256), and always pair short-lived access tokens (5–15 mins) with rotating refresh tokens backed by replay detection.

---

## 1. Visual Mental Model: The JWT Anatomy & Verification Pipeline

A JSON Web Token (RFC 7519) consists of three Base64URL-encoded strings separated by periods (`.`):

```
┌─────────────────────────┐ . ┌─────────────────────────┐ . ┌─────────────────────────┐
│         HEADER          │   │         PAYLOAD         │   │        SIGNATURE        │
│ {"alg":"RS256",...}     │   │ {"sub":"usr_42",...}    │   │ Cryptographic Signature │
└─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

```mermaid
flowchart TD
    RawToken["Bearer Token: Header.Payload.Signature"] --> Parser["Split on '.' & Decode Header"]
    
    Parser --> AlgCheck{"Algorithm Whitelisted?\n(e.g., MUST be RS256)"}
    AlgCheck -- "No (e.g. alg='none' or 'HS256')" --> RejectAlg["401 Unauthorized: Disallowed Algorithm"]
    
    AlgCheck -- Yes --> CryptoVerify{"Verify Signature against\nPublic Key (RS256)"}
    CryptoVerify -- Invalid Signature --> RejectSig["401 Unauthorized: Cryptographic Tampering"]
    
    CryptoVerify -- Valid --> TimeCheck{"Current Time within\nnbf < now < exp?"}
    TimeCheck -- Expired --> RejectExp["401 Unauthorized: Token Expired"]
    
    TimeCheck -- Valid --> RevocationCheck{"Check jti / user_id\nin Redis Revocation List?"}
    RevocationCheck -- Blacklisted --> RejectRevoked["401 Unauthorized: Token Revoked"]
    
    RevocationCheck -- Clean --> Authorize["Extract Claims (sub, roles, tenant) -> Context"]

    classDef reject fill:#ef4444,stroke:#991b1b,stroke-width:2px,color:#fff;
    classDef success fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef check fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    
    class RejectAlg,RejectSig,RejectExp,RejectRevoked reject;
    class Authorize success;
    class AlgCheck,CryptoVerify,TimeCheck,RevocationCheck check;
```

---

## 2. Cryptographic Signing: Symmetric vs Asymmetric

| Dimension | Symmetric Signing (`HS256`) | Asymmetric Signing (`RS256` / `ES256`) |
| :--- | :--- | :--- |
| **Key Type** | Single shared secret string | Public Key / Private Key pair |
| **Minting Key** | Shared Secret | Private Key (Held exclusively by Auth Server) |
| **Verification Key** | Shared Secret (Every verifying service must know it) | Public Key (Published via JWKS endpoint, safe to share) |
| **Blast Radius** | **Critical:** If one backend service leaks the secret, attackers can mint valid tokens for the entire system | **Isolated:** Verifying services only hold the public key; private key remains secured in KMS |
| **Computational Cost** | Extremely low CPU overhead (~microseconds) | Higher CPU cost for RSA/ECDSA verification |
| **Recommended Usage** | Monoliths where one service both creates and verifies | Distributed microservices, mobile apps, third-party consumers |

---

## 3. Production War Story: The Public Key HMAC Confusion Breach

### The Incident
A distributed financial platform converted their monolithic authentication system to microservices. The central identity provider signed tokens using **RS256** (RSA signature with SHA-256). Resource services retrieved the identity provider's public key from `https://auth.company.internal/.well-known/jwks.json` to verify incoming tokens.

An external security researcher inspected an open-source client library and crafted an authentication bypass:
1. They forged a JWT payload claiming `"sub": "admin_root"`, `"role": "superadmin"`.
2. They modified the header to: `{"alg": "HS256", "typ": "JWT"}`.
3. They signed this token using the **public RSA key** (formatted as a PEM string) as the HMAC shared secret.
4. When the resource server called `jwt.verify(token, rsaPublicKey)`, the naive library read `alg: "HS256"` from the token header, treated the provided `rsaPublicKey` as a symmetric byte string, verified the HMAC-SHA256 signature, and granted full root access to the researcher.

```mermaid
sequenceDiagram
    autonumber
    actor Attacker as Malicious Actor
    participant IdP as Auth Identity Provider
    participant Svc as Downstream Microservice

    Note over Attacker,IdP: Attacker fetches IdP's Public RSA Key (Publicly Accessible)
    Attacker->>Attacker: Create Header: {"alg": "HS256"}<br/>Payload: {"sub": "root", "role": "admin"}
    Attacker->>Attacker: Sign token using HMAC-SHA256(rsa_public_key.pem)
    Attacker->>Svc: GET /v1/admin/vault<br/>Authorization: Bearer <forged_token>
    Note over Svc: Server calls jwt.verify(token, pubKey)<br/>Vulnerable library honors token's "alg": "HS256"<br/>Uses pubKey string as HMAC secret -> Signature Valid!
    Svc-->>Attacker: 200 OK + Full Admin Privileges Granted!
```

### The Root Cause
1. **Header Algorithm Trust:** The server allowed the untrusted client token to dictate which cryptographic algorithm to execute.
2. **Key Type Mismatch:** The validation library permitted an asymmetric RSA public key to be interpreted as a symmetric HMAC shared secret.

### The Verified Fix
- **Hardcode Expected Algorithms:** Never let the token header select the algorithm. Explicitly pass `algorithms=["RS256"]` to the verification function.
- **Enforce Key Type Assertions:** Ensure the verification function strictly verifies that an RSA public key can only be used with `RS256`/`RS512` algorithms.

---

## 4. Multi-Language Production Implementation

### Go: Secure Asymmetric JWT Verification & Strict Algorithm Enforcement

```go
package main

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type CustomClaims struct {
	UserID string   `json:"user_id"`
	Roles  []string `json:"roles"`
	jwt.RegisteredClaims
}

type JWTVerifier struct {
	publicKey *rsa.PublicKey
}

func NewJWTVerifier(pubKeyPEM string) (*JWTVerifier, error) {
	block, _ := pem.Decode([]byte(pubKeyPEM))
	if block == nil {
		return nil, errors.New("failed to parse PEM block containing the public key")
	}

	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}

	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("key is not of type *rsa.PublicKey")
	}

	return &JWTVerifier{publicKey: rsaPub}, nil
}

func (v *JWTVerifier) VerifyToken(tokenString string) (*CustomClaims, error) {
	// Parse with strict algorithm enforcement (Eliminates Key Confusion and alg:none)
	token, err := jwt.ParseWithClaims(tokenString, &CustomClaims{}, func(t *jwt.Token) (any, error) {
		// Non-negotiable: Enforce expected signing method
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing algorithm: %v", t.Header["alg"])
		}
		return v.publicKey, nil
	}, jwt.WithValidMethods([]string{"RS256"})) // Hard whitelist

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*CustomClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}

func AuthMiddleware(verifier *JWTVerifier, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
			http.Error(w, `{"error":"missing_bearer_token"}`, http.StatusUnauthorized)
			return
		}

		rawToken := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := verifier.VerifyToken(rawToken)
		if err != nil {
			slog.Warn("JWT verification rejected", "error", err)
			w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		slog.Info("Request authorized", "user_id", claims.UserID)
		next(w, r)
	}
}
```

---

### Node.js (TypeScript): Secure Verification & Refresh Token Rotation

```typescript
import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';

interface UserPayload extends JwtPayload {
  userId: string;
  role: string;
}

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'strong-secret-key-min-32-chars';

// Refresh Token Storage with Replay / Theft Detection
interface RefreshTokenFamily {
  userId: string;
  familyId: string;
  currentJti: string;
}

const activeRefreshTokens = new Map<string, RefreshTokenFamily>(); // jti -> Family

export function mintTokenPair(userId: string, role: string) {
  // 1. Short-lived Access Token (15 minutes)
  const accessToken = jwt.sign({ userId, role }, ACCESS_TOKEN_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
    issuer: 'https://auth.example.com',
    audience: 'https://api.example.com',
  });

  // 2. High-Entropy Refresh Token with JTI
  const jti = crypto.randomBytes(16).toString('hex');
  const familyId = crypto.randomUUID();

  activeRefreshTokens.set(jti, { userId, familyId, currentJti: jti });

  return { accessToken, refreshToken: jti };
}

// Rotate Refresh Token & Detect Token Theft Replays
export function rotateRefreshToken(incomingJti: string, role: string) {
  const family = activeRefreshTokens.get(incomingJti);

  if (!family) {
    // CRITICAL: Token reuse detected! Someone presented an already-invalidated JTI!
    // In production: Revoke ALL active sessions for this compromised account immediately
    throw new Error('TOKEN_THEFT_DETECTED: Session invalidated');
  }

  // Delete consumed JTI immediately (Single-use token)
  activeRefreshTokens.delete(incomingJti);

  // Mint replacement JTI in same family
  const nextJti = crypto.randomBytes(16).toString('hex');
  activeRefreshTokens.set(nextJti, {
    userId: family.userId,
    familyId: family.familyId,
    currentJti: nextJti,
  });

  const nextAccessToken = jwt.sign(
    { userId: family.userId, role },
    ACCESS_TOKEN_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );

  return { accessToken: nextAccessToken, refreshToken: nextJti };
}

// Strict JWT Verification (Algorithms Explicitly Fixed)
export function verifyAccessToken(token: string): UserPayload {
  return jwt.verify(token, ACCESS_TOKEN_SECRET, {
    algorithms: ['HS256'], // Explicit whitelist: Rejects alg:none and key confusion
    issuer: 'https://auth.example.com',
    audience: 'https://api.example.com',
  }) as UserPayload;
}
```

---

### Python: FastAPI Verification with PyJWT & Audience Enforcing

```python
import jwt
from datetime import datetime, timezone, timedelta
from typing import Annotated
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

app = FastAPI(title="Secure JWT Gateway")
security = HTTPBearer()

JWT_SECRET = "super-secret-secure-signing-key-for-fastapi-app-32"
EXPECTED_ISSUER = "https://auth.example.com"
EXPECTED_AUDIENCE = "https://api.example.com"

class TokenClaims(BaseModel):
    sub: str
    roles: list[str]
    exp: int

def verify_token_claims(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(security)]
) -> TokenClaims:
    token = creds.credentials
    try:
        # Mandatory algorithm whitelisting and claims validation
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=["HS256"],  # Hardened whitelist: Never trust token header!
            issuer=EXPECTED_ISSUER,
            audience=EXPECTED_AUDIENCE,
            options={
                "require": ["exp", "iss", "aud", "sub"],
                "verify_exp": True,
            },
        )
        return TokenClaims(
            sub=payload["sub"],
            roles=payload.get("roles", []),
            exp=payload["exp"],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer error=\"invalid_token\""},
        )

@app.get("/v1/secure/data")
async def get_secure_data(claims: Annotated[TokenClaims, Depends(verify_token_claims)]):
    return {
        "status": "authenticated",
        "user_id": claims.sub,
        "roles": claims.roles,
    }
```

---

## 5. Practical Hands-On Verification Matrix

Test token expiration, claim validation, and signature verification via terminal commands.

### Step 1: Query with Valid Bearer Token
```bash
curl.exe -i http://localhost:8080/v1/secure/data \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfNDIiLCJyb2xlcyI6WyJhZG1pbiJdLCJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJhdWQiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsImV4cCI6MTk5OTk5OTk5OX0.e4...sig"
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"authenticated","user_id":"usr_42","roles":["admin"]}
```

### Step 2: Query with Manipulated Payload (Signature Tampering)
```bash
# Changing "usr_42" to "usr_01" without re-signing
curl.exe -i http://localhost:8080/v1/secure/data \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfMDEifQ.tampered_signature"
```
**Expected Response:**
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"
Content-Type: application/json

{"detail":"Invalid token: Signature verification failed"}
```

### Step 3: Query with Expired Token
```bash
curl.exe -i http://localhost:8080/v1/secure/data \
  -H "Authorization: Bearer <expired_token>"
```
**Expected Response:**
```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"

{"detail":"Token has expired"}
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: The alg: none Vulnerability</b></summary>

**Scenario:** An old JWT parser allows tokens with header `{"alg": "none", "typ": "JWT"}` and an empty signature string (`Header.Payload.`). An attacker submits an unauthenticated request with `{"sub": "admin"}`. Why does this result in immediate privilege escalation?

**Correct Analysis:** The RFC 7519 specification originally included the `"none"` algorithm for unsigned debugging tokens. If an implementation parses the header and encounters `"none"`, it skips signature verification entirely and returns the payload as valid. Attackers can trivially forge arbitrary claims without possessing any signing keys. Modern systems prevent this by enforcing a hard whitelist of approved cryptographic algorithms (e.g. only `["RS256"]`).
</details>

<details>
<summary><b>Checkpoint 2: Immediate Logout in Stateless Architectures</b></summary>

**Scenario:** A user clicks "Log Out Everywhere" on a banking portal. The portal uses 1-hour stateless JWTs. A thief who previously intercepted the token continues querying the account API. How can a stateless backend instantly revoke that token before the 1-hour expiration?

**Correct Analysis:** A purely stateless token cannot be revoked without state. Production architectures implement a **Distributed Denylist / Revocation Cache** (in Redis). When the user logs out, the token's unique ID (`jti`) or a revocation timestamp (`revoked_before = now()`) is stored in Redis with a TTL equal to the token's remaining lifetime. Downstream gateways perform an $O(1)$ memory lookup against this denylist during authorization.
</details>

<details>
<summary><b>Checkpoint 3: Refresh Token Replay Detection</b></summary>

**Scenario:** An attacker steals a refresh token from a user's mobile device. The genuine user uses their refresh token to obtain a new access token. Five minutes later, the attacker attempts to use the same refresh token. What should the authorization server do?

**Correct Analysis:** The authorization server must immediately flag a **Token Family Replay Attack**. Under Refresh Token Rotation, each refresh token is strictly single-use. If an already-consumed token is presented a second time, it indicates that a token was stolen or intercepted. The server must immediately revoke the *entire* token family and all active sessions for that user, forcing a full credential re-authentication.
</details>

---

## Further Reading & Sources

- [RFC 7519: JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 8725: JSON Web Token Best Current Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [Auth0: Critical Vulnerabilities in JSON Web Token Libraries](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/)

---

## Next Steps

Advance to the next module:
[../03-oauth2-and-oidc/README.md](../03-oauth2-and-oidc/README.md)
Master OAuth 2.0 and OpenID Connect (OIDC): Authorization Code Flow with PKCE, Client Credentials, ID tokens vs Access tokens, and Consent management.
