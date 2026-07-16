# خطة إعادة تصميم محتوى Clone Lens — "Evidence Dossier"

> الهدف الجوهري: كل قسم في كل صفحة يجب أن يُقرأ كـ **ملف قضية / أداة قياس** (case file / measuring instrument) لا كـ dashboard عام مولّد بالذكاء الاصطناعي. اللوحة الأساسية (Masthead) في كل الصفحات مُنجزة بالفعل؛ العمل كله في **بنية جسم الصفحة** (block-level composition) وفي **توحيد المفردات** عبر مكوّنات `Dossier.tsx` مشتركة.
>
> الملف المرجعي الوحيد للمفردات: `src/components/dossier/Dossier.tsx` (يحتوي حاليًا: `MetaStrip`, `Masthead`, `Field`, `FieldSheet`, `Panel`, `Figure`, `Serial`).

---

## 1. ملخّص (Verdict)

الحالة العامة: التطبيق **تجاوز مرحلة الـ dashboard العام** — الـ Masthead و`MetaStrip` و`Field/FieldSheet` و`Serial` و`Figure` مستخدمة فعليًا في كل الصفحات تقريبًا. النقص الحقيقي مركَّز في: (أ) جداول مبنية يدويًا (hand-rolled `<table>`) تتكرر بلا primitive مشترك، (ب) صفوف/شبكات "stat tiles" و"card grids" متبقية، (ج) نماذج وحوارات مكدّسة (stacked forms)، (د) حالات فارغة/تحميل/خطأ مُوسَّطة (centered), (هـ) شارات (badges) مبنية من خرائط class محلية متكررة.

**ترتيب الصفحات حسب الأولوية (الأقل تميّزًا أولًا):**

| # | الصفحة | Distinctiveness | الفجوة الأساسية |
|---|--------|:---:|---|
| 1 | **Chat** (`Chat.tsx` + `AnalysisChatPanel.tsx`) | **40** | كامل واجهة المحادثة = messenger UI (فقاعات + avatars + chips مدوّرة) |
| 2 | **Analysis** (`Analysis.tsx`) | 58 | checklist أخضر، dropzone موسَّط، غياب comparator readout |
| 3 | **Results** (`Results.tsx`) | 58 | تبويبا Quality + Graphs = stat tiles + shadow score widgets |
| 4 | **History** (`History.tsx`) | 58 | preview dialog متناظر، جدول غير مؤطَّر، فلاتر منفصلة |
| 5 | **Admin** (`Admin.tsx`) | 60 | 4 جداول يدوية، stat grids، drawer key/value، صفر ترميز دلالي للّون |
| 6 | **WorkspaceDetail** (`enterprise/WorkspaceDetail.tsx`) | 62 | قوائم مكدّسة، avatar chips، خرائط chip متوازية |
| 7 | **Workspaces** (`enterprise/Workspaces.tsx`) | 64 | ledger غير مُعنون، حالات فارغة/خطأ عامة |
| 8 | **ReviewCases** (`enterprise/ReviewCases.tsx`) | 64 | فلتر status مخفي في dropdown، حالات موسَّطة |
| 9 | **Analytics** (`Analytics.tsx`) | 66 | stat-tile grid، جدول ad-hoc، شبكة 2-col متناظرة |
| 10 | **Settings** (`Settings.tsx`) | 68 | عمود مركزي واحد، أقسام غير مرقّمة، نماذج 2FA مكدّسة |
| 11 | **Home** (`Home.tsx`) | 70 | Figure مُكرَّر يدويًا، ledger بأيقونات زخرفية، footer CTA عام |
| 12 | **Billing** (`Billing.tsx`) | 70 | usage meter عام، تكرار Masthead، banner عام |
| 13 | **CaseDetail** (`enterprise/CaseDetail.tsx`) | 70 | شبكة exhibit 2-up متناظرة، progress bars مدوّرة، حوارات مكدّسة |
| 14 | **Help** (`Help.tsx`) | 80 | أيقونات lucide زخرفية، قوائم شبه-ledger |

**الأنماط العامة المتكررة (الأعداء الـ 6):**

1. **صفوف/شبكات stat-tiles** (big-number KPI cards) — Analytics, Results/Quality, Admin, Home. الحل: `MetaStrip` أو `SpecBand` أو `ReadoutRow`.
2. **جداول مبنية يدويًا** (`<table>` افتراضي، بلا Serial، أرقام start-aligned، بلا footer) — Admin×4, Analytics, History, Billing, Workspaces, WorkspaceDetail, ReviewCases, CaseDetail. الحل: عائلة `Ledger` مشتركة.
3. **شبكات cards متساوية / تناظر انعكاسي** (equal card grids) — Results/Quality, Home specimen, CaseDetail exhibits, History preview, Analytics distributions. الحل: تحويل لـ ledger واحد أو split غير متناظر (60/40) + Serial.
4. **نماذج/حوارات مكدّسة** (label-over-input, `space-y-4`) — Settings 2FA, CaseDetail dialogs, Admin drawer, Chat composer. الحل: `FieldSheet` + `Field` (margin-label).
5. **حالات فارغة/تحميل/خطأ موسَّطة** (centered icon+text+CTA) — Workspaces, WorkspaceDetail×3, ReviewCases×3, Results, Analysis. الحل: `LedgerEmpty`/`LedgerFault`/`LedgerSkeleton`/`DossierNote` مُثبّتة يسارًا داخل الإطار.
6. **شارات مبنية من class maps محلية / أيقونات زخرفية / لون بلا معنى** — Admin, WorkspaceDetail, ReviewCases, Workspaces, Help. الحل: `Tag` + `StatusTag` بحيث اللون يُشفِّر معنى فقط.

