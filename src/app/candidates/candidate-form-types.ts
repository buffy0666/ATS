import type { ParsedResume } from "@/lib/resume-parser";

export type CandidateFieldValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  locationCity: string;
  locationState: string;
  locationCountry: string;
  currentTitle: string;
  currentCompany: string;
  yearsExperience: string;
};

export const emptyCandidateFieldValues: CandidateFieldValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  locationCity: "",
  locationState: "",
  locationCountry: "",
  currentTitle: "",
  currentCompany: "",
  yearsExperience: "",
};

export type CandidateResumeParseResult = {
  status: "idle" | "success" | "error";
  message: string;
  fields: CandidateFieldValues;
  parsed?: ParsedResume;
  parserVersion?: string;
};
