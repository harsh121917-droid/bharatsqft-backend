const fs = require('fs');
const path = require('path');

const targetFile = 'c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_scheme_detail_view.dart';

let content = fs.readFileSync(targetFile, 'utf8');

// 1. In _buildSimilarFundsSection, fix return value defaulting to 0.00%
const oldSimilarReturn = `'returns': '\${((sf['cagr3Y'] as num?)?.toDouble() ?? 0).toStringAsFixed(2)}%',`;
const newSimilarReturn = `'returns': (sf['cagr3Y'] != null) ? '\${((sf['cagr3Y'] as num).toDouble()).toStringAsFixed(2)}%' : '—',`;

if (content.includes(oldSimilarReturn)) {
  content = content.replace(oldSimilarReturn, newSimilarReturn);
  console.log('✅ Updated similar funds return parsing');
} else {
  console.log('⚠️ oldSimilarReturn not found');
}

// 2. In _buildRecentlyViewedSection, fix rating and cagr3Y formatting
const oldRecentRating = `'${'${f.category}'} • ${'${f.rating}'}★'`;
// Let's check exact string for recently viewed rating
const oldRecentBlock = `                            Text(
                              '\${f.category} • \${f.rating}★',
                              style: TextStyle(color: textSecondary, fontSize: 11),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Text(
                      '\${f.cagr3Y.toStringAsFixed(2)}%',`;

const newRecentBlock = `                            Text(
                              f.rating != null ? '\${f.category} • \${f.rating}★' : f.category,
                              style: TextStyle(color: textSecondary, fontSize: 11),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Text(
                      f.cagr3Y != null ? '\${f.cagr3Y!.toStringAsFixed(2)}%' : '—',`;

if (content.includes(oldRecentBlock)) {
  content = content.replace(oldRecentBlock, newRecentBlock);
  console.log('✅ Updated recently viewed rating and return parsing');
} else {
  console.log('⚠️ oldRecentBlock not found, checking variations...');
}

// 3. In _NavChartPainter, replace fallback to _getCurvePoints with clean unavailable placeholder
const oldPainterNormalize = `    final List<double> normalizedPoints = (rawPoints != null && rawPoints!.length > 1)
        ? _normalizePoints(rawPoints!)
        : _getCurvePoints(period);`;

const newPainterNormalize = `    if (rawPoints == null || rawPoints!.length <= 1) {
      final textPainter = TextPainter(
        text: const TextSpan(
          text: 'NAV chart data unavailable',
          style: TextStyle(color: Color(0xFF6B7280), fontSize: 12, fontWeight: FontWeight.w500),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      textPainter.paint(
        canvas,
        Offset((size.width - textPainter.width) / 2, (size.height - textPainter.height) / 2),
      );
      return;
    }

    final List<double> normalizedPoints = _normalizePoints(rawPoints!);`;

if (content.includes(oldPainterNormalize)) {
  content = content.replace(oldPainterNormalize, newPainterNormalize);
  console.log('✅ Updated _NavChartPainter normalizedPoints logic');
} else {
  console.log('⚠️ oldPainterNormalize not found');
}

// 4. Remove _getCurvePoints method entirely
const curvePointsRegex = /\s*List<double> _getCurvePoints\(String period\) \{[\s\S]*?default:\s*return \[0\.20[\s\S]*?;\s*\}\s*\}/;
if (curvePointsRegex.test(content)) {
  content = content.replace(curvePointsRegex, '');
  console.log('✅ Removed _getCurvePoints and all fake chart trend curves');
} else {
  console.log('⚠️ curvePointsRegex not matched');
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Done writing updated mf_scheme_detail_view.dart');
