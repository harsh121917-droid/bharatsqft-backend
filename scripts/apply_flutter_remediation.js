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

// 1. mf_scheme_model.dart
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
  final double? minPurchaseAmount;
  final double? minSipAmount;
  final int? rating;
  final String riskLevel;
  final String? fundManager;
  final double? aum;
  final double? expenseRatio;
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
    this.minPurchaseAmount,
    this.minSipAmount,
    this.rating,
    required this.riskLevel,
    this.fundManager,
    this.aum,
    this.expenseRatio,
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
      minPurchaseAmount: (json['minPurchaseAmount'] as num?)?.toDouble(),
      minSipAmount: (json['minSipAmount'] as num?)?.toDouble(),
      rating: (json['rating'] as num?)?.toInt(),
      riskLevel: json['riskLevel']?.toString() ?? 'Moderate',
      fundManager: json['fundManager']?.toString(),
      aum: (json['aum'] as num?)?.toDouble(),
      expenseRatio: (json['expenseRatio'] as num?)?.toDouble(),
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

// 2. mutual_funds_controller.dart
updateFile('modules/mutual_funds/controllers/mutual_funds_controller.dart', (content) => {
  let res = content;
  // Clear hardcoded watchlist schemes
  res = res.replace(
    "final RxList<String> watchlistSchemeCodes = <String>['1001', '1003', '1004'].obs;",
    "final RxList<String> watchlistSchemeCodes = <String>[].obs;"
  );
  // Null-safe sorting in popularFunds
  res = res.replace(
    'list.sort((a, b) => b.cagr3Y.compareTo(a.cagr3Y));',
    'list.sort((a, b) => (b.cagr3Y ?? 0.0).compareTo(a.cagr3Y ?? 0.0));'
  );
  // Delete _getDefaultSchemes()
  const defSchemesIndex = res.indexOf('// ── Verified Default Schemes Matching Reference Groww Catalog ──');
  const onboardingIndex = res.indexOf('// ── Fetch Onboarding & SIP Readiness Status');
  if (defSchemesIndex !== -1 && onboardingIndex !== -1) {
    res = res.slice(0, defSchemesIndex) + res.slice(onboardingIndex);
  }
  return res;
});

