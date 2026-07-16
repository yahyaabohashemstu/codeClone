# سجلّ المعالجة الموحّد — واجهة Clone Lens (Evidence Dossier)

> تدقيق شامل: **16 شريحة**، **115 ملاحظة** موثّقة (12 عبر الـworkflow + 4 مستعادة). اللغة: عربية للسرد، وكل المسارات والأصناف والقيم اللونية بالإنجليزية LTR.

---

## 1. الملخّص التنفيذي

الواجهة **لا تصرخ "صناعة آلية"** في معظمها. طبقة الرموز الأساسية (`index.css`) هي عمل مؤلَّف بحق: ثيم فاتح "warm-paper/amber" + ثيم داكن "Ink & Ember"، إشارة أمبر واحدة، أنصاف أقطار حادة (`--radius: 0.35rem`)، ارتفاع مسطّح، وصوت عرض mono. أغلب الشرائح تسجّل `human_read_score` بين **72 و 85**، أي "بشري مع فجوات صقل"، لا "مولّد خام".

لكن المتوسط يُسحب لأسفل بستّ مشكلات نظامية مسيطرة:

1. **كتلة AST-graph حيّة غير مُرحَّلة** (`index.css` ~552–826، مطبّقة في `AstGraphPanel.tsx`): تُحيي النظام المتقاعد بالكامل — هالات glow ملوّنة ذاتية الإضاءة (`0 0 28px rgba(124,114,255,.46)` + `drop-shadow(0 0 …)` على الحواف)، اللونان المتقاعدان indigo `#7c72ff` + cyan `#22d3ee` مضمّنان hardcoded، وشعيرات `white/18` فوق بطاقات slate متدرّجة. هذه **الملاحظة الحرجة الوحيدة** وأقوى tell سطحي في المشروع كله، ومخالفة مباشرة لقاعدة No-Glow التي يفرضها الملف نفسه.

2. **تعارض المواصفة مقابل الشحنة** (القرار الاستراتيجي، القسم 2): `DESIGN.md` ما زال يصف نظام "Measuring Instrument" (indigo/cyan، Inter فقط، أنصاف أقطار 8–20px) بينما `index.css` شحن نظام "Evidence Dossier" مختلفًا تمامًا. المواصفة تكذب على الطبقة الحيّة.

3. **غياب كامل لـ `prefers-reduced-motion`**: grep على كامل `src` = صفر نتائج، رغم أن `DESIGN.md` §6 يوجبها لكل حركة. تتكرّر هذه الملاحظة عبر **6+ شرائح** (spinners لا نهائية، `animate-fade-in` على ~10 جذور صفحات، skeleton pulse).

4. **Scaffold ميّت قابل لإعادة التفعيل**: في `tailwind.config.ts` — ظلال سوداء ثقيلة `shadow-card/card-hover`، طقم حركات دخول كامل (`fade-in-fast/slide-in-left/slide-up/scale-in`)، `shimmer`، `rounded-3xl` — لا يشير إليها أي ملف. بذور تسمح لأي مكوّن بالعودة للمظهر المرفوض.

5. **تلوين أمبر صغير على ورق فاتح تحت AA**: raw `text-warning`/`text-primary` كنصّ حالة صغير على الورق ≈ **2.4:1** (Analysis, History)، وتخفيف `text-muted-foreground/60`≈**2.1–2.5:1**. النظام نفسه حلّها في `.badge-warning` (حبر على tint) لكن الصفحات تتجاوزها.

6. **نسخ تسويقي مُقولب + أيقونات عامّة**: عناوين "Everything you need…"، "Ready to…?"، شارة "AI-Powered Platform"، وألفاظ virtue (world-class/premium/polished)، مع أيقونات `Zap`/`Shield` العامّة — كلّها تناقض الصوت "الأداتي" وتتكرّر EN+AR.

**الحكم العام:** بنية على-النظام قوية، أُفسدها جزيرة AST واحدة صارخة، مواصفة قديمة، وطبقة صقل غير مكتملة (حركة، a11y، نسخ). لا فوضى معماريّة — بل **بقايا** يجب كنسها بموجات.

---

## 2. ⚠️ القرار الاستراتيجي أولاً — يُحسَم قبل أي معالجة

**هذا يحجب المعالجة المتّسقة.** لا يمكن توحيد العناوين/الألوان/الأقطار عبر الشرائح ما دامت المواصفة (`DESIGN.md`) والطبقة الحيّة (`index.css`) تصفان نظامين متناقضين.

| البُعد | `DESIGN.md` — "Measuring Instrument" | `index.css` (الشحنة الحيّة) — "Evidence Dossier" |
|---|---|---|
| اللون | Signal Indigo `#3f4dee` + Diagnostic Cyan `#18a3bf` (إشارتان) | إشارة أمبر واحدة `--primary: 34 92% 46%`، ورق دافئ `42 30% 95%`، لا cyan |
| الخطوط | Inter فقط، mono للكود فقط ("Never use it for headings") | JetBrains Mono صوت عرض لكل `.t-hero/.t-h1..h5/.t-label/.t-stat`، body Inter، عربي IBM Plex Sans Arabic |
| نصف القطر | sm6/md8/lg10/xl16/2xl20، "never past 20px" | حادّ ~5.6px أساس، 2–3px sm/md، "over-rounding retired" |

### الخياران

- **الخيار أ — اعتماد "Evidence Dossier" (index.css) كمصدر الحقيقة، وإعادة كتابة DESIGN.md ليطابقه.** المنطق: الطبقة الحيّة مؤلَّفة وناضجة ومتّسقة عبر 18+ ملفًا؛ التراجع عنها يعني حرق العمل الأقوى في المشروع.
- **الخيار ب — إحياء "Measuring Instrument" (indigo/cyan + Inter) والتراجع عن index.css.** المنطق: لو كانت هناك أصول علامة/تسويق مبنية على indigo/cyan خارج المستودع.

### ملاحظة نقدية على الهوية

صوت **mono-display-headings** بذاته يخاطر بكليشيه "أداة-مطوّرين" (كل عناوين بخط الآلة الكاتبة). لكنّ ثنائي **amber/warm-paper** مميّز وغير مألوف ويرفع الواجهة فوق قالب "dark-SaaS". التوصية تحافظ على المميِّز وتلطّف المخاطرة.