---

## 2. مكوّنات مشتركة جديدة في `Dossier.tsx` (تُضاف أولًا — Wave A)

تجميع كل `newPatterns` عبر الصفحات وإزالة التكرار. هذه تفكّ الاعتماد وتضمن اتساقًا. تُبنى بالترتيب التالي (الأعلى رافعة أولًا).

### 2.1 `Ledger` + `LedgerHead` / `LedgerRow` / `LedgerCell` / `LedgerFooter` — **الأولوية القصوى**
الجدول المُسطَّر المشترك؛ يستبدل 12+ جدولًا يدويًا عبر التطبيق.
- **الشكل (API مُركَّب):**
  ```tsx
  <Ledger columns="2.75rem minmax(0,1fr) 6.5rem 7rem 6rem 1.25rem">
    <LedgerHead cells={["#","REPO","PROVIDER","BRANCH","REGION",""]} />
    <LedgerRow to?={href} serial={<Serial>R01</Serial>} onClick?>
      <LedgerCell>…</LedgerCell>
      <LedgerCell align="end" mono>…</LedgerCell>
    </LedgerRow>
    <LedgerFooter left="SHOWING" right={`${n} / ${total}`} />
  </Ledger>
  ```
- **القواعد:** `columns` يُمرَّر مرة واحدة كـ `grid-template-columns` فيستخدمه الرأس والصفوف (يمنع الانجراف). الرأس: `bg-muted/40 border-b border-border px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`. الصفوف: `divide-y divide-border`, hover `hover:bg-muted`. خلايا الأرقام: `text-end font-mono tabular-nums`. الـ footer: `border-t bg-muted/20 px-5 py-2.5 font-mono text-[11px]`. RTL-aware عبر `text-start/text-end`.
- **أصدّر أيضًا** `ledgerHeadClass` لمن يريد الاحتفاظ بـ `<table>` دلالي (a11y `<th scope>`) مع نفس التنسيق.
- **متى:** أي "قائمة هي في الحقيقة جدول": Admin (Revenue×2, Usage topApi, Security locked), Analytics top-analyses, History artifacts, Billing plans, Workspaces register, WorkspaceDetail (repos/cases/members), ReviewCases, CaseDetail evidence, Home features.

### 2.2 `Reading` — قراءة أداة مفردة (atomic)
الذرّة التي يتركّب منها `MetaStrip`؛ لعرض قراءة واحدة داخل خلية Field أو ledger أو caption. مُكرَّرة محليًا في Analytics و Admin و ApiKeys.
- **الشكل:** `<Reading label value tone? unit? />` → `font-mono text-xs` uppercase label + `tabular-nums font-semibold` value؛ `tone?: 'default'|'primary'|'success'|'warning'|'danger'`.
- **متى:** خلايا Figure/Masthead `actions`, gutters, one-off readings (Exhibit A SIZE/LINES/LANG).

### 2.3 `Meter` / `Gauge` / `ScoreMeter` — مقياس أفقي دلالي موحّد
يُغلّف كل "شريط نسبة + قيمة mono" ويملك نطاقات اللون. سُلّم التشابه (`scoreColor`) مُكرَّر حرفيًا في ReviewCases + WorkspaceDetail + History + CaseDetail — يُوحَّد هنا.
- **الشكل:** `<Meter value max? tone? showTicks? label? />`؛ track `h-2 rounded-[2px] bg-muted`, fill `rounded-[2px]` مُلوَّن بالنطاق (≤70 `bg-success` / 71–85 `bg-warning` / >85 `bg-destructive`)، ticks اختيارية عند 60/80. `<ScoreMeter value/>` = variant مُخصَّص للتشابه (track 14px + نسبة `tabular-nums` بنفس اللون).
- **قاعدة:** الـ fill نفسه يُشفِّر المقدار (لا يبقى `bg-primary` ثابتًا). للـ Billing quota: variant مُقطَّع بـ ticks + `role=progressbar` + `aria-valuenow/min/max`.
- **متى:** Similarity/threshold/quality/quota/coverage في كل مكان.

### 2.4 `StatusTag` / `Stamp` — رمز حالة مربّع mono
يستبدل `badge-success` والـ spans اليدوية؛ اللون يُشفِّر معنى فقط.
- **الشكل:** `<StatusTag tone>{children}</StatusTag>`, tone: `ok|warn|danger|muted|near|over`؛ `rounded-sm border px-1.5 font-mono text-[10px]/[11px] font-bold uppercase tracking-[0.14em] tabular-nums`. `Stamp` = variant لسطر حالة inline (SYNC/LIVE/ERR/NIL).
- **متى:** READY/EMPTY/DRAFT/GROUNDED/ONLINE, حالة الاشتراك (active=ok/past_due=warn/canceled=danger), failed-logins, حالة التحميل/الخطأ.

### 2.5 `Tag` — وسم كلمة تصنيفية مربّع (شقيق `Serial` لكن للكلمات لا الأرقام)
- **الشكل:** `<Tag tone?>{children}</Tag>`, tone: `neutral|primary|signal|success|warning|danger|accent|muted`؛ `inline-flex rounded-sm border px-1.5 font-mono text-[10px] uppercase tracking-[0.12em]`.
- **متى:** channel TYPE (Help §01), FAQ topic tags, role chips (`ROLE_BADGE`→tone map), provider (GH/GL), clone-type, severity/status عبر enterprise.

