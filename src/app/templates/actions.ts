"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const templateSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
});

export async function createTemplate(formData: FormData) {
  const session = await requireSession();
  const data = templateSchema.parse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });

  const tpl = await prisma.emailTemplate.create({
    data: { ...data, createdById: session.user.id },
  });

  revalidatePath("/templates");
  redirect(`/templates/${tpl.id}`);
}

export async function updateTemplate(templateId: string, formData: FormData) {
  await requireSession();
  const data = templateSchema.parse({
    name: formData.get("name"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  await prisma.emailTemplate.update({ where: { id: templateId }, data });
  revalidatePath("/templates");
  revalidatePath(`/templates/${templateId}`);
}

export async function deleteTemplate(templateId: string) {
  await requireSession();
  await prisma.emailTemplate.delete({ where: { id: templateId } });
  revalidatePath("/templates");
  redirect("/templates");
}