### التوصية

**اعتمد الخيار أ (Evidence Dossier).** أبقِ ورق-الأمبر (المميِّز)، لكن **خفِّف مخاطرة كليشيه المطوّر**: لا تفرض mono على *كل* عنصر نصّي — اقصر mono-display على العناوين واللصائق والأرقام (evidence-labels/stats)، وأبقِ prose الطويل على Inter (وعربي على IBM Plex Sans Arabic) بحيث يقرأ كـ"ملف/دوسيه" لا كـ"terminal". ثم أعد كتابة `DESIGN.md` frontmatter + §2/§3/§5 لتطابق: أمبر أحادي الإشارة + سلّم green/amber/red الدلالي، حذف Diagnostic Cyan، صوت mono-display، سلّم 2/3/5.6px مع "over-rounding retired".

> **قرار المستخدم مطلوب:** لا تُشرَع Wave 1 قبل تثبيت هذا الخيار — كل مهام "sync DESIGN.md" وإعادة تلوين AST تعتمد عليه.

---

## 3. الأولويات على شكل موجات (Waves)

### 🌊 Wave 1 — القتل النظامي (يُصلح ملاحظات كثيرة دفعة واحدة)

مرتّبة:

1. **[critical] تفكيك glow في كتلة AST-graph** — `index.css:628` وتوابعها (638, 657–717, 746/750/754 SVG). احذف كل طبقة `0 0 Npx rgba(brand,α)` وكل `drop-shadow(0 0 …)`؛ عبّر عن التحديد بـ outline صلب `hsl(var(--ring))` + drop محايد `0 2px 8px hsl(30 24% 18% / .12)`.
2. **[high] إزالة الزجاج/التدرّج/الشعيرات في AST** — `index.css:560` وبطاقات `.ast-node-detail-*` (757–792): fill صلب `hsl(var(--card))` + شعيرة 1px `hsl(var(--border))`، لا gradient ولا shadow.
3. **[high] إعادة تلوين أدوار عُقد AST من الرموز** — `index.css:602` (وَ597/607/566/571/819/823): احذف كل `#7c72ff`/`#22d3ee`/`#6d7cff`؛ أمبر `hsl(var(--primary))` للبؤرة، `hsl(var(--muted-foreground))` للثانوي، والسلّم الدلالي للحالات فقط.
4. **[low] إسقاط الغسيل الأمبر الزخرفي** خلف الكانفاس — `index.css:506` (`.ast-graph-surface`): أبقِ التدرّج المحايد `surface-1→surface-2` فقط.
5. **حظر over-rounding عبر الرموز** — `index.css:912/760/771/781/790/944/895/889`: استبدل كل rem hardcoded (1rem/0.85rem/0.75rem/0.5rem) بـ `var(--radius)`/`--radius-md`/`--radius-sm`؛ وحّد `.analysis-markdown pre` مع `.code-surface`.
6. **حذف scaffold الميّت** — `tailwind.config.ts:132/133` (shadow-card/hover)، keyframes+animations 96–119/124–129 (fade/slide/scale/shimmer)، `rounded-3xl` (85). أبقِ فقط accordion المرتبط بحالة.
7. **حقنة reduced-motion عالمية واحدة** — أضِف في `@layer base` بـ`index.css` كتلة `@media (prefers-reduced-motion: reduce)` تُصفِّر durations لكل `*` وتُحيّد `.animate-*`/`.animate-spin`/`.animate-pulse` وحالات transform/scale في AST. **تُغلق ملاحظات a11y/motion في 6 شرائح دفعة واحدة.**
8. **مزامنة `DESIGN.md`** (بعد قرار القسم 2) — إعادة كتابة §2/§3/§5 + frontmatter (`DESIGN.md:127` وما حوله).
9. **[high] قتل تدرّج تعبئة المخطط** — `Analytics.tsx:177/200` احذف `<linearGradient id="actGrad">` → خطّ صلب بلا تعبئة (§15.4)؛ و`Analytics.tsx:48` tooltip radius رمزيّ.
10. **[high] الجانب البرمجي لكتلة AST** (يُنفَّذ مع 1–4) — `AstGraphPanel.tsx:399` تجاوز inline صلب للوحة التفاصيل (بدل gradient/`border-radius:1rem` في CSS)؛ `AstGraphPanel.tsx:24` احذف `hsl(8 60% 46%)` oxblood المكتوب يدويًا → token؛ `AnalysisChatPanel.tsx:225` احذف `shadow-glow-sm`.

### 🌊 Wave 2 — إصلاحات لكل سطح/مكوّن

**shadcn primitives:**
1. صوت العرض للعناوين: `font-[family:var(--font-display)]` على `CardTitle`(`card.tsx:39`)، `DialogTitle`(`dialog.tsx:89`)، `SheetTitle`(`sheet.tsx:109`)، `AlertDialogTitle`(`alert-dialog.tsx:80`).
2. تدفئة الحُجُب واستبدال حركة docs-clone: `dialog.tsx:22`/`sheet.tsx:22`/`alert-dialog.tsx:19` → `hsl(var(--foreground)/0.55)`؛ استبدل `zoom-in-95`+`slide-in-from-top-[48%]` بـ fade+scale هادئ.
3. تسطيح الظلال: `switch.tsx:20` (`shadow-lg`→`ring-1 ring-border`)، `tabs.tsx:30` (احذف `shadow-sm`، عبّر عن النشط بأمبر)، `chart.tsx:180` (`shadow-xl`→`shadow-md`)، `sidebar.tsx:249/324` (احذف bare `shadow`).
4. أشكال حادّة: `carousel.tsx:207/236` (`rounded-full`→`rounded-md`)، `drawer.tsx:44` (`rounded-t-[10px]`→`rounded-t-2xl`).
5. تنظيف scaffold مُتجاوَز: `badge.tsx:7` و`toast.tsx:78` (Radix toast غير مُركّب) — احذف أو أعد المحاذاة لـ `.badge-*`/tokens.

