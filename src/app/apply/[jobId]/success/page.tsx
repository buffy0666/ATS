export default function ApplicationSuccess() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="text-center px-6">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Application Received</h1>
        <p className="mt-3 max-w-sm mx-auto text-zinc-400">
          Thank you. Your application has been submitted successfully. We’ll review it and get back to you soon.
        </p>
      </div>
    </div>
  );
}
