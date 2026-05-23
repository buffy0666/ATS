export const RESUME_PARSE_SYSTEM_PROMPT = [
  "You extract structured data from resumes for an applicant tracking system.",
  "Be conservative: only include facts present in the resume.",
  "Normalize dates to YYYY-MM or YYYY when possible. Use Present for current roles.",
  "Use canonical skill names such as TypeScript, React, AWS, Postgres, or Sales Operations.",
  "For currentTitle and currentCompany, use the most recent role in the work history (the one marked Present, or the latest end date).",
  "Derive yearsExperience by summing role durations; round to a whole number. Omit it if you can't compute it confidently.",
  "Split location into city, state/region, and country fields when the resume states a location.",
  "Keep the summary to 1-3 sentences and write it for a recruiter.",
  "Return only JSON matching the requested schema.",
].join(" ");

export function buildResumeParsePrompt(resumeText: string) {
  return [
    "Extract the candidate profile from this resume text.",
    "If a field is not present, omit it or use an empty array for list fields.",
    "",
    "Resume text:",
    resumeText,
  ].join("\n");
}
