#!/usr/bin/env python3
"""Tag vocabulary + tagger for the curriculum index.

Every indexed .md file gets tags from four independent sources, so no file can
end up untagged:

  1. curriculum  - the top-level folder (backend / learn / lld / genai)
  2. track       - the track folder slug, mapped to a short canonical tag
  3. content     - a curated keyword vocabulary, scored by weighted frequency
  4. format      - structural signals (capstone, quiz, exercises, code fences)

Imported by gen-docs-index.py; also runnable directly to inspect the result:
    python scripts/tags.py backend/04-databases-and-data-layer/README.md
"""
import os
import re
import sys
from collections import Counter

# --------------------------------------------------------------------------
# 1. curriculum-level tags
# --------------------------------------------------------------------------
CURRICULUM = {
    "backend": "backend",
    "learn": "infrastructure",
    "lld": "low-level-design",
    "genai": "genai",
}

# --------------------------------------------------------------------------
# 2. track slug -> canonical tag(s)
#    Keyed by a substring of the track folder name.
# --------------------------------------------------------------------------
TRACK_TAGS = {
    # learn/
    "linux": ["linux", "shell"],
    "docker": ["docker", "containers"],
    "kubernetes": ["kubernetes", "containers"],
    "networking-fundamentals": ["networking"],
    "azure-networking": ["azure", "networking"],
    "azure-container-apps": ["azure", "containers", "paas"],
    "aks": ["azure", "kubernetes"],
    "git-and-version-control": ["git", "version-control"],
    "terraform": ["terraform", "iac", "azure"],
    "cicd-and-gitops": ["ci-cd", "gitops", "automation"],
    "security-deep-dive": ["security"],
    "observability": ["observability", "monitoring"],
    "service-mesh": ["service-mesh", "kubernetes"],
    "databases-and-stateful": ["databases", "kubernetes", "storage"],
    "messaging-and-event-driven": ["messaging", "event-driven"],
    "identity-deep-dive": ["identity", "auth", "azure"],
    "governance-at-scale": ["governance", "azure"],
    "supply-chain-security": ["supply-chain", "security"],
    "api-management": ["api", "azure", "gateway"],
    "sre-practices": ["sre", "reliability"],
    "cost-management": ["finops", "cost"],
    "disaster-recovery": ["disaster-recovery", "chaos-engineering", "reliability"],
    "performance-and-load-testing": ["performance", "load-testing"],
    "platform-engineering": ["platform-engineering"],
    # backend/
    "request-response": ["http", "fundamentals"],
    "api-layer": ["api", "rest"],
    "authentication-and-authorization": ["auth", "security"],
    "databases-and-data-layer": ["databases", "sql"],
    "caching-and-performance": ["caching", "performance"],
    "background-processing": ["async", "queues", "realtime"],
    "search-with-elasticsearch": ["search", "elasticsearch"],
    "observability-and-operational": ["observability", "logging"],
    "distributed-systems": ["distributed-systems"],
    "advanced-api-paradigms": ["api", "grpc", "graphql"],
    "testing-and-code-quality": ["testing", "code-quality"],
    "devops-for-backend": ["devops", "ci-cd"],
    "system-design-interview": ["system-design", "interview"],
    "multi-tenancy-and-saas": ["multi-tenancy", "saas"],
    # lld/
    "programming-basics": ["fundamentals", "python", "csharp"],
    "classes-objects": ["oop"],
    "oop-foundations": ["oop", "uml"],
    "generics-exceptions": ["oop", "generics"],
    "solid-principles": ["solid", "design-principles"],
    "core-design-principles": ["design-principles"],
    "creational-patterns": ["design-patterns", "creational"],
    "structural-patterns": ["design-patterns", "structural"],
    "behavioral-patterns": ["design-patterns", "behavioral"],
    "concurrency": ["concurrency", "threading"],
    "requirements-to-class": ["uml", "modeling"],
    "anti-patterns": ["anti-patterns", "refactoring"],
    "interview-playbook": ["interview"],
    "capstone": ["capstone"],
    "supply-chain-platform": ["capstone", "supply-chain"],
}