// 3. mf_scheme_detail_view.dart
updateFile('modules/mutual_funds/views/mf_scheme_detail_view.dart', (content) => {
  let res = content;
  // Replace fallback CAGR in _currentReturn
  const oldSwitchBlock = `    // 4. Fallback to widget.scheme CAGR rates
    switch (_selectedPeriod) {
      case '1Y':
        if (widget.scheme.cagr1Y > 0) return widget.scheme.cagr1Y;
        break;
      case '3Y':
        if (widget.scheme.cagr3Y > 0) return widget.scheme.cagr3Y;
        break;
      case '5Y':
        if (widget.scheme.cagr5Y > 0) return widget.scheme.cagr5Y;
        break;
    }`;

  const newSwitchBlock = `    // 4. Fallback to widget.scheme CAGR rates
    switch (_selectedPeriod) {
      case '1Y':
        if ((widget.scheme.cagr1Y ?? 0) > 0) return widget.scheme.cagr1Y;
        break;
      case '3Y':
        if ((widget.scheme.cagr3Y ?? 0) > 0) return widget.scheme.cagr3Y;
        break;
      case '5Y':
        if ((widget.scheme.cagr5Y ?? 0) > 0) return widget.scheme.cagr5Y;
        break;
    }`;
  res = res.replace(oldSwitchBlock, newSwitchBlock);

  // Replace hardcoded returns in fallback
  const oldHardFallback = `    // 6. Hard fallback to scheme CAGR rates
    switch (_selectedPeriod) {
      case '1M':
        return -0.98;
      case '6M':
        return 14.50;
      case '1Y':
        return widget.scheme.cagr1Y;
      case '3Y':
        return widget.scheme.cagr3Y;
      case '5Y':
        return widget.scheme.cagr5Y;
      case 'All':
        return widget.scheme.cagr5Y > 0 ? (widget.scheme.cagr5Y * 1.35) : 30.40;
      default:
        return widget.scheme.cagr3Y;
    }`;

  const newHardFallback = `    // 6. Hard fallback to scheme CAGR rates without fabricating data
    switch (_selectedPeriod) {
      case '1Y':
        return widget.scheme.cagr1Y;
      case '3Y':
        return widget.scheme.cagr3Y;
      case '5Y':
        return widget.scheme.cagr5Y;
      default:
        return null;
    }`;
  res = res.replace(oldHardFallback, newHardFallback);

  // Change _currentReturn to double?
  res = res.replace('double get _currentReturn {', 'double? get _currentReturn {');
  res = res.replace('bool get _isNegativeReturn => _currentReturn < 0;', 'bool get _isNegativeReturn => (_currentReturn ?? 0.0) < 0;');

  // Day 1 return fallback
  res = res.replace('return 0.58;', 'return 0.0;');

  // Text rendering of _currentReturn
  res = res.replace(
    '\'${_currentReturn >= 0 ? "+" : ""}${_currentReturn.toStringAsFixed(2)}%\',',
    '_currentReturn != null ? \'${_currentReturn! >= 0 ? "+" : ""}${_currentReturn!.toStringAsFixed(2)}%\' : \'—\','
  );
  res = res.replace(
    '\'${_currentReturn >= 0 ? \'+\' : \'\'}${_currentReturn.toStringAsFixed(2)}%\',',
    '_currentReturn != null ? \'${_currentReturn! >= 0 ? "+" : ""}${_currentReturn!.toStringAsFixed(2)}%\' : \'—\','
  );

  // Min SIP amount in detail
  res = res.replace(
    "Expanded(child: _buildMetricItem('Min. SIP amount', '₹${widget.scheme.minSipAmount.toInt()}', textSecondary, textPrimary)),",
    "Expanded(child: _buildMetricItem('Min. SIP amount', widget.scheme.minSipAmount != null ? '₹${widget.scheme.minSipAmount!.toInt()}' : '—', textSecondary, textPrimary)),"
  );

  // Returns and rankings comparison section
  const oldComp = `    final y1Fund = comp?['1Y']?['fund']?.toString() ?? widget.scheme.cagr1Y.toStringAsFixed(1);
    final y3Fund = comp?['3Y']?['fund']?.toString() ?? widget.scheme.cagr3Y.toStringAsFixed(1);
    final y5Fund = comp?['5Y']?['fund']?.toString() ?? widget.scheme.cagr5Y.toStringAsFixed(1);
    final allFund = comp?['All']?['fund']?.toString() ?? (widget.scheme.cagr3Y * 1.08).toStringAsFixed(1);

    final y1Avg = comp?['1Y']?['categoryAvg']?.toString() ?? (widget.scheme.cagr1Y * 0.88).toStringAsFixed(1);
    final y3Avg = comp?['3Y']?['categoryAvg']?.toString() ?? (widget.scheme.cagr3Y * 0.85).toStringAsFixed(1);
    final y5Avg = comp?['5Y']?['categoryAvg']?.toString() ?? (widget.scheme.cagr5Y * 0.86).toStringAsFixed(1);
    final allAvg = comp?['All']?['categoryAvg']?.toString() ?? (widget.scheme.cagr3Y * 0.82).toStringAsFixed(1);

    final y1Rank = comp?['1Y']?['rank']?.toString() ?? '2';
    final y3Rank = comp?['3Y']?['rank']?.toString() ?? '1';
    final y5Rank = comp?['5Y']?['rank']?.toString() ?? '2';
    final allRank = comp?['All']?['rank']?.toString() ?? '1';`;

  const newComp = `    final y1Fund = comp?['1Y']?['fund'] != null ? '\${comp!['1Y']['fund']}%' : (widget.scheme.cagr1Y != null ? '\${widget.scheme.cagr1Y!.toStringAsFixed(1)}%' : '—');
    final y3Fund = comp?['3Y']?['fund'] != null ? '\${comp!['3Y']['fund']}%' : (widget.scheme.cagr3Y != null ? '\${widget.scheme.cagr3Y!.toStringAsFixed(1)}%' : '—');
    final y5Fund = comp?['5Y']?['fund'] != null ? '\${comp!['5Y']['fund']}%' : (widget.scheme.cagr5Y != null ? '\${widget.scheme.cagr5Y!.toStringAsFixed(1)}%' : '—');
    final allFund = comp?['All']?['fund'] != null ? '\${comp!['All']['fund']}%' : '—';

    final y1Avg = comp?['1Y']?['categoryAvg'] != null ? '\${comp!['1Y']['categoryAvg']}%' : '—';
    final y3Avg = comp?['3Y']?['categoryAvg'] != null ? '\${comp!['3Y']['categoryAvg']}%' : '—';
    final y5Avg = comp?['5Y']?['categoryAvg'] != null ? '\${comp!['5Y']['categoryAvg']}%' : '—';
    final allAvg = comp?['All']?['categoryAvg'] != null ? '\${comp!['All']['categoryAvg']}%' : '—';

    final y1Rank = comp?['1Y']?['rank'] != null ? '#\${comp!['1Y']['rank']}' : '—';
    final y3Rank = comp?['3Y']?['rank'] != null ? '#\${comp!['3Y']['rank']}' : '—';
    final y5Rank = comp?['5Y']?['rank'] != null ? '#\${comp!['5Y']['rank']}' : '—';
    final allRank = comp?['All']?['rank'] != null ? '#\${comp!['All']['rank']}' : '—';`;
  res = res.replace(oldComp, newComp);

  // Rate in calculator
  res = res.replace('double rate = widget.scheme.cagr3Y;', 'double rate = widget.scheme.cagr3Y ?? 12.0;');
  res = res.replace('rate = widget.scheme.cagr1Y;', 'rate = widget.scheme.cagr1Y ?? 12.0;');
  res = res.replace('rate = widget.scheme.cagr3Y;', 'rate = widget.scheme.cagr3Y ?? 12.0;');
  res = res.replace('rate = widget.scheme.cagr5Y;', 'rate = widget.scheme.cagr5Y ?? 12.0;');

  // Similar funds mock removal
  const oldSimilarMock = `    } else {
      similarFunds = [
        {'name': widget.scheme.schemeName, 'returns': '\${widget.scheme.cagr3Y.toStringAsFixed(2)}%', 'isCurrent': true},
        {'name': 'Bandhan Small Cap Fund', 'returns': '24.78%', 'isCurrent': false},
        {'name': 'Nippon India Small Cap Fund', 'returns': '28.40%', 'isCurrent': false},
        {'name': 'Quant Small Cap Fund', 'returns': '28.90%', 'isCurrent': false},
        {'name': 'Tata Small Cap Fund', 'returns': '24.10%', 'isCurrent': false},
      ];
    }`;

  const newSimilarMock = `    } else {
      similarFunds = [
        {'name': widget.scheme.schemeName, 'returns': widget.scheme.cagr3Y != null ? '\${widget.scheme.cagr3Y!.toStringAsFixed(2)}%' : '—', 'isCurrent': true},
      ];
    }`;
  res = res.replace(oldSimilarMock, newSimilarMock);

  // Returns in similar funds
  res = res.replace(
    "'returns': '\${widget.scheme.cagr3Y.toStringAsFixed(2)}%',",
    "'returns': widget.scheme.cagr3Y != null ? '\${widget.scheme.cagr3Y!.toStringAsFixed(2)}%' : '—',"
  );

  // Fund house fake AUM and rank
  res = res.replace(
    "final rankVal = fh?['rank'] ?? '#4 in India';",
    "final rankVal = fh?['rank']?.toString() ?? '—';"
  );
  res = res.replace(
    "final totalAumVal = fh?['totalAum'] ?? '₹${(widget.scheme.aum * 12).toInt()} Crores';",
    "final totalAumVal = fh?['totalAum']?.toString() ?? (widget.scheme.aum != null ? '₹${widget.scheme.aum!.toInt()} Crores' : '—');"
  );

  return res;
});

