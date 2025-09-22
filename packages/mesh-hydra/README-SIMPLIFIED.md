# Hydra Provider - Simplified & Maintainable

This is a **much cleaner and more maintainable** version of the Hydra Provider that eliminates confusing timeout configurations and complex logic.

## 🎯 Key Improvements

### ✅ **Single Timeout Configuration**
- **Before**: 5 different timeout parameters (`connectionTimeout`, `disconnectTimeout`, `sendTimeout`, `reconnectAttempts`, `reconnectDelay`)
- **After**: 1 simple `timeout` parameter for all operations

### ✅ **Simplified Logic**
- **Before**: Complex timeout handling with multiple intervals and validation
- **After**: Clean, straightforward timeout implementation

### ✅ **Better Error Handling**
- **Before**: Confusing error states and validation
- **After**: Clear error messages and graceful handling

### ✅ **Easier to Understand**
- **Before**: 200+ lines of complex timeout logic
- **After**: ~50 lines of clear, maintainable code

## 🚀 Usage Examples

### Basic Usage
```javascript
import { HydraProvider } from "@meshsdk/hydra";

// Simple - uses 10 second default timeout
const provider = new HydraProvider({
  httpUrl: "http://localhost:4002"
});

await provider.connect();
await provider.disconnect();
```

### Custom Timeout
```javascript
// Custom timeout for all operations
const provider = new HydraProvider({
  httpUrl: "http://localhost:4002",
  timeout: 5000 // 5 seconds
});

await provider.connect();
await provider.disconnect();
```

### Per-Call Timeout Override
```javascript
// Use custom timeout just for disconnect
await provider.disconnect(2000); // 2 seconds
```

### Environment-Based Configuration
```javascript
function createProvider(env) {
  const timeouts = {
    development: 2000,  // 2 seconds - fast
    staging: 10000,     // 10 seconds - normal
    production: 30000   // 30 seconds - reliable
  };

  return new HydraProvider({
    httpUrl: process.env.HYDRA_URL,
    timeout: timeouts[env]
  });
}
```

## 📋 Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `httpUrl` | string | **required** | HTTP URL of the Hydra node |
| `wsUrl` | string | auto-generated | WebSocket URL (optional) |
| `history` | boolean | `false` | Include history in connection |
| `address` | string | undefined | Specific address to connect to |
| `timeout` | number | `10000` | Timeout in milliseconds for all operations |

## 🔧 API Methods

### `connect(): Promise<void>`
Connects to the Hydra node using the configured timeout.

```javascript
try {
  await provider.connect();
  console.log("Connected successfully");
} catch (error) {
  console.error("Connection failed:", error.message);
}
```

### `disconnect(timeout?: number): Promise<void>`
Disconnects from the Hydra node. Optionally accepts a custom timeout.

```javascript
// Use default timeout
await provider.disconnect();

// Use custom timeout
await provider.disconnect(2000); // 2 seconds
```

### `send(data: unknown): void`
Sends data through the WebSocket connection.

```javascript
provider.send({ tag: "Init" });
```

## 🛡️ Error Handling

The simplified version provides clear, actionable error messages:

```javascript
try {
  await provider.connect();
} catch (error) {
  // Clear error messages:
  // "Connection failed: timeout after 5000ms"
  // "WebSocket connection failed"
  // "Connection closed: Client initiated"
  console.error(error.message);
}
```

## 🧪 Testing

The simplified implementation includes comprehensive tests:

```bash
npm test hydra-connection.test.js
```

All 21 tests pass, covering:
- ✅ Connection/Disconnection scenarios
- ✅ Error handling
- ✅ Timeout configurations
- ✅ Edge cases and concurrency
- ✅ Status management

## 🔄 Migration Guide

### From Complex Configuration
```javascript
// OLD - Confusing multiple timeouts
const provider = new HydraProvider({
  httpUrl: "http://localhost:4002",
  connectionTimeout: 30000,
  disconnectTimeout: 5000,
  sendTimeout: 5000,
  reconnectAttempts: 3,
  reconnectDelay: 1000
});

// NEW - Simple single timeout
const provider = new HydraProvider({
  httpUrl: "http://localhost:4002",
  timeout: 10000 // Covers all operations
});
```

### Environment Variables
```javascript
// OLD - Multiple env vars
const provider = new HydraProvider({
  httpUrl: process.env.HYDRA_URL,
  connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT),
  disconnectTimeout: parseInt(process.env.DISCONNECT_TIMEOUT),
  // ... more config
});

// NEW - Single env var
const provider = new HydraProvider({
  httpUrl: process.env.HYDRA_URL,
  timeout: parseInt(process.env.HYDRA_TIMEOUT) || 10000
});
```

## 🎉 Benefits

1. **🚀 Simpler**: One timeout parameter instead of five
2. **🔧 Maintainable**: Clean, readable code
3. **🐛 Fewer Bugs**: Less complex logic means fewer edge cases
4. **📚 Easier to Learn**: New developers can understand it quickly
5. **⚡ Faster**: No complex timeout calculations or validations
6. **🛡️ Reliable**: Better error handling and cleanup

## 🏗️ Architecture

The simplified architecture follows these principles:

1. **Single Responsibility**: Each method has one clear purpose
2. **Fail Fast**: Clear error messages when things go wrong
3. **Graceful Cleanup**: Always clean up resources properly
4. **Simple Configuration**: Minimal configuration options
5. **Predictable Behavior**: Consistent timeout behavior across all operations

This approach makes the code much more maintainable and easier to debug when issues arise.
