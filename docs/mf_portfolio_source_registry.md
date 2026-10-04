# VikaOne Mutual Fund — AMC Portfolio Source Registry

**Version**: 1.0.0 (Phase 5G)  
**Authority**: AMC Statutory Monthly Portfolio Disclosures (SEBI Master Circular on Mutual Funds)  
**Catalogue Scope**: All 55 Asset Management Companies (1,864 Regular + Growth Schemes)  

---

## 1. Registry Architecture & Operational Standards

Under SEBI regulations, each Mutual Fund Asset Management Company (AMC) must publish a complete portfolio disclosure of all schemes on a monthly basis within 10 days of the end of each month in a user-friendly and machine-readable spreadsheet (XLSX / CSV) on their official website.

The VikaOne Portfolio Source Registry defines:
1. **Official Portal**: The statutory disclosure landing URL for each AMC.
2. **Ingestion Format**: XLSX, CSV, or structured statutory tables.
3. **Parser Key**: Normalized parser pipeline adapter (`hdfc_v1`, `invesco_v1`, `bandhan_v1`, `ppfas_v1`, `generic_v1`, etc.).
4. **Identity Enforcement Rules**: Mandatory validation of `schemeCode + ISIN + AMC + Regular + Growth + portfolioAsOf`.

---

## 2. Complete AMC Registry (55 AMCs)

