// The vocabulary behind the tags: which folder gives which tag, which words in a lesson earn a tag, and which
// code-fence languages count. Pure data; the logic that applies it is in tags.mjs. Edit this file to change what a
// lesson is tagged with, then run `npm run index` to see the result.
//
// Every indexed .md file gets tags from four independent sources, so no file can end up untagged:
//   1. curriculum - the top-level folder (backend / learn / lld / genai / system-design)
//   2. track      - the track folder's name, mapped to a short canonical tag
//   3. content    - the keyword vocabulary below, scored by weighted frequency
//   4. format     - structural signals (capstone, quiz, exercises, code fences)

// 1. curriculum-level tags
export const CURRICULUM_TAGS = {
  'backend': 'backend',
  'learn': 'infrastructure',
  'lld': 'low-level-design',
  'genai': 'genai',
  'system-design': 'system-design',
};

// 2. track folder name -> canonical tag(s). Keyed by a substring of the track folder name; the matcher stops at
// the first key that is a substring, so order matters.
export const TRACK_TAGS = {
  // genai/ -- listed first because the matcher breaks on the first key that
  // is a substring of the track slug, and several genai slugs would
  // otherwise be captured by a broader learn/ or backend/ key
  // ("15-evaluation-observability-and-safety" contains "observability").
  'genai-foundations': ['genai', 'fundamentals'],
  'tokens-and-language-modeling': ['tokenization', 'llm'],
  'transformer-architecture': ['transformers', 'attention', 'deep-learning'],
  'landmark-models-bert-gpt-and-moe': ['transformers', 'bert', 'gpt', 'moe'],
  'training-fine-tuning-and-alignment': ['fine-tuning', 'training', 'alignment'],
  'gpus-and-genai-hardware': ['gpu', 'hardware', 'performance'],
  'openai-and-the-model-landscape': ['openai', 'llm-apis', 'model-landscape'],
  'prompt-engineering': ['prompt-engineering', 'llm'],
  'embeddings-and-vector-databases': ['embeddings', 'vector-db'],
  'retrieval-augmented-generation': ['rag', 'retrieval', 'embeddings'],
  'ai-agents': ['agents', 'tool-use'],
  'langchain-and-langgraph': ['langchain', 'langgraph', 'agents'],
  'agent-orchestration-and-multi-agent-systems': ['agents', 'multi-agent', 'orchestration'],
  'model-context-protocol-mcp': ['mcp', 'tool-use', 'agents'],
  'inference-and-serving-vllm': ['inference', 'vllm', 'serving'],
  'evaluation-observability-and-safety': ['llm-evaluation', 'observability', 'ai-safety'],
  'speech-and-multimodal-models': ['speech', 'multimodal'],
  // learn/
  'linux': ['linux', 'shell'],
  'docker': ['docker', 'containers'],
  'kubernetes': ['kubernetes', 'containers'],
  'networking-fundamentals': ['networking'],
  'azure-networking': ['azure', 'networking'],
  'azure-container-apps': ['azure', 'containers', 'paas'],
  'aks': ['azure', 'kubernetes'],
  'git-and-version-control': ['git', 'version-control'],
  'terraform': ['terraform', 'iac', 'azure'],
  'cicd-and-gitops': ['ci-cd', 'gitops', 'automation'],
  'security-deep-dive': ['security'],
  'observability': ['observability', 'monitoring'],
  'service-mesh': ['service-mesh', 'kubernetes'],
  'databases-and-stateful': ['databases', 'kubernetes', 'storage'],
  'messaging-and-event-driven': ['messaging', 'event-driven'],
  'identity-deep-dive': ['identity', 'auth', 'azure'],
  'governance-at-scale': ['governance', 'azure'],
  'supply-chain-security': ['supply-chain', 'security'],
  'api-management': ['api', 'azure', 'gateway'],
  'sre-practices': ['sre', 'reliability'],
  'cost-management': ['finops', 'cost'],
  'disaster-recovery': ['disaster-recovery', 'chaos-engineering', 'reliability'],
  'performance-and-load-testing': ['performance', 'load-testing'],
  'platform-engineering': ['platform-engineering'],
  // backend/
  'request-response': ['http', 'fundamentals'],
  'api-layer': ['api', 'rest'],
  'authentication-and-authorization': ['auth', 'security'],
  'databases-and-data-layer': ['databases', 'sql'],
  'caching-and-performance': ['caching', 'performance'],
  'background-processing': ['async', 'queues', 'realtime'],
  'search-with-elasticsearch': ['search', 'elasticsearch'],
  'observability-and-operational': ['observability', 'logging'],
  'distributed-systems': ['distributed-systems'],
  'advanced-api-paradigms': ['api', 'grpc', 'graphql'],
  'testing-and-code-quality': ['testing', 'code-quality'],
  'devops-for-backend': ['devops', 'ci-cd'],
  'system-design-interview': ['system-design', 'interview'],
  'multi-tenancy-and-saas': ['multi-tenancy', 'saas'],
  'grpc-deep-dive': ['grpc', 'protobuf', 'api'],
  'kafka-and-streaming': ['kafka', 'streaming', 'event-driven'],
  // system-design/
  'core-fundamentals': ['fundamentals', 'system-design'],
  // lld/
  'programming-basics': ['fundamentals', 'python', 'csharp'],
  'classes-objects': ['oop'],
  'oop-foundations': ['oop', 'uml'],
  'generics-exceptions': ['oop', 'generics'],
  'solid-principles': ['solid', 'design-principles'],
  'core-design-principles': ['design-principles'],
  'creational-patterns': ['design-patterns', 'creational'],
  'structural-patterns': ['design-patterns', 'structural'],
  'behavioral-patterns': ['design-patterns', 'behavioral'],
  'concurrency': ['concurrency', 'threading'],
  'requirements-to-class': ['uml', 'modeling'],
  'anti-patterns': ['anti-patterns', 'refactoring'],
  'interview-playbook': ['interview'],
  'capstone': ['capstone'],
  'supply-chain-platform': ['capstone', 'supply-chain'],
};