### 2.6 `SectionRule` (a.k.a. `Section` / `SectionHead`) — فاصل قسم مُسطَّر
ترقية الـ `SectionHead` المحلي في Help.
- **الشكل:** `<SectionRule n tick?>{children}</SectionRule>` → `§NN` (`font-mono font-bold text-primary`) + tick اختياري (`h-px w-6 bg-primary`) + `t-label` فوق `border-b pb-2`.

### 2.7 `Register` — فهرس/tally مُقطَّع للفلاتر
شريط toggle chips يُظهر التوزيع بدل dropdown مخفي.
- **الشكل:** `<Register items={[{value,label,count,tone?}]} active onSelect />`؛ كل chip: نقطة لون + `t-label` mono + count `tabular-nums`؛ `role=group`, `aria-pressed`؛ active `border-primary/40 bg-primary/10 text-primary`.
- **متى:** ReviewCases status، WorkspaceDetail، History/Analytics status/severity filters.

### 2.8 `IndexRow` (a.k.a. `LedgerRow` المُبسَّط) — صف فهرس مرقّم 3-أعمدة
- **الشكل:** `<IndexRow serial icon? meta?>{title+desc}</IndexRow>` → `grid grid-cols-[auto_1fr_auto] items-start gap-4 px-5 py-4` داخل `<ul className="divide-y divide-border">`. gutter=Serial (+أيقونة كـ index glyph صغير `text-muted-foreground`)، وسط=title+desc، يمين=cross-reference mono.
- **متى:** Home features, Analysis capabilities register, أي "what this covers" index.

### 2.9 `CompareField` / `CompareSheet` — تعميم `FieldSheet` لمقارنة A↔B
- **الشكل:** `<CompareField label a b diff? />` → gutter `t-label` + `sm:grid-cols-2 gap-x-8` قيمتان جنبًا لجنب؛ `<CompareSheet columns={[A,B]} rows={[{label,values,diff}]}>` حاوية مؤطَّرة برؤوس Serial مثبّتة و emphasis عند الاختلاف (tick أمبر / قيمة أعرض).
- **متى:** CaseDetail exhibits (الأهم)، أي مقارنة قِطعتين.

### 2.10 `Transcript` / `TranscriptTurn` — سجل محادثة مُسطَّر (يستبدل الفقاعات)
- **الشكل:** `<TranscriptTurn role serial time label>{body}</TranscriptTurn>` → `grid gap-x-6 border-t border-border py-4 first:border-t-0 sm:grid-cols-[minmax(6rem,9rem)_1fr]`؛ gutter=Serial + speaker `t-label` + timestamp `font-mono text-[10px] tabular-nums`؛ main=`whitespace-pre-wrap t-body`؛ ردود الأداة `border-l-2 border-primary/40 pl-4`.
- **متى:** Chat transcript؛ أي Q/A أو examiner exchange.

### 2.11 `Dropzone` — سطح رفع ملف بمفردات الأداة
- **الشكل:** `<Dropzone label hint icon selectedFile onFile accept />`؛ الحالة الفارغة: أيقونة صغيرة يسارًا `5x5` + `t-label` mono prompt + hint (left-anchored، لا موسَّط)؛ الحالة المختارة: صف Field-style (`FILE:` + اسم mono مقصوص + حجم `formatBytes` tabular-nums + `StatusTag ok`)؛ يُبقي الحد المتقطّع (drop affordance مشروع).

### 2.12 `Notice` — إشعار مُسطَّر (يستبدل alert cards المُلوَّنة)
- **الشكل:** `<Notice tone label>{children}</Notice>`, tone: `warning|info|danger`؛ `border-s-2 border-{tone}` + `border-y border-border` سطح مسطّح (لا pill مملوء) + `t-label` heading + `t-body`.
- **متى:** Billing disabled banner, Settings, ApiKeys degraded states.

### 2.13 `CaseContents` — فهرس ريل جانبي لاصق
- **الشكل:** `<CaseContents items={[{n,label,href?,onClick?,active?}]} />` → قائمة `divide-y` بروابط Serial-marked (`tone=active?'primary':'muted'`)، عدّاد `tabular-nums` اختياري يمينًا.
- **متى:** Settings layout 30/70، ApiKeys، Billing؛ Help TOC rail (بعدّادات حيّة).

### 2.14 `DossierDialogHeader` — رأس مودال ملف-قضية
- **الشكل:** kicker mono + case title + `MetaStrip` من القراءات؛ يستبدل `DialogTitle` العادي.
- **متى:** History preview, CaseDetail/Admin/أي detail modal.

### 2.15 `PathPair` — قراءة مسارين جنائية (تستبدل avatar chips)
- **الشكل:** `<PathPair a b />` → `path A → path B` بـ `font-mono text-xs`، المجلد مُعتَّم (`text-muted-foreground`)، الـ basename `text-foreground`، فاصل سهم `text-primary →`.
- **متى:** WorkspaceDetail cases، أي عرض زوج clone.

### 2.16 `Verdict` — رقاقة استنتاج مربّعة مُشتقّة من رقم
- **الشكل:** `<Verdict score bands? />` → LIKELY CLONE (≥80 red) / PROBABLE (≥50 amber) / WEAK (<50 primary)؛ نفس عتبات `ringColor/metricColor`.
- **متى:** CaseDetail confidence dial، أي score block.

