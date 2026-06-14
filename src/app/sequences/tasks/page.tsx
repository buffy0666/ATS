import { redirect } from "next/navigation";

/**
 * Sequence manual steps are now real Tasks surfaced in the unified task board
 * (with candidate + sequence context and inline complete). This page is kept
 * as a redirect so old links / revalidatePath("/sequences/tasks") still resolve.
 */
export default function SequenceTasksRedirect() {
  redirect("/tasks");
}
