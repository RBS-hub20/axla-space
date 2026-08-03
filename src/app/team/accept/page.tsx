import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getInviteByToken, ROLE_LABELS } from "@/lib/team";
import { AcceptInviteButton } from "./AcceptInviteButton";

interface PageProps {
  searchParams: { token?: string };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F1A] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#1E293B] bg-[#141A2A] p-8 text-center">
        <Image
          src="/axla-logo-dark.png"
          alt="Axla"
          width={140}
          height={40}
          className="mx-auto h-10 w-auto object-contain"
          priority
        />
        {children}
      </div>
    </div>
  );
}

export default async function AcceptInvitePage({ searchParams }: PageProps) {
  const token = searchParams.token?.trim() ?? "";
  const invite = await getInviteByToken(token);
  const roleLabel = invite.role ? ROLE_LABELS[invite.role] : "";

  if (invite.state === "not_found") {
    return (
      <Shell>
        <h1 className="mt-6 text-xl font-bold text-white">Invite link not valid</h1>
        <p className="mt-2 text-sm text-slate-400">
          This invite link is broken or has already been used up. Ask whoever invited you to send a new one.
        </p>
      </Shell>
    );
  }

  if (invite.state === "expired") {
    return (
      <Shell>
        <h1 className="mt-6 text-xl font-bold text-white">This invite has expired</h1>
        <p className="mt-2 text-sm text-slate-400">
          Invite links from {invite.ownerName} are only valid for 7 days. Ask them to send you a new one.
        </p>
      </Shell>
    );
  }

  if (invite.state === "revoked") {
    return (
      <Shell>
        <h1 className="mt-6 text-xl font-bold text-white">This invite was revoked</h1>
        <p className="mt-2 text-sm text-slate-400">
          {invite.ownerName} canceled this invite. Ask them to send you a new one if this was a mistake.
        </p>
      </Shell>
    );
  }

  if (invite.state === "accepted") {
    return (
      <Shell>
        <h1 className="mt-6 text-xl font-bold text-white">Already accepted</h1>
        <p className="mt-2 text-sm text-slate-400">This invite has already been accepted.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-[#00FF88] px-6 py-3 text-sm font-bold text-[#001A29] hover:bg-[#1ee87f]"
        >
          Log in
        </Link>
      </Shell>
    );
  }

  const user = await getCurrentUser();
  const nextUrl = `/team/accept?token=${encodeURIComponent(token)}`;

  if (!user) {
    return (
      <Shell>
        <h1 className="mt-6 text-xl font-bold text-white">You&apos;ve been invited</h1>
        <p className="mt-2 text-sm text-slate-400">
          <span className="font-semibold text-white">{invite.ownerName}</span> invited you as a{" "}
          <span className="font-semibold text-[#00FF88]">{roleLabel}</span> on their Axla account.
          {invite.invitedEmail ? ` Sent to ${invite.invitedEmail}.` : ""}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={`/login?next=${encodeURIComponent(nextUrl)}`}
            className="flex w-full items-center justify-center rounded-lg bg-[#00FF88] px-4 py-3 text-sm font-bold text-[#001A29] transition hover:bg-[#1ee87f]"
          >
            Sign up
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(nextUrl)}`}
            className="flex w-full items-center justify-center rounded-lg border border-[#1E293B] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-[#00FF88]/40"
          >
            Log in
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">No password needed — we&apos;ll send you a code either way.</p>
      </Shell>
    );
  }

  const emailMismatch = invite.invitedEmail && user.email.toLowerCase() !== invite.invitedEmail.toLowerCase();

  return (
    <Shell>
      <h1 className="mt-6 text-xl font-bold text-white">You&apos;ve been invited</h1>
      <p className="mt-2 text-sm text-slate-400">
        <span className="font-semibold text-white">{invite.ownerName}</span> invited you as a{" "}
        <span className="font-semibold text-[#00FF88]">{roleLabel}</span> on their Axla account.
      </p>
      {emailMismatch && (
        <p className="mt-3 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
          This invite was sent to {invite.invitedEmail}, but you&apos;re signed in as {user.email}. You can still accept it below.
        </p>
      )}
      <AcceptInviteButton token={token} roleLabel={roleLabel} />
    </Shell>
  );
}
