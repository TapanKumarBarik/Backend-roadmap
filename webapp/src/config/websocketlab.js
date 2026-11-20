// Presets and system hardware models for Real-Time Connection & WebSocket Scaling Lab (/tools/websocket-scaling/).

export const WS_LAB_CONFIG = {
  presets: {
    liveChat: {
      name: 'Global Chat / Messaging (Slack/Discord)',
      description: 'Room and channel-based fan-out across 200,000 active concurrent connections.',
      connections: 200_000,
      bufferSizeKb: 8,       // 4KB rmem + 4KB wmem
      fdLimitPerNode: 65_535,
      nodeRamGb: 16,
      msgRatePerSec: 50,
      msgSizeKb: 0.5
    },
    cryptoTrading: {
      name: 'Crypto Exchange / Live Orderbook',
      description: 'Extreme broadcast frequency with tight latency guarantees across 100,000 traders.',
      connections: 100_000,
      bufferSizeKb: 4,
      fdLimitPerNode: 65_535,
      nodeRamGb: 16,
      msgRatePerSec: 200,
      msgSizeKb: 0.2
    },
    liveStreaming: {
      name: 'Massive Live Stream Event (1 Million Users)',
      description: '1-to-many massive viewer broadcast with pub/sub backplane fan-out.',
      connections: 1_000_000,
      bufferSizeKb: 6,
      fdLimitPerNode: 262_144, // tuned Linux sysctl
      nodeRamGb: 32,
      msgRatePerSec: 10,
      msgSizeKb: 1.0
    }
  }
};
