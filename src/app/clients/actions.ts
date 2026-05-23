"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ContactRole,
  ClientStatus,
  ContactStatus,
  CompanySize,
  RevenueBand,
} from "@/generated/prisma";
import { tagColorForName } from "@/lib/tag-colors";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

const optionalString = (max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      return trimmed || null;
    },
    z.string().max(max).nullable(),
  );

const optionalUrl = (max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (!trimmed) return null;
      // Recruiters often type "bbagc.com" without a scheme; normalize before validating.
      if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
      return trimmed;
    },
    z.string().url().max(max).nullable(),
  );

const optionalEnum = <T extends Record<string, string>>(e: T) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.nativeEnum(e).nullable(),
  );

const clientSchema = z.object({
  name: z.string().min(1).max(200),
  website: optionalUrl(300),
  linkedinUrl: optionalUrl(300),
  industry: optionalString(100),
  location: optionalString(150),
  address: optionalString(500),
  phone: optionalString(40),
  companySize: optionalEnum(CompanySize),
  revenueBand: optionalEnum(RevenueBand),
  status: z.nativeEnum(ClientStatus).default(ClientStatus.ACTIVE),
  ownerId: optionalString(50),
  notes: optionalString(5000),
});

/**
 * Upsert tags by name (creating any new ones with a deterministic color),
 * then return the list of tag IDs ready to be `set` on a Client or Contact.
 */
async function syncTagNamesToIds(rawNames: string[]): Promise<string[]> {
  const names = Array.from(
    new Set(rawNames.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 60)),
  );
  if (names.length === 0) return [];

  const tags = await Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { name },
        create: { name, color: tagColorForName(name) },
        update: {},
      }),
    ),
  );
  return tags.map((t) => t.id);
}

function clientPayload(formData: FormData) {
  return clientSchema.parse({
    name: formData.get("name"),
    website: formData.get("website"),
    linkedinUrl: formData.get("linkedinUrl"),
    industry: formData.get("industry"),
    location: formData.get("location"),
    address: formData.get("address"),
    phone: formData.get("phone"),
    companySize: formData.get("companySize"),
    revenueBand: formData.get("revenueBand"),
    status: formData.get("status"),
    ownerId: formData.get("ownerId"),
    notes: formData.get("notes"),
  });
}

export async function createClient(formData: FormData) {
  await requireUser();
  const data = clientPayload(formData);
  const tagIds = await syncTagNamesToIds(formData.getAll("tags").map(String));

  const client = await prisma.client.create({
    data: {
      ...data,
      tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
    },
  });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(clientId: string, formData: FormData) {
  await requireUser();
  const data = clientPayload(formData);
  const tagIds = await syncTagNamesToIds(formData.getAll("tags").map(String));

  await prisma.client.update({
    where: { id: clientId },
    data: {
      ...data,
      tags: { set: tagIds.map((id) => ({ id })) },
    },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
}

export async function deleteClient(clientId: string) {
  await requireUser();
  const linkedJobs = await prisma.job.count({ where: { clientId } });
  if (linkedJobs > 0) {
    throw new Error(
      `Cannot delete this client — ${linkedJobs} job(s) are still attached. Reassign or delete those jobs first.`,
    );
  }
  await prisma.client.delete({ where: { id: clientId } });
  revalidatePath("/clients");
  redirect("/clients");
}

const contactSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z
    .string()
    .email()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  phone: optionalString(40),
  title: optionalString(120),
  department: optionalString(120),
  role: optionalEnum(ContactRole),
  linkedinUrl: optionalUrl(300),
  status: z.nativeEnum(ContactStatus).default(ContactStatus.ACTIVE),
  birthday: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? new Date(v) : null)),
  notes: optionalString(5000),
});

function contactPayload(formData: FormData) {
  return contactSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    title: formData.get("title"),
    department: formData.get("department"),
    role: formData.get("role"),
    linkedinUrl: formData.get("linkedinUrl"),
    status: formData.get("status"),
    birthday: formData.get("birthday"),
    notes: formData.get("notes"),
  });
}

export async function addContact(clientId: string, formData: FormData) {
  await requireUser();
  const data = contactPayload(formData);
  const tagIds = await syncTagNamesToIds(formData.getAll("tags").map(String));

  await prisma.clientContact.create({
    data: {
      clientId,
      ...data,
      tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
    },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateContact(contactId: string, formData: FormData) {
  await requireUser();
  const data = contactPayload(formData);
  const tagIds = await syncTagNamesToIds(formData.getAll("tags").map(String));

  const contact = await prisma.clientContact.update({
    where: { id: contactId },
    data: {
      ...data,
      tags: { set: tagIds.map((id) => ({ id })) },
    },
    select: { clientId: true },
  });
  revalidatePath(`/clients/${contact.clientId}`);
}

export async function deleteContact(contactId: string) {
  await requireUser();
  const contact = await prisma.clientContact.delete({
    where: { id: contactId },
    select: { clientId: true },
  });
  revalidatePath(`/clients/${contact.clientId}`);
}

export async function markContactContacted(contactId: string) {
  await requireUser();
  const contact = await prisma.clientContact.update({
    where: { id: contactId },
    data: { lastContactedAt: new Date() },
    select: { clientId: true },
  });
  revalidatePath(`/clients/${contact.clientId}`);
}