### 2.17 ترقيات/توسعات صغيرة على المكوّنات القائمة
- **`Figure` `prefix?: string`** (default `'FIG'`): يجعل caption `${prefix}.${NN}` — يفكّ Home من إعادة بناء `<figure>` يدويًا (SPEC.01) والـ EX./PLATE. لاحقًا.
- **`Panel` `n?: number`** (أو `<ExhibitLabel n>`): يُصيّر `<Serial>NN</Serial>` تلقائيًا قبل العنوان — أقسام Settings المرقّمة كـ prop واحد.
- **ترقية `StatBand` → `SpecBand`** إلى الـ kit (حاليًا helper محلي في Admin مُعاد 6×): شبكة `gap-px` مؤطَّرة بلا ظل، أرقام mono — خيار مُوثَّق بين "readout row / spec band / big-number band".
- **`FormField`**: variant من `Field` يربط `htmlFor`/`id` للـ a11y — لنماذج 2FA/delete.
- **`Composer`** (اختياري): صف input+action بإطار Field (mono placeholder، radius مربّع، margin label) — Chat وأي إدخال نصّي.
- **`LedgerSkeleton` / `LedgerEmpty` / `LedgerFault`**: صفوف داخل إطار `Ledger` للحالات؛ skeleton = صفوف pulse، empty = `Serial 00` + note، fault = destructive Serial + retry.

---

## 3. خطة لكل صفحة (مرتّبة بالأثر — الأقل تميّزًا أولًا)

### 3.1 Chat — `pages/Chat.tsx` + `components/.../AnalysisChatPanel.tsx` (40)
الفجوة كلها في الـ panel: messenger UI كامل. الإطار (masthead + exhibit sheet) صحيح.

| Block | From → To | Effort |
|---|---|:---:|
| Consultation container (`AnalysisChatPanel` 139-140, mounted Chat 117) | `card-premium` shadow card → `<Panel label="RECORD OF EXAMINATION" actions={<StatusTag tone={grounded?'ok':'warn'}>…</StatusTag>} bodyClassName="flex h-[620px] flex-col p-0">`؛ flat border؛ سبقه بـ `MetaStrip` (`GROUNDING·TURNS·MODE`) | M |
| Widget header (141-153) | icon-circle+title+subtitle+pill → **حذف**؛ يُطوى في `Panel label/actions` | S |
| Message transcript (155-196) | avatar bubbles justified L/R → `<TranscriptTurn>` مُسطَّر: gutter Serial + speaker `t-label` (CLONE LENS/ANALYST) + timestamp؛ main `whitespace-pre-wrap t-body`؛ ردود الأداة `border-l-2 border-primary/40 pl-4`؛ **لا avatars/فقاعات** | L |
| Typing indicator (182-193) | فقاعة نقاط → صف transcript: `<Serial tone="primary">··</Serial>` + `EXAMINING RECORD…` + نقاط inline | S |
| Suggested-query chips (199-210) | `rounded-full` pills → فهرس مُسطَّر `t-label` header (SUGGESTED LINES OF INQUIRY) + `divide-y border-y` أزرار Serial-numbered mono | M |
| Query composer (211-228) | `rounded-xl` bubble → `<Field label="ENTER QUERY">` + input `rounded-md border-border bg-card font-mono` + زر `rounded-md h-11 w-11` | S |
| Grounding sheet (88-115) | يُبقى؛ اختياري لفّه بـ `<Panel label="GROUNDING RECORD">` أو `MetaStrip` (`PAIR: A ↔ B`) | S |

**أساسي:** `Transcript/TranscriptTurn`, `StatusTag`, `RuledList`, `Composer`.

### 3.2 Analysis — `pages/Analysis.tsx` (58)

| Block | From → To | Effort |
|---|---|:---:|
| Engine-capabilities grid (431-459) | شبكة green-check 2-col → `<Panel label>` يلفّ `<Ledger>` من `IndexRow`: Serial (`tone='primary'` عند انطباق الوحدة على اللغة، وإلا muted) + اسم mono + `StatusTag` (MODULE/ONLINE) يمينًا؛ hairline لا striped | M |
| Case-parameters FieldSheet (397-413) | Field وحيد (language) → نموذج spec حقيقي: أبقِ `Field(language)` + أضف `COMPARATOR` (`SRC.A ⇄ SRC.B`) + `METHOD` (`A: PASTE · B: FILE`) + `CASE` token | S |
| Live comparator readout (جديد، فوق 425-429) | لا شيء → `<MetaStrip>` (أو `Gauge` row): `SRC.A` lines·bytes / `SRC.B` / `READY n/2` / `LANG`؛ `tabular-nums` | M |
| ExhibitPanel dropzone (218-266) | مربّع متقطّع موسَّط بأيقونة 7x7 → `<Dropzone>` يساري: أيقونة 5x5 + `t-label` CLICK OR DROP؛ الحالة المختارة `FILE:` + اسم mono + حجم `formatBytes` + `StatusTag ok` | M |
| Status tokens (161-170) | `badge-success` + span يدوي → `<StatusTag tone>` موحّد (READY/EMPTY/DRAFT)؛ وصل `isReady/bothReady/readyCount` مباشرة | S |

**أساسي:** `Ledger/IndexRow`, `Dropzone`, `StatusTag`, `Gauge`.

