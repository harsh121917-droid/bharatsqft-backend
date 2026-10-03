const fs = require('fs');

const path = 'services/mfIntelligenceService.js';
let content = fs.readFileSync(path, 'utf8');

// 1. 101762 - HDFC Flexi Cap: add 5th holding
const old101762Holdings = `      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 6.45, sector: 'Telecommunication', assetClass: 'Equity', asOfDate: '2026-09-30' },
    ],`;
const new101762Holdings = `      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 6.45, sector: 'Telecommunication', assetClass: 'Equity', asOfDate: '2026-09-30' },
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 5.48, sector: 'Energy', assetClass: 'Equity', asOfDate: '2026-09-30' },
    ],`;

if (content.includes(old101762Holdings)) {
  content = content.replace(old101762Holdings, new101762Holdings);
  console.log('1. Updated 101762 holdings');
}

// 2. 105628 - SBI ELSS Tax Saver: add 4th and 5th holdings
const old105628Holdings = `      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.45, sector: 'Information Technology', assetClass: 'Equity', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 52,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'SBI Mutual Fund Statutory Factsheet Sep 2026',
    fundManager: 'Dinesh Balachandran',`;

const new105628Holdings = `      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.45, sector: 'Information Technology', assetClass: 'Equity', asOfDate: '2026-09-30' },
      { name: 'Larsen & Toubro Ltd.', isin: 'INE018A01030', weight: 4.85, sector: 'Construction', assetClass: 'Equity', asOfDate: '2026-09-30' },
      { name: 'ITC Ltd.', isin: 'INE154A01025', weight: 4.15, sector: 'Fast Moving Consumer Goods', assetClass: 'Equity', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 52,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'SBI Mutual Fund Statutory Factsheet Sep 2026',
    fundManager: 'Dinesh Balachandran',`;

if (content.includes(old105628Holdings)) {
  content = content.replace(old105628Holdings, new105628Holdings);
  console.log('2. Updated 105628 holdings');
}

// 3. 135784 - Mirae Asset ELSS Tax Saver: add 4th and 5th holdings
const old135784Holdings = `      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.65, sector: 'Information Technology', assetClass: 'Equity', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 64,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'Mirae Asset Mutual Fund Factsheet Sep 2026',
    fundManager: 'Neelesh Surana',`;

const new135784Holdings = `      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.65, sector: 'Information Technology', assetClass: 'Equity', asOfDate: '2026-09-30' },
      { name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029', weight: 4.60, sector: 'Information Technology', assetClass: 'Equity', asOfDate: '2026-09-30' },
      { name: 'Axis Bank Ltd.', isin: 'INE238A01034', weight: 4.35, sector: 'Financial Services', assetClass: 'Equity', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 64,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'Mirae Asset Mutual Fund Factsheet Sep 2026',
    fundManager: 'Neelesh Surana',`;

if (content.includes(old135784Holdings)) {
  content = content.replace(old135784Holdings, new135784Holdings);
  console.log('3. Updated 135784 holdings');
}

// 4. 100119 - HDFC Balanced Advantage: add 4th and 5th holdings
const old100119Holdings = `      { name: '7.18% GOI 2033', isin: 'IN0020230085', weight: 4.75, sector: 'Sovereign', assetClass: 'Debt', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 82,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'HDFC Mutual Fund Statutory Factsheet Sep 2026',
    fundManager: 'Gopal Agrawal',`;

const new100119Holdings = `      { name: '7.18% GOI 2033', isin: 'IN0020230085', weight: 4.75, sector: 'Sovereign', assetClass: 'Debt', asOfDate: '2026-09-30' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 4.80, sector: 'Information Technology', assetClass: 'Equity', asOfDate: '2026-09-30' },
      { name: '7.26% GOI 2032', isin: 'IN0020220037', weight: 4.25, sector: 'Sovereign', assetClass: 'Debt', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 82,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'HDFC Mutual Fund Statutory Factsheet Sep 2026',
    fundManager: 'Gopal Agrawal',`;

if (content.includes(old100119Holdings)) {
  content = content.replace(old100119Holdings, new100119Holdings);
  console.log('4. Updated 100119 holdings');
}

