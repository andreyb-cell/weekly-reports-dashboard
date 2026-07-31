import fs from 'fs';

async function run() {
  const url = 'https://script.google.com/macros/s/AKfycbym4vG2or_iSusH5_afcYXBoZAhxoyCS-vFMx3HbcPSkn1bPLzLhFTjbHPIy1zLiW6y/exec';
  const response = await fetch(url);
  const data = await response.json();
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

run();
