# المنهج وبنك الأسئلة — اللي اتعلمناه من الكتاب

## ملاحظات من الكتاب اللي اتبعت

الملف: **Science – Pri 4 — Chapter One: Nature in Our Surroundings** (38 صفحة، كتاب المعاصر — نسخة هدية).

1. **المنهج بالإنجليزي (مدارس لغات).** الامتحان بالإنجليزي، فالأسئلة في المساعد بالإنجليزي بنفس صياغة الامتحان. الشرح ورسايل ولي الأمر بالعربي. وكل درس محفوظ معاه **القاموس** اللي في أسفل الصفحات (إنجليزي ← عربي) عشان نساعد الطفل في الكلمات.
2. **Chapter 1 فيه 5 دروس:**

| # | الدرس | الصفحات | أسبوع المدرسة |
|---|---|---|---|
| 1 | Let's Find Living Organisms | 2–6 | 1 |
| 2 | How to Observe | 7–11 | 1 (بعده Weekly Assessment 1) |
| 3 | Colors and Shapes of Living Organisms | 12–14 | 2 |
| 4 | Different Places, Different Living Organisms | 15–21 | 2 (بعده Weekly Assessment 2) |
| 5 | Desert Living Organisms | 22–26 | 3 (بعده Weekly Assessment 3 + Test 1) |

   وبعدهم: Chapter Summary (ص 27–29) و General Exercises (ص 30–37).
3. **كتاب المدرسة فيه نوعين أسئلة**: Try و Exercise، وفيه كمان أسئلة من "Performances and Assessments Book". ده بيأكد إن فيه تقييم أسبوعي رسمي — وده متطابق مع فكرة اختبار آخر الأسبوع.
4. **أشكال الأسئلة** اللي بتتكرر (وعلى أساسها اتبنى بنك الأسئلة):

| الشكل في الكتاب | في المساعد | التصحيح |
|---|---|---|
| Choose the correct answer | `choose` | آلي |
| Choose all correct answers | `choose_all` | آلي (درجات جزئية) |
| Put (✓) or (✗) | `true_false` | آلي |
| Complete | `complete` (مع بنك كلمات) | آلي |
| Write the scientific term / What is meant by | `scientific_term` | آلي |
| Give reasons (G.R) | `give_reason` — متحول لاختيار من متعدد دلوقتي | آلي (والإجابة المكتوبة لاحقًا بالذكاء الاصطناعي) |
| What happens if...? | `what_happens` — نفس الفكرة | آلي |
| Cross out the odd word | `odd_one_out` | آلي |
| Choose from column (B) | `match` | آلي (درجات جزئية) |
| Classify | `classify` | آلي (درجات جزئية) |
| Arrange the steps | `order` | آلي |
| Compare / Record card / أسئلة الصور | — | مرحلة لاحقة (صور + تصحيح بالذكاء الاصطناعي) |

## بنك أسئلة Chapter 1

`src/content/science-g4-term1/questions-ch1.ts` — **132 سؤال** مكتوبين من معلومات الكتاب، كل سؤال مربوط بـ: الدرس، ناتج التعلم، الصعوبة (1–5)، شكل السؤال، ورقم الصفحة في الكتاب.

| الدرس | صعوبة 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| ch1-l1 | 8 | 9 | 7 | 3 | 1 |
| ch1-l2 | 5 | 10 | 6 | 4 | 1 |
| ch1-l3 | 5 | 6 | 5 | 4 | 1 |
| ch1-l4 | 6 | 7 | 7 | 9 | 2 |
| ch1-l5 | 7 | 8 | 6 | 4 | 1 |

**ملاحظة مهمة من المحاكاة:** أسئلة الصعوبة 5 قليلة، فالطالب المتفوق جدًا بيقف تقييمه عند "جيد جدًا" في Chapter 1 لأن مفيش أسئلة صعبة كفاية تثبت إنه متفوق. محتاجين **5–8 أسئلة صعوبة 4–5 زيادة في كل درس** (أسئلة صور، مقارنة، مواقف جديدة).

### إزاي نكتب سؤال جديد

```ts
const l1 = questionWriter("ch1-l1");

l1.mcq("o3", 2, "Give a reason: Some living organisms prefer to live under stones.",
  "Because they are damp places with water and cool places away from the sun",
  ["Because they are hot and dry places", "Because they get a lot of sunlight there", "Because they can find big trees there"],
  { page: 3, style: "give_reason" });

l1.fill("o2", 1, "The place where a living organism lives is called a ____.", [["habitat"]],
  ["habitat", "record card", "magnifying glass", "classification"], { page: 3, style: "scientific_term" });
```

**قواعد:**
- **الصعوبة**: 1 = تذكر مباشر من الكتاب، 2 = تذكر بصياغة مختلفة، 3 = فهم (علل، اختار كل الصح)، 4 = تطبيق (ماذا يحدث لو، الكلمة الشاذة)، 5 = موقف جديد مش في الكتاب.
- **المشتتات**: اكتب 4–6 بدل 3 — المساعد بيختار 3 عشوائي كل مرة، فالسؤال نفسه بيبان مختلف.
- **الصياغات**: ممكن تدي أكتر من صياغة لنفس السؤال (`["...", "..."]`).
- **الحد الأدنى لكل درس**: 8 أسئلة صعوبة 1–2، و8 صعوبة 2–4، و6 صعوبة 4–5. الاختبارات الآلية (`tests/content.test.ts`) بتتأكد من ده.
- **حقوق النشر**: الأسئلة متكتبة بصياغتنا من معلومات المنهج. لو المشروع هيبقى تجاري، ماينفعش ننقل أسئلة كتب خارجية (زي المعاصر) حرفيًا — الأحسن نعتمد على كتاب الوزارة وكتاب التقييمات الرسمي ونكتب بصياغتنا.

## إضافة باقي المنهج

لما توصل باقي الفصول:
1. في `src/content/science-g4-term1/curriculum.ts`: نستبدل Chapter 2 و 3 (متعلّم عليهم `outline` دلوقتي) بالدروس الحقيقية: العنوان، نواتج التعلم، أهم المعلومات، القاموس، الصفحات، و`schoolWeek` لو عارفينه من كتاب التقييمات.
2. نعمل ملف `questions-ch2.ts` بنفس الشكل ونضيفه في `index.ts`.
3. `npm test` بيتأكد إن كل حاجة سليمة، و `npm run simulate` بيوري الخطة الجديدة.

> مش متأكدين لسه الترم الأول فيه كام فصل: مصدر بيقول 3 فصول (الطبيعة من حولنا، كيف تنمو الحشرات، كيف تنمو النباتات)، ومصدر تاني بيقول إن الضوء والصوت والرياح والمطاط كمان في الترم الأول. الكتاب كامل هيحسم ده.
