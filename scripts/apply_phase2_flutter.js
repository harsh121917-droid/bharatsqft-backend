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

// 1. data/models/mf_scheme_model.dart
updateFile('data/models/mf_scheme_model.dart', (content) => {
  return `class MfSchemeModel {
  final String id;
  final String schemeCode;
  final String schemeName;
  final String amcCode;
  final String amcName;
  final String isin;
  final String category;
  final String subCategory;
  final double? nav;
  final DateTime? navDate;
  final double? cagr1Y;
  final double? cagr3Y;
  final double? cagr5Y;
  final double? return1M;
  final double? return3M;
  final double? return6M;
  final double? minPurchaseAmount;
  final double? minSipAmount;
  final int? rating;
  final String riskLevel;
  final String? fundManager;
  final double? aum;
  final double? expenseRatio;
  final String? benchmark;
  final String? exitLoad;
  final String? navSource;
  final bool isPopular;
  final bool isFeatured;
  final bool isRecommended;
  final List<NavHistoryPoint> navHistory;

  MfSchemeModel({
    required this.id,
    required this.schemeCode,
    required this.schemeName,
    required this.amcCode,
    required this.amcName,
    required this.isin,
    required this.category,
    required this.subCategory,
    this.nav,
    this.navDate,
    this.cagr1Y,
    this.cagr3Y,
    this.cagr5Y,
    this.return1M,
    this.return3M,
    this.return6M,
    this.minPurchaseAmount,
    this.minSipAmount,
    this.rating,
    required this.riskLevel,
    this.fundManager,
    this.aum,
    this.expenseRatio,
    this.benchmark,
    this.exitLoad,
    this.navSource,
    required this.isPopular,
    required this.isFeatured,
    this.isRecommended = false,
    this.navHistory = const [],
  });

  factory MfSchemeModel.fromJson(Map<String, dynamic> json) {
    return MfSchemeModel(
      id: json['_id']?.toString() ?? '',
      schemeCode: json['schemeCode']?.toString() ?? '',
      schemeName: json['schemeName']?.toString() ?? '',
      amcCode: json['amcCode']?.toString() ?? '',
      amcName: json['amcName']?.toString() ?? '',
      isin: json['isin']?.toString() ?? '',
      category: json['category']?.toString() ?? 'Equity',
      subCategory: json['subCategory']?.toString() ?? '',
      nav: (json['nav'] as num?)?.toDouble(),
      navDate: json['navDate'] != null ? DateTime.tryParse(json['navDate'].toString()) : null,
      cagr1Y: (json['cagr1Y'] as num?)?.toDouble(),
      cagr3Y: (json['cagr3Y'] as num?)?.toDouble(),
      cagr5Y: (json['cagr5Y'] as num?)?.toDouble(),
      return1M: (json['return1M'] as num?)?.toDouble(),
      return3M: (json['return3M'] as num?)?.toDouble(),
      return6M: (json['return6M'] as num?)?.toDouble(),
      minPurchaseAmount: (json['minPurchaseAmount'] as num?)?.toDouble(),
      minSipAmount: (json['minSipAmount'] as num?)?.toDouble(),
      rating: (json['rating'] as num?)?.toInt(),
      riskLevel: json['riskLevel']?.toString() ?? 'Moderate',
      fundManager: json['fundManager']?.toString(),
      aum: (json['aum'] as num?)?.toDouble(),
      expenseRatio: (json['expenseRatio'] as num?)?.toDouble(),
      benchmark: json['benchmark']?.toString(),
      exitLoad: json['exitLoad']?.toString(),
      navSource: json['navSource']?.toString(),
      isPopular: json['isPopular'] == true,
      isFeatured: json['isFeatured'] == true,
      isRecommended: json['isRecommended'] == true,
      navHistory: (json['navHistory'] as List<dynamic>?)
              ?.map((e) => NavHistoryPoint.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

class NavHistoryPoint {
  final String date;
  final double nav;

  NavHistoryPoint({required this.date, required this.nav});

  factory NavHistoryPoint.fromJson(Map<String, dynamic> json) {
    return NavHistoryPoint(
      date: json['date']?.toString() ?? '',
      nav: (json['nav'] as num?)?.toDouble() ?? 0.0,
    );
  }
}
`;
});

// 2. modules/mutual_funds/views/mf_nfo_view.dart
updateFile('modules/mutual_funds/views/mf_nfo_view.dart', (content) => {
  return content
    .replace('cagr1Y: 0.0,', 'cagr1Y: null,')
    .replace('cagr3Y: 0.0,', 'cagr3Y: null,')
    .replace('cagr5Y: 0.0,', 'cagr5Y: null,')
    .replace('rating: 5,', 'rating: null,')
    .replace("fundManager: 'Fund Manager',", 'fundManager: null,')
    .replace('aum: 0.0,', 'aum: null,')
    .replace('expenseRatio: 0.75,', 'expenseRatio: null,');
});

