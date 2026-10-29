/** BISE grading used across Pakistan (pass mark 33%), with a colour tone for each grade. */
export function bise(percentage) {
  const p = Number(percentage);
  const grade = p >= 80 ? "A+" : p >= 70 ? "A" : p >= 60 ? "B" : p >= 50 ? "C" : p >= 40 ? "D" : p >= 33 ? "E" : "F";
  const tone = p >= 70 ? "good" : p >= 50 ? "ok" : p >= 33 ? "mid" : "low";
  return { grade, tone };
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th" … */
export function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}