// 4. mf_investment_checkout_sheet.dart
updateFile('modules/mutual_funds/views/mf_investment_checkout_sheet.dart', (content) => {
  let res = content;
  res = res.replace(
    'final defaultAmount = _isSip ? widget.scheme.minSipAmount : widget.scheme.minPurchaseAmount;',
    'final defaultAmount = (_isSip ? widget.scheme.minSipAmount : widget.scheme.minPurchaseAmount) ?? 1000.0;'
  );
  res = res.replace(
    '_amountController.text = widget.scheme.minSipAmount.toInt().toString();',
    '_amountController.text = (widget.scheme.minSipAmount ?? 500.0).toInt().toString();'
  );
  res = res.replace(
    '_amountController.text = widget.scheme.minPurchaseAmount.toInt().toString();',
    '_amountController.text = (widget.scheme.minPurchaseAmount ?? 1000.0).toInt().toString();'
  );
  return res;
});

// 5. mf_popular_funds_view.dart
updateFile('modules/mutual_funds/views/mf_popular_funds_view.dart', (content) => {
  let res = content;
  res = res.replace('double returnVal = s.cagr3Y;', 'double? returnVal = s.cagr3Y;');
  res = res.replace(
    'if (s.rating > 0) ...[',
    'if (s.rating != null && s.rating! > 0) ...['
  );
  res = res.replace(
    "'Min ₹${s.minSipAmount.toInt()}',",
    "s.minSipAmount != null ? 'Min ₹${s.minSipAmount!.toInt()}' : 'Min ₹—',"
  );
  res = res.replace(
    "'+${returnVal.toStringAsFixed(1)}%',",
    "returnVal != null ? '${returnVal >= 0 ? \"+\" : \"\"}${returnVal.toStringAsFixed(1)}%' : '—',"
  );
  return res;
});