**App shell:**
6. `Sidebar.tsx:219` أضِف `aria-label` لزر الطيّ؛ `MainLayout.tsx:53` و`Sidebar.tsx:142` أزل `/50`,`/40` (contrast)؛ استبدل `transition-all` بـ scoped (`Sidebar.tsx:83/112/157/197/210`, `MainLayout.tsx:47`)؛ `Header.tsx:90` modifier حسب المنصّة؛ `Header.tsx:78/114` استبدل inline بـ `w-80`/`text-[11px]`.

**Analysis / Home / Results / History-Admin:**
7. `Analysis.tsx:390/466/468` أوقف الأمبر الصغير كنصّ → `text-foreground` على `bg-warning/18`؛ `Analysis.tsx:167/208` أزل `/60`؛ `Analysis.tsx:279` استخدم Input primitive؛ `Analysis.tsx:472` `transition-[width]`.
8. `Home.tsx:25` بدّل `Shield/Zap`؛ `StructuredReport.tsx:20/36/108` وحّد السلّم على success/warning/destructive وأزل الـpill؛ `SimilarityRadar.tsx:42/44` لوّن القيمة بالنطاق + overlay واحد؛ `AnalysisReport`/`.analysis-markdown` عناوين mono.
9. `History.tsx:37` احذف `hsl(14 85% 38%)` واعتمد العتبات 50/80؛ `ApiKeys.tsx:165` أعد التلوين لـ warning؛ `Admin.tsx:216/197` أعد بناء الدرج على `Sheet` واستبدل `window.confirm` بـ `AlertDialog`.
10. **Analytics:** `Analytics.tsx:37` عرّف `--chart-*` رمزيًّا بدل `PALETTE` الخام؛ `:270` وحّد المقياس الثلاثي (لا primary كنطاق)؛ `:260/301` `radius 0`؛ `:174` `aria-label`/جدول مكافئ للمخططات؛ `:297` mono للمحور؛ `:164` `.t-stat`.
11. **Results-graph:** `DiffViewer.tsx:29` `bg-warning/10` للجهتين؛ `DiffViewer.tsx:178/182/186` `rounded-lg`؛ `AnalysisChatPanel.tsx:165/205/223/225` قرّب الأقطار + `transition-colors`؛ `AstGraphPanel.tsx:408` وسم بنيوي محايد.

**Common:**
10. `ThemeToggle.tsx:20`/`LanguageToggle.tsx:26` أزل الزجاج (`backdrop-blur-sm`+`bg-card/50`+`shadow-sm`)→ صلب + شعيرة؛ `ThemeToggle.tsx:27` أيقونة الشمس محايدة؛ `EmptyState.tsx:25/29`,`PageError`,`ErrorBoundary` أقطار حادة + عناوين mono؛ `Auth.tsx` (القسم 4).

### 🌊 Wave 3 — نسخ/محتوى/i18n، أيقونات، meta، حركة، حالات a11y

1. **نسخ EN+AR:** `en/common.json:163` ("Everything you need…")، `:137` ("AI-Powered Platform")، `:165` ("Ready to…?")، `:187` ("Fast & Reliable")، `:218` ("Figures report")؛ `en/auth.json:3/4/17` (superlatives)، `:5-9` (تكرار)، `:45` (شخصية وهميّة). حدّث السطر AR الموازي في كلٍّ.
2. **خلل i18n مؤكّد:** `ar/common.json:204` (`topScoreDesc` "في آخر تحليل" خاطئ ← "أعلى نتيجة مسجّلة").
3. **i18n متروك:** `Analysis.tsx:384` (MODE/PAIRWISE/AUTOSAVE)، `Chat.tsx:35`/`ApiKeys.tsx:675`، `History.tsx:445/455/465/475/485` (aria-labels). مرّرها عبر `t()`.
4. **أيقونات:** `Help.tsx:62/63` (`Shield/Zap`)، `Help.tsx:87/147/180` (`ExternalLink` على روابط داخلية → `ArrowRight`)؛ إزالة `ArrowRight` الانعكاسي عن أزرار submit (`Auth.tsx:381`, `ResetPassword.tsx:115`).
5. **الحركة:** `tailwind.config.ts:97` أوقف نشر `fade-in` (fade-up) على كل جذر؛ اجعله opacity-only على سطح واحد؛ احذف tokens الميّتة (`:126`)؛ أزل `transition-all` الميّت (`Results.tsx:837`).
6. **404/placeholders/meta:** `NotFound.tsx:18` ادفع motif الدوسيه؛ `Privacy.tsx:19/45/62` عبّئ قبل النشر؛ `Auth.tsx:371` احذف `--glow-shadow-sm`، و`:172/198` رموز surface، و`:166` `rounded-lg`، و`:197` أزل side-stripe 3px، و`:186` استخدم `.t-*`.
7. **microcopy:** `ApiKeys.tsx:57` ("Copy…"→"Copied" مع `t()`).
8. **أيقونات AI (§9.2):** أزِل ثنائي `Sparkles`+`Bot` وكل `Sparkles=AI` — `AnalysisChatPanel.tsx:149/160`، `Results.tsx:829/1278`، `PdfExportDialog.tsx:66-67`، `Home.tsx:25` (`Shield/Zap`)، `Billing.tsx:183` (`Zap`) → رموز خاصّة بالمجال أو لقطات واجهة.
9. **Meta اجتماعي/لغوي:** `index.html:7-13` أضِف `og:*`/`twitter:card` + صورة OG في `public/`؛ `index.html:2` زامِن `lang`/`dir` مع اللغة النشطة؛ أضِف `<meta name="theme-color">` لكل نظام لون؛ احذف `public/placeholder.svg`.
10. **توحيد الشعار:** wordmark بخط واحد (mono-display) عبر `Sidebar.tsx:95`/`Header.tsx:63`/`Auth.tsx:182`، ونصف قطر رقاقة موحّد (`Sidebar.tsx:90`/`Header.tsx:60`/`Auth.tsx:177`)؛ إمّا استعمل `public/brand/nameOfLogo.png` أو احذفه.

---

## 4. السجلّ الكامل حسب الشريحة

