// Promotional posts for Jobs24India itself.
//
// Unlike the blog cards, nothing here is extracted from anything — this is the
// product talking about itself, so every line is a claim we are making and has
// to be one we can stand behind.
//
// What is deliberately absent:
//
// - No counts. "500+ jobs", "10,000 candidates" and the like would have to be
//   either hardcoded and quietly wrong within a week, or read live from the
//   database, which this repo has no access to by design. Numbers that drift
//   are worse than no numbers in a category built on not overstating things.
// - No "verified companies" claim. Most live listings are aggregated, and the
//   site itself withholds the verified badge from them; a promo card must not
//   claim on the account what the product refuses to claim on the page.
// - No people. No AI-generated faces presented as real employers or hires, and
//   no testimonials that nobody gave.
// - "Free to post", never "free forever". Posting is free today. Whether it
//   stays free is a pricing decision that has not been made, and an advert is
//   not the place to make it by implication.
//
// Audiences never mix: employers read English, seekers read Hindi. A promo is
// one card, and the rotation cycles rather than exhausts — an advert is meant
// to be seen more than once, which is the opposite of a blog card.

module.exports = [
  // ── Employers (English) ──────────────────────────────────────────────────
  {
    id: "emp-post-free",
    audience: "employer",
    lang: "en",
    eyebrow: "For employers",
    headline: "Hiring for your shop, factory or office?",
    points: [
      "Post a job free",
      "Reach job seekers in Delhi NCR",
      "No commission on any hire",
    ],
    cta: "Post a job — it is free",
  },
  {
    id: "emp-blue-collar",
    audience: "employer",
    lang: "en",
    eyebrow: "For employers",
    headline: "Drivers, guards, cooks, helpers — hire locally.",
    points: [
      "Candidates who live near your workplace",
      "Call or WhatsApp applicants directly",
      "No agency in the middle",
    ],
    cta: "Post a job — it is free",
  },
  {
    id: "emp-why-us",
    audience: "employer",
    lang: "en",
    eyebrow: "For employers",
    headline: "Your job advert, written once and seen in Hindi.",
    points: [
      "Workers read listings in their own language",
      "Applicants apply from a phone, free",
      "You keep every application",
    ],
    cta: "Post a job — it is free",
  },

  // ── Seekers (Hindi) ──────────────────────────────────────────────────────
  {
    id: "seek-free",
    audience: "seeker",
    lang: "hi",
    eyebrow: "नौकरी खोजें",
    headline: "नौकरी ढूंढने के पैसे नहीं लगते।",
    points: [
      "अकाउंट बनाना मुफ्त",
      "नौकरी खोजना और अप्लाई करना मुफ्त",
      "कोई रजिस्ट्रेशन फीस नहीं",
    ],
    cta: "लिंक बायो में — अभी देखें",
  },
  {
    id: "seek-no-fee-warning",
    audience: "seeker",
    lang: "hi",
    eyebrow: "सावधान",
    headline: "नौकरी के बदले पैसे मांगे? वो नौकरी नहीं है।",
    points: [
      "असली कंपनी सिक्योरिटी डिपॉज़िट नहीं लेती",
      "रजिस्ट्रेशन फीस माँगना ठगी की पहली निशानी है",
      "पैसे देने से पहले कंपनी का पता जांचें",
    ],
    cta: "लिंक बायो में — अभी देखें",
  },
  {
    id: "seek-hindi-listings",
    audience: "seeker",
    lang: "hi",
    eyebrow: "नौकरी खोजें",
    headline: "नौकरी की पूरी जानकारी, हिंदी में।",
    points: [
      "सैलरी, शिफ्ट और जगह — सब साफ लिखा हुआ",
      "फोन से ही अप्लाई करें",
      "दिल्ली NCR और बाकी शहरों में नौकरियां",
    ],
    cta: "लिंक बायो में — अभी देखें",
  },
];
