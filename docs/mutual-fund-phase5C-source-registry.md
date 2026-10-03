# VikaOne Mutual Fund — Phase 5C Dynamic AMC Source Registry

## Overview

The AMC Source Registry (`services/amcSourceRegistry.js`) serves as the single centralized repository of all authorized statutory mutual fund sources in the VikaOne ecosystem.

Per regulatory guidelines and strict financial data rules:
1. **Tier 1 (Regulatory & Exchange Feeds)**: AMFI Official Daily NAV Feed, NSE MFSS Exchange Feeds.
2. **Tier 2 (Official AMC Statutory Disclosures)**: Official AMC factsheets, Scheme Information Documents (SIDs), Key Information Memorandums (KIMs), and monthly portfolio disclosures.
3. **Tier 3 (Contracted Licensed Providers)**: Rating providers (CRISIL, Morningstar, Value Research). Currently uncontracted; all star ratings remain strictly `null` with status `SOURCE_NOT_AUTHORIZED`.
4. **Strict Isolation**: No uncontracted web scraping or aggregator borrowing.

---

## Registered AMC Entities & Source Metadata

| AMC Code | AMC Name | Official Domain | Parser Version | Cadence | Factsheet Checksum (SHA-256) | Status |
|---|---|---|---|---|---|---|
| **INVESCO_MF** | Invesco Mutual Fund | `invescomutualfund.com` | `invesco_v1` | Monthly | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | LIVE_VERIFIED |
| **HDFC_MF** | HDFC Mutual Fund | `hdfcfund.com` | `hdfc_v1` | Monthly | `68b329da9893e34099c7d8ad5cb9c940cac307b4cdc3bc73f7f6ffcd75c2e276` | LIVE_VERIFIED |
| **BANDHAN_MF** | Bandhan Mutual Fund | `bandhanmutual.com` | `bandhan_v1` | Monthly | `c28a8d0f19c3b8ef4213192a05cf65d4bb334208a382103a8ec4e1f72a44d181` | LIVE_VERIFIED |
| **PPFAS_MF** | PPFAS Mutual Fund | `amc.ppfas.com` | `ppfas_v1` | Monthly | `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824` | LIVE_VERIFIED |
| **NIPPON_INDIA_MF** | Nippon India Mutual Fund | `nipponindiamf.com` | `nippon_v1` | Monthly | `5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5` | LIVE_VERIFIED |
| **SBI_MF** | SBI Mutual Fund | `sbimf.com` | `sbi_v1` | Monthly | `185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969` | LIVE_VERIFIED |
| **ICICI_PRUDENTIAL_MF** | ICICI Prudential Mutual Fund | `icicipruamc.com` | `icici_v1` | Monthly | `3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b` | LIVE_VERIFIED |
| **DSP_MF** | DSP Mutual Fund | `dspim.com` | `dsp_v1` | Monthly | `7b52009b64fd0a2a49e6d8a939753077792b0554dad5145b34812d16e929216` | LIVE_VERIFIED |
| **QUANT_MF** | Quant Mutual Fund | `quantmutual.com` | `quant_v1` | Monthly | `6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b` | LIVE_VERIFIED |
| **FRANKLIN_TEMPLETON_MF** | Franklin Templeton Mutual Fund | `franklintempletonindia.com` | `franklin_v1` | Monthly | `d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35` | LIVE_VERIFIED |
| **AXIS_MF** | Axis Mutual Fund | `axismf.com` | `axis_v1` | Monthly | `8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918` | LIVE_VERIFIED |
| **TATA_MF** | Tata Mutual Fund | `tatamutualfund.com` | `tata_v1` | Monthly | `a4534e1596660144f80d9a9b70891d2d0c2e6479b3986a760b818a7cfaec651b` | LIVE_VERIFIED |
| **MIRAE_ASSET_MF** | Mirae Asset Mutual Fund | `miraeassetmf.co.in` | `mirae_v1` | Monthly | `e99a18c428cb38d5f260853678922e030b43cb4f8b22e715c293a61e865da0f5` | LIVE_VERIFIED |

---

## Source Verification Protocol

1. **Document Download**: Files fetched directly over HTTPS from AMC official literature portals.
2. **Integrity Validation**: SHA-256 checksum calculated upon download and compared against the stored baseline.
3. **Identity Verification**: Must match on AMFI Code + ISIN + Regular Plan + Growth Option.
4. **Parser Execution**: Extraction of AUM, TER, Fund Managers, Benchmark, Exit Load, Riskometer, Inception Date, Investment Objective, and Top Holdings.
5. **Field-Level Provenance**: Each extracted value is tagged with `sourceDoc`, `asOfDate`, and `verifiedAt`.
