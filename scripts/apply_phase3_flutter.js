const fs = require('fs');
const path = require('path');

const FLUTTER_LIB = 'C:\\Ashahad\\Porwal\\GoldVikaone\\lib';

function updateFile(relPath, transformFn) {
  const fullPath = path.join(FLUTTER_LIB, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    return;
  }
  const original = fs.readFileSync(fullPath, 'utf8');
  const updated = transformFn(original);
  if (original !== updated) {
    fs.writeFileSync(fullPath, updated, 'utf8');
    console.log(`Updated: ${relPath}`);
  } else {
    console.log(`No changes needed: ${relPath}`);
  }
}

// 1. data/models/mf_portfolio_model.dart
updateFile('data/models/mf_portfolio_model.dart', (content) => {
  return `class MfPortfolioSummary {
  final double totalInvested;
  final double currentValuation;
  final double totalProfitLoss;
  final double totalProfitLossPct;
  final double? todayChangeAmount;
  final double? todayChangePct;
  final double? xirr;
  final int totalFunds;
  final int activeSipsCount;

  MfPortfolioSummary({
    required this.totalInvested,
    required this.currentValuation,
    required this.totalProfitLoss,
    required this.totalProfitLossPct,
    this.todayChangeAmount,
    this.todayChangePct,
    this.xirr,
    required this.totalFunds,
    required this.activeSipsCount,
  });

  factory MfPortfolioSummary.fromJson(Map<String, dynamic> json) {
    return MfPortfolioSummary(
      totalInvested: (json['totalInvested'] as num?)?.toDouble() ?? 0.0,
      currentValuation: (json['currentValuation'] as num?)?.toDouble() ?? 0.0,
      totalProfitLoss: (json['totalProfitLoss'] as num?)?.toDouble() ?? 0.0,
      totalProfitLossPct: (json['totalProfitLossPct'] as num?)?.toDouble() ?? 0.0,
      todayChangeAmount: (json['todayChangeAmount'] as num?)?.toDouble(),
      todayChangePct: (json['todayChangePct'] as num?)?.toDouble(),
      xirr: (json['xirr'] as num?)?.toDouble(),
      totalFunds: (json['totalFunds'] as num?)?.toInt() ?? 0,
      activeSipsCount: (json['activeSipsCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class MfHolding {
  final String schemeCode;
  final String schemeName;
  final String? amcName;
  final String? category;
  final String? subCategory;
  final double totalUnits;
  final double investedAmount;
  final double? averageNav;
  final double currentNav;
  final DateTime? navDate;
  final double currentValue;
  final double profitLoss;
  final double profitLossPct;
  final double? pendingUnits;

  MfHolding({
    required this.schemeCode,
    required this.schemeName,
    this.amcName,
    this.category,
    this.subCategory,
    required this.totalUnits,
    required this.investedAmount,
    this.averageNav,
    required this.currentNav,
    this.navDate,
    required this.currentValue,
    required this.profitLoss,
    required this.profitLossPct,
    this.pendingUnits,
  });

  factory MfHolding.fromJson(Map<String, dynamic> json) {
    return MfHolding(
      schemeCode: json['schemeCode']?.toString() ?? '',
      schemeName: json['schemeName']?.toString() ?? '',
      amcName: json['amcName']?.toString(),
      category: json['category']?.toString(),
      subCategory: json['subCategory']?.toString(),
      totalUnits: (json['totalUnits'] as num?)?.toDouble() ?? 0.0,
      investedAmount: (json['investedAmount'] as num?)?.toDouble() ?? 0.0,
      averageNav: (json['averageNav'] as num?)?.toDouble(),
      currentNav: (json['currentNav'] as num?)?.toDouble() ?? 0.0,
      navDate: json['navDate'] != null ? DateTime.tryParse(json['navDate'].toString()) : null,
      currentValue: (json['currentValue'] as num?)?.toDouble() ?? 0.0,
      profitLoss: (json['profitLoss'] as num?)?.toDouble() ?? 0.0,
      profitLossPct: (json['profitLossPct'] as num?)?.toDouble() ?? 0.0,
      pendingUnits: (json['pendingUnits'] as num?)?.toDouble(),
    );
  }
}

class MfActiveSip {
  final String id;
  final String sipRegNo;
  final String schemeCode;
  final String schemeName;
  final String frequency;
  final double installmentAmount;
  final DateTime? nextDueDate;
  final String status;
  final int installmentsPaid;

  MfActiveSip({
    required this.id,
    required this.sipRegNo,
    required this.schemeCode,
    required this.schemeName,
    required this.frequency,
    required this.installmentAmount,
    this.nextDueDate,
    required this.status,
    required this.installmentsPaid,
  });

  factory MfActiveSip.fromJson(Map<String, dynamic> json) {
    return MfActiveSip(
      id: json['_id']?.toString() ?? '',
      sipRegNo: json['sipRegNo']?.toString() ?? '',
      schemeCode: json['schemeCode']?.toString() ?? '',
      schemeName: json['schemeName']?.toString() ?? '',
      frequency: json['frequency']?.toString() ?? 'MONTHLY',
      installmentAmount: (json['installmentAmount'] as num?)?.toDouble() ?? 0.0,
      nextDueDate: json['nextDueDate'] != null ? DateTime.tryParse(json['nextDueDate'].toString()) : null,
      status: json['status']?.toString() ?? 'ACTIVE',
      installmentsPaid: (json['installmentsPaid'] as num?)?.toInt() ?? 0,
    );
  }
}

class MfTransactionModel {
  final String id;
  final String schemeCode;
  final String schemeName;
  final String transactionType;
  final DateTime transactionDate;
  final double orderAmount;
  final double units;
  final double nav;
  final String status;
  final String? externalReference;

  MfTransactionModel({
    required this.id,
    required this.schemeCode,
    required this.schemeName,
    required this.transactionType,
    required this.transactionDate,
    required this.orderAmount,
    required this.units,
    required this.nav,
    required this.status,
    this.externalReference,
  });

  factory MfTransactionModel.fromJson(Map<String, dynamic> json) {
    return MfTransactionModel(
      id: json['_id']?.toString() ?? '',
      schemeCode: json['schemeCode']?.toString() ?? '',
      schemeName: json['schemeName']?.toString() ?? '',
      transactionType: json['transactionType']?.toString() ?? 'PURCHASE',
      transactionDate: DateTime.tryParse(json['transactionDate']?.toString() ?? '') ?? DateTime.now(),
      orderAmount: (json['orderAmount'] as num?)?.toDouble() ?? 0.0,
      units: (json['units'] as num?)?.toDouble() ?? 0.0,
      nav: (json['nav'] as num?)?.toDouble() ?? 0.0,
      status: json['status']?.toString() ?? 'CONFIRMED',
      externalReference: json['externalReference']?.toString(),
    );
  }
}

class MfCapitalGainSummary {
  final String financialYear;
  final double totalProceeds;
  final double totalCost;
  final double netRealizedGain;
  final double stcg;
  final double ltcg;
  final int totalRedemptionsCount;
  final String disclaimer;

  MfCapitalGainSummary({
    required this.financialYear,
    required this.totalProceeds,
    required this.totalCost,
    required this.netRealizedGain,
    required this.stcg,
    required this.ltcg,
    required this.totalRedemptionsCount,
    required this.disclaimer,
  });

  factory MfCapitalGainSummary.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? {};
    return MfCapitalGainSummary(
      financialYear: json['financialYear']?.toString() ?? '',
      totalProceeds: (summary['totalProceeds'] as num?)?.toDouble() ?? 0.0,
      totalCost: (summary['totalCost'] as num?)?.toDouble() ?? 0.0,
      netRealizedGain: (summary['netRealizedGain'] as num?)?.toDouble() ?? 0.0,
      stcg: (summary['stcg'] as num?)?.toDouble() ?? 0.0,
      ltcg: (summary['ltcg'] as num?)?.toDouble() ?? 0.0,
      totalRedemptionsCount: (summary['totalRedemptionsCount'] as num?)?.toInt() ?? 0,
      disclaimer: summary['disclaimer']?.toString() ?? '',
    );
  }
}

class MfUccModel {
  final String clientCode;
  final String pan;
  final String nseStatus;
  final String accountNo;
  final String ifsc;
  final String bankName;

  MfUccModel({
    required this.clientCode,
    required this.pan,
    required this.nseStatus,
    required this.accountNo,
    required this.ifsc,
    required this.bankName,
  });

  factory MfUccModel.fromJson(Map<String, dynamic> json) {
    final primaryBank = json['primaryBank'] as Map<String, dynamic>? ?? {};
    return MfUccModel(
      clientCode: json['clientCode']?.toString() ?? '',
      pan: json['pan']?.toString() ?? '',
      nseStatus: json['nseStatus']?.toString() ?? 'ACTIVE',
      accountNo: primaryBank['accountNo']?.toString() ?? '',
      ifsc: primaryBank['ifsc']?.toString() ?? '',
      bankName: primaryBank['bankName']?.toString() ?? '',
    );
  }
}
`;
});

