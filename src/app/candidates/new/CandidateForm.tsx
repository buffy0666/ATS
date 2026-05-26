"use client";

import { useRef, useState } from "react";
import { createCandidate, parseCandidateResume } from "../actions";
import {
  emptyCandidateFieldValues,
  type CandidateFieldValues,
  type CandidateResumeParseResult,
} from "../candidate-form-types";
import {
  CandidateStatus,
  EmploymentType,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";
import { CustomFieldsForm } from "@/components/custom-fields/CustomFieldsForm";
import { TagInput } from "@/components/TagInput";
import { type CustomFieldRow } from "@/lib/custom-fields-shared";
import type { EducationItem, ParsedResume, WorkHistoryItem } from "@/lib/resume-parser/schema";

type UserOption = { id: string; name: string | null; email: string };
type ContactOption = { id: string; firstName: string; lastName: string; clientName: string };
type TagOption = { id: string; name: string; color: string };
type ChoiceOption = { id: string; name: string };

const initialCandidateResumeParseResult: CandidateResumeParseResult = {
  status: "idle",
  message: "",
  fields: emptyCandidateFieldValues,
};

const WORK_AUTH_LABEL: Record<WorkAuth, string> = {
  US_CITIZEN: "U.S. citizen",
  GREEN_CARD: "Green card / permanent resident",
  H1B: "H-1B",
  H1B_TRANSFER: "H-1B transfer",
  OPT: "OPT",
  STEM_OPT: "STEM OPT",
  CPT: "CPT",
  TN: "TN",
  L1: "L-1",
  L2: "L-2",
  E3: "E-3",
  O1: "O-1",
  OTHER_VISA: "Other visa",
  NEEDS_SPONSORSHIP: "Needs sponsorship",
  NOT_AUTHORIZED: "Not authorized to work",
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  CONTRACT_TO_HIRE: "Contract-to-hire",
  TEMPORARY: "Temporary",
  INTERNSHIP: "Internship",
  FREELANCE: "Freelance",
};

const REMOTE_PREF_LABEL: Record<RemotePref, string> = {
  ONSITE: "Onsite",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
};

const STATUS_LABEL: Record<CandidateStatus, string> = {
  ACTIVE: "Active",
  PASSIVE: "Passive",
  PLACED: "Placed",
  ON_HOLD: "On hold",
  DO_NOT_CONTACT: "Do not contact",
  ALUMNI: "Alumni",
  BLACKLISTED: "Blacklisted",
};

export function CandidateForm({
  users,
  contacts,
  allTags,
  currentUserId,
  sourceOptions,
  seniorityOptions,
  customFields,
  prefill,
}: {
  users: UserOption[];
  contacts: ContactOption[];
  allTags: TagOption[];
  currentUserId: string;
  sourceOptions: ChoiceOption[];
  seniorityOptions: ChoiceOption[];
  customFields: CustomFieldRow[];
  // Optional initial values, populated from URL search params. Used by
  // the Chrome extension's "Create candidate" toast which lands here
  // with ?email=foo@bar.com&name=Foo+Bar when the captured email's
  // sender isn't yet in the ATS. firstName/lastName are split on the
  // first space in the page (a Name header can be "Sarah Lee" or
  // "Sarah", or even "Lee, Sarah" — best effort).
  prefill?: { email?: string; firstName?: string; lastName?: string };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<CandidateFieldValues>(() => ({
    ...emptyCandidateFieldValues,
    email: prefill?.email ?? emptyCandidateFieldValues.email,
    firstName: prefill?.firstName ?? emptyCandidateFieldValues.firstName,
    lastName: prefill?.lastName ?? emptyCandidateFieldValues.lastName,
  }));
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [workHistory, setWorkHistory] = useState<WorkHistoryItem[]>([]);
  const [education, setEducation] = useState<EducationItem[]>([]);
  const [parserVersion, setParserVersion] = useState("");
  const [parseState, setParseState] = useState<CandidateResumeParseResult>(
    initialCandidateResumeParseResult,
  );
  const [isParsing, setIsParsing] = useState(false);
  const [resumeSelected, setResumeSelected] = useState(false);
  const [parseAttempted, setParseAttempted] = useState(false);

  const cleanWorkHistory = workHistory.filter((item) => item.company.trim() && item.title.trim());
  const cleanEducation = education.filter((item) => item.school.trim());
  const canCreate = !isParsing && (!resumeSelected || parseAttempted);
  const showPreview =
    parseState.status === "success" ||
    Boolean(summary || skills.length || cleanWorkHistory.length || cleanEducation.length);

  async function handleParseResume() {
    if (!formRef.current) return;
    setIsParsing(true);
    setParseAttempted(true);

    try {
      const result = await parseCandidateResume(new FormData(formRef.current));
      setParseState(result);
      setFields(result.fields);
      if (result.status === "success" && result.parsed) {
        applyParsedResume(result.parsed, result.parserVersion ?? "");
      }
    } catch {
      setParseState({
        status: "error",
        message: "Could not parse this resume. Try again or enter the candidate details manually.",
        fields,
      });
    } finally {
      setIsParsing(false);
    }
  }

  function applyParsedResume(parsed: ParsedResume, version: string) {
    setSummary(parsed.summary ?? "");
    setSkills(parsed.skills ?? []);
    setWorkHistory(parsed.workHistory ?? []);
    setEducation(parsed.education ?? []);
    setParserVersion(version);
  }

  function handleResumeChange(event: React.ChangeEvent<HTMLInputElement>) {
    setResumeSelected(Boolean(event.target.files?.[0]));
    setParseAttempted(false);
    setParserVersion("");
    setParseState(initialCandidateResumeParseResult);
    setSummary("");
    setSkills([]);
    setWorkHistory([]);
    setEducation([]);
  }

  function setField<K extends keyof CandidateFieldValues>(key: K, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      ref={formRef}
      action={createCandidate}
      className="space-y-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="skills" value={JSON.stringify(skills)} />
      <input type="hidden" name="workHistory" value={JSON.stringify(cleanWorkHistory)} />
      <input type="hidden" name="education" value={JSON.stringify(cleanEducation)} />
      <input type="hidden" name="parserVersion" value={parserVersion} />

      <Section title="Identity">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ControlledField
            label="First name"
            name="firstName"
            value={fields.firstName}
            onChange={(v) => setField("firstName", v)}
            required
          />
          <ControlledField
            label="Last name"
            name="lastName"
            value={fields.lastName}
            onChange={(v) => setField("lastName", v)}
            required
          />
          <StaticField label="Preferred name" name="preferredName" />
          <StaticField label="Pronouns" name="pronouns" placeholder="she/her, he/him, they/them" />
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ControlledField
            label="Email"
            name="email"
            type="email"
            value={fields.email}
            onChange={(v) => setField("email", v)}
            required
          />
          <StaticField label="Alternate email" name="alternateEmail" type="email" />
          <ControlledField
            label="Phone"
            name="phone"
            value={fields.phone}
            onChange={(v) => setField("phone", v)}
          />
          <StaticField label="Alternate phone" name="alternatePhone" />
        </div>
      </Section>

      <Section title="Location & work authorization">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ControlledField
            label="City"
            name="locationCity"
            value={fields.locationCity}
            onChange={(v) => setField("locationCity", v)}
          />
          <ControlledField
            label="State / region"
            name="locationState"
            value={fields.locationState}
            onChange={(v) => setField("locationState", v)}
          />
          <ControlledField
            label="Country"
            name="locationCountry"
            value={fields.locationCountry}
            onChange={(v) => setField("locationCountry", v)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StaticField label="Timezone" name="timezone" placeholder="America/New_York" />
          <StaticSelect label="Work authorization" name="workAuthorization">
            <option value="">— Unknown —</option>
            {(Object.keys(WORK_AUTH_LABEL) as WorkAuth[]).map((k) => (
              <option key={k} value={k}>
                {WORK_AUTH_LABEL[k]}
              </option>
            ))}
          </StaticSelect>
        </div>
        <div className="flex flex-wrap gap-6">
          <CheckboxField label="Open to relocation" name="willingToRelocate" />
          <CheckboxField label="Requires visa sponsorship" name="requiresSponsorship" />
        </div>
      </Section>

      <Section title="Links">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ControlledField
            label="LinkedIn URL"
            name="linkedinUrl"
            value={fields.linkedinUrl}
            onChange={(v) => setField("linkedinUrl", v)}
          />
          <ControlledField
            label="GitHub URL"
            name="githubUrl"
            value={fields.githubUrl}
            onChange={(v) => setField("githubUrl", v)}
          />
          <ControlledField
            label="Portfolio / website"
            name="portfolioUrl"
            value={fields.portfolioUrl}
            onChange={(v) => setField("portfolioUrl", v)}
          />
        </div>
        <TextAreaField
          label="Other URLs"
          name="otherUrls"
          rows={2}
          placeholder="One URL per line, or comma-separated"
        />
      </Section>

      <Section title="Career snapshot">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ControlledField
            label="Current title"
            name="currentTitle"
            value={fields.currentTitle}
            onChange={(v) => setField("currentTitle", v)}
          />
          <ControlledField
            label="Current company"
            name="currentCompany"
            value={fields.currentCompany}
            onChange={(v) => setField("currentCompany", v)}
          />
          <ControlledField
            label="Years of experience"
            name="yearsExperience"
            value={fields.yearsExperience}
            onChange={(v) => setField("yearsExperience", v)}
            type="number"
            min={0}
            max={80}
          />
          <StaticSelect label="Seniority" name="seniority">
            <option value="">— Not set —</option>
            {seniorityOptions.map((o) => (
              <option key={o.id} value={o.name}>
                {o.name}
              </option>
            ))}
          </StaticSelect>
        </div>
      </Section>

      <Section title="Compensation & availability">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <StaticField
            label="Desired salary (min)"
            name="desiredSalaryMin"
            type="number"
            min={0}
            placeholder="100000"
          />
          <StaticField
            label="Desired salary (max)"
            name="desiredSalaryMax"
            type="number"
            min={0}
            placeholder="140000"
          />
          <StaticField
            label="Current salary"
            name="currentSalary"
            type="number"
            min={0}
          />
          <StaticField label="Currency" name="salaryCurrency" defaultValue="USD" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StaticField label="Available from" name="availableFrom" type="date" />
          <StaticField
            label="Notice period (days)"
            name="noticePeriodDays"
            type="number"
            min={0}
            max={365}
          />
        </div>
        <CheckboxGroup
          legend="Employment type preference"
          name="employmentTypePref"
          options={(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((k) => ({
            value: k,
            label: EMPLOYMENT_TYPE_LABEL[k],
          }))}
        />
        <CheckboxGroup
          legend="Work mode preference"
          name="remotePref"
          options={(Object.keys(REMOTE_PREF_LABEL) as RemotePref[]).map((k) => ({
            value: k,
            label: REMOTE_PREF_LABEL[k],
          }))}
        />
      </Section>

      <Section title="Focus areas">
        <TextAreaField
          label="Industries"
          name="industries"
          rows={2}
          placeholder="One per line, or comma-separated — e.g. SaaS, Fintech, Healthcare"
        />
        <TextAreaField
          label="Specialties / functions"
          name="specialties"
          rows={2}
          placeholder="One per line, or comma-separated — e.g. ML platform, Growth, Risk modeling"
        />
      </Section>

      <Section title="Source & ownership">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StaticSelect label="Source" name="source">
            <option value="">— Unknown —</option>
            {sourceOptions.map((o) => (
              <option key={o.id} value={o.name}>
                {o.name}
              </option>
            ))}
          </StaticSelect>
          <StaticField
            label="Source detail"
            name="sourceDetail"
            placeholder="Free text — search term, event name, etc."
          />
          <StaticSelect label="Sourced by (recruiter)" name="sourcedById" defaultValue={currentUserId}>
            <option value="">— Unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </StaticSelect>
          <StaticSelect label="Referred by (teammate)" name="referredByUserId">
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </StaticSelect>
          <StaticSelect label="Referred by (client contact)" name="referredByContactId">
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName} — {c.clientName}
              </option>
            ))}
          </StaticSelect>
          <StaticField
            label="Referred by (other)"
            name="referredByName"
            placeholder="Name if not in the system"
          />
        </div>
      </Section>

      <Section title="Status & engagement">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StaticSelect label="Status" name="status" defaultValue={CandidateStatus.ACTIVE}>
            {(Object.keys(STATUS_LABEL) as CandidateStatus[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k]}
              </option>
            ))}
          </StaticSelect>
          <StaticField
            label="Rating (1–5)"
            name="rating"
            type="number"
            min={1}
            max={5}
          />
          <StaticField label="Next follow-up" name="nextFollowUpAt" type="date" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tags</label>
          <TagInput allTags={allTags} />
        </div>
      </Section>

      <Section title="Resume">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="resume">
            Resume (PDF or DOCX, max 10 MB)
          </label>
          <input
            id="resume"
            name="resume"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleResumeChange}
            className="block w-full text-sm"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleParseResume}
            disabled={isParsing || !resumeSelected}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {isParsing ? "Parsing resume..." : "Parse resume"}
          </button>
          {parseState.message && (
            <p
              className={`text-sm ${
                parseState.status === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-500"
              }`}
              aria-live="polite"
            >
              {parseState.message}
            </p>
          )}
        </div>

        {showPreview && (
          <div className="space-y-5 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="summary">
                Summary
              </label>
              <textarea
                id="summary"
                name="summary"
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="skillsText">
                Skills
              </label>
              <textarea
                id="skillsText"
                rows={4}
                value={skills.join("\n")}
                onChange={(event) => setSkills(splitSkills(event.target.value))}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
              />
            </div>

            <EditableWorkHistory items={workHistory} onChange={setWorkHistory} />
            <EditableEducation items={education} onChange={setEducation} />
          </div>
        )}
      </Section>

      <Section title="Notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          placeholder="Anything else worth remembering — context, preferences, history…"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </Section>

      {customFields.length > 0 && (
        <Section title="Custom fields">
          <CustomFieldsForm fields={customFields} />
        </Section>
      )}

      <button
        type="submit"
        disabled={!canCreate}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Create candidate
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-zinc-200 pt-6 first:border-t-0 first:pt-0 dark:border-zinc-800">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ControlledField({
  label,
  name,
  value,
  onChange,
  type = "text",
  required,
  min,
  max,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
      />
    </div>
  );
}

