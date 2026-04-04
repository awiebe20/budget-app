console.log('Node version:', process.version);
console.log('Electron version:', process.versions.electron);
console.log('Process type:', process.type);

const e = require('electron');
console.log('require electron type:', typeof e);

// Try to find the real electron module
try {
  const m = require('module');
  console.log('builtinModules includes electron:', m.builtinModules?.includes('electron'));
} catch(err) {}
