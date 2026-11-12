// IST date helpers — Instagram cron times are scheduled in UTC by GitHub Actions
// but every "day" the bot reasons about is the IST calendar day.
//
// IST = UTC + 5:30 (no DST), so we shift then take the date.

function nowIst(at = new Date()) {
  return new Date(at.getTime() + (5 * 60 + 30) * 60 * 1000);
}

function istDateString(at = new Date()) {
  return nowIst(at).toISOString().slice(0, 10); // YYYY-MM-DD
}

function istYesterdayString(at = new Date()) {
  const t = nowIst(at);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

function istHumanLong(dateStr) {
  // dateStr is "YYYY-MM-DD"; render "Wednesday, 4 June 2026"
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

module.exports = { nowIst, istDateString, istYesterdayString, istHumanLong };
