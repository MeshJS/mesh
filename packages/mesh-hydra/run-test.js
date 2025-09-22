#!/usr/bin/env node

// Simple script to run Hydra Provider tests
import { HydraProvider } from './dist/index.js';

console.log('🧪 Running Quick Hydra Provider Test...\n');

async function quickTest() {
  const provider = new HydraProvider({
    httpUrl: "http://localhost:4002"
  });

  try {
    console.log('⏳ Connecting...');
    await provider.connect();
    console.log('✅ Connected! Status:', provider._status);
    
    console.log('📤 Sending Init command...');
    await provider.init();
    console.log('✅ Init command sent');
    
    console.log('⏳ Disconnecting...');
    await provider.disconnect();
    console.log('✅ Disconnected! Status:', provider._status);
    
    console.log('🎉 Quick test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
quickTest()
  .then(() => {
    console.log('\n✨ Test run completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test run failed:', error);
    process.exit(1);
  });