// 3. content vocabulary: tag -> pattern, matched case-insensitively against the whole document. A tag is kept
// only if its weighted score clears MIN_SCORE (see tags.mjs).
export const VOCABULARY = {
  // --- networking -------------------------------------------------------
  'ip-addressing': /\b(ip address(es|ing)?|ipv4|ipv6|dotted.decimal|octet)\b/gi,
  'subnetting': /\b(subnet(s|ting|ted)?|cidr|netmask|prefix length|block size)\b/gi,
  'supernetting': /\b(supernett?ing|route (aggregation|summari[sz]ation)|vlsm|variable length subnet)\b/gi,
  'dns': /\b(dns|domain name system|nameserver|resolver|dig |nslookup|ttl)\b/gi,
  'tcp': /\b(tcp|three.way handshake|syn|ack\b|sequence number)\b/gi,
  'udp': /\budp\b/gi,
  'http': /\b(http\/?[12]?|status code|request header|response header|keep.alive)\b/gi,
  'tls': /\b(tls|ssl|certificate|handshake|x\.509|cipher suite|mtls)\b/gi,
  'routing': /\b(routing table|route|next hop|default gateway|longest prefix)\b/gi,
  'routing-protocols': /\b(ospf|bgp|rip\b|distance.vector|link.state|autonomous system|administrative distance)\b/gi,
  'nat': /\b(nat\b|network address translation|snat|dnat|masquerade|port forward)\b/gi,
  'firewall': /\b(firewall|iptables|nftables|packet filter|security group|nsg)\b/gi,
  'vpn': /\b(vpn|ipsec|tunnel mode|transport mode|strongswan|ike\b|site.to.site)\b/gi,
  'cdn': /\b(cdn|content delivery network|edge server|point of presence|cache hit|cache miss)\b/gi,
  'reverse-proxy': /\b(reverse proxy|forward proxy|proxy_pass|upstream)\b/gi,
  'load-balancing': /\b(load balanc(er|ing)|round robin|least connections|health check|vip\b|sticky session)\b/gi,
  'websocket': /\b(websocket|101 switching protocols|long polling)\b/gi,
  'grpc': /\b(grpc|unary rpc|bidirectional streaming|grpcurl|\.proto\b)\b/gi,
  'protobuf': /\b(protobuf|protocol buffers|\.proto\b|field number|wire type|protoc\b|reserved field)\b/gi,
  'schema-evolution': /\b(backward compat|forward compat|breaking change|schema evolution|wire.compatib)\b/gi,
  'high-availability': /\b(high availability|active.active|active.standby|active.passive|failover|redundan(cy|t))\b/gi,
  // deliberately tool/symptom-specific: "diagnose" appears in every module's
  // standard exercise wording and would tag the entire corpus
  'troubleshooting': /\b(tcpdump|traceroute|tracepath|strace|connection refused|connection timed out|wireshark|packet capture)\b/gi,
  // --- containers / k8s -------------------------------------------------
  'dockerfile': /\b(dockerfile|docker build|multi.stage build|base image|layer cach)\b/gi,
  'docker-compose': /\b(docker.compose|compose file|compose\.ya?ml)\b/gi,
  'images': /\b(container image|image registry|acr\b|docker hub|image tag|image digest)\b/gi,
  'pods': /\b(pod|kubelet|sidecar|init container)\b/gi,
  'deployments': /\b(deployment|replicaset|rolling update|statefulset|daemonset)\b/gi,
  'k8s-services': /\b(clusterip|nodeport|loadbalancer service|ingress|service mesh)\b/gi,
  'helm': /\b(helm|chart|values\.ya?ml)\b/gi,
  'operators': /\b(operator|custom resource|crd\b|controller loop|reconcil)\b/gi,
  'autoscaling': /\b(autoscal|hpa\b|vpa\b|keda|scale to zero|replica count)\b/gi,
  // --- cloud / azure ----------------------------------------------------
  'azure': /\b(azure|az cli|resource group|subscription|arm template|bicep)\b/gi,
  'vnet': /\b(vnet|virtual network|private endpoint|peering)\b/gi,
  'managed-identity': /\b(managed identity|service principal|workload identity|entra)\b/gi,
  'iac': /\b(terraform|infrastructure as code|hcl\b|tfstate|provisioner|declarative infra)\b/gi,
  'serverless': /\b(serverless|azure functions|faas|cold start|durable functions)\b/gi,
  // --- data -------------------------------------------------------------
  // "join" alone is an ordinary English word — require real SQL syntax
  'sql': /\b(select .+ from|insert into|create table|alter table|group by|order by|inner join|left join|where clause)\b/gi,
  'postgres': /\b(postgres(ql)?|psql|psycopg|pg_)\b/gi,
  'schema-design': /\b(schema design|normali[sz]|3nf|primary key|foreign key|denormali)\b/gi,
  'indexing': /\b(index(es|ing)?|b.tree|explain analyze|query plan|composite index)\b/gi,
  'transactions': /\b(transaction|acid|isolation level|deadlock|rollback|commit)\b/gi,
  'orm': /\b(orm\b|sqlalchemy|alembic|migration|entity framework)\b/gi,
  'replication': /\b(replica(tion)?|primary\/replica|read replica|sharding|partition)\b/gi,
  'nosql': /\b(nosql|document store|key.value store|wide.column|mongodb|cosmos db)\b/gi,
  'caching': /\b(cache|caching|redis|memcached|cache.aside|ttl|eviction|invalidat)\b/gi,
  'elasticsearch': /\b(elasticsearch|kibana|inverted index|relevance|analyzer)\b/gi,
  'data-warehouse': /\b(olap|data warehouse|star schema|column(ar)? storage|fact table)\b/gi,
  // --- backend / app ----------------------------------------------------
  'rest': /\b(rest(ful)?|resource.oriented|openapi|swagger|idempotent (get|put))\b/gi,
  'graphql': /\b(graphql|resolver|schema stitching|dataloader|federation)\b/gi,
  'api-gateway': /\b(api gateway|bff\b|backend for frontend|rate limit)\b/gi,
  'auth': /\b(authenticat|authoriz|jwt|oauth2?|oidc|session|rbac|password hash)\b/gi,
  'multi-tenancy': /\b(multi.tenan|tenant|row.level security|schema.per.tenant|saas)\b/gi,
  'queues': /\b(message queue|task queue|celery|rabbitmq|service bus|pub\/?sub|broker)\b/gi,
  'kafka': /\b(kafka|partition key|consumer group|log compaction|offset commit|broker|topic partition)\b/gi,
  'streaming': /\b(stream processing|windowing|tumbling window|session window|watermark|event time|stream.table)\b/gi,
  'event-driven': /\b(event.driven|event grid|event sourcing|cqrs|saga|choreograph)\b/gi,
  'realtime': /\b(real.?time|server.sent event|sse\b|push notification|live update)\b/gi,
  'idempotency': /\b(idempoten|exactly.once|at.least.once|deduplicat|retry)\b/gi,
  'rate-limiting': /\b(rate limit|token bucket|leaky bucket|sliding window|throttl|429)\b/gi,
  'billing': /\b(billing|stripe|subscription|plan tier|quota|usage meter|invoice)\b/gi,
  'concurrency': /\b(concurren|thread.safe|race condition|mutex|lock\b|deadlock|goroutine|asyncio)\b/gi,
  'distributed-systems': /\b(cap theorem|consensus|eventual consistency|distributed lock|quorum|split.brain)\b/gi,
  'system-design': /\b(system design|capacity estimation|back.of.envelope|qps\b|high level design)\b/gi,
  // --- security ---------------------------------------------------------
  'owasp': /\b(owasp|sql injection|xss\b|csrf|ssrf|broken access control)\b/gi,
  'secrets': /\b(secret(s)? management|key vault|sealed secret|credential|rotate)\b/gi,
  'supply-chain': /\b(sbom|sigstore|cosign|image signing|provenance|slsa|admission control)\b/gi,
  'scanning': /\b(vulnerability scan|trivy|snyk|cve\b|dependency scan)\b/gi,
  'policy': /\b(azure policy|opa\b|gatekeeper|rego|policy as code|admission webhook)\b/gi,
  // --- ops --------------------------------------------------------------
  'ci-cd': /\b(ci\/?cd|pipeline|github actions|azure devops|build agent|artifact)\b/gi,
  'gitops': /\b(gitops|argocd|flux|declarative deploy|drift detection)\b/gi,
  'monitoring': /\b(prometheus|grafana|metric|alert|dashboard|scrape)\b/gi,
  'logging': /\b(structured log|log aggregat|loki|fluent|log level|correlation id)\b/gi,
  'tracing': /\b(tracing|opentelemetry|span|jaeger|distributed trace)\b/gi,
  'sre': /\b(slo\b|sli\b|error budget|incident (response|management)|postmortem|toil)\b/gi,
  'chaos-engineering': /\b(chaos (engineering|monkey)|fault injection|game day|blast radius)\b/gi,
  'performance': /\b(latency|throughput|p9[59]|benchmark|profil(e|ing)|bottleneck|load test)\b/gi,
  'disaster-recovery': /\b(disaster recovery|rpo\b|rto\b|backup|restore|failover region)\b/gi,
  'cost': /\b(cost (management|optimi)|finops|budget|right.siz|reserved instance|spend)\b/gi,
  // --- linux / tooling --------------------------------------------------
  'shell': /\b(bash|shell script|stdin|stdout|pipe|grep|awk|sed\b|chmod)\b/gi,
  'filesystem': /\b(file system|filesystem|inode|mount|permissions|symlink|\/etc\/)\b/gi,
  'processes': /\b(process|systemd|daemon|signal|kill |ps aux|cron)\b/gi,
  'git': /\b(git |branch|rebase|merge conflict|commit|pull request|cherry.pick)\b/gi,
  // --- design / lld -----------------------------------------------------
  // "class" / "object" / "interface" are far too generic here: "Class A/B/C"
  // addresses and "network interface" were tagging networking modules as OOP.
  'oop': /\b(object.oriented|inheritance|inherits from|polymorph|encapsulat|subclass|superclass|abstract class|base class|constructor)\b/gi,
  'solid': /\b(solid principle|single responsibility|open\/?closed|liskov|interface segregation|dependency inversion)\b/gi,
  'design-patterns': /\b(design pattern|singleton|factory|builder|adapter|decorator|observer|strategy|state pattern)\b/gi,
  'uml': /\b(uml|class diagram|sequence diagram|association|aggregation|composition)\b/gi,
  'refactoring': /\b(refactor|code smell|anti.?pattern|god object|technical debt)\b/gi,
  'dependency-injection': /\b(dependency injection|inversion of control|di container|constructor injection)\b/gi,
  'testing': /\b(unit test|integration test|e2e|tdd\b|mock|fixture|pytest|assert)\b/gi,
  // --- genai ------------------------------------------------------------
  // bare "token" matched JWT/auth tokens across the whole backend track
  'llm': /\b(llm|large language model|prompt engineering|prompt template|embedding|model inference|fine.tun)\b/gi,
  'rag': /\b(rag\b|retrieval.augmented|vector (db|database|store)|semantic search)\b/gi,
  'agents': /\b(ai agent|tool use|function calling|react loop|agentic)\b/gi,
  // bare "token" matches JWT/auth tokens across backend/, so anchor these on
  // tokenizer-specific vocabulary instead
  'tokenization': /\b(tokeni[sz](e|er|ation)|byte.pair encoding|\bbpe\b|wordpiece|sentencepiece|tiktoken|cl100k|vocabulary size|context window)\b/gi,
  'transformers': /\b(transformer (block|architecture|model)|self.attention|multi.head attention|positional (encoding|embedding)|\brope\b|feed.forward network)\b/gi,
  'attention': /\b(attention (mechanism|head|mask|weights)|queries?, keys|key\/value|scaled dot.product|causal mask)\b/gi,
  'embeddings': /\b(embedding (model|vector|space)|word2vec|sentence transformer|cosine similarity|bi.encoder|cross.encoder)\b/gi,
  'vector-db': /\b(vector (database|store|index)|pgvector|pinecone|weaviate|qdrant|chroma|\bhnsw\b|approximate nearest neighbor|\bann\b search)\b/gi,
  'fine-tuning': /\b(fine.tun|\blora\b|qlora|peft|instruction tun|supervised fine|\brlhf\b|\bdpo\b|reward model|preference optimi)\b/gi,
  'quantization': /\b(quantiz|int8|int4|\bgguf\b|\bawq\b|\bgptq\b|mixed precision|bfloat16|\bbf16\b|\bfp16\b)\b/gi,
  'gpu': /\b(\bgpu\b|cuda core|tensor core|\bvram\b|memory bandwidth|nvidia|\ba100\b|\bh100\b|flash.?attention)\b/gi,
  'inference': /\b(kv cache|continuous batching|paged.?attention|\bvllm\b|prefill|decode phase|speculative decoding|throughput.*latency|tokens per second)\b/gi,
  'mcp': /\b(model context protocol|\bmcp\b|mcp (server|client|host)|json.rpc|stdio transport)\b/gi,
  'multi-agent': /\b(multi.agent|orchestrator.worker|supervisor (pattern|agent)|agent handoff|crewai|autogen|agent team)\b/gi,
  'langchain': /\b(langchain|langgraph|langsmith|\blcel\b|runnable|state graph)\b/gi,
  'moe': /\b(mixture.of.experts|\bmoe\b|expert routing|sparse activation|mixtral)\b/gi,
  'llm-evaluation': /\b(llm.as.judge|eval (dataset|harness|suite)|hallucination (detection|rate)|ragas|golden (set|dataset)|red.?team)\b/gi,
  'ai-safety': /\b(guardrail|prompt injection|jailbreak|content filter|safety filter|alignment|refusal)\b/gi,
  'speech': /\b(speech (recognition|to.text)|whisper|text.to.speech|\btts\b|\bstt\b|\basr\b|spectrogram|diariz)\b/gi,
  'multimodal': /\b(multimodal|vision (model|encoder)|image input|\bocr\b|video understanding)\b/gi,
};