// 6. mf_search_view.dart
updateFile('modules/mutual_funds/views/mf_search_view.dart', (content) => {
  let res = content;
  res = res.replace(
    'if (scheme.rating > 0) ...[',
    'if (scheme.rating != null && scheme.rating! > 0) ...['
  );
  res = res.replace(
    "'+${scheme.cagr3Y}%',",
    "scheme.cagr3Y != null ? '+${scheme.cagr3Y}%' : '—',"
  );
  return res;
});

// 7. mf_sip_investment_view.dart
updateFile('modules/mutual_funds/views/mf_sip_investment_view.dart', (content) => {
  let res = content;
  res = res.replace(
    'final minAmount = _isSip ? widget.scheme.minSipAmount : widget.scheme.minPurchaseAmount;',
    'final minAmount = (_isSip ? widget.scheme.minSipAmount : widget.scheme.minPurchaseAmount) ?? 500.0;'
  );
  res = res.replace(
    'final double minAmount = _isSip ? widget.scheme.minSipAmount : widget.scheme.minPurchaseAmount;',
    'final double minAmount = (_isSip ? widget.scheme.minSipAmount : widget.scheme.minPurchaseAmount) ?? 500.0;'
  );
  res = res.replace(
    'final minAmt = widget.scheme.minPurchaseAmount;',
    'final minAmt = widget.scheme.minPurchaseAmount ?? 1000.0;'
  );
  res = res.replace(
    'final minAmt = _isSip ? widget.scheme.minSipAmount : widget.scheme.minPurchaseAmount;',
    'final minAmt = (_isSip ? widget.scheme.minSipAmount : widget.scheme.minPurchaseAmount) ?? 500.0;'
  );
  return res;
});

