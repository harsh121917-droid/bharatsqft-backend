const fs = require('fs');
const path = require('path');

const flutterDir = "C:\\Ashahad\\Porwal\\GoldVikaone";
const viewPath = path.join(flutterDir, "lib", "modules", "digi_gold", "views", "digi_gold_view.dart");
let content = fs.readFileSync(viewPath, 'utf8');

// Replace _RecommendedGoalsSection definition
const sectionStartIndex = content.indexOf("// ─── Recommended Goals (SIP) Section");
if (sectionStartIndex !== -1) {
    content = content.substring(0, sectionStartIndex);
}

// Premium Fintech-level Card Design
const premiumGoalCardWidget = `
// ─── Recommended Goals (SIP) Section — Premium UI/UX ─────────────────────────
class _RecommendedGoalsSection extends StatefulWidget {
  const _RecommendedGoalsSection({required this.t});
  final _T t;

  @override
  State<_RecommendedGoalsSection> createState() => _RecommendedGoalsSectionState();
}

class _RecommendedGoalsSectionState extends State<_RecommendedGoalsSection> {
  late final PageController _pageCtrl;
  int _activePage = 0;
  int _pressedIdx = -1;

  @override
  void initState() {
    super.initState();
    _pageCtrl = PageController(viewportFraction: 0.82, initialPage: 0);
  }

  @override
  void dispose() {
    _pageCtrl.dispose();
    super.dispose();
  }

  static const _goals = [
    {
      'id': 'soldier',
      'label': 'SPECIAL OFFER',
      'title': 'Veer Jawan',
      'tagline': 'Salute your service,\\nsecure your future.',
      'badge': '🎖️ 15% OFF',
      'icon': Icons.military_tech_rounded,
      'bgGrad': [Color(0xFF064E3B), Color(0xFF022C22)],
      'accentGrad': [Color(0xFF10B981), Color(0xFF34D399)],
      'bgImgColor': Color(0xFF052E21),
      'glow': Color(0xFF10B981),
    },
    {
      'id': 'education',
      'label': 'ZERO CHARGES',
      'title': 'Education',
      'tagline': 'Invest in knowledge,\\nearns the best returns.',
      'badge': '🎓 Zero Fee',
      'icon': Icons.school_rounded,
      'bgGrad': [Color(0xFF1E3A5F), Color(0xFF0F1E33)],
      'accentGrad': [Color(0xFF3B82F6), Color(0xFF60A5FA)],
      'bgImgColor': Color(0xFF152A47),
      'glow': Color(0xFF3B82F6),
    },
    {
      'id': 'home',
      'label': 'HIGH RETURN',
      'title': 'Dream Home',
      'tagline': 'Build your castle,\\nbrick by golden brick.',
      'badge': '🏡 Wealth',
      'icon': Icons.cottage_rounded,
      'bgGrad': [Color(0xFF14532D), Color(0xFF052E16)],
      'accentGrad': [Color(0xFF22C55E), Color(0xFF4ADE80)],
      'bgImgColor': Color(0xFF0F3D20),
      'glow': Color(0xFF22C55E),
    },
    {
      'id': 'wealth',
      'label': 'LONG TERM',
      'title': 'Retirement',
      'tagline': 'Your future self will\\nthank you today.',
      'badge': '🌴 Wealth',
      'icon': Icons.beach_access_rounded,
      'bgGrad': [Color(0xFF3B0764), Color(0xFF1E0340)],
      'accentGrad': [Color(0xFFA855F7), Color(0xFFC084FC)],
      'bgImgColor': Color(0xFF2D0A50),
      'glow': Color(0xFFA855F7),
    },
    {
      'id': 'wedding',
      'label': 'MOST POPULAR',
      'title': 'Wedding Gold',
      'tagline': 'Celebrate with\\npure 24K brilliance.',
      'badge': '💍 Popular',
      'icon': Icons.diamond_outlined,
      'bgGrad': [Color(0xFF451A03), Color(0xFF260E01)],
      'accentGrad': [Color(0xFFD97706), Color(0xFFFBBF24)],
      'bgImgColor': Color(0xFF331404),
      'glow': Color(0xFFD97706),
    },
  ];

  @override
  Widget build(BuildContext context) {
    final dark = ThemeController.to.isDark.value;
    final t = widget.t;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Header ─────────────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Your Goals',
                    style: TextStyle(
                      color: t.ink,
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    'Tap any goal to start investing ✨',
                    style: TextStyle(
                      color: t.inkMuted,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              GestureDetector(
                onTap: () => Get.toNamed(AppRoutes.digiGoldSavings),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: _gold.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: _gold.withValues(alpha: 0.35)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Text(
                        'See All',
                        style: TextStyle(
                          color: _gold,
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      SizedBox(width: 2),
                      Icon(Icons.arrow_forward_ios_rounded, color: _gold, size: 11),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // ── Carousel ───────────────────────────────────────────────────────
        SizedBox(
          height: 200,
          child: PageView.builder(
            controller: _pageCtrl,
            onPageChanged: (idx) => setState(() => _activePage = idx),
            itemCount: _goals.length,
            itemBuilder: (ctx, index) {
              final g = _goals[index];
              final List<Color> bg = g['bgGrad'] as List<Color>;
              final List<Color> ac = g['accentGrad'] as List<Color>;
              final Color glow = g['glow'] as Color;
              final bool isPressed = _pressedIdx == index;

              return AnimatedBuilder(
                animation: _pageCtrl,
                builder: (context, child) {
                  double scale = 1.0;
                  if (_pageCtrl.position.haveDimensions) {
                    double page = _pageCtrl.page ?? _activePage.toDouble();
                    scale = (1 - ((page - index).abs() * 0.07)).clamp(0.93, 1.0);
                  } else {
                    scale = index == _activePage ? 1.0 : 0.94;
                  }
                  return Transform.scale(
                    scale: isPressed ? scale * 0.96 : scale,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 6),
                      child: GestureDetector(
                        onTapDown: (_) => setState(() => _pressedIdx = index),
                        onTapUp: (_) => setState(() => _pressedIdx = -1),
                        onTapCancel: () => setState(() => _pressedIdx = -1),
                        onTap: () {
                          HapticFeedback.lightImpact();
                          Get.toNamed(
                            AppRoutes.digiGoldSavings,
                            arguments: {'selectedGoalId': g['id']},
                          );
                        },
                        child: Container(
                          clipBehavior: Clip.antiAlias,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: bg,
                            ),
                            borderRadius: BorderRadius.circular(28),
                            boxShadow: [
                              BoxShadow(
                                color: glow.withValues(alpha: 0.35),
                                blurRadius: 24,
                                spreadRadius: -4,
                                offset: const Offset(0, 10),
                              ),
                            ],
                          ),
                          child: Stack(
                            children: [
                              // ── Large Abstract Glow Blob ──
                              Positioned(
                                right: -30,
                                top: -30,
                                child: Container(
                                  width: 130,
                                  height: 130,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: glow.withValues(alpha: 0.15),
                                  ),
                                ),
                              ),
                              Positioned(
                                left: -20,
                                bottom: -30,
                                child: Container(
                                  width: 90,
                                  height: 90,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: glow.withValues(alpha: 0.1),
                                  ),
                                ),
                              ),

                              // ── Bottom Frosted Bar ──
                              Positioned(
                                left: 0,
                                right: 0,
                                bottom: 0,
                                child: Container(
                                  height: 56,
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      colors: [
                                        Colors.transparent,
                                        Colors.black.withValues(alpha: 0.35),
                                      ],
                                    ),
                                  ),
                                ),
                              ),

                              // ── Card Content ──
                              Padding(
                                padding: const EdgeInsets.all(20),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    // Top Row: Label + Avatar Icon
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        // Top Label Tag
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 5,
                                          ),
                                          decoration: BoxDecoration(
                                            gradient: LinearGradient(colors: ac),
                                            borderRadius: BorderRadius.circular(20),
                                          ),
                                          child: Text(
                                            g['label'] as String,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 9,
                                              fontWeight: FontWeight.w900,
                                              letterSpacing: 1,
                                            ),
                                          ),
                                        ),
                                        // Large Avatar Icon Ring
                                        Container(
                                          width: 52,
                                          height: 52,
                                          decoration: BoxDecoration(
                                            color: Colors.white.withValues(alpha: 0.1),
                                            shape: BoxShape.circle,
                                            border: Border.all(
                                              color: Colors.white.withValues(alpha: 0.2),
                                            ),
                                          ),
                                          child: Icon(
                                            g['icon'] as IconData,
                                            color: ac[1],
                                            size: 28,
                                          ),
                                        ),
                                      ],
                                    ),

                                    // Title & Tagline
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          g['title'] as String,
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 22,
                                            fontWeight: FontWeight.w900,
                                            letterSpacing: -0.5,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          (g['tagline'] as String).replaceAll('\\\\n', '\\n'),
                                          style: TextStyle(
                                            color: Colors.white.withValues(alpha: 0.65),
                                            fontSize: 11,
                                            height: 1.5,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ],
                                    ),

                                    // Bottom Row: Badge + "Start Goal" arrow
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 5,
                                          ),
                                          decoration: BoxDecoration(
                                            color: Colors.white.withValues(alpha: 0.12),
                                            borderRadius: BorderRadius.circular(14),
                                            border: Border.all(
                                              color: Colors.white.withValues(alpha: 0.2),
                                            ),
                                          ),
                                          child: Text(
                                            g['badge'] as String,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 10.5,
                                              fontWeight: FontWeight.w800,
                                            ),
                                          ),
                                        ),
                                        Container(
                                          padding: const EdgeInsets.all(8),
                                          decoration: BoxDecoration(
                                            gradient: LinearGradient(colors: ac),
                                            shape: BoxShape.circle,
                                            boxShadow: [
                                              BoxShadow(
                                                color: ac[0].withValues(alpha: 0.5),
                                                blurRadius: 8,
                                                offset: const Offset(0, 3),
                                              ),
                                            ],
                                          ),
                                          child: const Icon(
                                            Icons.arrow_forward_rounded,
                                            color: Colors.white,
                                            size: 18,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
        const SizedBox(height: 12),

        // ── Page Dots ──────────────────────────────────────────────────────
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(_goals.length, (i) {
            final isSel = i == _activePage;
            final List<Color> ac = _goals[i]['accentGrad'] as List<Color>;
            return AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutCubic,
              margin: const EdgeInsets.symmetric(horizontal: 3.5),
              width: isSel ? 24 : 7,
              height: 7,
              decoration: BoxDecoration(
                gradient: isSel ? LinearGradient(colors: ac) : null,
                color: isSel ? null : t.inkMuted.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(10),
                boxShadow: isSel
                    ? [BoxShadow(color: ac[0].withValues(alpha: 0.4), blurRadius: 6)]
                    : null,
              ),
            );
          }),
        ),
      ],
    );
  }
}
`;

content += premiumGoalCardWidget;
fs.writeFileSync(viewPath, content, 'utf8');
console.log('✓ Premium luxury Goal Cards applied to digi_gold_view.dart!');
