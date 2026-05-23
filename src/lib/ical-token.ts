import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Returns the user's iCal subscribe token, minting one on first call.
 *
 * The token is the only secret in the calendar feed URL — anyone with it can
 * see that user's upcoming interviews. Rotating is a matter of nulling the
 * column and calling this again.
 */
export async function getOrCreateICalToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { iCalToken: true },
  });
  if (user?.iCalToken) return user.iCalToken;

  const token = randomBytes(24).toString("base64url");
  await prisma.user.update({
    where: { id: userId },
    data: { iCalToken: token },
  });
  return token;
}

export async function rotateICalToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.user.update({
    where: { id: userId },
    data: { iCalToken: token },
  });
  return token;
}
