#!/bin/bash

# Test proxy with a mock request

echo "Testing Model Router Proxy..."
echo ""

# Start proxy in background
npm run proxy &
PROXY_PID=$!

# Wait for proxy to start
sleep 2

# Send test request (will fail without valid API key, but should route)
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-key" \
  -d '{
    "model": "claude-opus-4",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }' 2>&1 | head -5

echo ""
echo "Check proxy logs above for routing decision"
echo ""

# Stop proxy
kill $PROXY_PID

echo "Test complete"
