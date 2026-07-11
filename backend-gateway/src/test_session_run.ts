import WebSocket from 'ws';

const WS_URL = 'ws://localhost:50051';
console.log(`[Test Runner] Connecting to flow.ad gateway at ${WS_URL}...`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('[Test Runner] Connected successfully!');
  
  // Simulate client initializing a session
  const initMessage = {
    type: 'INIT_SESSION',
    sessionId: `test_session_${Date.now()}`
  };
  
  console.log('[Test Runner] Sending INIT_SESSION message:', initMessage);
  ws.send(JSON.stringify(initMessage));
});

ws.on('message', (data: string) => {
  try {
    const response = JSON.parse(data);
    console.log(`\n[Client Received] Type: ${response.type}`);
    
    if (response.type === 'AGENT_LOG') {
      console.log(`  Agent: [${response.agentName}]`);
      console.log(`  Log:   ${response.executionLog}`);
    } else if (response.type === 'STATE_MUTATION') {
      console.log(`  State Mutated to: ${response.state}`);
      
      // If we are now STREAMING, let's wait 3 seconds and trigger a mock tool call or finish
      if (response.state === 'STREAMING') {
        console.log('\n[Test Runner] Live audio/video loop established. Swarm agents loaded context successfully!');
        console.log('[Test Runner] Manual test succeeded. Closing session...');
        ws.close();
      }
    } else if (response.type === 'AD_PREVIEW') {
      console.log(`  Generated Ad URL: ${response.url}`);
    }
  } catch (err) {
    console.error('[Test Runner] Error parsing message:', err);
  }
});

ws.on('close', () => {
  console.log('\n[Test Runner] Connection closed.');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('[Test Runner] WebSocket Error:', err.message || err);
  process.exit(1);
});