### 4.1 Global tokens & CSS — `index.css`, `App.css`, `tailwind.config.ts`, `index.html` · score 60

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| **critical** | `index.css:628` | glow | `box-shadow: 0 0 0 1px rgba(124,114,255,.66), …, 0 0 28px rgba(124,114,255,.46), 0 18px 38px rgba(124,114,255,.3)` + توأم cyan (638) + هالات dots (598–717) + `drop-shadow(0 0 12px…)` على الحواف (746/750/754) → احذف كل طبقة `0 0 Npx` وكل `drop-shadow(0 0…)`؛ التحديد = outline `hsl(var(--ring))` + drop محايد `0 2px 8px hsl(30 24% 18%/.12)` | M |
| high | `index.css:560` | glass | `.ast-flow-label-card` شعيرة `rgba(255,255,255,.18)` + gradient slate + shadow slate (561–562)، و`.ast-node-detail-*` (757–792) → fill `hsl(var(--card))` + شعيرة 1px `hsl(var(--border))`، بلا gradient/shadow | M |
| high | `index.css:602` | color | `#7c72ff`/`#22d3ee`/`#6d7cff` + حدود `rgba(137,145,255,…)` (566/571) + dots detail (819/823) → أمبر `--primary` للبؤرة، `--muted-foreground` للثانوي، سلّم دلالي للحالات؛ احذف كل hex | M |
| medium | `tailwind.config.ts:132` | shadcn-default | `shadow-card`/`card-hover` (0.4α), keyframes+anim fade/slide/scale (96–115/124–128), shimmer (116–119/129), `rounded-3xl` (85) → احذف الكل؛ أبقِ accordion فقط | S |
| medium | `index.css:245` | a11y | لا كتلة `prefers-reduced-motion` إطلاقًا؛ `.metric-bar-fill`(438) `.skeleton`(463) + ast transform/scale (622/645/653/703) → أضِف كتلة عالمية في `@layer base` | S |
| medium | `index.css:912` | over-rounding | `table 1rem`(912), panels `1rem`(760/771), `0.85rem`(781/790), blockquote `0.75rem`(944), pre `rounded-xl`(895), code `0.5rem`(889) → `var(--radius)`/`--radius-md`/`--radius-sm`؛ وحّد pre مع `.code-surface` | S |
| medium | `DESIGN.md:127` | inconsistency | §2 indigo+cyan، §3 Inter-only، §5 8–20px → أعد الكتابة لنظام Evidence Dossier (أمبر أحادي، mono-display، سلّم 2/3/5.6px) | M |
| low | `index.css:462` | motion | `.skeleton` يهيّئ `background-size:200%` لكن يطبّق `animate-pulse` فقط (لا sweep) → إمّا flat `bg-muted animate-pulse` أو وصل `animate-shimmer` | S |
| low | `index.css:506` | glow | `.ast-graph-surface` `radial-gradient(circle at top, primary/.06 …)` زخرفي → أبقِ `surface-1→surface-2` المحايد فقط | S |

### 4.2 shadcn primitives — high-traffic · score 74

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| medium | `card.tsx:39` | shadcn-default | `CardTitle "text-2xl font-semibold …"` (+Dialog/Sheet/AlertDialog titles) بخط Inter → `font-[family:var(--font-display)]` (أو `.t-h4/.t-h5`) | M |
| medium | `dialog.tsx:22` | shadcn-default | حُجُب `bg-black/80` (+sheet/alert) + `zoom-in-95`/`slide-in-from-top-[48%]` → `hsl(var(--foreground)/.55)` + fade+scale هادئ على `--ease-out/--dur-base` | M |
| low | `switch.tsx:20` | shadow | thumb `shadow-lg` → `ring-1 ring-border` أو `shadow-sm` | S |
| low | `tabs.tsx:30` | shadcn-default | active `bg-background shadow-sm` → احذف الظل، عبّر بأمبر (underline/border-b) | M |
| low | `skeleton.tsx:9` | shadcn-default | `animate-pulse rounded-md bg-muted` verbatim → ابنِ على `.skeleton` المؤلَّف، ونوّع الأشكال | S |
| low | `badge.tsx:7` | over-rounding | `rounded-full … pill` غير مستخدم → احذف أو أعد المحاذاة لـ `.badge-*` (rounded-sm, mono, 11px) | S |
| low | `toast.tsx:78` | hardcoded-color | `text-red-300/50 ring-red-400/600` (Radix toast غير مُركّب) → tokens `destructive`، أو احذف كومة Radix toast | S |

### 4.3 shadcn primitives — remainder · score 84

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| medium | `chart.tsx:180` | shadcn-default | tooltip `shadow-xl` (أثقل ظل في الطقم) → `shadow-md` (كـ`tooltip.tsx:20`) أو `shadow-[var(--card-shadow-hover)]` | S |
| low | `carousel.tsx:207` | over-rounding | prev/next `rounded-full h-8 w-8` (+236) → `rounded-md`؛ نظّف المسافة المزدوجة `"absolute  h-8"` | S |
| low | `drawer.tsx:44` | inconsistency | `rounded-t-[10px]` literal → `rounded-t-2xl` (token) | S |
| low | `sidebar.tsx:249` | shadcn-default | floating/inset bare `shadow` (+324) → احذف واعتمد شعيرة `sidebar-border`، أو `shadow-[var(--card-shadow-rest)]` | S |

### 4.4 App shell — Header, Sidebar, MainLayout · score 82

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| medium | `MainLayout.tsx:53` | a11y | footer `text-muted-foreground/50` ≈2.1:1 + روابط بلا rest color → `text-muted-foreground` صلب + `hover:text-foreground` | S |
| medium | `Sidebar.tsx:83` | motion | `transition-all duration-300` على width/slide/padding بلا reduced-motion → أضِف الكتلة العالمية أو `motion-reduce:transition-none` | M |
| medium | `Sidebar.tsx:219` | a11y | زر الطيّ icon-only بلا `aria-label` في الحالة المطويّة → أضِف `aria-label`/`sr-only` | S |
| low | `Sidebar.tsx:112` | motion | `transition-all` مكرّر (157/197/210 + `MainLayout:47`) → scoped: `transition-colors`/`transition-[width,transform]`/`transition-[padding]` | S |
| low | `Sidebar.tsx:142` | a11y | eyebrow `text-sidebar-foreground/40` ≈1.9:1 → لون كامل + وزن/tracking | S |
| low | `Header.tsx:90` | inconsistency | `⌘K` hardcoded على هدف Windows/Linux → modifier حسب المنصّة أو أسقط الرمز | S |
| low | `Header.tsx:114` | inconsistency | inline `0.72rem` و`320px`(78) → `text-[11px]`/token و`w-80` | S |

