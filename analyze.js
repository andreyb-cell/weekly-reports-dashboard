import fs from 'fs';

const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));

console.log('source1 "Проверка" block details:');
let inProverka = false;
for (let i = 0; i < data.source1.length; i++) {
    const row = data.source1[i];
    if (row[0] === 'Проверка') {
        inProverka = true;
    }
    if (inProverka) {
        if (row[0] === '' && i > 110) break; // Arbitrary break if empty row after some items
        console.log(`Row ${i+1}: ${JSON.stringify(row)}`);
    }
}