| # | AMC Code | AMC Name | Format | Frequency | Parser | Statutory Portal URL | Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `HDFC_MF` | HDFC Mutual Fund | XLSX | MONTHLY | `hdfc_v1` | `https://www.hdfcfund.com/statutory-disclosure/monthly-portfolio` | ACTIVE |
| 2 | `INVESCO_MF` | Invesco Mutual Fund | XLSX | MONTHLY | `invesco_v1` | `https://www.invescomutualfund.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 3 | `BANDHAN_MF` | Bandhan Mutual Fund | XLSX | MONTHLY | `bandhan_v1` | `https://bandhanmutual.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 4 | `PPFAS_MF` | PPFAS Mutual Fund | XLSX | MONTHLY | `ppfas_v1` | `https://amc.ppfas.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 5 | `ICICI_PRUDENTIA_MF` | ICICI Prudential Mutual Fund | XLSX | MONTHLY | `icici_v1` | `https://www.icicipruamc.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 6 | `UTI_MF` | UTI Mutual Fund | XLSX | MONTHLY | `uti_v1` | `https://www.utimf.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 7 | `FRANKLIN_MF` | Franklin Templeton Mutual Fund | XLSX | MONTHLY | `franklin_v1` | `https://www.franklintempletonindia.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 8 | `SBI_MF` | SBI Mutual Fund | XLSX | MONTHLY | `sbi_v1` | `https://www.sbimf.com/statutory-disclosure/monthly-portfolio` | ACTIVE |
| 9 | `NIPPON_INDIA_MF` | Nippon India Mutual Fund | XLSX | MONTHLY | `nippon_v1` | `https://mf.nipponindiaim.com/investor-service/downloads/factsheet-and-portfolio` | ACTIVE |
| 10 | `KOTAK_MAHINDRA_MF` | Kotak Mahindra Mutual Fund | XLSX | MONTHLY | `kotak_v1` | `https://www.kotakmf.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 11 | `AXIS_MF` | Axis Mutual Fund | XLSX | MONTHLY | `axis_v1` | `https://www.axismf.com/statutory-disclosures` | ACTIVE |
| 12 | `ADITYA_BIRLA_SU_MF` | Aditya Birla Sun Life Mutual Fund | XLSX | MONTHLY | `adityabirla_v1` | `https://mutualfund.adityabirlacapital.com/forms-and-downloads/portfolio-disclosures` | ACTIVE |
| 13 | `DSP_MF` | DSP Mutual Fund | XLSX | MONTHLY | `dsp_v1` | `https://www.dspim.com/mandatory-disclosures/portfolio-disclosures` | ACTIVE |
| 14 | `TATA_MF` | Tata Mutual Fund | XLSX | MONTHLY | `tata_v1` | `https://www.tatamutualfund.com/statutory-disclosures` | ACTIVE |
| 15 | `MIRAE_ASSET_MF` | Mirae Asset Mutual Fund | XLSX | MONTHLY | `mirae_v1` | `https://www.miraeassetmf.co.in/downloads/portfolio` | ACTIVE |
| 16 | `EDELWEISS_MF` | Edelweiss Mutual Fund | XLSX | MONTHLY | `edelweiss_v1` | `https://www.edelweissmf.com/statutory/monthly-portfolio` | ACTIVE |
| 17 | `BARODA_BNP_PARI_MF` | Baroda BNP Paribas Mutual Fund | XLSX | MONTHLY | `baroda_v1` | `https://www.barodabnpparibasmf.in/downloads/monthly-portfolio-disclosures` | ACTIVE |
| 18 | `CANARA_ROBECO_MF` | Canara Robeco Mutual Fund | XLSX | MONTHLY | `canara_v1` | `https://www.canararobeco.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 19 | `MOTILAL_OSWAL_MF` | Motilal Oswal Mutual Fund | XLSX | MONTHLY | `motilal_v1` | `https://www.motilaloswalmf.com/downloads/mutual-fund/monthly-portfolio` | ACTIVE |
| 20 | `HSBC_MF` | HSBC Mutual Fund | XLSX | MONTHLY | `hsbc_v1` | `https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources/statutory-disclosures` | ACTIVE |
| 21 | `QUANT_MF` | Quant Mutual Fund | XLSX | MONTHLY | `quant_v1` | `https://quantmutual.com/statutory-disclosures` | ACTIVE |
| 22 | `SUNDARAM_MF` | Sundaram Mutual Fund | XLSX | MONTHLY | `sundaram_v1` | `https://www.sundarammutual.com/Statutory_Disclosures` | ACTIVE |
| 23 | `UNION_MF` | Union Mutual Fund | XLSX | MONTHLY | `union_v1` | `https://www.unionmf.com/downloads/portfolio-disclosures` | ACTIVE |
| 24 | `MAHINDRA_MANULI_MF` | Mahindra Manulife Mutual Fund | XLSX | MONTHLY | `mahindra_v1` | `https://www.mahindramanulife.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 25 | `BANK_OF_INDIA_MF` | Bank of India Mutual Fund | XLSX | MONTHLY | `boi_v1` | `https://www.boimf.in/downloads/monthly-portfolio` | ACTIVE |
| 26 | `PGIM_INDIA_MF` | PGIM India Mutual Fund | XLSX | MONTHLY | `pgim_v1` | `https://www.pgimindiamf.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 27 | `BAJAJ_FINSERV_MF` | Bajaj Finserv Mutual Fund | XLSX | MONTHLY | `bajaj_v1` | `https://www.bajajamc.com/statutory-disclosures` | ACTIVE |
| 28 | `WHITE_OAK_CAPIT_MF` | WhiteOak Capital Mutual Fund | XLSX | MONTHLY | `whiteoak_v1` | `https://mf.whiteoaktax.com/statutory-disclosures` | ACTIVE |
| 29 | `GROWW_MF` | Groww Mutual Fund | XLSX | MONTHLY | `groww_v1` | `https://www.growwmf.in/statutory-disclosures` | ACTIVE |
| 30 | `JM_FINANCIAL_MF` | JM Financial Mutual Fund | XLSX | MONTHLY | `jm_v1` | `https://www.jmfinancialmf.com/Downloads/MonthlyPortfolio.aspx` | ACTIVE |
| 31 | `LIC_MF` | LIC Mutual Fund | XLSX | MONTHLY | `lic_v1` | `https://www.licmf.com/statutory-disclosure/monthly-portfolio` | ACTIVE |
| 32 | `QUANTUM_MF` | Quantum Mutual Fund | XLSX | MONTHLY | `quantum_v1` | `https://www.quantumamc.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 33 | `TAURUS_MF` | Taurus Mutual Fund | XLSX | MONTHLY | `taurus_v1` | `https://www.taurusmutualfund.com/Download/monthly_portfolio.php` | ACTIVE |
| 34 | `NAVI_MF` | Navi Mutual Fund | XLSX | MONTHLY | `navi_v1` | `https://navi.com/mutual-fund/statutory-disclosures` | ACTIVE |
| 35 | `ITI_MF` | ITI Mutual Fund | XLSX | MONTHLY | `iti_v1` | `https://www.itiamc.com/statutory-disclosures/monthly-portfolio` | ACTIVE |
| 36 | `TRUST_MF` | Trust Mutual Fund | XLSX | MONTHLY | `trust_v1` | `https://www.trustmf.com/downloads/statutory-disclosures` | ACTIVE |
| 37 | `SAMCO_MF` | Samco Mutual Fund | XLSX | MONTHLY | `samco_v1` | `https://www.samcomf.com/statutory-disclosures` | ACTIVE |
| 38 | `NJ_MF` | NJ Mutual Fund | XLSX | MONTHLY | `nj_v1` | `https://www.njmutualfund.com/downloads/monthly-portfolio` | ACTIVE |
| 39 | `SHRIRAM_MF` | Shriram Mutual Fund | XLSX | MONTHLY | `shriram_v1` | `https://www.shrirammf.in/statutory-disclosures` | ACTIVE |
| 40 | `360_ONE_MF` | 360 ONE Mutual Fund | XLSX | MONTHLY | `360one_v1` | `https://www.iiflmf.com/statutory-disclosures` | ACTIVE |
| 41 | `HELIOS_MF` | Helios Mutual Fund | XLSX | MONTHLY | `helios_v1` | `https://www.heliosmf.com/statutory-disclosures` | ACTIVE |
| 42 | `OLD_BRIDGE_MF` | Old Bridge Mutual Fund | XLSX | MONTHLY | `oldbridge_v1` | `https://www.oldbridgemf.com/statutory-disclosures` | ACTIVE |
| 43 | `JIO_BLACKROCK_MF` | Jio BlackRock Mutual Fund | XLSX | MONTHLY | `jio_v1` | `https://www.jioblackrock.com/disclosures` | ACTIVE |
| 44 | `UNIFI_MF` | Unifi Mutual Fund | XLSX | MONTHLY | `unifi_v1` | `https://www.unifiamc.com/disclosures` | ACTIVE |
| 45 | `ABAKKUS_MF` | Abakkus Mutual Fund | XLSX | MONTHLY | `abakkus_v1` | `https://www.abakkusinvest.com/disclosures` | ACTIVE |
| 46 | `ALPHAGREP_MF` | AlphaGrep Mutual Fund | XLSX | MONTHLY | `alphagrep_v1` | `https://www.alphagrepmf.com/disclosures` | ACTIVE |
| 47 | `CAPITALMIND_MF` | Capitalmind Mutual Fund | XLSX | MONTHLY | `capitalmind_v1` | `https://www.capitalmindmf.com/disclosures` | ACTIVE |
| 48 | `CHOICE_MF` | Choice Mutual Fund | XLSX | MONTHLY | `choice_v1` | `https://www.choicemutualfund.com/disclosures` | ACTIVE |
| 49 | `FIRST_WATER_MF` | First Water Mutual Fund | XLSX | MONTHLY | `firstwater_v1` | `https://www.firstwatermf.com/disclosures` | ACTIVE |
| 50 | `FRONT_MARGIN_MF` | Front Margin Mutual Fund | XLSX | MONTHLY | `frontmargin_v1` | `https://www.frontmarginmf.com/disclosures` | ACTIVE |
| 51 | `INNO_VEST_MF` | InnoVest Mutual Fund | XLSX | MONTHLY | `innovest_v1` | `https://www.innovestmf.com/disclosures` | ACTIVE |
| 52 | `KBC_MF` | KBC Mutual Fund | XLSX | MONTHLY | `kbc_v1` | `https://www.kbcmf.com/disclosures` | ACTIVE |
| 53 | `ANGEL_ONE_MF` | Angel One Mutual Fund | XLSX | MONTHLY | `angelone_v1` | `https://www.angelonemf.com/statutory-disclosures` | ACTIVE |
| 54 | `MONARCH_MF` | Monarch Mutual Fund | XLSX | MONTHLY | `monarch_v1` | `https://www.monarchmf.com/statutory-disclosures` | ACTIVE |
| 55 | `ZERODHA_MF` | Zerodha Mutual Fund | XLSX | MONTHLY | `zerodha_v1` | `https://www.zerodhafundhouse.com/statutory-disclosures` | ACTIVE |