### 4.5 Auth, ResetPassword, Privacy, Help, NotFound · score 72

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| high | `Auth.tsx:186` | inconsistency | عناوين raw `text-4xl font-extrabold`+inline letterSpacing (h3:212, wordmark:182, OR:406) بخط Inter → `.t-h2/.t-h3/.t-label`، احذف letterSpacing | M |
| medium | `Auth.tsx:197` | side-stripe | `border-l-[3px] border-primary` (مخالف `DESIGN.md:239`) → شعيرة 1px `border-border` أو أزلها | S |
| medium | `Help.tsx:63` | icon | `Zap`(apiGuide) + `Shield`(securityFaq, :62) → `Terminal/Braces` و`Lock/KeyRound` أو أسقطها | S |
| medium | `Help.tsx:73` | motion | `animate-fade-in` بلا guard → أضِف الكتلة العالمية | S |
| low | `Help.tsx:87` | icon | `ExternalLink` داخل روابط داخلية (147/180) → `ArrowRight`/`ArrowUpRight`؛ احفظ `ExternalLink` لـ mailto فقط | S |
| low | `Auth.tsx:371` | glow | `boxShadow: var(--glow-shadow-sm)` (fossil=none) → احذف الإعلان؛ لو لزم `--card-shadow-rest` | S |
| low | `Auth.tsx:172` | inconsistency | `hsl(30 12% 8%)` + `rgba(255,255,255,0.05)`(198) literals → رموز `--surface-*` | S |
| low | `Auth.tsx:166` | inconsistency | البطاقة `rounded-2xl` (10px) أنعم من أقرانها → `rounded-lg` | S |
| low | `Auth.tsx:381` | cta | `ArrowRight` انعكاسي على submit (+`ResetPassword:115`, `NotFound:26`) → أزله عن submit | S |
| low | `NotFound.tsx:18` | default-404 | بطاقة centered + `Compass` → motif دوسيه ("EXHIBIT NOT FOUND" + كود خطأ) | M |
| low | `Privacy.tsx:19` | placeholder | placeholders تعليمية حيّة (45/62) → عبّئ قبل النشر أو gate بـ draft flag | S |

### 4.6 Home / landing · score 85

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| medium | `en/common.json:163` | copy | `"Everything you need for code analysis"` (+AR:163) → لصيقة أداتية محدّدة | S |
| low | `Home.tsx:25` | icon | `featureIcons=[…, Shield, Zap, …]` (Shield على Clone-Type, Zap على Fast) → `Layers/FileStack/Copy`, `Gauge/Activity/History` | S |
| low | `en/common.json:165` | copy | `"Ready to analyze your code?"` (+AR:165) → سطر disposition محدّد ("Queue a pairwise comparison") | S |

### 4.7 Analysis workspace — `Analysis.tsx` · score 82

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| medium | `Analysis.tsx:390` | a11y | `text-warning DRAFT` + `text-primary`(466) و`%`(468) ≈2.4:1 على الورق → `text-foreground` على `bg-warning/18`؛ للـstage/percent `text-foreground` | M |
| medium | `Analysis.tsx:167` | a11y | `text-muted-foreground/60` ≈2.5:1 (+208 line-count) → `text-muted-foreground` صلب أو token ثالث محقّق | S |
| medium | `Analysis.tsx:279` | a11y | raw `<input type=number … focus:outline-none focus:border-primary/60>` → Input primitive أو `.input-focus` | S |
| low | `Analysis.tsx:472` | motion | `transition-all duration-500` على width فقط → `transition-[width]` + `motion-reduce:transition-none` (وكذا `.metric-bar-fill`) | S |
| low | `Analysis.tsx:384` | i18n | `MODE/PAIRWISE/AUTOSAVE:"ON"` hardcoded (وAUTOSAVE ثابت) → `t()` + اربط STATUS/AUTOSAVE بالحالة الفعلية | M |

### 4.8 History, ApiKeys, Admin, Chat · score 84

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| high | `History.tsx:37` | color | `scoreColor` = `hsl(14 85% 38%)` بحزم 25/50/75 → ثلاثة رموز عند 50/80: `success`/`warning`/`destructive`؛ احذف الـliteral | S |
| medium | `ApiKeys.tsx:165` | color | لوحة تحذير بـ `border-success/45 bg-success/5` + `TriangleAlert` → `warning` tokens، أو أيقونة success | S |
| medium | `Admin.tsx:216` | a11y | `UserDetailModal` div overlay بلا role/aria-modal/focus-trap/Esc → أعد البناء على `Sheet` primitive | M |
| medium | `History.tsx:250` | motion | `animate-fade-in` (translateY8px) بلا guard (+`Chat:28/63`,`Admin:692`) → الكتلة العالمية | S |
| low | `Admin.tsx:197` | inconsistency | `window.confirm(opts.confirm)` → `AlertDialog` primitive | M |
| low | `ApiKeys.tsx:57` | copy | `copied ? label+"…" : label` → `t("apiKeys.keys.copied")`="Copied" بجانب Check | S |
| low | `Chat.tsx:35` | i18n | meta `NO CONTEXT/NONE/CONSULT/GROUNDED` (+`ApiKeys:675`) hardcoded → `t()`؛ اترك `v1`/`X-API-KEY` | M |
| low | `History.tsx:445` | i18n | `aria-label="View details"` (+455/465/475/485) → مفاتيح `t()` | S |