// 8. widgets/mf_groww_widgets.dart
updateFile('modules/mutual_funds/views/widgets/mf_groww_widgets.dart', (content) => {
  let res = content;
  res = res.replace("'+${f1.cagr3Y}%',", "f1.cagr3Y != null ? '+${f1.cagr3Y}%' : '—',");
  res = res.replace("'+${f2.cagr3Y}%',", "f2.cagr3Y != null ? '+${f2.cagr3Y}%' : '—',");
  res = res.replace("'+${f1.cagr1Y}%',", "f1.cagr1Y != null ? '+${f1.cagr1Y}%' : '—',");
  res = res.replace("'+${f2.cagr1Y}%',", "f2.cagr1Y != null ? '+${f2.cagr1Y}%' : '—',");
  res = res.replace("'₹${f1.minSipAmount.toInt()}',", "f1.minSipAmount != null ? '₹${f1.minSipAmount!.toInt()}' : '—',");
  res = res.replace("'₹${f2.minSipAmount.toInt()}',", "f2.minSipAmount != null ? '₹${f2.minSipAmount!.toInt()}' : '—',");
  res = res.replace("'${f1.expenseRatio}%',", "f1.expenseRatio != null ? '${f1.expenseRatio}%' : '—',");
  res = res.replace("'${f2.expenseRatio}%',", "f2.expenseRatio != null ? '${f2.expenseRatio}%' : '—',");
  res = res.replace("'${f1.rating} ★',", "f1.rating != null ? '${f1.rating} ★' : '—',");
  res = res.replace("'${f2.rating} ★',", "f2.rating != null ? '${f2.rating} ★' : '—',");
  return res;
});

// 9. mf_home_view.dart
updateFile('modules/mutual_funds/views/mf_home_view.dart', (content) => {
  let res = content;
  res = res.replace("'+${s.cagr3Y}%',", "s.cagr3Y != null ? '+${s.cagr3Y}%' : '—',");
  res = res.replace("'+${returnVal}%',", "returnVal != null ? '${returnVal > 0 ? \"+\" : \"\"}${returnVal}%' : '—',");
  return res;
});

// 10. mf_collection_list_view.dart
updateFile('modules/mutual_funds/views/mf_collection_list_view.dart', (content) => {
  let res = content;
  res = res.replace(
    '..sort((a, b) => b.cagr3Y.compareTo(a.cagr3Y));',
    '..sort((a, b) => (b.cagr3Y ?? 0.0).compareTo(a.cagr3Y ?? 0.0));'
  );
  res = res.replace(
    'if (!amcMap.containsKey(key) || s.cagr3Y > amcMap[key]!.cagr3Y) {',
    'if (!amcMap.containsKey(key) || (s.cagr3Y ?? 0.0) > (amcMap[key]!.cagr3Y ?? 0.0)) {'
  );
  res = res.replace(
    'local = List<MfSchemeModel>.from(pool)..sort((a, b) => b.cagr3Y.compareTo(a.cagr3Y));',
    'local = List<MfSchemeModel>.from(pool)..sort((a, b) => (b.cagr3Y ?? 0.0).compareTo(a.cagr3Y ?? 0.0));'
  );
  res = res.replace(
    'list.sort((a, b) => b.cagr1Y.compareTo(a.cagr1Y));',
    'list.sort((a, b) => (b.cagr1Y ?? 0.0).compareTo(a.cagr1Y ?? 0.0));'
  );
  res = res.replace(
    'final aVal = a.cagr5Y > 0 ? a.cagr5Y : a.cagr3Y;',
    'final aVal = (a.cagr5Y ?? 0) > 0 ? a.cagr5Y! : (a.cagr3Y ?? 0.0);'
  );
  res = res.replace(
    'final bVal = b.cagr5Y > 0 ? b.cagr5Y : b.cagr3Y;',
    'final bVal = (b.cagr5Y ?? 0) > 0 ? b.cagr5Y! : (b.cagr3Y ?? 0.0);'
  );
  res = res.replace(
    'list.sort((a, b) => b.cagr3Y.compareTo(a.cagr3Y));',
    'list.sort((a, b) => (b.cagr3Y ?? 0.0).compareTo(a.cagr3Y ?? 0.0));'
  );
  res = res.replace('double returnVal = scheme.cagr3Y;', 'double? returnVal = scheme.cagr3Y;');
  res = res.replace(
    "returnVal = scheme.cagr5Y > 0 ? scheme.cagr5Y : scheme.cagr3Y;",
    "returnVal = (scheme.cagr5Y ?? 0) > 0 ? scheme.cagr5Y : scheme.cagr3Y;"
  );
  res = res.replace('final bool hasReturn = returnVal > 0;', 'final bool hasReturn = returnVal != null && returnVal != 0;');
  res = res.replace(
    "'+${returnVal.toStringAsFixed(2)}%'",
    "'${returnVal! >= 0 ? \"+\" : \"\"}${returnVal!.toStringAsFixed(2)}%'"
  );
  res = res.replace('if (scheme.rating > 0) ...[', 'if (scheme.rating != null && scheme.rating! > 0) ...[');
  return res;
});