// 2. modules/mutual_funds/views/mf_portfolio_view.dart
updateFile('modules/mutual_funds/views/mf_portfolio_view.dart', (content) => {
  let updated = content;

  // Replace static copy with clean generic onboarding prompt
  updated = updated.replace(
    "Text('Start investing with as little as ₹500/month', style: TextStyle(color: textSecondary, fontSize: 13)),",
    "Text('Start your investment journey in top Regular mutual funds', style: TextStyle(color: textSecondary, fontSize: 13)),"
  );

  // Update Summary Card to include Investor XIRR
  const oldRowEnd = `                            const SizedBox(height: 3),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: (summary?.totalProfitLoss ?? 0) >= 0
                                    ? const Color(0xFF10B981).withOpacity(0.2)
                                    : Colors.red.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                '\${(summary?.totalProfitLoss ?? 0) >= 0 ? '+' : ''}₹\${summary?.totalProfitLoss.toStringAsFixed(2) ?? '0.00'} (\${summary?.totalProfitLossPct.toStringAsFixed(2) ?? '0.00'}%)',
                                style: TextStyle(
                                  color: (summary?.totalProfitLoss ?? 0) >= 0 ? const Color(0xFF10B981) : Colors.red,
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),`;

  const newRowEnd = `                            const SizedBox(height: 3),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: (summary?.totalProfitLoss ?? 0) >= 0
                                    ? const Color(0xFF10B981).withValues(alpha: 0.2)
                                    : Colors.red.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                '\${(summary?.totalProfitLoss ?? 0) >= 0 ? '+' : ''}₹\${summary?.totalProfitLoss.toStringAsFixed(2) ?? '0.00'} (\${summary?.totalProfitLossPct.toStringAsFixed(2) ?? '0.00'}%)',
                                style: TextStyle(
                                  color: (summary?.totalProfitLoss ?? 0) >= 0 ? const Color(0xFF10B981) : Colors.red,
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    if (summary?.xirr != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Your XIRR (Investor Return)', style: TextStyle(color: Colors.white70, fontSize: 12)),
                            Text(
                              '\${(summary!.xirr ?? 0) >= 0 ? '+' : ''}\${summary!.xirr!.toStringAsFixed(2)}% p.a.',
                              style: TextStyle(
                                color: (summary!.xirr ?? 0) >= 0 ? const Color(0xFF00D09C) : Colors.red,
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),`;

  if (updated.includes(oldRowEnd)) {
    updated = updated.replace(oldRowEnd, newRowEnd);
  }

  return updated;
});

console.log('Phase 3 Flutter updates applied.');