# --------------------------------------------------------------------------
# 3. content vocabulary: tag -> regex
#    Patterns are matched case-insensitively against the whole document.
#    A tag is kept only if its weighted score clears MIN_SCORE.
# --------------------------------------------------------------------------
VOCAB = {
    # --- networking -------------------------------------------------------
    "ip-addressing":   r"\b(ip address(es|ing)?|ipv4|ipv6|dotted.decimal|octet)\b",
    "subnetting":      r"\b(subnet(s|ting|ted)?|cidr|netmask|prefix length|block size)\b",
    "supernetting":    r"\b(supernett?ing|route (aggregation|summari[sz]ation)|vlsm|variable length subnet)\b",
    "dns":             r"\b(dns|domain name system|nameserver|resolver|dig |nslookup|ttl)\b",
    "tcp":             r"\b(tcp|three.way handshake|syn|ack\b|sequence number)\b",
    "udp":             r"\budp\b",
    "http":            r"\b(http/?[12]?|status code|request header|response header|keep.alive)\b",
    "tls":             r"\b(tls|ssl|certificate|handshake|x\.509|cipher suite|mtls)\b",
    "routing":         r"\b(routing table|route|next hop|default gateway|longest prefix)\b",
    "routing-protocols": r"\b(ospf|bgp|rip\b|distance.vector|link.state|autonomous system|administrative distance)\b",
    "nat":             r"\b(nat\b|network address translation|snat|dnat|masquerade|port forward)\b",
    "firewall":        r"\b(firewall|iptables|nftables|packet filter|security group|nsg)\b",
    "vpn":             r"\b(vpn|ipsec|tunnel mode|transport mode|strongswan|ike\b|site.to.site)\b",
    "cdn":             r"\b(cdn|content delivery network|edge server|point of presence|cache hit|cache miss)\b",
    "reverse-proxy":   r"\b(reverse proxy|forward proxy|proxy_pass|upstream)\b",
    "load-balancing":  r"\b(load balanc(er|ing)|round robin|least connections|health check|vip\b|sticky session)\b",
    "websocket":       r"\b(websocket|101 switching protocols|long polling)\b",
    "grpc":            r"\b(grpc|protobuf|protocol buffers|unary|bidirectional streaming)\b",
    "high-availability": r"\b(high availability|active.active|active.standby|active.passive|failover|redundan(cy|t))\b",
    # deliberately tool/symptom-specific: "diagnose" appears in every module's
    # standard exercise wording and would tag the entire corpus
    "troubleshooting": r"\b(tcpdump|traceroute|tracepath|strace|connection refused|connection timed out|wireshark|packet capture)\b",
    # --- containers / k8s -------------------------------------------------
    "dockerfile":      r"\b(dockerfile|docker build|multi.stage build|base image|layer cach)\b",
    "docker-compose":  r"\b(docker.compose|compose file|compose\.ya?ml)\b",
    "images":          r"\b(container image|image registry|acr\b|docker hub|image tag|image digest)\b",
    "pods":            r"\b(pod|kubelet|sidecar|init container)\b",
    "deployments":     r"\b(deployment|replicaset|rolling update|statefulset|daemonset)\b",
    "k8s-services":    r"\b(clusterip|nodeport|loadbalancer service|ingress|service mesh)\b",
    "helm":            r"\b(helm|chart|values\.ya?ml)\b",
    "operators":       r"\b(operator|custom resource|crd\b|controller loop|reconcil)\b",
    "autoscaling":     r"\b(autoscal|hpa\b|vpa\b|keda|scale to zero|replica count)\b",
    # --- cloud / azure ----------------------------------------------------
    "azure":           r"\b(azure|az cli|resource group|subscription|arm template|bicep)\b",
    "vnet":            r"\b(vnet|virtual network|private endpoint|peering)\b",
    "managed-identity": r"\b(managed identity|service principal|workload identity|entra)\b",
    "iac":             r"\b(terraform|infrastructure as code|hcl\b|tfstate|provisioner|declarative infra)\b",
    "serverless":      r"\b(serverless|azure functions|faas|cold start|durable functions)\b",
    # --- data -------------------------------------------------------------
    # "join" alone is an ordinary English word — require real SQL syntax
    "sql":             r"\b(select .+ from|insert into|create table|alter table|group by|order by|inner join|left join|where clause)\b",
    "postgres":        r"\b(postgres(ql)?|psql|psycopg|pg_)\b",
    "schema-design":   r"\b(schema design|normali[sz]|3nf|primary key|foreign key|denormali)\b",
    "indexing":        r"\b(index(es|ing)?|b.tree|explain analyze|query plan|composite index)\b",
    "transactions":    r"\b(transaction|acid|isolation level|deadlock|rollback|commit)\b",
    "orm":             r"\b(orm\b|sqlalchemy|alembic|migration|entity framework)\b",
    "replication":     r"\b(replica(tion)?|primary/replica|read replica|sharding|partition)\b",
    "nosql":           r"\b(nosql|document store|key.value store|wide.column|mongodb|cosmos db)\b",
    "caching":         r"\b(cache|caching|redis|memcached|cache.aside|ttl|eviction|invalidat)\b",
    "elasticsearch":   r"\b(elasticsearch|kibana|inverted index|relevance|analyzer)\b",
    "data-warehouse":  r"\b(olap|data warehouse|star schema|column(ar)? storage|fact table)\b",
    # --- backend / app ----------------------------------------------------
    "rest":            r"\b(rest(ful)?|resource.oriented|openapi|swagger|idempotent (get|put))\b",
    "graphql":         r"\b(graphql|resolver|schema stitching|dataloader|federation)\b",
    "api-gateway":     r"\b(api gateway|bff\b|backend for frontend|rate limit)\b",
    "auth":            r"\b(authenticat|authoriz|jwt|oauth2?|oidc|session|rbac|password hash)\b",
    "multi-tenancy":   r"\b(multi.tenan|tenant|row.level security|schema.per.tenant|saas)\b",
    "queues":          r"\b(message queue|task queue|celery|rabbitmq|service bus|kafka|pub/?sub|broker)\b",
    "event-driven":    r"\b(event.driven|event grid|event sourcing|cqrs|saga|choreograph)\b",
    "realtime":        r"\b(real.?time|server.sent event|sse\b|push notification|live update)\b",
    "idempotency":     r"\b(idempoten|exactly.once|at.least.once|deduplicat|retry)\b",
    "rate-limiting":   r"\b(rate limit|token bucket|leaky bucket|sliding window|throttl|429)\b",
    "billing":         r"\b(billing|stripe|subscription|plan tier|quota|usage meter|invoice)\b",
    "concurrency":     r"\b(concurren|thread.safe|race condition|mutex|lock\b|deadlock|goroutine|asyncio)\b",
    "distributed-systems": r"\b(cap theorem|consensus|eventual consistency|distributed lock|quorum|split.brain)\b",
    "system-design":   r"\b(system design|capacity estimation|back.of.envelope|qps\b|high level design)\b",
    # --- security ---------------------------------------------------------
    "owasp":           r"\b(owasp|sql injection|xss\b|csrf|ssrf|broken access control)\b",
    "secrets":         r"\b(secret(s)? management|key vault|sealed secret|credential|rotate)\b",
    "supply-chain":    r"\b(sbom|sigstore|cosign|image signing|provenance|slsa|admission control)\b",
    "scanning":        r"\b(vulnerability scan|trivy|snyk|cve\b|dependency scan)\b",
    "policy":          r"\b(azure policy|opa\b|gatekeeper|rego|policy as code|admission webhook)\b",
    # --- ops --------------------------------------------------------------
    "ci-cd":           r"\b(ci/?cd|pipeline|github actions|azure devops|build agent|artifact)\b",
    "gitops":          r"\b(gitops|argocd|flux|declarative deploy|drift detection)\b",
    "monitoring":      r"\b(prometheus|grafana|metric|alert|dashboard|scrape)\b",
    "logging":         r"\b(structured log|log aggregat|loki|fluent|log level|correlation id)\b",
    "tracing":         r"\b(tracing|opentelemetry|span|jaeger|distributed trace)\b",
    "sre":             r"\b(slo\b|sli\b|error budget|incident (response|management)|postmortem|toil)\b",
    "chaos-engineering": r"\b(chaos (engineering|monkey)|fault injection|game day|blast radius)\b",
    "performance":     r"\b(latency|throughput|p9[59]|benchmark|profil(e|ing)|bottleneck|load test)\b",
    "disaster-recovery": r"\b(disaster recovery|rpo\b|rto\b|backup|restore|failover region)\b",
    "cost":            r"\b(cost (management|optimi)|finops|budget|right.siz|reserved instance|spend)\b",
    # --- linux / tooling --------------------------------------------------
    "shell":           r"\b(bash|shell script|stdin|stdout|pipe|grep|awk|sed\b|chmod)\b",
    "filesystem":      r"\b(file system|filesystem|inode|mount|permissions|symlink|/etc/)\b",
    "processes":       r"\b(process|systemd|daemon|signal|kill |ps aux|cron)\b",
    "git":             r"\b(git |branch|rebase|merge conflict|commit|pull request|cherry.pick)\b",
    # --- design / lld -----------------------------------------------------
    # "class" / "object" / "interface" are far too generic here: "Class A/B/C"
    # addresses and "network interface" were tagging networking modules as OOP.
    "oop":             r"\b(object.oriented|inheritance|inherits from|polymorph|encapsulat|subclass|superclass|abstract class|base class|constructor)\b",
    "solid":           r"\b(solid principle|single responsibility|open/?closed|liskov|interface segregation|dependency inversion)\b",
    "design-patterns": r"\b(design pattern|singleton|factory|builder|adapter|decorator|observer|strategy|state pattern)\b",
    "uml":             r"\b(uml|class diagram|sequence diagram|association|aggregation|composition)\b",
    "refactoring":     r"\b(refactor|code smell|anti.?pattern|god object|technical debt)\b",
    "dependency-injection": r"\b(dependency injection|inversion of control|di container|constructor injection)\b",
    "testing":         r"\b(unit test|integration test|e2e|tdd\b|mock|fixture|pytest|assert)\b",
    # --- genai ------------------------------------------------------------
    # bare "token" matched JWT/auth tokens across the whole backend track
    "llm":             r"\b(llm|large language model|prompt engineering|prompt template|embedding|model inference|fine.tun)\b",
    "rag":             r"\b(rag\b|retrieval.augmented|vector (db|database|store)|semantic search)\b",
    "agents":          r"\b(ai agent|tool use|function calling|react loop|agentic)\b",
}

