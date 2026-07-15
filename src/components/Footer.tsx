export function Footer() {
  return (
    <footer className="bg-navy py-8 text-slate-400">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center text-sm sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <p>
          <span className="font-semibold text-white">Axla.space</span> · Your AI
          agent for adulting
        </p>
        <div className="flex gap-5">
          <a href="/privacy" className="transition hover:text-white">
            Privacy
          </a>
          <a href="/terms" className="transition hover:text-white">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
