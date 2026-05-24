import { AssistantChat } from "@/components/assistant/AssistantChat";

export default function AssistantFullScreenPage() {
  return (
    <main className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 max-w-3xl w-full mx-auto px-0 sm:px-4 flex flex-col min-h-0">
        <AssistantChat mode="full" />
      </div>
    </main>
  );
}
