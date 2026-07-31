import fs from 'fs';

const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const names = data.source1.map(r => r[0]).filter(n => typeof n === 'string' && n.trim() !== '');
console.log("Source 1 names:\n", names.join('\n'));
