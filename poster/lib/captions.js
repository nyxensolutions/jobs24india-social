// Hindi captions.
//
// Seeker content is Hindi only. A Hindi card with an English caption sends a
// mixed signal to exactly the audience the account exists for, and the caption
// is where the link lives, so it is the part that has to be readable.
//
// The caption is assembled from the post's own Hindi title and URL. Nothing
// here paraphrases the article: the only sentences written by hand are the two
// fixed lines below, which make no factual claim.

/** Evergreen tags. Deliberately small and stable rather than a churn of trends. */
const BASE_TAGS = [
  "#नौकरी", "#जॉब", "#Jobs24India", "#सरकारीनौकरी_नहीं", "#प्राइवेटजॉब",
  "#दिल्लीNCR", "#फ्रेशरजॉब", "#JobSearchIndia",
];

/** Category-specific tags, keyed on the blog category label the API returns. */
const TAGS_BY_TAG = {
  "Delivery Jobs": ["#डिलीवरीजॉब", "#DeliveryJobs", "#Zomato", "#Swiggy", "#Blinkit"],
  "Driver Jobs": ["#ड्राइवरजॉब", "#DriverJobs", "#कैबड्राइवर"],
  "Security Guard Jobs": ["#सिक्योरिटीगार्ड", "#SecurityJobs", "#गार्डजॉब"],
  "Warehouse & Logistics": ["#वेयरहाउसजॉब", "#WarehouseJobs", "#लोडरजॉब"],
  "Telecaller & BPO": ["#टेलीकॉलर", "#BPOJobs", "#कॉलसेंटर"],
  "Data Entry & Back Office": ["#डेटाएंट्री", "#DataEntryJobs"],
  "Job Safety & Scams": ["#जॉबस्कैम", "#ठगीसेबचें", "#JobFraud", "#सावधान"],
  "Salary Guides": ["#सैलरी", "#वेतन", "#PF", "#SalaryGuide"],
  "Interview Tips": ["#इंटरव्यू", "#InterviewTips", "#नौकरीकीतैयारी"],
  "Resume & Profile": ["#रिज्यूमे", "#Resume", "#बायोडाटा"],
};

/**
 * Five hashtags, category first.
 *
 * Instagram's actual cap is 30; five is their own published recommendation and
 * what Instagram has said performs best. Category tags come before the generic
 * ones because the first few are the ones that do any work — a post about
 * security guard pay is better served by #सिक्योरिटीगार्ड than by #नौकरी, which
 * it shares with half the country.
 */
const TAG_LIMIT = 5;

function tagsFor(tag) {
  return [...(TAGS_BY_TAG[tag] || []), ...BASE_TAGS].slice(0, TAG_LIMIT);
}

/**
 * Instagram counts every hashtag against the 2,200-character caption limit and
 * shows only the first two lines before "more", so the hook has to survive
 * truncation on its own.
 */
function instagram({ title, url, tag }) {
  return [
    title,
    "",
    "पूरी जानकारी वेबसाइट पर पढ़ें — लिंक बायो में।",
    "जॉब्स24इंडिया पर नौकरी खोजना और अप्लाई करना पूरी तरह मुफ्त है।",
    "",
    tagsFor(tag).join(" "),
  ].join("\n");
}

/**
 * Facebook shows a link preview and does not hide the caption behind a "more",
 * so the URL goes in the text here where on Instagram it would be dead weight.
 * Fewer hashtags: they read as spam on a Page and do little for reach.
 */
function facebook({ title, url, tag }) {
  // Fewer still on a Page, where hashtags read as spam and do little for reach.
  const tags = (TAGS_BY_TAG[tag] || []).slice(0, 3);
  return [
    title,
    "",
    "पूरी जानकारी यहां पढ़ें:",
    url,
    "",
    "जॉब्स24इंडिया पर नौकरी खोजना और अप्लाई करना पूरी तरह मुफ्त है।",
    "",
    [...tags, "#Jobs24India", "#नौकरी"].join(" "),
  ].join("\n");
}

module.exports = { instagram, facebook };
