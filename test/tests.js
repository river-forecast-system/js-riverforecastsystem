import rfs from "../src/index.js";

console.log('Retrospective Data:');
console.log(await rfs.v2.retrospective({riverId: 710431167, resolution: 'hourly'}));
console.log(await rfs.v2.retrospective({riverId: 710431167, resolution: 'daily'}));
console.log(await rfs.v2.retrospective({riverId: 710431167, resolution: 'monthly'}));
console.log(await rfs.v2.retrospective({riverId: 710431167, resolution: 'yearly'}));

console.log('\nReturn Periods Data:');
console.log(await rfs.v2.returnPeriods({riverId: 710431167}));

console.log('\nForecast Data:');
console.log(await rfs.v2.forecast({riverId: 710431167, date: '20251015'}));