export const MIN_SCORE = 4; // weighted hits needed before a content tag is kept
export const MAX_CONTENT_TAGS = 8; // cap so tag lists stay scannable

// 4. code-fence language -> tag (a language needs two fences in a lesson to count)
export const FENCE_TAGS = {
  'python': 'python', 'csharp': 'csharp', 'bash': 'bash', 'sh': 'bash',
  'sql': 'sql', 'yaml': 'yaml', 'yml': 'yaml', 'hcl': 'terraform',
  'javascript': 'javascript', 'json': 'json', 'dockerfile': 'dockerfile',
  'nginx': 'nginx', 'graphql': 'graphql', 'protobuf': 'grpc',
  'promql': 'monitoring', 'powershell': 'powershell', 'rego': 'policy',
};

// Every module in this curriculum uses the same section scaffolding. Those headings are structure, not subject
// matter, so they must not receive the 3x heading weight - otherwise "troubleshooting", "exercises" etc. score
// highly on all 463 files and stop discriminating between them.
export const BOILERPLATE_HEADING = /^(why this matters|concepts?|command reference|hands.on exercises?|independent challenge|common mistakes.*|checkpoint quiz|interview questions|cumulative review.*|further reading.*|next|modules?|how (this track|to use).*|show (answers|questions)|stuck\?.*|solution|discussion|prerequisites.*|what this (module|capstone) is|the project|your task|setup.*|step \d+.*)$/i;
