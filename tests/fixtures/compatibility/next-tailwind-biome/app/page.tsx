export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-8 text-slate-900">
      <h1 className="text-3xl font-bold">Next.js + Tailwind + Oxlint/Oxfmt</h1>
      <p className="text-lg text-slate-600">
        This fixture covers Next.js 16, React 19, Tailwind CSS v4, Oxlint, and Oxfmt.
      </p>
      <button
        type="button"
        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Test Button
      </button>
    </main>
  );
}
