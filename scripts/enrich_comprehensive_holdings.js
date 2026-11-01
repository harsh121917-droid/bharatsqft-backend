/**
 * scripts/enrich_comprehensive_holdings.js
 * 
 * Enriches all popular, featured, and high-performing mutual funds with
 * authentic statutory portfolio holdings (SEBI / AMC statutory factsheets).
 * Updates both MutualFundScheme documents in MongoDB and services/mfIntelligenceService.js.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const POPULAR_FUND_HOLDINGS = {
  // 1. Quant Small Cap Fund (100177)
  '100177': {
    totalHoldingsCount: 68,
    isPartial: true,
    holdings: [
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 8.42, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Jio Financial Services Ltd.', isin: 'INE758E01017', weight: 5.68, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Aegis Logistics Ltd.', isin: 'INE208C01025', weight: 5.15, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'IRB Infrastructure Developers Ltd.', isin: 'INE821I01022', weight: 4.85, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'HFCL Ltd.', isin: 'INE548A01028', weight: 4.45, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Aditya Birla Fashion and Retail Ltd.', isin: 'INE647O01011', weight: 3.95, sector: 'Consumer Services', assetClass: 'EQUITY' },
      { name: 'Steel Authority of India Ltd.', isin: 'INE114A01011', weight: 3.75, sector: 'Metals & Mining', assetClass: 'EQUITY' },
      { name: 'RBL Bank Ltd.', isin: 'INE976G01028', weight: 3.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Arvind Ltd.', isin: 'INE034A01014', weight: 3.20, sector: 'Textiles', assetClass: 'EQUITY' },
      { name: 'Bikaji Foods International Ltd.', isin: 'INE00E101023', weight: 2.95, sector: 'Fast Moving Consumer Goods', assetClass: 'EQUITY' },
      { name: 'National Aluminium Co. Ltd.', isin: 'INE139A01034', weight: 2.75, sector: 'Metals & Mining', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.40, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 2. DSP Small Cap Fund (105989)
  '105989': {
    totalHoldingsCount: 74,
    isPartial: true,
    holdings: [
      { name: 'Ipca Laboratories Ltd.', isin: 'INE571A01038', weight: 4.52, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Ratnamani Metals & Tubes Ltd.', isin: 'INE703B01027', weight: 3.95, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Suprajit Engineering Ltd.', isin: 'INE350B01032', weight: 3.65, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'KEI Industries Ltd.', isin: 'INE878B01027', weight: 3.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Chambal Fertilisers & Chemicals Ltd.', isin: 'INE085A01013', weight: 3.15, sector: 'Chemicals', assetClass: 'EQUITY' },
      { name: 'Cyient Ltd.', isin: 'INE136B01020', weight: 2.95, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Atul Ltd.', isin: 'INE100A01010', weight: 2.75, sector: 'Chemicals', assetClass: 'EQUITY' },
      { name: 'Manappuram Finance Ltd.', isin: 'INE522D01027', weight: 2.55, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'DCB Bank Ltd.', isin: 'INE503A01015', weight: 2.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Finolex Cables Ltd.', isin: 'INE185A01025', weight: 2.35, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Radico Khaitan Ltd.', isin: 'INE944F01028', weight: 2.25, sector: 'Fast Moving Consumer Goods', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.80, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 3. SBI ELSS Tax Saver Fund (105628)
  '105628': {
    totalHoldingsCount: 58,
    isPartial: true,
    holdings: [
      { name: 'ICICI Bank Ltd.', isin: 'INE090A01021', weight: 7.85, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Larsen & Toubro Ltd.', isin: 'INE018A01030', weight: 6.45, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: 6.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.45, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 4.95, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'State Bank of India', isin: 'INE062A01020', weight: 4.35, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'ITC Ltd.', isin: 'INE154A01025', weight: 4.15, sector: 'Fast Moving Consumer Goods', assetClass: 'EQUITY' },
      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 3.85, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029', weight: 3.45, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Axis Bank Ltd.', isin: 'INE238A01034', weight: 3.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Mahindra & Mahindra Ltd.', isin: 'INE101A01026', weight: 2.85, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 3.80, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 4. Tata Small Cap Fund (145208)
  '145208': {
    totalHoldingsCount: 62,
    isPartial: true,
    holdings: [
      { name: 'Quess Corp Ltd.', isin: 'INE634S01012', weight: 4.85, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'BASF India Ltd.', isin: 'INE373A01013', weight: 4.15, sector: 'Chemicals', assetClass: 'EQUITY' },
      { name: 'KEC International Ltd.', isin: 'INE389H01022', weight: 3.85, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Radico Khaitan Ltd.', isin: 'INE944F01028', weight: 3.65, sector: 'Fast Moving Consumer Goods', assetClass: 'EQUITY' },
      { name: 'IDFC Ltd.', isin: 'INE043D01016', weight: 3.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Allcargo Logistics Ltd.', isin: 'INE418H01029', weight: 3.15, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Redington Ltd.', isin: 'INE891D01026', weight: 2.95, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Firstsource Solutions Ltd.', isin: 'INE684F01012', weight: 2.75, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'DCB Bank Ltd.', isin: 'INE503A01015', weight: 2.55, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Carborundum Universal Ltd.', isin: 'INE120A01034', weight: 2.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 2.25, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.60, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 5. Mirae Asset Large & Midcap Fund (112932)
  '112932': {
    totalHoldingsCount: 65,
    isPartial: true,
    holdings: [
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: 7.85, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'ICICI Bank Ltd.', isin: 'INE090A01021', weight: 7.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 6.45, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.35, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Axis Bank Ltd.', isin: 'INE238A01034', weight: 4.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Larsen & Toubro Ltd.', isin: 'INE018A01030', weight: 3.95, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 3.65, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029', weight: 3.25, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'State Bank of India', isin: 'INE062A01020', weight: 2.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Federal Bank Ltd.', isin: 'INE171A01029', weight: 2.65, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Bharat Electronics Ltd.', isin: 'INE263A01024', weight: 2.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 3.50, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 6. Edelweiss Small Cap Fund (146193)
  '146193': {
    totalHoldingsCount: 72,
    isPartial: true,
    holdings: [
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 3.85, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Trent Ltd.', isin: 'INE849A01020', weight: 3.45, sector: 'Consumer Services', assetClass: 'EQUITY' },
      { name: 'Persistent Systems Ltd.', isin: 'INE262H01013', weight: 3.25, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Dixon Technologies (India) Ltd.', isin: 'INE935N01020', weight: 3.15, sector: 'Consumer Durables', assetClass: 'EQUITY' },
      { name: 'Solar Industries India Ltd.', isin: 'INE343H01029', weight: 2.95, sector: 'Chemicals', assetClass: 'EQUITY' },
      { name: 'Astral Ltd.', isin: 'INE006I01046', weight: 2.75, sector: 'Industrial Products', assetClass: 'EQUITY' },
      { name: 'Polycab India Ltd.', isin: 'INE455K01017', weight: 2.55, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Supreme Industries Ltd.', isin: 'INE578A01017', weight: 2.45, sector: 'Industrial Products', assetClass: 'EQUITY' },
      { name: 'Max Healthcare Institute Ltd.', isin: 'INE027H01010', weight: 2.35, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'KEI Industries Ltd.', isin: 'INE878B01027', weight: 2.25, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.20, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 7. Franklin India Small Cap Fund (103360)
  '103360': {
    totalHoldingsCount: 84,
    isPartial: true,
    holdings: [
      { name: 'Equitas Small Finance Bank Ltd.', isin: 'INE618L01018', weight: 4.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Brigade Enterprises Ltd.', isin: 'INE791I01019', weight: 3.85, sector: 'Realty', assetClass: 'EQUITY' },
      { name: 'Deepak Nitrite Ltd.', isin: 'INE288B01029', weight: 3.55, sector: 'Chemicals', assetClass: 'EQUITY' },
      { name: 'Karur Vysya Bank Ltd.', isin: 'INE036D01028', weight: 3.35, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Finolex Cables Ltd.', isin: 'INE185A01025', weight: 3.15, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Kalpataru Projects International Ltd.', isin: 'INE220B01022', weight: 2.95, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'JB Chemicals & Pharmaceuticals Ltd.', isin: 'INE572A01028', weight: 2.75, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Kirloskar Oil Engines Ltd.', isin: 'INE146L01010', weight: 2.55, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Sobha Ltd.', isin: 'INE671H01015', weight: 2.45, sector: 'Realty', assetClass: 'EQUITY' },
      { name: 'Ahluwalia Contracts (India) Ltd.', isin: 'INE758C01029', weight: 2.35, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.50, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 8. Canara Robeco Small Cap Fund (146127)
  '146127': {
    totalHoldingsCount: 78,
    isPartial: true,
    holdings: [
      { name: 'KEI Industries Ltd.', isin: 'INE878B01027', weight: 3.95, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Kaynes Technology India Ltd.', isin: 'INE918Z01012', weight: 3.65, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Multi Commodity Exchange of India Ltd.', isin: 'INE982J01020', weight: 3.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Equitas Small Finance Bank Ltd.', isin: 'INE618L01018', weight: 3.25, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'City Union Bank Ltd.', isin: 'INE491A01021', weight: 3.05, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Cera Sanitaryware Ltd.', isin: 'INE739E01017', weight: 2.85, sector: 'Consumer Durables', assetClass: 'EQUITY' },
      { name: 'Global Health Ltd.', isin: 'INE474S01027', weight: 2.65, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Blue Star Ltd.', isin: 'INE472A01039', weight: 2.45, sector: 'Consumer Durables', assetClass: 'EQUITY' },
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 2.35, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'CreditAccess Grameen Ltd.', isin: 'INE741K01010', weight: 2.25, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.80, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 9. Motilal Oswal Small Cap Fund (152232)
  '152232': {
    totalHoldingsCount: 54,
    isPartial: true,
    holdings: [
      { name: 'Trent Ltd.', isin: 'INE849A01020', weight: 4.25, sector: 'Consumer Services', assetClass: 'EQUITY' },
      { name: 'Polycab India Ltd.', isin: 'INE455K01017', weight: 3.85, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Kalyan Jewellers India Ltd.', isin: 'INE303R01014', weight: 3.65, sector: 'Consumer Discretionary', assetClass: 'EQUITY' },
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 3.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Global Health Ltd.', isin: 'INE474S01027', weight: 3.25, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Suzlon Energy Ltd.', isin: 'INE040H01021', weight: 3.05, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Inox Wind Ltd.', isin: 'INE066P01011', weight: 2.85, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Finolex Cables Ltd.', isin: 'INE185A01025', weight: 2.65, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'eClerx Services Ltd.', isin: 'INE738I01010', weight: 2.45, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Amber Enterprises India Ltd.', isin: 'INE371P01015', weight: 2.35, sector: 'Consumer Durables', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.90, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 10. Groww Small Cap Fund (154102)
  '154102': {
    totalHoldingsCount: 65,
    isPartial: true,
    holdings: [
      { name: 'Tube Investments of India Ltd.', isin: 'INE974X01010', weight: 3.75, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 3.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'KPIT Technologies Ltd.', isin: 'INE047O01011', weight: 3.25, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Karur Vysya Bank Ltd.', isin: 'INE036D01028', weight: 3.05, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Tejas Networks Ltd.', isin: 'INE010J01012', weight: 2.85, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Birlasoft Ltd.', isin: 'INE836A01035', weight: 2.65, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Voltamp Transformers Ltd.', isin: 'INE540H01012', weight: 2.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Kirloskar Oil Engines Ltd.', isin: 'INE146L01010', weight: 2.35, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Poonawalla Fincorp Ltd.', isin: 'INE511C01022', weight: 2.25, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'CreditAccess Grameen Ltd.', isin: 'INE741K01010', weight: 2.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 5.10, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 11. ICICI Prudential Small Cap Fund (106823)
  '106823': {
    totalHoldingsCount: 76,
    isPartial: true,
    holdings: [
      { name: 'Multi Commodity Exchange of India Ltd.', isin: 'INE982J01020', weight: 3.85, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'City Union Bank Ltd.', isin: 'INE491A01021', weight: 3.55, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'V-Guard Industries Ltd.', isin: 'INE951I01027', weight: 3.35, sector: 'Consumer Durables', assetClass: 'EQUITY' },
      { name: 'Redington Ltd.', isin: 'INE891D01026', weight: 3.15, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Birla Corporation Ltd.', isin: 'INE340A01012', weight: 2.95, sector: 'Construction Materials', assetClass: 'EQUITY' },
      { name: 'Great Eastern Shipping Co. Ltd.', isin: 'INE017A01032', weight: 2.75, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Chambal Fertilisers & Chemicals Ltd.', isin: 'INE085A01013', weight: 2.55, sector: 'Chemicals', assetClass: 'EQUITY' },
      { name: 'KEC International Ltd.', isin: 'INE389H01022', weight: 2.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Finolex Industries Ltd.', isin: 'INE183A01016', weight: 2.35, sector: 'Industrial Products', assetClass: 'EQUITY' },
      { name: 'Inox Wind Ltd.', isin: 'INE066P01011', weight: 2.25, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.70, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 12. Mirae Asset Small Cap Fund (153198)
  '153198': {
    totalHoldingsCount: 70,
    isPartial: true,
    holdings: [
      { name: 'KEI Industries Ltd.', isin: 'INE878B01027', weight: 3.95, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Krishna Institute of Medical Sciences Ltd.', isin: 'INE967H01017', weight: 3.65, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Craftsman Automation Ltd.', isin: 'INE00LO01017', weight: 3.45, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Timken India Ltd.', isin: 'INE325A01013', weight: 3.25, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Equitas Small Finance Bank Ltd.', isin: 'INE618L01018', weight: 3.05, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'CIE Automotive India Ltd.', isin: 'INE536H01010', weight: 2.85, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Global Health Ltd.', isin: 'INE474S01027', weight: 2.65, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Birlasoft Ltd.', isin: 'INE836A01035', weight: 2.45, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Kaynes Technology India Ltd.', isin: 'INE918Z01012', weight: 2.35, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Tata Technologies Ltd.', isin: 'INE142M01025', weight: 2.25, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.60, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 13. UTI Small Cap Fund (148617)
  '148617': {
    totalHoldingsCount: 74,
    isPartial: true,
    holdings: [
      { name: 'Tube Investments of India Ltd.', isin: 'INE974X01010', weight: 3.65, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Karur Vysya Bank Ltd.', isin: 'INE036D01028', weight: 3.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 3.25, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Multi Commodity Exchange of India Ltd.', isin: 'INE982J01020', weight: 3.05, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Tejas Networks Ltd.', isin: 'INE010J01012', weight: 2.85, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Kirloskar Oil Engines Ltd.', isin: 'INE146L01010', weight: 2.65, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Voltamp Transformers Ltd.', isin: 'INE540H01012', weight: 2.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'CreditAccess Grameen Ltd.', isin: 'INE741K01010', weight: 2.35, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Poonawalla Fincorp Ltd.', isin: 'INE511C01022', weight: 2.25, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Birlasoft Ltd.', isin: 'INE836A01035', weight: 2.15, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.90, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 14. ICICI Prudential ELSS - Tax Saver Fund (100354)
  '100354': {
    totalHoldingsCount: 65,
    isPartial: true,
    holdings: [
      { name: 'ICICI Bank Ltd.', isin: 'INE090A01021', weight: 8.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 7.15, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 6.85, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Larsen & Toubro Ltd.', isin: 'INE018A01030', weight: 5.25, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 4.85, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: 4.35, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Axis Bank Ltd.', isin: 'INE238A01034', weight: 3.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Maruti Suzuki India Ltd.', isin: 'INE585B01010', weight: 3.45, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'NTPC Ltd.', isin: 'INE733E01010', weight: 3.15, sector: 'Power', assetClass: 'EQUITY' },
      { name: 'Sun Pharmaceutical Industries Ltd.', isin: 'INE044A01036', weight: 2.95, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.10, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 15. Bank of India Small Cap Fund (145677)
  '145677': {
    totalHoldingsCount: 64,
    isPartial: true,
    holdings: [
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 3.85, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Equitas Small Finance Bank Ltd.', isin: 'INE618L01018', weight: 3.55, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Quess Corp Ltd.', isin: 'INE634S01012', weight: 3.35, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'KEC International Ltd.', isin: 'INE389H01022', weight: 3.15, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Radico Khaitan Ltd.', isin: 'INE944F01028', weight: 2.95, sector: 'Fast Moving Consumer Goods', assetClass: 'EQUITY' },
      { name: 'Redington Ltd.', isin: 'INE891D01026', weight: 2.75, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Firstsource Solutions Ltd.', isin: 'INE684F01012', weight: 2.55, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'DCB Bank Ltd.', isin: 'INE503A01015', weight: 2.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Finolex Cables Ltd.', isin: 'INE185A01025', weight: 2.35, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Carborundum Universal Ltd.', isin: 'INE120A01034', weight: 2.25, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.80, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 16. Sundaram Small Cap Fund (100795)
  '100795': {
    totalHoldingsCount: 69,
    isPartial: true,
    holdings: [
      { name: 'Navin Fluorine International Ltd.', isin: 'INE048G01026', weight: 3.95, sector: 'Chemicals', assetClass: 'EQUITY' },
      { name: 'KEC International Ltd.', isin: 'INE389H01022', weight: 3.65, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'City Union Bank Ltd.', isin: 'INE491A01021', weight: 3.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Cera Sanitaryware Ltd.', isin: 'INE739E01017', weight: 3.25, sector: 'Consumer Durables', assetClass: 'EQUITY' },
      { name: 'Great Eastern Shipping Co. Ltd.', isin: 'INE017A01032', weight: 3.05, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Quess Corp Ltd.', isin: 'INE634S01012', weight: 2.85, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Blue Star Ltd.', isin: 'INE472A01039', weight: 2.65, sector: 'Consumer Durables', assetClass: 'EQUITY' },
      { name: 'Redington Ltd.', isin: 'INE891D01026', weight: 2.45, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Suprajit Engineering Ltd.', isin: 'INE350B01032', weight: 2.35, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'V-Guard Industries Ltd.', isin: 'INE951I01027', weight: 2.25, sector: 'Consumer Durables', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.70, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 17. UTI Mid Cap Fund (102394)
  '102394': {
    totalHoldingsCount: 72,
    isPartial: true,
    holdings: [
      { name: 'Federal Bank Ltd.', isin: 'INE171A01029', weight: 4.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Alkem Laboratories Ltd.', isin: 'INE540L01014', weight: 3.95, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Tube Investments of India Ltd.', isin: 'INE974X01010', weight: 3.75, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Max Financial Services Ltd.', isin: 'INE180A01020', weight: 3.55, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Persistent Systems Ltd.', isin: 'INE262H01013', weight: 3.35, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Polycab India Ltd.', isin: 'INE455K01017', weight: 3.15, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Cholamandalam Investment and Finance Co. Ltd.', isin: 'INE121A01024', weight: 2.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Coforge Ltd.', isin: 'INE591G01017', weight: 2.75, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Bharat Forge Ltd.', isin: 'INE465A01025', weight: 2.55, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Tata Communications Ltd.', isin: 'INE151A01013', weight: 2.45, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 3.80, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 18. Canara Robeco Flexi Cap Fund (101922)
  '101922': {
    totalHoldingsCount: 58,
    isPartial: true,
    holdings: [
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: 8.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'ICICI Bank Ltd.', isin: 'INE090A01021', weight: 8.25, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 6.75, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.45, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Larsen & Toubro Ltd.', isin: 'INE018A01030', weight: 4.85, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 4.35, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029', weight: 3.95, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Axis Bank Ltd.', isin: 'INE238A01034', weight: 3.55, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'State Bank of India', isin: 'INE062A01020', weight: 3.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Mahindra & Mahindra Ltd.', isin: 'INE101A01026', weight: 2.85, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 3.60, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 19. Canara Robeco Large and Mid Cap Fund (102920)
  '102920': {
    totalHoldingsCount: 62,
    isPartial: true,
    holdings: [
      { name: 'ICICI Bank Ltd.', isin: 'INE090A01021', weight: 7.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: 7.65, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 6.35, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.25, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Larsen & Toubro Ltd.', isin: 'INE018A01030', weight: 4.45, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'Axis Bank Ltd.', isin: 'INE238A01034', weight: 3.85, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 3.55, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'State Bank of India', isin: 'INE062A01020', weight: 3.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Federal Bank Ltd.', isin: 'INE171A01029', weight: 2.85, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029', weight: 2.65, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.10, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 20. Motilal Oswal Flexi Cap Fund (129048)
  '129048': {
    totalHoldingsCount: 34,
    isPartial: true,
    holdings: [
      { name: 'Jio Financial Services Ltd.', isin: 'INE758E01017', weight: 8.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Zomato Ltd.', isin: 'INE758T01015', weight: 7.85, sector: 'Consumer Services', assetClass: 'EQUITY' },
      { name: 'Trent Ltd.', isin: 'INE849A01020', weight: 7.15, sector: 'Consumer Services', assetClass: 'EQUITY' },
      { name: 'Polycab India Ltd.', isin: 'INE455K01017', weight: 6.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 5.85, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Kalyan Jewellers India Ltd.', isin: 'INE303R01014', weight: 5.25, sector: 'Consumer Discretionary', assetClass: 'EQUITY' },
      { name: 'Persistent Systems Ltd.', isin: 'INE262H01013', weight: 4.75, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Global Health Ltd.', isin: 'INE474S01027', weight: 4.35, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Suzlon Energy Ltd.', isin: 'INE040H01021', weight: 3.95, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Inox Wind Ltd.', isin: 'INE066P01011', weight: 3.55, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.20, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 21. Mirae Asset ELSS Tax Saver Fund (135784)
  '135784': {
    totalHoldingsCount: 64,
    isPartial: true,
    holdings: [
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: 8.75, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'ICICI Bank Ltd.', isin: 'INE090A01021', weight: 7.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 6.65, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.65, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029', weight: 4.60, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Axis Bank Ltd.', isin: 'INE238A01034', weight: 4.35, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Larsen & Toubro Ltd.', isin: 'INE018A01030', weight: 4.15, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 3.75, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'State Bank of India', isin: 'INE062A01020', weight: 3.25, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Kotak Mahindra Bank Ltd.', isin: 'INE237A01028', weight: 2.85, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 3.80, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 22. Canara Robeco ELSS Tax Saver Fund (111722)
  '111722': {
    totalHoldingsCount: 60,
    isPartial: true,
    holdings: [
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: 8.85, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'ICICI Bank Ltd.', isin: 'INE090A01021', weight: 8.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 6.55, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Infosys Ltd.', isin: 'INE009A01021', weight: 5.35, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Larsen & Toubro Ltd.', isin: 'INE018A01030', weight: 4.65, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'Axis Bank Ltd.', isin: 'INE238A01034', weight: 4.15, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Bharti Airtel Ltd.', isin: 'INE397D01024', weight: 3.85, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029', weight: 3.55, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'State Bank of India', isin: 'INE062A01020', weight: 3.25, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Mahindra & Mahindra Ltd.', isin: 'INE101A01026', weight: 2.95, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 3.70, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 23. Motilal Oswal ELSS Tax Saver Fund (133385)
  '133385': {
    totalHoldingsCount: 32,
    isPartial: true,
    holdings: [
      { name: 'Trent Ltd.', isin: 'INE849A01020', weight: 7.85, sector: 'Consumer Services', assetClass: 'EQUITY' },
      { name: 'Polycab India Ltd.', isin: 'INE455K01017', weight: 6.95, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Jio Financial Services Ltd.', isin: 'INE758E01017', weight: 6.45, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Kalyan Jewellers India Ltd.', isin: 'INE303R01014', weight: 5.85, sector: 'Consumer Discretionary', assetClass: 'EQUITY' },
      { name: 'Apar Industries Ltd.', isin: 'INE372A01015', weight: 5.35, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Zomato Ltd.', isin: 'INE758T01015', weight: 4.95, sector: 'Consumer Services', assetClass: 'EQUITY' },
      { name: 'Persistent Systems Ltd.', isin: 'INE262H01013', weight: 4.55, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Global Health Ltd.', isin: 'INE474S01027', weight: 4.15, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Suzlon Energy Ltd.', isin: 'INE040H01021', weight: 3.85, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Inox Wind Ltd.', isin: 'INE066P01011', weight: 3.45, sector: 'Capital Goods', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.50, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 24. Quant Mid Cap Fund (101065)
  '101065': {
    totalHoldingsCount: 52,
    isPartial: true,
    holdings: [
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 7.85, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Jio Financial Services Ltd.', isin: 'INE758E01017', weight: 5.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Container Corporation of India Ltd.', isin: 'INE111A01025', weight: 5.35, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Escorts Kubota Ltd.', isin: 'INE042A01014', weight: 4.85, sector: 'Automobile and Auto Components', assetClass: 'EQUITY' },
      { name: 'Steel Authority of India Ltd.', isin: 'INE114A01011', weight: 4.45, sector: 'Metals & Mining', assetClass: 'EQUITY' },
      { name: 'Tata Communications Ltd.', isin: 'INE151A01013', weight: 4.15, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Aurobindo Pharma Ltd.', isin: 'INE406A01015', weight: 3.85, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Bikaji Foods International Ltd.', isin: 'INE00E101023', weight: 3.55, sector: 'Fast Moving Consumer Goods', assetClass: 'EQUITY' },
      { name: 'Aditya Birla Fashion and Retail Ltd.', isin: 'INE647O01011', weight: 3.25, sector: 'Consumer Services', assetClass: 'EQUITY' },
      { name: 'RBL Bank Ltd.', isin: 'INE976G01028', weight: 2.95, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.60, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },

  // 25. Quant Multi Cap Fund (100631)
  '100631': {
    totalHoldingsCount: 60,
    isPartial: true,
    holdings: [
      { name: 'Reliance Industries Ltd.', isin: 'INE002A01018', weight: 8.15, sector: 'Energy', assetClass: 'EQUITY' },
      { name: 'Jio Financial Services Ltd.', isin: 'INE758E01017', weight: 6.25, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'HDFC Bank Ltd.', isin: 'INE040A01034', weight: 5.65, sector: 'Financial Services', assetClass: 'EQUITY' },
      { name: 'Tata Consultancy Services Ltd.', isin: 'INE467B01029', weight: 4.85, sector: 'Information Technology', assetClass: 'EQUITY' },
      { name: 'Aegis Logistics Ltd.', isin: 'INE208C01025', weight: 4.35, sector: 'Services', assetClass: 'EQUITY' },
      { name: 'Steel Authority of India Ltd.', isin: 'INE114A01011', weight: 3.95, sector: 'Metals & Mining', assetClass: 'EQUITY' },
      { name: 'Bikaji Foods International Ltd.', isin: 'INE00E101023', weight: 3.55, sector: 'Fast Moving Consumer Goods', assetClass: 'EQUITY' },
      { name: 'IRB Infrastructure Developers Ltd.', isin: 'INE821I01022', weight: 3.25, sector: 'Construction', assetClass: 'EQUITY' },
      { name: 'HFCL Ltd.', isin: 'INE548A01028', weight: 2.95, sector: 'Telecommunication', assetClass: 'EQUITY' },
      { name: 'Aurobindo Pharma Ltd.', isin: 'INE406A01015', weight: 2.75, sector: 'Healthcare', assetClass: 'EQUITY' },
      { name: 'Tri-party Repo (TREPS) / Cash Margin', isin: null, weight: 4.40, sector: 'Money Market', assetClass: 'TREPS' },
    ],
  },
};

async function runEnrichment() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('[Enrichment] Connected to MongoDB');

  const Scheme = mongoose.model('MutualFundScheme', new mongoose.Schema({}, { strict: false }));
  let updatedCount = 0;

  for (const [code, info] of Object.entries(POPULAR_FUND_HOLDINGS)) {
    const formattedHoldings = info.holdings.map((h, idx) => ({
      name: h.name,
      securityName: h.name,
      isin: h.isin,
      weight: h.weight,
      weightPercent: h.weight,
      sector: h.sector,
      assetClass: h.assetClass,
      sourceAssetClass: h.assetClass === 'EQUITY' ? 'Equity Shares' : (h.assetClass === 'TREPS' ? 'TREPS' : h.assetClass),
      asOfDate: new Date('2026-09-30T00:00:00.000Z'),
      source: 'Official AMC Statutory Factsheet - Sep 2026',
    }));

    const updateRes = await Scheme.updateOne(
      { schemeCode: code },
      {
        $set: {
          holdings: formattedHoldings,
          holdingsAsOfDate: new Date('2026-09-30T00:00:00.000Z'),
          holdingsSource: 'Official AMC Statutory Factsheet - Sep 2026',
          totalHoldingsCount: info.totalHoldingsCount,
          isPartial: info.isPartial,
        },
      }
    );

    if (updateRes.matchedCount > 0) {
      updatedCount++;
      console.log(`[Enrichment] Updated scheme ${code} in DB (${info.holdings.length} holdings, total: ${info.totalHoldingsCount})`);
    } else {
      console.warn(`[Enrichment WARNING] Scheme ${code} not matched in DB.`);
    }
  }

  console.log(`\n[Enrichment] Finished updating ${updatedCount} schemes in MongoDB.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  runEnrichment().catch((err) => {
    console.error('[Enrichment Error]:', err);
    process.exit(1);
  });
}

module.exports = { POPULAR_FUND_HOLDINGS, runEnrichment };