// 3. modules/mutual_funds/views/mf_scheme_detail_view.dart
updateFile('modules/mutual_funds/views/mf_scheme_detail_view.dart', (content) => {
  let updated = content;

  // Add '3M' to selector pills
  updated = updated.replace(
    "['1M', '6M', '1Y', '3Y', '5Y', 'All']",
    "['1M', '3M', '6M', '1Y', '3Y', '5Y', 'All']"
  );

  // Update _periodTypeLabel
  const oldLabelMethod = `  String get _periodTypeLabel {
    switch (_selectedPeriod) {
      case '3Y':
      case '5Y':
      case 'All':
      case '1Y':
        return '$_selectedPeriod annualised';
      case '1M':
      case '6M':
      default:
        return '$_selectedPeriod total';
    }
  }`;

  const newLabelMethod = `  String get _periodTypeLabel {
    switch (_selectedPeriod) {
      case '3Y':
      case '5Y':
        return '$_selectedPeriod annualised';
      case '1M':
      case '3M':
      case '6M':
      case '1Y':
      case 'All':
      default:
        return '$_selectedPeriod total';
    }
  }`;

  if (updated.includes(oldLabelMethod)) {
    updated = updated.replace(oldLabelMethod, newLabelMethod);
  }

  // Update return calculator section to eliminate hardcoded 12.8 and 12.0
  const oldCalcStart = `    double rate = widget.scheme.cagr3Y ?? 12.0;
    double years = 3;
    if (_calculatorPeriod == '6M') {
      rate = 12.8;
      years = 0.5;
    } else if (_calculatorPeriod == '1Y') {
      rate = widget.scheme.cagr1Y ?? 12.0;
      years = 1;
    } else if (_calculatorPeriod == '3Y') {
      rate = widget.scheme.cagr3Y ?? 12.0;
      years = 3;
    } else if (_calculatorPeriod == '5Y') {
      rate = widget.scheme.cagr5Y ?? 12.0;
      years = 5;
    }`;

  const newCalcStart = `    double? rate;
    double years = 3;
    if (_calculatorPeriod == '6M') {
      rate = (_detailData?['return6M'] as num?)?.toDouble();
      years = 0.5;
    } else if (_calculatorPeriod == '1Y') {
      rate = ((_detailData?['cagr1Y'] ?? widget.scheme.cagr1Y) as num?)?.toDouble();
      years = 1;
    } else if (_calculatorPeriod == '3Y') {
      rate = ((_detailData?['cagr3Y'] ?? widget.scheme.cagr3Y) as num?)?.toDouble();
      years = 3;
    } else if (_calculatorPeriod == '5Y') {
      rate = ((_detailData?['cagr5Y'] ?? widget.scheme.cagr5Y) as num?)?.toDouble();
      years = 5;
    }

    if (rate == null) {
      return Padding(
        padding: const EdgeInsets.only(left: 20, right: 20, bottom: 20),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: const Color(0xFF0F141E),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                'Return Calculator',
                style: TextStyle(color: textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              Text(
                'Calculations are unavailable because this scheme does not have verified historical returns for $_calculatorPeriod.',
                textAlign: TextAlign.center,
                style: TextStyle(color: textSecondary, fontSize: 13),
              ),
            ],
          ),
        ),
      );
    }`;

  if (updated.includes(oldCalcStart)) {
    updated = updated.replace(oldCalcStart, newCalcStart);
  }

  // Direct return resolution in _currentReturn
  const oldDirectReturn = `    // 2. Direct CAGR from backend root data if available
    if (_detailData != null) {
      if (_selectedPeriod == '1Y' && _detailData!['cagr1Y'] != null) {
        return (_detailData!['cagr1Y'] as num).toDouble();
      }
      if (_selectedPeriod == '3Y' && _detailData!['cagr3Y'] != null) {
        return (_detailData!['cagr3Y'] as num).toDouble();
      }
      if (_selectedPeriod == '5Y' && _detailData!['cagr5Y'] != null) {
        return (_detailData!['cagr5Y'] as num).toDouble();
      }
    }`;

  const newDirectReturn = `    // 2. Direct returns/CAGR from backend root data if available
    if (_detailData != null) {
      if (_selectedPeriod == '1M' && _detailData!['return1M'] != null) {
        return (_detailData!['return1M'] as num).toDouble();
      }
      if (_selectedPeriod == '3M' && _detailData!['return3M'] != null) {
        return (_detailData!['return3M'] as num).toDouble();
      }
      if (_selectedPeriod == '6M' && _detailData!['return6M'] != null) {
        return (_detailData!['return6M'] as num).toDouble();
      }
      if (_selectedPeriod == '1Y' && _detailData!['cagr1Y'] != null) {
        return (_detailData!['cagr1Y'] as num).toDouble();
      }
      if (_selectedPeriod == '3Y' && _detailData!['cagr3Y'] != null) {
        return (_detailData!['cagr3Y'] as num).toDouble();
      }
      if (_selectedPeriod == '5Y' && _detailData!['cagr5Y'] != null) {
        return (_detailData!['cagr5Y'] as num).toDouble();
      }
    }`;

  if (updated.includes(oldDirectReturn)) {
    updated = updated.replace(oldDirectReturn, newDirectReturn);
  }

  // Update chart painter unavailable message to handle insufficientData
  const oldUnavailable = `    if (rawPoints == null || rawPoints!.length <= 1) {
      final textPainter = TextPainter(
        text: const TextSpan(
          text: 'NAV chart data unavailable',
          style: TextStyle(color: Color(0xFF6B7280), fontSize: 12, fontWeight: FontWeight.w500),
        ),
        textDirection: TextDirection.ltr,
      )..layout();`;

  const newUnavailable = `    if (rawPoints == null || rawPoints!.length <= 1) {
      final textPainter = TextPainter(
        text: TextSpan(
          text: 'NAV chart data unavailable for this timeframe',
          style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12, fontWeight: FontWeight.w500),
        ),
        textDirection: TextDirection.ltr,
      )..layout();`;

  if (updated.includes(oldUnavailable)) {
    updated = updated.replace(oldUnavailable, newUnavailable);
  }

  return updated;
});

console.log('Phase 2 Flutter updates complete.');