VOCAB_RE = {tag: re.compile(pat, re.I) for tag, pat in VOCAB.items()}

MIN_SCORE = 4        # weighted hits needed before a content tag is kept
MAX_CONTENT_TAGS = 8 # cap so tag lists stay scannable

# --------------------------------------------------------------------------
# 4. format / structure tags
# --------------------------------------------------------------------------
FENCE_TAG = {
    "python": "python", "csharp": "csharp", "bash": "bash", "sh": "bash",
    "sql": "sql", "yaml": "yaml", "yml": "yaml", "hcl": "terraform",
    "javascript": "javascript", "json": "json", "dockerfile": "dockerfile",
    "nginx": "nginx", "graphql": "graphql", "protobuf": "grpc",
    "promql": "monitoring", "powershell": "powershell", "rego": "policy",
}

FENCE_RE = re.compile(r"^```([a-zA-Z0-9+#-]+)", re.M)
HEADING_RE = re.compile(r"^#{1,6}\s+(.*)$", re.M)

# Every module in this curriculum uses the same section scaffolding. Those
# headings are structure, not subject matter, so they must not receive the 3x
# heading weight — otherwise "troubleshooting", "exercises" etc. score highly
# on all 463 files and stop discriminating between them.
BOILERPLATE_HEADING_RE = re.compile(
    r"^(why this matters|concepts?|command reference|hands.on exercises?|"
    r"independent challenge|common mistakes.*|checkpoint quiz|interview questions|"
    r"cumulative review.*|further reading.*|next|modules?|how (this track|to use).*|"
    r"show (answers|questions)|stuck\?.*|solution|discussion|prerequisites.*|"
    r"what this (module|capstone) is|the project|your task|setup.*|step \d+.*)$",
    re.I,
)


