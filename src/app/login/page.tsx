import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-zinc-500 mb-6">Use your ATS account.</p>
        <LoginForm />
      </div>
    </main>
  );
}
