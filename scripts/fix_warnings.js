const fs = require('fs');

// Fix 1: mf_all_mutual_funds_view.dart
const f1 = 'c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_all_mutual_funds_view.dart';
let c1 = fs.readFileSync(f1, 'utf8');
c1 = c1.replace(
  'final retStr = (returnVal != null && returnVal != 0) ?',
  'final retStr = hasRet ?'
);
fs.writeFileSync(f1, c1, 'utf8');

// Fix 2: mf_nfo_view.dart
const f2 = 'c:/Ashahad/Porwal/GoldVikaone/lib/modules/mutual_funds/views/mf_nfo_view.dart';
let c2 = fs.readFileSync(f2, 'utf8');
const searchTarget = `Text(
                      minSip != null ? minSip != null ? '`;
const idx = c2.indexOf(searchTarget);
if (idx !== -1) {
  const endIdx = c2.indexOf('),\n                  ],', idx);
  const replacement = `Text(
                      minSip != null ? '₹\${minSip.toStringAsFixed(0)}' : '—',
                      style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                    `;
  c2 = c2.slice(0, idx) + replacement + c2.slice(endIdx);
} else {
  // Try regex replace
  c2 = c2.replace(
    /minSip != null \? minSip != null \? [^:]+? : [^:]+? : ['"][^'"]*?['"]/,
    "minSip != null ? '₹\${minSip.toStringAsFixed(0)}' : '—'"
  );
}
fs.writeFileSync(f2, c2, 'utf8');

console.log('Fixed warnings');
