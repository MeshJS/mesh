// src/polyfills.ts - Create this file
import { Buffer } from 'buffer'

// Make Buffer available globally
window.Buffer = Buffer
window.global = window.global || window
window.process = window.process || { env: {} }

// Export for direct imports
export { Buffer }