def _slug_tags_from_path(rel_path):
    """curriculum + track tags derived purely from the file's location."""
    parts = rel_path.split("/")
    tags = []
    if parts and parts[0] in CURRICULUM:
        tags.append(CURRICULUM[parts[0]])
    if len(parts) > 1:
        track = parts[1].lower()
        for key, vals in TRACK_TAGS.items():
            if key in track:
                tags.extend(vals)
                break
    return tags


def _format_tags(text, rel_path):
    tags = []
    low = rel_path.lower()
    name = os.path.basename(os.path.dirname(low)) or low

    if "capstone" in low:
        tags.append("capstone")
    if low.endswith("/readme.md") and low.count("/") <= 1:
        tags.append("index")
    if re.search(r"^#+\s*.*checkpoint quiz", text, re.I | re.M):
        tags.append("quiz")
    if re.search(r"^#+\s*.*hands.on exercis", text, re.I | re.M):
        tags.append("exercises")
    if re.search(r"^#+\s*.*independent challenge", text, re.I | re.M):
        tags.append("challenge")
    if re.search(r"^#+\s*.*interview questions", text, re.I | re.M):
        tags.append("interview")
    if re.search(r"^#+\s*.*cumulative review", text, re.I | re.M):
        tags.append("review")
    if "{{tabs}}" in text:
        tags.append("dual-language")

    fences = Counter(m.lower() for m in FENCE_RE.findall(text))
    for lang, n in fences.items():
        tag = FENCE_TAG.get(lang)
        if tag and n >= 2:
            tags.append(tag)
    return tags


def _content_tags(text):
    """Weighted keyword scoring: topic headings count triple, boilerplate doesn't."""
    headings = "\n".join(
        h for h in HEADING_RE.findall(text)
        if not BOILERPLATE_HEADING_RE.match(h.strip())
    )
    scored = []
    for tag, rx in VOCAB_RE.items():
        body_hits = len(rx.findall(text))
        if not body_hits:
            continue
        head_hits = len(rx.findall(headings))
        score = body_hits + head_hits * 3
        if score >= MIN_SCORE:
            scored.append((score, tag))
    scored.sort(reverse=True)
    return [t for _, t in scored[:MAX_CONTENT_TAGS]]


def tags_for(abs_path, rel_path):
    """Return an ordered, de-duplicated tag list for one markdown file."""
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
    except OSError:
        text = ""

    ordered = []
    for tag in _slug_tags_from_path(rel_path) + _format_tags(text, rel_path) + _content_tags(text):
        if tag not in ordered:
            ordered.append(tag)
    return ordered


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for arg in sys.argv[1:]:
        rel = os.path.relpath(os.path.abspath(arg), root).replace(os.sep, "/")
        print(f"{rel}\n  {', '.join(tags_for(os.path.abspath(arg), rel))}\n")
