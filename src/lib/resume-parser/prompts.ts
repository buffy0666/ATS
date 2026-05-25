export const RESUME_PARSE_SYSTEM_PROMPT = [
  "You extract structured data from resumes and LinkedIn profile pages for an applicant tracking system.",
  "Be conservative: only include facts present in the source text.",
  "Normalize dates to YYYY-MM or YYYY when possible. Use Present for current roles.",
  "Use canonical skill names such as TypeScript, React, AWS, Postgres, or Sales Operations.",
  "For currentTitle and currentCompany, use the most recent role in the work history (the one marked Present, or the latest end date).",
  "Derive yearsExperience by summing role durations; round to a whole number. Omit it if you can't compute it confidently.",
  "Split location into city, state/region, and country fields when the source states a location.",
  "Keep the summary to 1-3 sentences and write it for a recruiter.",
  // LinkedIn-specific guidance — only kicks in when the source text looks
  // like a profile page (Activity section, post/comment markers). Resume
  // PDFs won't have those signals, so the model leaves recentActivity
  // empty for them.
  "If the source is a LinkedIn profile page (look for an Activity, Posts, or Recent activity section), populate recentActivity with up to 10 of the most recent posts, comments, reposts, or articles.",
  "For each activity item: mark its kind (post/comment/reaction/repost/article), include a short verbatim snippet of the text (under ~250 chars — capture the gist, not the full thread), tag it with 1-3 short lowercase-hyphenated topic categories (e.g. technology, leadership, hiring, industry-news, product-launch, fundraising, career-advice, personal), and include a relative time string when shown (e.g. '3d', '2 weeks ago').",
  "Do not include ads, sponsored posts, or LinkedIn UI chrome like 'See more' in activity items.",
  "Return only JSON matching the requested schema.",
].join(" ");

export function buildResumeParsePrompt(resumeText: string) {
  return [
    "Extract the candidate profile from this text. It may be a traditional resume PDF or a LinkedIn profile page scrape.",
    "If a field is not present, omit it or use an empty array for list fields.",
    "",
    "Source text:",
    resumeText,
  ].join("\n");
}
