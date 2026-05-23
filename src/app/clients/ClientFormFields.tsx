import { ClientStatus, CompanySize, RevenueBand } from "@/generated/prisma";
import { TagInput } from "@/components/TagInput";

type Owner = { id: string; name: string | null; email: string };
type Tag = { id: string; name: string; color: string };

type Defaults = {
  name?: string;
  website?: string | null;
  linkedinUrl?: string | null;
  industry?: string | null;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  companySize?: CompanySize | null;
  revenueBand?: RevenueBand | null;
  status?: ClientStatus;
  ownerId?: string | null;
  notes?: string | null;
  tags?: Tag[];
};

const COMPANY_SIZE_LABEL: Record<CompanySize, string> = {
  ONE_TO_TEN: "1–10",
  ELEVEN_TO_FIFTY: "11–50",
  FIFTY_ONE_TO_TWO_HUNDRED: "51–200",
  TWO_HUNDRED_ONE_TO_FIVE_HUNDRED: "201–500",
  FIVE_HUNDRED_ONE_TO_ONE_THOUSAND: "501–1,000",
  ONE_THOUSAND_PLUS: "1,000+",
};

const REVENUE_BAND_LABEL: Record<RevenueBand, string> = {
  UNDER_1M: "Under $1M",
  ONE_TO_10M: "$1M–$10M",
  TEN_TO_50M: "$10M–$50M",
  FIFTY_TO_250M: "$50M–$250M",
  TWO_FIFTY_M_TO_1B: "$250M–$1B",
  OVER_1B: "Over $1B",
};

export function ClientFormFields({
  owners,
  allTags,
  defaults,
}: {
  owners: Owner[];
  allTags: Tag[];
  defaults?: Defaults;
}) {
  return (
    <>
      <Field label="Company name" name="name" required defaultValue={defaults?.name} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Status"
          name="status"
          defaultValue={defaults?.status ?? ClientStatus.ACTIVE}
        >
          <option value={ClientStatus.PROSPECT}>Prospect</option>
          <option value={ClientStatus.ACTIVE}>Active</option>
          <option value={ClientStatus.INACTIVE}>Inactive</option>
          <option value={ClientStatus.FORMER}>Former</option>
        </Select>
        <Select
          label="Owner (recruiter on our side)"
          name="ownerId"
          defaultValue={defaults?.ownerId ?? ""}
        >
          <option value="">— Unassigned —</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name ?? o.email}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Company size"
          name="companySize"
          defaultValue={defaults?.companySize ?? ""}
        >
          <option value="">— Not set —</option>
          {(Object.keys(COMPANY_SIZE_LABEL) as CompanySize[]).map((k) => (
            <option key={k} value={k}>
              {COMPANY_SIZE_LABEL[k]}
            </option>
          ))}
        </Select>
        <Select
          label="Revenue band"
          name="revenueBand"
          defaultValue={defaults?.revenueBand ?? ""}
        >
          <option value="">— Not set —</option>
          {(Object.keys(REVENUE_BAND_LABEL) as RevenueBand[]).map((k) => (
            <option key={k} value={k}>
              {REVENUE_BAND_LABEL[k]}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Industry"
          name="industry"
          placeholder="e.g. SaaS, Healthcare, Finance"
          defaultValue={defaults?.industry ?? ""}
        />
        <Field
          label="HQ location"
          name="location"
          placeholder="City, State / Country"
          defaultValue={defaults?.location ?? ""}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Main phone"
          name="phone"
          placeholder="+1 555-0100"
          defaultValue={defaults?.phone ?? ""}
        />
        <Field
          label="Website"
          name="website"
          placeholder="https://example.com"
          defaultValue={defaults?.website ?? ""}
        />
      </div>
      <Field
        label="LinkedIn company URL"
        name="linkedinUrl"
        placeholder="https://www.linkedin.com/company/..."
        defaultValue={defaults?.linkedinUrl ?? ""}
      />
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="address">
          Address
        </label>
        <textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={defaults?.address ?? ""}
          placeholder="Street, city, state, ZIP, country…"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Tags</label>
        <TagInput allTags={allTags} defaultValue={defaults?.tags ?? []} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={5}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Anything worth remembering about this client — interview preferences, must-haves, history…"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
    </>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Select({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      >
        {children}
      </select>
    </div>
  );
}