### 3.3 Results — `pages/Results.tsx` (58) — flagship، تبويبا Quality+Graphs هما المعطّلان

| Block | From → To | Effort |
|---|---|:---:|
| Quality hero + 3-up stat column (950-987) | badge hero + 3 tiles → `<Panel label>` + فقرة `max-w-[64ch]` + `<MetaStrip>` (FINDINGS/AVG SCORE/HEALTHIER/SOURCES)؛ **احذف الـ tiles الثلاثة** | M |
| اثنان QualitySourceCard (989-998) | 2-up cards متطابقة → كل مصدر `<Panel>` برأس `<Serial>A/B</Serial>` + العنوان + tone badge + score readout؛ فكّر بالتكديس العمودي (A ثم B) | M |
| Floating shadow score tile (781-796) | `rounded-2xl shadow-[…] 4xl` → قراءة mono في رأس الـ Panel: `t-label` + `font-mono text-2xl tabular-nums {toneClass}` + `<Gauge value={score*10}/>`؛ **لا shadow/rounded-2xl** | M |
| 4-up KPI tiles داخل المصدر (800-823) | 4 tiles → `<MetaStrip>` واحد (FINDINGS/CRITICAL/WARN/SIGNALS)؛ اللون يُشفِّر الخطورة | S |
| Priority-findings icon-chip list (826-864) | cards بـ 40px icon chips → `<Ledger>`: header (`# / SEVERITY / FINDING / LOCATION`) + صفوف `grid grid-cols-[auto_auto_1fr_auto]`: Serial + `SeverityTag` + الرسالة + locator `L{line}:C{column}` tabular؛ **بلا icon chips/rounded-2xl** | L |
| Raw diagnostic details (881-901) | rounded-2xl/xl متداخلة → `border-t` section مسطّح: notes `divide-y` mono + الخام في `<pre className="code-surface">` | S |
| Graphs tab grid (1458-1467) | 2 AstGraphPanel بلا caption → `<Figure n={2}>` / `<Figure n={3}>` (استكمال FIG بعد SimilarityBars=FIG.01)؛ AstGraphPanel يُسقط إطاره الخاص | M |
| SimilarityBars (231-271, صقل) | Figure جيد → أضف `<Serial>` لكل إشارة + header row (SIGNAL/READING) + قيمة tabular يمينًا | M |
| Empty state (1132-1148) | card موسَّط بـ shadow → إشعار "NO EXHIBIT ON FILE" يساري: border (لا shadow) + kicker + amber rule + أزرار يسارًا | S |

**أساسي:** `Ledger/LedgerRow`, `Reading`, `Gauge`, `ExhibitHeader`, `SeverityTag`.

### 3.4 History — `pages/History.tsx` (58)