### 4.9 Results — report & chart components · score 78

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| medium | `StructuredReport.tsx:20` | color-encoding | `low: text-primary bg-primary/10` + `SEV_DOTS.low:"bg-primary"`(36) — primary≈warning بصريًا → low→`success`, moderate→`warning`, high→`destructive`؛ حرّر primary | S |
| medium | `StructuredReport.tsx:108` | inconsistency | `rounded-full … opacity-70 style={{color:"inherit"}}` (dead) + count pill(92)/risk(63) → `.badge-*` (rounded-sm, mono)؛ احذف inline color | M |
| medium | `index.css:912` | over-rounding | `.analysis-markdown table 1rem` + blockquote(944)/pre(895)/code(888) → `var(--radius)` وسلّم حادّ | S |
| low | `SimilarityRadar.tsx:44` | dataviz | tooltip value `text-primary` دائمًا (يناقض dot النطاق 100–106) → لوّن بالنطاق + `font-mono/tabular-nums` | S |
| low | `SimilarityRadar.tsx:42` | surfaces | tooltip `rounded-xl border … shadow-lg` (border+shadow) → hairline أو `--card-shadow-hover` (لا كلاهما) + `rounded-lg` | S |
| low | `index.css:838` | inconsistency | `.analysis-markdown h1/h2/h3` بلا font-family (Inter) → `font-family: var(--font-display)` | S |

### 4.10 Common components & guards · score 72

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| medium | `ThemeToggle.tsx:20` | glass | `rounded-full border/50 bg-card/50 shadow-sm backdrop-blur-sm` → `bg-card` صلب + شعيرة، أزل blur/shadow، `rounded-sm/md` | S |
| medium | `LanguageToggle.tsx:26` | glass | توأم الزجاج ذاته → نفس الإصلاح | S |
| medium | `PageLoader.tsx:19` | motion | `animate-spin` لا نهائي بلا guard (+`ProtectedRoute:29`) → الكتلة العالمية + `motion-reduce:animate-none` | S |
| low | `EmptyState.tsx:25` | over-rounding | `rounded-2xl bg-muted/60` tile (10px) + lucide → إطار حادّ `--radius-md` أو حالة محتوى-محدّدة | S |
| low | `ThemeToggle.tsx:27` | colour | `Sun … text-warning` زخرفي → `text-foreground`/`text-muted-foreground` | S |
| low | `EmptyState.tsx:29` | inconsistency | `h3 text-lg font-semibold` (+`PageError:21`,`ErrorBoundary:43`) Inter → `.t-h4/.t-h5`/`font-display` | S |

### 4.11 Copy & content — i18n en/* + ar/* · score 70

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| high | `en/common.json:163` | copy | `"Everything you need for code analysis"` (+AR:163) → "Five similarity signals, one review verdict" / "خمس إشارات تشابه، حكم مراجعة واحد" | S |
| medium | `en/common.json:137` | copy | `badge:"AI-Powered Code Intelligence Platform"` → "Multi-signal clone detection" | S |
| medium | `en/auth.json:3` | copy | world-class(3)/premium(4)/polished(17) → قدرات ملموسة | S |
| medium | `en/auth.json:45` | placeholder | `quoteCite:"Dr. N. Kaya, CS Dept."` (+AR) → اقتباس حقيقي مُصرّح أو ادّعاء أول-شخص | S |
| medium | `ar/common.json:204` | inconsistency | `topScoreDesc:"في آخر تحليل"` (خاطئ) → "أعلى نتيجة مسجّلة" | S |
| low | `en/common.json:165` | copy | `ctaTitle:"Ready to analyze your code?"` (+AR) → "Run my first comparison" / "شغّل أول مقارنة لي" | S |
| low | `en/common.json:187` | copy | `"Fast & Reliable"`/"Optimized…" (+AR) → "Charts, graphs & session history" | S |
| low | `en/auth.json:5` | inconsistency | trustSignals(5–9) = featureCards(11–22) verbatim (+AR) → مايّز القائمتين | S |
| low | `en/common.json:218` | copy | `eyebrow:"Figures report"` / AR "تقرير الأشكال" → "Usage figures" / "أرقام الاستخدام" | S |

### 4.12 Cross-cutting motion audit · score 64

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| high | `index.css:463` | a11y | صفر `prefers-reduced-motion` مع loops لا نهائية + كل الدخول → كتلة عالمية واحدة في base layer | M |
| medium | `tailwind.config.ts:97` | motion | `fade-in` = fade-up مطبّق على ~10 جذور (Help:73, Analytics:87/134, Admin:692, Settings:117, Billing:144, Chat:28/63, Results:1169, History:250) → دخول واحد opacity-only، مربوط بحالة | M |
| low | `tailwind.config.ts:126` | dead-token | `slide-in-left/slide-up/scale-in/fade-in-fast/shimmer` غير مُستهلكة → احذف الأزواج keyframe+anim | S |
| low | `Results.tsx:837` | motion | `transition-all duration-200` على بطاقة ساكنة (لا hover/onClick) → احذفه؛ scoped حيث يلزم | S |

### 4.13 Billing & pricing · score 86

تقرأ بشرية وعلى-هوية بقوة: استبدلت كليشيه بطاقات التسعير الثلاث «Most Popular» بجدول سِجِلّ (ledger) بأسلوب الـ dossier، بأرقام API حقيقية بلا تدرّج/توهّج/أرقام دقيقة زائفة؛ نقاط ضعفها الوحيدة a11y ومعالجة أخطاء الجلب الصامتة، لا «الطابع الآلي».

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| medium | `Billing.tsx:201` | a11y | شريط الاستخدام `<div>` بصري بلا `role="progressbar"`/`aria-valuenow/min/max` → أضِف الدور وقيَم `aria-value*` | S |
| medium | `Billing.tsx:36` | loading-state | `.catch(() => undefined)` يبتلع فشل `getBillingSummary`/`getPlans` بصمت → حالة خطأ صريحة (toast + retry) | S |
| medium | `Billing.tsx:253` | placeholder | `plans.map(...)` بلا حالة فارغة (جدول شبح عند `plans=[]`) → empty state داخل الـ Panel | S |
| low | `Billing.tsx:96` | a11y | `Loader2` ملء الشاشة بلا `role="status"`/`sr-only` → لُفّه بـ `role="status"` + نص مخفي | S |
| low | `Billing.tsx:300` | a11y | زر الترقية يعرض `Loader2` فقط عند `checkingOut` (اسم متاح فارغ) → أبقِ نصًّا/`aria-label` أثناء التحميل | S |
| low | `Billing.tsx:270` | a11y | أيقونات زخرفية (`CheckCircle2`, `Zap:183`, `AlertCircle:234`) بلا `aria-hidden` → علِّمها | S |

