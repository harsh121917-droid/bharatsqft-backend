const fs = require('fs');

const basePath = 'c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views';

// 1. mf_all_mutual_funds_view.dart
{
  const filePath = `${basePath}/mf_all_mutual_funds_view.dart`;
  let c = fs.readFileSync(filePath, 'utf8');
  c = c.replace(
    `final retStr = hasRet ? '\${returnVal! >= 0 ? '+' : ''}\${returnVal!.toStringAsFixed(2)}%' : '—';`,
    `final retStr = (returnVal != null && returnVal != 0) ? '\${returnVal >= 0 ? '+' : ''}\${returnVal.toStringAsFixed(2)}%' : '—';`
  );
  // Also check with \u2014
  c = c.replace(
    /\bhasRet \? '\$\{returnVal! >= 0 \? '\+' : ''\}\$\{returnVal!\.toStringAsFixed\(2\)\}%' : '[\u2014—\?]+';/,
    `hasRet ? '\${returnVal >= 0 ? '+' : ''}\${returnVal.toStringAsFixed(2)}%' : '—';`
  );
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ Updated mf_all_mutual_funds_view.dart');
}

// 2. mf_collection_list_view.dart
{
  const filePath = `${basePath}/mf_collection_list_view.dart`;
  let c = fs.readFileSync(filePath, 'utf8');
  // fix rating sort
  c = c.replace(
    'local = List<MfSchemeModel>.from(pool)..sort((a, b) => b.rating.compareTo(a.rating));',
    'local = List<MfSchemeModel>.from(pool)..sort((a, b) => (b.rating ?? 0).compareTo(a.rating ?? 0));'
  );
  // fix returnVal! in line 728
  c = c.replace(
    `final String returnStr = hasReturn\n        ? '\${returnVal! >= 0 ? "+" : ""}\${returnVal!.toStringAsFixed(2)}%'\n        : '--';`,
    `final String returnStr = (returnVal != null && returnVal != 0)\n        ? '\${returnVal >= 0 ? "+" : ""}\${returnVal.toStringAsFixed(2)}%'\n        : '—';`
  );
  // fix scheme.rating.toInt() in line 782
  c = c.replace(
    `'\${scheme.rating.toInt()}',`,
    `'\${scheme.rating!.toInt()}',`
  );
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ Updated mf_collection_list_view.dart');
}

// 3. mf_compare_funds_view.dart
{
  const filePath = `${basePath}/mf_compare_funds_view.dart`;
  let c = fs.readFileSync(filePath, 'utf8');
  // remove unused cardHeaderBg
  c = c.replace('  static const Color cardHeaderBg = Color(0xFF1C273B);\n', '');
  // fix fundManager in line 505
  c = c.replace(
    `values: _selectedFunds.map((f) => f.fundManager.isNotEmpty ? f.fundManager : 'Fund Team').toList(),`,
    `values: _selectedFunds.map((f) => (f.fundManager != null && f.fundManager!.isNotEmpty) ? f.fundManager! : 'Fund Team').toList(),`
  );
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ Updated mf_compare_funds_view.dart');
}

// 4. mf_nfo_view.dart
{
  const filePath = `${basePath}/mf_nfo_view.dart`;
  let c = fs.readFileSync(filePath, 'utf8');
  // fix minSip.toStringAsFixed(0)
  c = c.replace(
    `'₹\${minSip.toStringAsFixed(0)}'`,
    `minSip != null ? '₹\${minSip.toStringAsFixed(0)}' : '—'`
  );
  c = c.replace(
    `',1\${minSip.toStringAsFixed(0)}'`,
    `minSip != null ? '₹\${minSip.toStringAsFixed(0)}' : '—'`
  );
  // Also regex to be sure
  c = c.replace(
    /['"][^'"]*?\$\{minSip\.toStringAsFixed\(0\)\}['"]/,
    `minSip != null ? '₹\${minSip.toStringAsFixed(0)}' : '—'`
  );
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ Updated mf_nfo_view.dart');
}

// 5. mf_scheme_detail_view.dart
{
  const filePath = `${basePath}/mf_scheme_detail_view.dart`;
  let c = fs.readFileSync(filePath, 'utf8');
  // line 603: final double liveNav = ...
  c = c.replace(
    `final double liveNav = (_detailData?['nav'] as num?)?.toDouble() ?? widget.scheme.nav;
                        return _buildMetricItem('NAV', ',1\${liveNav.toStringAsFixed(2)}', textSecondary, textPrimary);`,
    `final double? liveNav = (_detailData?['nav'] as num?)?.toDouble() ?? widget.scheme.nav;
                        return _buildMetricItem('NAV', liveNav != null ? '₹\${liveNav.toStringAsFixed(2)}' : '—', textSecondary, textPrimary);`
  );
  c = c.replace(
    /final double liveNav = \(_detailData\?\['nav'\] as num\?\)\?\.toDouble\(\) \?\? widget\.scheme\.nav;\s*return _buildMetricItem\('NAV', '.*?\$\{liveNav\.toStringAsFixed\(2\)\}', textSecondary, textPrimary\);/,
    `final double? liveNav = (_detailData?['nav'] as num?)?.toDouble() ?? widget.scheme.nav;
                        return _buildMetricItem('NAV', liveNav != null ? '₹\${liveNav.toStringAsFixed(2)}' : '—', textSecondary, textPrimary);`
  );

  // line 1553: widget.scheme.fundManager.isNotEmpty
  c = c.replace(
    `'name': widget.scheme.fundManager.isNotEmpty ? widget.scheme.fundManager : 'Senior Portfolio Manager',`,
    `'name': (widget.scheme.fundManager != null && widget.scheme.fundManager!.isNotEmpty) ? widget.scheme.fundManager! : 'Portfolio Management Team',`
  );
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ Updated mf_scheme_detail_view.dart');
}

// 6. mf_search_view.dart
{
  const filePath = `${basePath}/mf_search_view.dart`;
  let c = fs.readFileSync(filePath, 'utf8');
  c = c.replace(
    'if (scheme.rating > 0)',
    'if (scheme.rating != null && scheme.rating! > 0)'
  );
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('✅ Updated mf_search_view.dart');
}