| Block | From → To | Effort |
|---|---|:---:|
| Filter strip (282-346) | شريط toolbar عائم فوق جدول منفصل + count سائب → رأس الـ Panel المُسطَّر: `flex flex-wrap gap-3 border-b bg-muted/40 px-5 py-3` + `t-label FILTER` gutter + search+selects+segmented toggle (docket واحد) | M |
| Artifact table (357-497) | card عاري بجدول thead غير متّسق (# vs باقي) + Serials كلها muted → `<Panel label="EXHIBIT LEDGER" bodyClassName="p-0">`؛ وحّد كل `<th>` بـ `ledgerHeadClass`؛ لوّن Serial بالإشارة (`severity==='high'||score>=80 ? 'primary':'muted'`) + نقطة severity في خلية الفهرس؛ footer tally `SHOWING {filtered}/{total}` | M |
| Preview dialog (515-565) | `DialogTitle` عادي + 2-up equal source cards + markdown box → `DossierDialogHeader` (kicker `EXHIBIT / CASE #{id}` + MetaStrip LANG/SCORE/SEVERITY/DATE)؛ استبدل التناظر بـ `<Figure n={1/2}>` لكل مصدر (60/40 أو مكدّس) + `<Figure n={3}>` للتحليل | M |
| Delete-confirm (500-513) | يُبقى؛ اختياري: id token كـ `<Serial>#{id}</Serial>` في الوصف | S |

**أساسي:** `Ledger` (+`ledgerHeadClass`, `LedgerFooter`), `Reading`, `ScoreMeter`, `DossierDialogHeader`.

### 3.5 Admin — `pages/Admin.tsx` (60)

| Block | From → To | Effort |
|---|---|:---:|
| Overview KPI bands (143-176) | 8-up + 3-up stat tiles → `<Panel label>` + `<MetaStrip>` للعدّات الناعمة؛ StatBand 2-up **فقط** للإشارتين (locked/failedLogins) بـ `text-warning` عند >0؛ signups كـ `MetaStrip` سطر داخل `<Field>` | M |
| Revenue plan tables (525-546) | `<table>` عادي بلا Serial/total → `<Ledger>`: Serial gutter + أعمدة رقمية `text-end tabular-nums` (monthly `font-semibold`) + `LedgerFooter` يجمع Σ | M |
| Revenue StatBands (550-570) | 2× 4-up tiles → `SpecBand` واحد للأرقام الرئيسية + `MetaStrip` للعدّات (pastDue/canceled `text-warning/destructive`) | S |
| Usage band+topApi (588-622) | 5-up فيه string 'period' + جدول عادي → اسحب `period` لـ `<Field>`؛ topApi → `<Ledger>` بـ Serial rank + calls/pairs `text-end tabular-nums`؛ overQuota `text-warning` | M |
| Security band+locked table (673-702) | 5-up + جدول محايد → `<Ledger>` بـ `<Serial tone='primary'>` + failedLoginCount عبر `<StatusTag>` (amber/red)؛ counts → MetaStrip | M |
| UserDetailModal drawer (184-363) | Group+DetailRow key/value مُبرَّرة → `<FieldSheet>` من `<Field>`؛ Payments/APIKeys/Security → `<Ledger>` Serial-indexed | L |
| Cross-cutting semantic color | status/quota/failedLogins نص محايد → `<StatusTag tone>` (green/amber/red) على Users status، usage cell، failed-logins | S |

**أساسي:** `Ledger` (+`Total`), `SpecBand` (promote), `StatusTag`, `Reading`, `Meter`.

### 3.6 WorkspaceDetail — `enterprise/WorkspaceDetail.tsx` (62)

| Block | From → To | Effort |
|---|---|:---:|
| Repositories tab (420-451) | قائمة مكدّسة → `<Ledger>`: Serial gutter + REPO + PROVIDER (`<Tag>`) + BRANCH (tabular) + REGION + Scan action + `LedgerHead` | M |
| Cases pair cell (528-540) | avatar-initial chips → `<PathPair a b/>` (مجلد مُعتَّم + basename + سهم `→`)؛ احذف initA/initB | M |
| Cases case-id + score (525-556) | `#C-{id}` عادي + meter ad-hoc → `<Serial>C-{id}</Serial>` gutter + `<ScoreMeter value/>` داخل `<Ledger>` | M |
| Members tab (609-634) | قائمة مكدّسة → `<Ledger>`: Serial + USER (mono) + ROLE (`<Tag>`) + LAST ACTIVE (tabular، em-dash) | S |
| Empty states ×3 (411,479,603) | مركزية icon+text+CTA → `<LedgerEmpty>`/`DossierNote` يسارية داخل Panel: أيقونة muted + `NO … ON FILE` + subnote + زر outline يسارًا | S |
| Chip maps (54-76, 558-631) | 3 خرائط class متوازية → `<Tag tone>` واحد؛ tone عند call-site | M |
| Loading/error (388-396) | spinner/banner موسَّط → سطر status mono يساري (`LOADING EXHIBITS…` / `RETRIEVAL ERROR`) داخل شريط hairline | S |

**أساسي:** `Ledger`, `ScoreMeter`, `Tag`, `PathPair`, `DossierNote/LedgerEmpty`.

### 3.7 Workspaces — `enterprise/Workspaces.tsx` (64)

| Block | From → To | Effort |
|---|---|:---:|
| Register container (217-226) | `<section>` غير معنون → `<Panel>`/`<Ledger>` بـ `label` + amber rule + `actions=MetaStrip {RECORDS: n}`؛ `bodyClassName='p-0'`؛ أبقِ الـ column legend | S |
| Threshold cell (253-257) | `%` مسطّح → `<Reading value={pct}/>` + `<Meter>` قصير مُلوَّن بسُلّم التشابه؛ أبقِ prefix `t-label` للموبايل | M |
| Loading (194-197) | spinner box → `<LedgerSkeleton rows={5}>`: نفس الإطار + صفوف pulse | M |
| Empty (203-215) | dashed folder card → صف واحد `<Serial tone='muted'>00</Serial>` + `NO WORKSPACES ON FILE` + زر Create trailing | M |
| Error (198-202) | box موسَّط → صف `<Serial tone='primary' text-destructive>!!</Serial>` + `FAULT` + retry | S |
| Ledger footer (بعد 289) | لا شيء → صف `border-t bg-muted/20` بـ MetaStrip (RECORDS/REGIONS/MEDIAN THRESHOLD) | M |
| Role chip (30-36, 266-277) | `ROLE_BADGE` inline → `<Tag tone={roleTone(role)}>` | S |

**أساسي:** `Ledger` (+`Skeleton/Empty/Fault`), `Reading/Meter`, `Tag`.

### 3.8 ReviewCases — `enterprise/ReviewCases.tsx` (64)

| Block | From → To | Effort |
|---|---|:---:|
| Status filter (166-175) | `<Select>` يخفي 7 حالات → `<Register>`: chips من `ALL_STATUSES` بنقطة لون + label mono + count `tabular-nums` حيّ (`useMemo`)، كأول شريط في الـ section | M |
| Filter toolbar (147-187) | dropdowns+search عارية → بعد رفع status: شريط ثانٍ بـ gutter labels `SCOPE`/`FIND` (MetaStrip voice) | S |
| Active-query readout (جديد) | ضمني → `<MetaStrip>` (SCOPE/STATUS/MATCH/RESULTS `{filtered}/{total}`) بين console والجدول | S |
| Fallback states (190-204) | موسَّطة → stamps يسارية mono: loading (`SYNC · loading`), error (`ERR` stamp), empty (`NIL` + `NO EXHIBITS ON FILE`) | S |
| Score column (271-286) | Score TH/cell يسارية → right-align (bar+percent لنهاية الصف) لعمود tabular حقيقي | S |

**أساسي:** `Register`, `ScoreMeter`, `Ledger` (+`LedgerFooter`), `Stamp`.

### 3.9 Analytics — `pages/Analytics.tsx` (66)

| Block | From → To | Effort |
|---|---|:---:|
| Stat-tile KPI grid (155-169) | 4 tiles display-serif → `<Panel label bodyClassName="p-0">` + `<Field>` rows بـ Serial gutter + `ReadoutRow` (label + `font-mono text-2xl/3xl tabular-nums` + descriptor)؛ الأرقام لصوت mono | M |
| Distribution figures (204-288) | `xl:grid-cols-2` متساوٍ + dot legend → `xl:grid-cols-5` (60/40: FIG.02 col-span-3, FIG.03 col-span-2)؛ legend → `divide-y` صفوف Serial + swatch 2px + count tabular + proportion bar | M |
| Top-analyses table (323-378) | `<table>` ad-hoc → `<Ledger>`: header `border-b-2` + `t-label` th + Serial (primary لصف 0) + similarity كـ `<Gauge>`+نسبة؛ Panel `actions=MetaStrip` (MAX/ROWS) | L |

**أساسي:** `Ledger`, `Reading/ReadoutRow`, `Gauge`.

### 3.10 Settings — `pages/Settings.tsx` (68)

| Block | From → To | Effort |
|---|---|:---:|
| Page shell (117, 145-371) | `max-w-3xl space-y-6` عمود مركزي → `max-w-5xl` + `grid gap-x-10 lg:grid-cols-[minmax(0,14rem)_1fr]`؛ يسار `<CaseContents>` لاصق (§01–§04) + MetaStrip عمودي؛ يمين الـ Panels | L |
| Section headers (147,183,301,336) | labels عادية → `Panel n` أو `<Serial>NN</Serial>` prefix (Danger=`tone='primary'` 04) | S |
| 2FA enrolling (224-257) | نموذج مكدّس موسَّط + QR في box أبيض → `<FieldSheet>` بـ `Field` rows: PROVISIONING QR (يساري) / SECRET KEY / VERIFY CODE؛ actions أسفل | M |
| 2FA disabling (282-297) | inputs مكدّسة → `<FieldSheet>` بـ `Field(password)` + `Field(authCode)` mono | S |
| Access & data rows (301-331) | blurb + زر يمين → `Field` + سطر `Reading` mono (SESSIONS/KEYS/DATA) + intro + زر يمينًا + Serial gutter | M |

**أساسي:** `CaseContents`, `Reading`, `ExhibitLabel/Panel n`, `FormField`.

### 3.11 Home — `pages/Home.tsx` (70)

| Block | From → To | Effort |
|---|---|:---:|
| Specimen exhibit (100-163) | `<figure>` يدوي مُكرَّر + Exhibit A tinted card + meta نصّي → `<Figure prefix="SPEC" n={1}>`؛ Exhibit A metadata → `<MetaStrip>` (SIZE/LINES/LANG)؛ demote للـ tinted card إلى `rounded-sm border-l-2 border-l-success bg-transparent`؛ 'vs' كعمود hairline `w-px bg-border`؛ أبقِ split 1fr_auto_1fr (تناظر مشروع) | M |
| Capability ledger (166-182) | rows بأيقونات زخرفية → `<IndexRow>`: gutter Serial + أيقونة كـ index glyph؛ col2 title+desc؛ col3 cross-ref mono (`TOKEN·AST`/`METRICS`… من `home.features[i].ref`) | M |
| Footer CTA (184-196) | heading+body+button → docket kicker (`h-px w-6 bg-primary` + `OPEN NEW CASE`) + `<MetaStrip>` (INPUTS/BUNDLES) | S |

**أساسي:** `Figure prefix`, `IndexRow`, `MetaStrip`.

### 3.12 Billing — `pages/Billing.tsx` (70)

| Block | From → To | Effort |
|---|---|:---:|
| Usage meter (202-243) | big number + progress bar مسطّح → `<Figure n={1}>` يلفّ `<Gauge>` مُقطَّع بـ ticks (~24)، `role=progressbar`، over-state `bg-destructive` | M |
| Account-statement FieldSheet (193-259) | 3 Fields تُكرِّر Masthead → `grid lg:grid-cols-[3fr_2fr]`: يسار Gauge (FIG.01)، يمين `FieldSheet` بقراءات جديدة (SUBSCRIPTION/RESETS/ANALYSES LEFT)؛ احذف PERIOD (مُكرَّر) | M |
| Warning banner (261-266) | alert card مُلوَّن → `<Notice tone="warning" label="SYSTEM NOTICE">` | S |
| Plans table (268-358) | جدول شبه-ledger → محاذاة اتفاقية History: thead `bg-muted` + `ledgerHeadClass`؛ Serial + current row `border-s-2 border-primary`؛ عمود مُشتق `PER ANALYSIS`؛ اختياري Panel كـ FIG.02 | M |

**أساسي:** `Gauge`, `Notice`, `Ledger`, `PriceReading`.

### 3.13 CaseDetail (enterprise) — `enterprise/CaseDetail.tsx` (70)

| Block | From → To | Effort |
|---|---|:---:|
| Exhibits 2-up grid (357-408) | Panelان متطابقان stacked-Field → `<CompareSheet>`/`<CompareField>` واحد: رؤوس Serial A/B مثبّتة + صف واحد لكل خاصية (Path/Symbol/Lines/Language/Tokens/Hash) بعمودين + `diff` emphasis عند الاختلاف | M |
| Metric bars (334-353) | `rounded-full bg-primary` ثابت → `<Meter value tone={metricColor}>` مربّع + ticks عند 60/80؛ الـ fill يُشفِّر المقدار | S |
| Confidence figure (264-355) | ring + ledger فضفاض → أبقِ split؛ أضف `<Verdict>` تحت الـ ring + لفّ الصفوف في `<FieldSheet>` + caption `SCALE 0–100` | S |
| Evidence index (410-427) | flex list → `<Ledger>`: caption row (`# · TYPE · EXHIBIT`) + صفوف grid محاذاة | S |
| Update/Feedback dialogs (467-536) | label-over-input `space-y-4` → `<FieldSheet>` + `<Field label>` لكل control؛ حافظ `htmlFor`/`id` | M |

**أساسي:** `CompareField/CompareSheet`, `Meter`, `Verdict`, `Ledger`.

### 3.14 Help — `pages/Help.tsx` (80) — الأقرب للتمام؛ صقل فقط

| Block | From → To | Effort |
|---|---|:---:|
| §02 Quick links (166-185) | list مُزخرف → `<Ledger>`: head (`IDX/DESTINATION/TARGET`) + صفوف Serial + label + route يمينًا (`font-mono tabular-nums`)؛ أسقط أيقونة lucide | M |
| §01 Support channels (130-160) | blurb + أيقونة + زر → أزل الأيقونة؛ أضف `<MetaStrip>` (TYPE/ENDPOINT/RESPONSE) + `<Tag>` نوع القناة | M |
| §03 FAQ (187-208) | Q/A نثري → أبقِ التوسّع (لا accordion)؛ أضف `<Tag>` topic (SECURITY/API/ANALYSIS) في الـ gutter + cross-ref `SEE §NN` | M |
| SectionHead محلي (21-28) | مُكرَّر → ترقية لـ `<SectionRule>` مشترك | S |
| TOC rail (95-114) | list عادي → عدّاد per-section `font-mono tabular-nums` يمينًا (فهرس حيّ) | S |

**أساسي:** `SectionRule`, `Ledger/LedgerRow`, `Reading`, `Tag`.

---

## 4. موجات التنفيذ (Execution Waves)

### Wave A — المكوّنات المشتركة (تسبق كل عمل صفحة)
تُبنى في `Dossier.tsx` بترتيب الرافعة:
1. **`Ledger` family** (+`ledgerHeadClass`, `LedgerHead/Row/Cell/Footer`, `LedgerSkeleton/Empty/Fault`) — يفكّ 12+ جدولًا.
2. **`Meter`/`Gauge`/`ScoreMeter`** + **`Reading`** — يوحّدان سُلّم التشابه المُكرَّر.
3. **`StatusTag`/`Stamp`** + **`Tag`** — اللون الدلالي.
4. **`SpecBand`** (ترقية StatBand) + توسعات `Figure prefix` و`Panel n`/`ExhibitLabel` و`FormField`.
5. مكوّنات مُتخصّصة: **`Register`**, **`CompareField/CompareSheet`**, **`Transcript/TranscriptTurn`**, **`Dropzone`**, **`Notice`**, **`CaseContents`**, **`DossierDialogHeader`**, **`PathPair`**, **`Verdict`**, **`IndexRow`**, **`SectionRule`**, **`Composer`**.

> اختبار Wave A: صفحة موجودة تستهلك `Ledger`+`Meter`+`Tag` بلا انحدار بصري قبل الانتشار.

### Wave B — أجسام الصفحات الأعلى أثرًا (الأقل تميّزًا)
بالتوازي بعد Wave A، بالترتيب:
1. **Chat** (40) — `Transcript` + `Panel` + `RuledList` + `Composer`.
2. **Analysis** (58) — `IndexLedger` + `Dropzone` + comparator `MetaStrip`.
3. **Results** (58، flagship) — تبويبا Quality/Graphs: `MetaStrip`-over-tiles، `Ledger` findings، `Figure` FIG.02/03.
4. **History** (58) — docket موحّد (filter+table+footer) + `DossierDialogHeader`.
5. **Admin** (60) — 4 جداول → `Ledger`، drawer → `FieldSheet`، `StatusTag` دلالي.

### Wave C — الباقي (صقل + توحيد enterprise)
1. **WorkspaceDetail** (62) — 3 قوائم → `Ledger`, `PathPair`, `Tag`.
2. **Workspaces** (64) — `Ledger`+`Skeleton/Empty/Fault`+footer.
3. **ReviewCases** (64) — `Register` + stamps.
4. **Analytics** (66) — `ReadoutRow` + asymmetric split + `Ledger`.
5. **Settings** (68) — layout 30/70 + `CaseContents` + 2FA `FieldSheet`.
6. **Home** (70) — `Figure prefix` + `IndexRow` + footer docket.
7. **Billing** (70) — `Gauge` quota + `Notice` + plans ledger.
8. **CaseDetail** (70) — `CompareSheet` + `Meter` + `Verdict`.
9. **Help** (80) — `SectionRule` + `Ledger` §02 + `Tag` FAQ.

> ملاحظة عبر-الموجات: بمجرد جهوز `Ledger` و`Tag` و`StatusTag`، تُحذف كل الـ hand-rolled tables وخرائط الـ badge المحلية (`STATUS_META/SEV_META/ROLE_CLS/ROLE_BADGE`) وأي `scoreColor` مُكرَّر — هذا الحذف هو أكبر مصدر مكاسب اتساق عبر التطبيق. حافظ في كل نقل على: مفاتيح `t()`، منطق `isRTL`/`dir`، `aria-*`/`scope`، وسلوك المعالجات دون تغيير — البنية (DOM) تُعاد تجميعها فقط.