function StaticField({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        min={min}
        max={max}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
      />
    </div>
  );
}

function StaticSelect({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-100"
      >
        {children}
      </select>
    </div>
  );
}

function TextAreaField({
  label,
  name,
  rows = 3,
  placeholder,
}: {
  label: string;
  name: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </div>
  );
}

function CheckboxField({ label, name }: { label: string; name: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        value="true"
        className="rounded border-zinc-300 dark:border-zinc-700"
      />
      {label}
    </label>
  );
}

function CheckboxGroup({
  legend,
  name,
  options,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((opt) => (
          <label key={opt.value} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={opt.value}
              className="rounded border-zinc-300 dark:border-zinc-700"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function EditableWorkHistory({
  items,
  onChange,
}: {
  items: WorkHistoryItem[];
  onChange: (items: WorkHistoryItem[]) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Work history</h3>
        <button
          type="button"
          onClick={() => onChange([...items, { company: "", title: "" }])}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Add role
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No work history extracted.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SmallInput
                  label="Company"
                  value={item.company}
                  onChange={(value) => updateWorkItem(items, onChange, index, { company: value })}
                />
                <SmallInput
                  label="Title"
                  value={item.title}
                  onChange={(value) => updateWorkItem(items, onChange, index, { title: value })}
                />
                <SmallInput
                  label="Start"
                  value={item.startDate ?? ""}
                  onChange={(value) => updateWorkItem(items, onChange, index, { startDate: value })}
                />
                <SmallInput
                  label="End"
                  value={item.endDate ?? ""}
                  onChange={(value) => updateWorkItem(items, onChange, index, { endDate: value })}
                />
              </div>
              <label className="block text-sm font-medium">
                Summary
                <textarea
                  rows={2}
                  value={item.summary ?? ""}
                  onChange={(event) =>
                    updateWorkItem(items, onChange, index, { summary: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                className="text-sm text-red-600 hover:underline dark:text-red-400"
              >
                Remove role
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EditableEducation({
  items,
  onChange,
}: {
  items: EducationItem[];
  onChange: (items: EducationItem[]) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Education</h3>
        <button
          type="button"
          onClick={() => onChange([...items, { school: "" }])}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Add education
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No education extracted.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SmallInput
                  label="School"
                  value={item.school}
                  onChange={(value) => updateEducationItem(items, onChange, index, { school: value })}
                />
                <SmallInput
                  label="Degree"
                  value={item.degree ?? ""}
                  onChange={(value) => updateEducationItem(items, onChange, index, { degree: value })}
                />
                <SmallInput
                  label="Field"
                  value={item.field ?? ""}
                  onChange={(value) => updateEducationItem(items, onChange, index, { field: value })}
                />
                <SmallInput
                  label="Start"
                  value={item.startDate ?? ""}
                  onChange={(value) => updateEducationItem(items, onChange, index, { startDate: value })}
                />
                <SmallInput
                  label="End"
                  value={item.endDate ?? ""}
                  onChange={(value) => updateEducationItem(items, onChange, index, { endDate: value })}
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                className="text-sm text-red-600 hover:underline dark:text-red-400"
              >
                Remove education
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SmallInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function splitSkills(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((skill) => skill.trim())
        .filter(Boolean),
    ),
  );
}

function updateWorkItem(
  items: WorkHistoryItem[],
  onChange: (items: WorkHistoryItem[]) => void,
  index: number,
  patch: Partial<WorkHistoryItem>,
) {
  onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function updateEducationItem(
  items: EducationItem[],
  onChange: (items: EducationItem[]) => void,
  index: number,
  patch: Partial<EducationItem>,
) {
  onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}