### 4.14 Analytics dashboard · score 78

في معظمها عمل بشري مصقول ومربوط بالرموز (spec band بدل رباعي KPI، ألوان دلالية، tooltip مخصّص، محاور mono، بيانات API حقيقية لا بذور desktop/mobile)، لكن تعبئة المنطقة المتدرّجة والـ palette اليدوية وأطراف الأعمدة المدوّرة تكسر نظامها الحادّ المسطّح.

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| high | `Analytics.tsx:177` | gradient | `<linearGradient id="actGrad">` (0.35→0.02) مُستهلك `fill="url(#actGrad)"` (200) — توقيع §15.4 ويخالف "gradients retired" → خطّ `strokeWidth 2` بلا تعبئة، أو `hsl(var(--primary)/0.06)` مسطّح | S |
| medium | `Analytics.tsx:37` | hardcoded-color | مصفوفة `PALETTE` تكتب HSL خامًا (`hsl(8 60% 46%)`…) بانجراف عن الرموز → عرّف `--chart-*` في index.css وارجع إليها | M |
| medium | `Analytics.tsx:270` | inconsistency | مخطط التوزيع بأربعة ألوان عتبات 25/50/75 ويصرف `--primary` على نطاق تشابه (يناقض green<50/amber50-79/red>=80) → وحّده على السلّم الثلاثي؛ لا تجعل primary نطاقًا | S |
| medium | `Analytics.tsx:260` | over-rounding | `radius={[6,6,0,0]}` (و`[0,6,6,0]`:301) أطراف مدوّرة على marks البيانات → `radius 0` (أو 2px) | S |
| medium | `Analytics.tsx:174` | a11y | كل `ResponsiveContainer`/`PieChart`/`BarChart` بلا `aria-label`/`<desc>`؛ الـPie ينقل المعنى باللون وحده → أضِف label/جدول مكافئ مخفي | M |
| low | `Analytics.tsx:48` | over-rounding | `CHART_TOOLTIP_STYLE.borderRadius: 6` صلب → رمز `--radius`/`--radius-md` | S |
| low | `Analytics.tsx:87` | motion | غلاف `animate-fade-in` (و134) بلا حارس → الكتلة العالمية أو `motion-reduce` | S |
| low | `Analytics.tsx:297` | inconsistency | محور الفئة يُسقط `fontFamily: var(--font-mono)` (بقيّة المحاور mono) → أضِف mono | S |
| low | `Analytics.tsx:164` | inconsistency | رقم الـspec band inline (`font-mono text-3xl…`) بدل `.t-stat` → استبدله بـ `.t-stat` | S |

### 4.15 Results — AST graph, diff, chat, PDF, Dossier · score 72

في معظمها بشري منضبط (Dossier وDiffViewer وPdfExportDialog على النظام: token، نصف قطر حادّ، بلا glow/gradient)، لكن `AstGraphPanel` لا يزال مربوطًا ببصمة الـglow البنفسجية/السماوية عبر أصناف `ast-*` ولون oxblood مكتوب يدويًا، مع بقايا `shadow-glow-sm` وأيقونات Sparkles/Bot. (`Dossier.tsx` نظيف تمامًا — نموذج القدوة البشري.)

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| high | `AstGraphPanel.tsx:399` | gradient | لوحة التفاصيل تُطبّق `ast-node-detail-panel/card/empty` (399/424/428/432/436/443) بلا تجاوز inline فتُعرض ببصمة الـCSS (`linear-gradient` + `border-radius:1rem`) → صبغها بسطح صلب `hsl(var(--card))`+hairline+`var(--radius)` عبر تجاوز inline كـ`cardStyle` | M |
| high | `AstGraphPanel.tsx:24` | hardcoded-color | `getGraphToneColor` يُرجِع `hsl(8 60% 46%)` (وَ30/778/830/405)؛ التعليق يدّعي token-based وهو غير صحيح (46% ثابت لا يتكيّف مع الداكن) → عرّف `--accent-suspect` واستبدل الحرفية | M |
| medium | `AnalysisChatPanel.tsx:225` | glow | زر الإرسال يحمل `shadow-glow-sm` (fossil=none، يتوهّج فور إعادة التفعيل) → احذف الصنف | S |
| medium | `DiffViewer.tsx:29` | color-encoding | كتلة `replace` تعرض الجهة B بـ `bg-primary/10` (تُنفق اللكنة على بيانات، وتخالف مفتاح `replace=bg-warning/60`:201) → `bg-warning/10` للجهتين | S |
| medium | `AnalysisChatPanel.tsx:149` | icon | `<Sparkles>` شارة «Grounded» + `<Bot>` (160) + Sparkles في `PdfExportDialog:66` — مفردات §9.2 «AI» → رمز خاصّ بالمجال، أسقط sparkle=AI | M |
| low | `AstGraphPanel.tsx:408` | color-encoding | `badge-success` (أخضر) يوسم «root node» (معنى بنيوي لا نجاح) → وسم محايد `badge-info`/mono | S |
| low | `DiffViewer.tsx:183` | color-encoding | `text-primary`/`text-accent` (187) لتمييز الملف A عن B زخرفيًّا → ميّز بالوزن/الطباعة واحصر primary للإشارة | S |
| low | `AnalysisChatPanel.tsx:205` | motion | رقائق الاقتراحات `transition-all` + `rounded-full` (تتنافر مع `badge-*` المربّعة) → `transition-colors` + `rounded-sm` | S |
| low | `AnalysisChatPanel.tsx:165` | over-rounding | فقاعات `.chat-bubble-*` `rounded-2xl` + مُدخَل/زر `rounded-xl` (223/225) أنعم الأسطح في نظام حادّ → قرّب نحو `--radius`/`--radius-md` | S |
| low | `DiffViewer.tsx:178` | over-rounding | بطاقات الإحصاء `rounded-xl` (178/182/186) بينما `card-premium` المحيط `rounded-lg` → وحّدها `rounded-lg` | S |