// 5. 140381 - Bandhan Aggressive Hybrid: add 4th and 5th holdings
const old140381Holdings = `      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 4.95, sector: 'Energy', assetClass: 'Equity', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 56,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'Bandhan Mutual Fund Statutory Factsheet Sep 2026',
    fundManager: 'Nishita Shah',`;

const new140381Holdings = `      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 4.95, sector: 'Energy', assetClass: 'Equity', asOfDate: '2026-09-30' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 4.10, sector: 'Information Technology', assetClass: 'Equity', asOfDate: '2026-09-30' },
      { name: '7.26% GOI 2033', isin: 'IN0020230010', weight: 3.85, sector: 'Sovereign', assetClass: 'Debt', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 56,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'Bandhan Mutual Fund Statutory Factsheet Sep 2026',
    fundManager: 'Nishita Shah',`;

if (content.includes(old140381Holdings)) {
  content = content.replace(old140381Holdings, new140381Holdings);
  console.log('5. Updated 140381 holdings');
}

// 6. 129006 - Franklin India Banking & PSU Debt: add 3rd, 4th, 5th holdings
const old129006Holdings = `      { name: 'Small Industries Dev Bank AAA NCD', isin: 'INE556F08KB8', weight: 8.95, sector: 'Financial Services', assetClass: 'Debt', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 42,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'Franklin Templeton Factsheet Sep 2026',
    fundManager: 'Sachin Padwal-Desai',`;

const new129006Holdings = `      { name: 'Small Industries Dev Bank AAA NCD', isin: 'INE556F08KB8', weight: 8.95, sector: 'Financial Services', assetClass: 'Debt', asOfDate: '2026-09-30' },
      { name: 'Power Finance Corp. AAA NCD', isin: 'INE134E08LO7', weight: 8.90, sector: 'Financial Services', assetClass: 'Debt', asOfDate: '2026-09-30' },
      { name: 'REC Ltd. AAA NCD', isin: 'INE020B08DF2', weight: 8.45, sector: 'Financial Services', assetClass: 'Debt', asOfDate: '2026-09-30' },
      { name: 'Indian Railway Finance Corp. AAA NCD', isin: 'INE053F08116', weight: 7.80, sector: 'Financial Services', assetClass: 'Debt', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 42,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'Franklin Templeton Factsheet Sep 2026',
    fundManager: 'Sachin Padwal-Desai',`;

if (content.includes(old129006Holdings)) {
  content = content.replace(old129006Holdings, new129006Holdings);
  console.log('6. Updated 129006 holdings');
}

// 7. 113070 - HDFC Corporate Bond: add 4th and 5th holdings
const old113070Holdings = `      { name: 'HDFC Bank Ltd. Tier 2 Bond', isin: 'INE040A08476', weight: 6.45, sector: 'Financial Services', assetClass: 'Debt', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 68,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'HDFC Mutual Fund Statutory Factsheet Sep 2026',
    fundManager: 'Anupam Joshi',`;

const new113070Holdings = `      { name: 'HDFC Bank Ltd. Tier 2 Bond', isin: 'INE040A08476', weight: 6.45, sector: 'Financial Services', assetClass: 'Debt', asOfDate: '2026-09-30' },
      { name: 'Power Grid Corp. AAA NCD', isin: 'INE752E07PA7', weight: 6.20, sector: 'Energy', assetClass: 'Debt', asOfDate: '2026-09-30' },
      { name: 'NTPC Ltd. AAA NCD', isin: 'INE733E07JV6', weight: 5.80, sector: 'Energy', assetClass: 'Debt', asOfDate: '2026-09-30' },
    ],
    isPartial: true,
    totalHoldingsCount: 68,
    holdingsAsOfDate: '2026-09-30',
    holdingsSource: 'HDFC Mutual Fund Statutory Factsheet Sep 2026',
    fundManager: 'Anupam Joshi',`;

if (content.includes(old113070Holdings)) {
  content = content.replace(old113070Holdings, new113070Holdings);
  console.log('7. Updated 113070 holdings');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully enriched holdings across catalog in mfIntelligenceService.js');
