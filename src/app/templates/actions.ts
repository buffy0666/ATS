"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const templateSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
});

export async function createTemplate(formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();
  const data = templateSchema.parse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });

  const tpl = await prisma.emailTemplate.create({
    data: { ...data, createdById: session.user.id, organizationId: orgId },
  });

  revalidatePath("/templates");
  redirect(`/templates/${tpl.id}`);
}

export async function updateTemplate(templateId: string, formData: FormData) {
  const { orgId } = await requireSessionWithOrg();
  const data = templateSchema.parse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  const result = await prisma.emailTemplate.updateMany({
    where: { id: templateId, organizationId: orgId },
    data,
  });
  if (result.count === 0) throw new Error("Template not found.");
  revalidatePath("/templates");
  revalidatePath(`/templates/${templateId}`);
}

export async function deleteTemplate(templateId: string) {
  const { orgId } = await requireSessionWithOrg();
  await prisma.emailTemplate.deleteMany({
    where: { id: templateId, organizationId: orgId },
  });
  revalidatePath("/templates");
  redirect("/templates");
}