// 11. mf_compare_funds_view.dart
updateFile('modules/mutual_funds/views/mf_compare_funds_view.dart', (content) => {
  let res = content;
  res = res.replace('if (f.cagr1Y > max1Y) max1Y = f.cagr1Y;', 'if ((f.cagr1Y ?? -999) > max1Y) max1Y = f.cagr1Y!;');
  res = res.replace('if (f.cagr3Y > max3Y) max3Y = f.cagr3Y;', 'if ((f.cagr3Y ?? -999) > max3Y) max3Y = f.cagr3Y!;');
  res = res.replace('if (f.cagr5Y > max5Y) max5Y = f.cagr5Y;', 'if ((f.cagr5Y ?? -999) > max5Y) max5Y = f.cagr5Y!;');
  res = res.replace(
    "values: _selectedFunds.map((f) => '${f.cagr1Y >= 0 ? '+' : ''}${f.cagr1Y.toStringAsFixed(2)}%').toList(),",
    "values: _selectedFunds.map((f) => f.cagr1Y != null ? '${f.cagr1Y! >= 0 ? '+' : ''}${f.cagr1Y!.toStringAsFixed(2)}%' : '—').toList(),"
  );
  res = res.replace(
    "winners: _selectedFunds.map((f) => f.cagr1Y == max1Y && max1Y != -999).toList(),",
    "winners: _selectedFunds.map((f) => f.cagr1Y != null && f.cagr1Y == max1Y && max1Y != -999).toList(),"
  );
  res = res.replace(
    "values: _selectedFunds.map((f) => '${f.cagr3Y >= 0 ? '+' : ''}${f.cagr3Y.toStringAsFixed(2)}%').toList(),",
    "values: _selectedFunds.map((f) => f.cagr3Y != null ? '${f.cagr3Y! >= 0 ? '+' : ''}${f.cagr3Y!.toStringAsFixed(2)}%' : '—').toList(),"
  );
  res = res.replace(
    "winners: _selectedFunds.map((f) => f.cagr3Y == max3Y && max3Y != -999).toList(),",
    "winners: _selectedFunds.map((f) => f.cagr3Y != null && f.cagr3Y == max3Y && max3Y != -999).toList(),"
  );
  res = res.replace(
    "values: _selectedFunds.map((f) => '${f.cagr5Y >= 0 ? '+' : ''}${f.cagr5Y.toStringAsFixed(2)}%').toList(),",
    "values: _selectedFunds.map((f) => f.cagr5Y != null ? '${f.cagr5Y! >= 0 ? '+' : ''}${f.cagr5Y!.toStringAsFixed(2)}%' : '—').toList(),"
  );
  res = res.replace(
    "winners: _selectedFunds.map((f) => f.cagr5Y == max5Y && max5Y != -999).toList(),",
    "winners: _selectedFunds.map((f) => f.cagr5Y != null && f.cagr5Y == max5Y && max5Y != -999).toList(),"
  );
  res = res.replace(
    "values: _selectedFunds.map((f) => '₹${f.nav.toStringAsFixed(2)}').toList(),",
    "values: _selectedFunds.map((f) => f.nav != null ? '₹${f.nav!.toStringAsFixed(2)}' : '—').toList(),"
  );
  res = res.replace(
    "if (f.expenseRatio < minExp && f.expenseRatio > 0) minExp = f.expenseRatio;",
    "if (f.expenseRatio != null && f.expenseRatio! < minExp && f.expenseRatio! > 0) minExp = f.expenseRatio!;"
  );
  res = res.replace(
    "values: _selectedFunds.map((f) => '${f.rating} / 5 ★').toList(),",
    "values: _selectedFunds.map((f) => f.rating != null ? '${f.rating} / 5 ★' : '—').toList(),"
  );
  res = res.replace(
    "values: _selectedFunds.map((f) => '${f.expenseRatio.toStringAsFixed(2)}%').toList(),",
    "values: _selectedFunds.map((f) => f.expenseRatio != null ? '${f.expenseRatio!.toStringAsFixed(2)}%' : '—').toList(),"
  );
  res = res.replace(
    "winners: _selectedFunds.map((f) => f.expenseRatio == minExp && minExp != 999).toList(),",
    "winners: _selectedFunds.map((f) => f.expenseRatio != null && f.expenseRatio == minExp && minExp != 999).toList(),"
  );
  res = res.replace(
    "values: _selectedFunds.map((f) => '₹${f.aum.toStringAsFixed(0)} Cr').toList(),",
    "values: _selectedFunds.map((f) => f.aum != null ? '₹${f.aum!.toStringAsFixed(0)} Cr' : '—').toList(),"
  );
  res = res.replace(
    "values: _selectedFunds.map((f) => '₹${f.minSipAmount.toStringAsFixed(0)}').toList(),",
    "values: _selectedFunds.map((f) => f.minSipAmount != null ? '₹${f.minSipAmount!.toStringAsFixed(0)}' : '—').toList(),"
  );
  res = res.replace(
    "values: _selectedFunds.map((f) => '₹${f.minPurchaseAmount.toStringAsFixed(0)}').toList(),",
    "values: _selectedFunds.map((f) => f.minPurchaseAmount != null ? '₹${f.minPurchaseAmount!.toStringAsFixed(0)}' : '—').toList(),"
  );
  res = res.replace(
    "'3Y: \${scheme.cagr3Y >= 0 ? '+' : ''}\${scheme.cagr3Y.toStringAsFixed(1)}%',",
    "scheme.cagr3Y != null ? '3Y: \${scheme.cagr3Y! >= 0 ? '+' : ''}\${scheme.cagr3Y!.toStringAsFixed(1)}%' : '3Y: —',"
  );
  return res;
});