### 4.16 Cross-cutting icons, favicon, meta & brand assets · score 72

بشريّة على المحاور الصعبة (`favicon.ico` حقيقي لا `/vite.svg`؛ عنوان ووصف فعليان؛ شعار نقطي حقيقي `/brand/logo.png` في مربّع `bg-primary` صلب فـ§17.10 لا ينطبق)، لكنها تتسرّب آليًّا عبر أيقونات الاستعارة (Sparkles/Bot=AI، Zap=سرعة، Shield=أمان) وميتاداتا اجتماعية/لغوية ناقصة. (احتكار lucide عبر 52 ملفًا **غير** مُعاقَب per §18.)

| Sev | file:line | category | current → fix | eff |
|---|---|---|---|---|
| high | `AnalysisChatPanel.tsx:149,160` | icon | حزمة `Sparkles`+`Bot` معًا = إشارة §9.2 «AI العامة» → رمز خاصّ بالمجال، أزِل الثنائي | S |
| high | `Results.tsx:829,1278` · `PdfExportDialog.tsx:67` | icon | `Sparkles=AI` مُعاد على ترويسة التقرير وخيار التصدير → أيقونة تقرير/تحليل محايدة | S |
| medium | `Home.tsx:25` | icon | `featureIcons=[…, Shield, Zap, …]` في شبكة 6-up؛ `Shield=أمان`/`Zap=سرعة` عامّتان → رمزان خاصّان أو لقطة واجهة | M |
| medium | `Help.tsx:62-63` | icon | `Shield=securityFaq` و`Zap=apiGuide` استعارات نمطية → رموز تصف الوجهة الفعلية | S |
| medium | `index.html:7-13` | metadata | لا `og:title`/`og:description`/`og:image`/`twitter:card` (§16.1) → بطاقات اجتماعية + صورة OG مخصّصة في `public/` | S |
| medium | `index.html:2` | metadata | `<html lang="en">` ثابت بلا `dir` رغم ثنائية EN/AR+RTL → زامِن `lang`/`dir` مع اللغة النشطة | M |
| low | `Billing.tsx:183` | icon | `Zap` بجانب «unlimited» استعارة سرعة → رمز محايد أو دع النص يحمل المعنى | S |
| low | `index.html` | metadata | لا `<meta name="theme-color">` رغم ThemeToggle داكن/فاتح → أضِفه لكل نظام لون | S |
| low | `public/placeholder.svg` | placeholder | أصل سقالة Lovable/Vite افتراضي غير مرجَّع → احذفه | S |
| low | `public/brand/nameOfLogo.png` (+`Sidebar.tsx:95`,`Header.tsx:63`,`Auth.tsx:182`) | logo | wordmark حقيقي مشحون لكنه غير مستخدم؛ الـwordmark يُرسم نصًّا بخطوط متباينة (mono مقابل sans) → وحّد على mono-display أو استعمل الأصل | M |
| low | `Sidebar.tsx:90` · `Header.tsx:60` · `Auth.tsx:177` | inconsistency | مربّع الشعار بثلاثة أنصاف أقطار (`rounded-lg`/`rounded-md`/`rounded-[10px]`) → وحّد نصف قطر الرقاقة | S |

---

## 5. جدول المقاييس

### حسب الخطورة

| الخطورة | العدد |
|---|---|
| critical | 1 |
| high | 11 |
| medium | 45 |
| low | 58 |
| **الإجمالي** | **115** |

### حسب الفئة (تنازليًا)

| الفئة | العدد | الفئة | العدد |
|---|---|---|---|
| inconsistency | 17 | glow | 4 |
| a11y | 14 | placeholder | 4 |
| motion | 11 | glass | 3 |
| copy | 9 | color | 3 |
| icon | 8 | i18n | 3 |
| over-rounding | 8 | metadata | 3 |
| shadcn-default | 7 | gradient | 2 |
| color-encoding | 4 | loading-state | 1 |
| hardcoded-color | 4 | logo · side-stripe · cta · default-404 · shadow · dataviz · surfaces · dead-token | 1 لكلٍّ |

> بعض ملاحظات `icon` تتقاطع بين §4.15 و§4.16 (Sparkles=AI مُشار إليه مرّتين)؛ العدّ أعلاه تقريبي على مستوى الفئة، بينما عدّ الخطورة (115) دقيق.

### الشرائح الأسوأ (أدنى human_read_score أولًا)

| # | الشريحة | score |
|---|---|---|
| 1 | Global design tokens & CSS (`index.css`, `App.css`, `tailwind.config.ts`, `index.html`) | **60** |
| 2 | Cross-cutting motion audit | **64** |
| 3 | Copy & content (i18n en/* + ar/*) | **70** |
| 4 | Auth, ResetPassword, Privacy, Help, NotFound | **72** |
| 4 | Common components & guards | **72** |
| 4 | Results — AST graph, diff, chat, PDF, Dossier | **72** |
| 4 | Cross-cutting icons, favicon, meta & brand assets | **72** |
| 8 | shadcn UI primitives — high-traffic | **74** |
| 9 | Results — report & chart components | 78 |
| 9 | Analytics dashboard | 78 |
| 11 | App shell — Header, Sidebar, MainLayout | 82 |
| 11 | Analysis workspace (`Analysis.tsx`) | 82 |
| 13 | shadcn primitives — remainder | 84 |
| 13 | History, ApiKeys, Admin, Chat | 84 |
| 15 | Home / landing | 85 |
| 16 | Billing & pricing | 86 |

> **ملاحظة توزيع الجهد:** الملاحظة الحرجة الوحيدة + معظم عالية-الخطورة مركّزة في **Wave 1** (كتلة AST + sync + reduced-motion)، وهي M/S بمجملها — أي أن أعلى عائد إصلاحي متاح بأقل عدد لمسات. ابدأ بها بعد حسم القرار الاستراتيجي في القسم 2.