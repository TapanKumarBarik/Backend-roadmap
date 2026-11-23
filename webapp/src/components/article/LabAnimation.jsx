// Visual animated micro-simulators inspired by designed-to-scale.
// Provides live interactive feedback matching the tool's core mental model.

export default function LabAnimation({ type }) {
  switch (type) {
    case 'latency-ping':
      return (
        <div className="lab-anim lab-anim--latency" aria-hidden="true">
          <div className="lab-anim__node lab-anim__node--client">
            <span className="lab-anim__label">Client</span>
          </div>
          <div className="lab-anim__wire">
            <div className="lab-anim__packet lab-anim__packet--forward" />
            <div className="lab-anim__packet lab-anim__packet--backward" />
            <span className="lab-anim__wire-tag">RTT ~38ms</span>
          </div>
          <div className="lab-anim__node lab-anim__node--server">
            <span className="lab-anim__label">Server</span>
          </div>
        </div>
      );

    case 'raft-nodes':
      return (
        <div className="lab-anim lab-anim--raft" aria-hidden="true">
          <div className="lab-anim__raft-cluster">
            <div className="lab-anim__raft-node lab-anim__raft-node--leader">
              <span className="lab-anim__raft-tag">Leader</span>
              <div className="lab-anim__pulse-ring" />
            </div>
            <div className="lab-anim__raft-followers">
              <span className="lab-anim__raft-node lab-anim__raft-node--follower">N2</span>
              <span className="lab-anim__raft-node lab-anim__raft-node--follower">N3</span>
              <span className="lab-anim__raft-node lab-anim__raft-node--follower">N4</span>
              <span className="lab-anim__raft-node lab-anim__raft-node--follower">N5</span>
            </div>
          </div>
          <span className="lab-anim__raft-sub">Quorum heartbeat: 50ms</span>
        </div>
      );

    case 'stream-log':
      return (
        <div className="lab-anim lab-anim--stream" aria-hidden="true">
          <div className="lab-anim__log-track">
            <span className="lab-anim__log-entry">#102</span>
            <span className="lab-anim__log-entry">#103</span>
            <span className="lab-anim__log-entry lab-anim__log-entry--active">#104</span>
            <span className="lab-anim__log-entry lab-anim__log-entry--incoming">#105</span>
          </div>
          <div className="lab-anim__stream-pointer">
            <span className="lab-anim__stream-tag">offset cursor</span>
          </div>
        </div>
      );

    case 'sawtooth-wave':
      return (
        <div className="lab-anim lab-anim--sawtooth" aria-hidden="true">
          <svg viewBox="0 0 140 40" className="lab-anim__svg">
            <path
              d="M 5,35 L 45,10 L 47,28 L 85,8 L 87,24 L 125,6"
              fill="none"
              stroke="var(--signal)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lab-anim__sawtooth-path"
            />
            <circle cx="125" cy="6" r="3.5" fill="var(--signal)" className="lab-anim__probe-dot" />
          </svg>
          <span className="lab-anim__sawtooth-sub">AIMD Sawtooth: cwnd = cwnd + 1</span>
        </div>
      );

    case 'hash-ring':
      return (
        <div className="lab-anim lab-anim--ring" aria-hidden="true">
          <div className="lab-anim__ring-circle">
            <div className="lab-anim__ring-node lab-anim__ring-node--1" title="Node A" />
            <div className="lab-anim__ring-node lab-anim__ring-node--2" title="Node B" />
            <div className="lab-anim__ring-node lab-anim__ring-node--3" title="Node C" />
            <div className="lab-anim__ring-key" />
          </div>
          <span className="lab-anim__ring-sub">Ring: 2³²-1 tokens</span>
        </div>
      );

    case 'token-bucket':
      return (
        <div className="lab-anim lab-anim--bucket" aria-hidden="true">
          <div className="lab-anim__bucket-body">
            <div className="lab-anim__token lab-anim__token--1" />
            <div className="lab-anim__token lab-anim__token--2" />
            <div className="lab-anim__token lab-anim__token--3" />
          </div>
          <span className="lab-anim__bucket-sub">Tokens: +10/sec</span>
        </div>
      );

    case 'query-tree':
      return (
        <div className="lab-anim lab-anim--query" aria-hidden="true">
          <div className="lab-anim__query-tree">
            <div className="lab-anim__tree-node lab-anim__tree-node--root">Index Scan</div>
            <div className="lab-anim__tree-branches">
              <span className="lab-anim__tree-leaf lab-anim__tree-leaf--hit">B-Tree: O(log N)</span>
              <span className="lab-anim__tree-leaf lab-anim__tree-leaf--dim">Cost: 4.12</span>
            </div>
          </div>
        </div>
      );

    case 'bit-array':
      return (
        <div className="lab-anim lab-anim--bits" aria-hidden="true">
          <div className="lab-anim__bit-grid">
            <span className="lab-anim__bit lab-anim__bit--on">1</span>
            <span className="lab-anim__bit">0</span>
            <span className="lab-anim__bit lab-anim__bit--on">1</span>
            <span className="lab-anim__bit lab-anim__bit--pulse">1</span>
            <span className="lab-anim__bit">0</span>
            <span className="lab-anim__bit lab-anim__bit--on">1</span>
          </div>
          <span className="lab-anim__bit-sub">k=3 hash projections</span>
        </div>
      );

    case 'cidr-bits':
      return (
        <div className="lab-anim lab-anim--cidr" aria-hidden="true">
          <div className="lab-anim__cidr-display">
            <span className="lab-anim__cidr-net">11000000.10101000.00000001</span>
            <span className="lab-anim__cidr-split">/24</span>
            <span className="lab-anim__cidr-host">00000000</span>
          </div>
          <span className="lab-anim__cidr-sub">254 usable hosts</span>
        </div>
      );

    case 'socket-connections':
      return (
        <div className="lab-anim lab-anim--sockets" aria-hidden="true">
          <div className="lab-anim__socket-hub">
            <div className="lab-anim__socket-beam lab-anim__socket-beam--1" />
            <div className="lab-anim__socket-beam lab-anim__socket-beam--2" />
            <div className="lab-anim__socket-beam lab-anim__socket-beam--3" />
            <div className="lab-anim__socket-core">WS</div>
          </div>
          <span className="lab-anim__socket-sub">1M+ duplex channels</span>
        </div>
      );

    case 'estimator-calc':
      return (
        <div className="lab-anim lab-anim--estimator" aria-hidden="true">
          <div className="lab-anim__est-grid">
            <div className="lab-anim__est-box">
              <span className="lab-anim__est-val">100k</span>
              <span className="lab-anim__est-key">Peak QPS</span>
            </div>
            <div className="lab-anim__est-arrow">→</div>
            <div className="lab-anim__est-box">
              <span className="lab-anim__est-val">1.2 GB/s</span>
              <span className="lab-anim__est-key">Ingress</span>
            </div>
          </div>
          <span className="lab-anim__est-sub">80/20 RAM: 2.8 TB</span>
        </div>
      );

    case 'incident-telemetry':
      return (
        <div className="lab-anim lab-anim--incident" aria-hidden="true">
          <div className="lab-anim__incident-bar">
            <span className="lab-anim__incident-dot" />
            <span className="lab-anim__incident-text">SEV-1 Mitigated</span>
          </div>
          <svg viewBox="0 0 120 28" className="lab-anim__svg">
            <path
              d="M 5,20 L 40,20 L 50,5 L 65,24 L 75,12 L 85,15 L 115,15"
              fill="none"
              stroke="var(--reward-ink)"
              strokeWidth="2"
              strokeLinecap="round"
              className="lab-anim__incident-path"
            />
          </svg>
        </div>
      );

    default:
      // Generic interactive laboratory animation
      return (
        <div className="lab-anim lab-anim--generic" aria-hidden="true">
          <div className="lab-anim__pulse-box">
            <span className="lab-anim__pulse-dot" />
            <span className="lab-anim__pulse-bar" />
          </div>
          <span className="lab-anim__generic-sub">Live Interactive Simulator</span>
        </div>
      );
  }
}