// 12. mf_all_mutual_funds_view.dart
updateFile('modules/mutual_funds/views/mf_all_mutual_funds_view.dart', (content) => {
  let res = content;
  res = res.replace('double returnVal = s.cagr3Y;', 'double? returnVal = s.cagr3Y;');
  res = res.replace(
    "final hasRet = returnVal != 0;",
    "final hasRet = returnVal != null && returnVal != 0;"
  );
  res = res.replace(
    "final retStr = hasRet ? '${returnVal >= 0 ? '+' : ''}${returnVal.toStringAsFixed(2)}%' : '--';",
    "final retStr = hasRet ? '${returnVal! >= 0 ? '+' : ''}${returnVal!.toStringAsFixed(2)}%' : '—';"
  );
  res = res.replace(
    "final retColor = returnVal < 0 ? const Color(0xFFEF4444) : GrowwColors.mintTeal;",
    "final retColor = (returnVal ?? 0.0) < 0 ? const Color(0xFFEF4444) : GrowwColors.mintTeal;"
  );
  res = res.replace('if (s.rating > 0) ...[', 'if (s.rating != null && s.rating! > 0) ...[');
  res = res.replace("'${s.rating.toInt()}',", "'${s.rating}',");
  return res;
});

console.log('Flutter remediation script complete!');
