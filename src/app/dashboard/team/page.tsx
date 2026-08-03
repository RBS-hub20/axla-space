"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Copy, Check, RefreshCw, X, Trash2 } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { INVITABLE_ROLES, ROLE_LABELS, type InvitableRole, type TeamRole } from "@/lib/team-permissions";
import { useTeamRole } from "@/contexts/TeamContext";

interface Invite {
  id: string;
  invited_email: string;
  role: TeamRole;
  status: "pending" | "accepted" | "revoked";
  accept_url: string | null;
  expires_at: string;
  created_at: string;
}

interface Member {
  id: string;
  invited_email: string;
  role: TeamRole;
  status: "active" | "removed";
  joined_at: string;
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can be blocked — the link was still generated correctly.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-[#00FF85]/40 hover:text-[#00FF85]"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export default function TeamPage() {
  const { permissions } = useTeamRole();
  const canManageTeam = permissions.canManageTeam;
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("accountant");
  const [isSending, setIsSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dashboard/team", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 403 && data.code === "LIMIT_REACHED") {
        setLocked(true);
        return;
      }
      if (res.ok) {
        setInvites(data.invites);
        setMembers(data.members);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsSending(true);
    try {
      const res = await fetch("/api/dashboard/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send invite.");
        return;
      }
      setNotice(`Invited ${email} as ${ROLE_LABELS[role]}.`);
      setEmail("");
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleRevoke(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/team/invites/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to revoke invite.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleResend(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/team/invites/${id}/resend`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to resend invite.");
        return;
      }
      setNotice("Invite resent.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this team member's access?")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/team/members/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to remove team member.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-400">Loading...</p>;
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Lock className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">Team invites are a Business feature</h1>
        <p className="text-sm text-slate-400">
          Upgrade to Business (₱1,499/mo) to invite your accountant or VA — up to 5 team members.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-block rounded-full bg-[#00FF85] px-6 py-3 text-sm font-semibold text-[#001A29] hover:bg-[#00e078]"
        >
          Upgrade to Business
        </Link>
      </div>
    );
  }

  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Team</h1>
        <p className="mt-1 text-sm text-slate-400">
          Invite your accountant, team leader, or VA to view and manage your filings, BIR forms, and payroll.
        </p>
      </div>

      {!canManageTeam && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Viewing team members — only the account owner can invite or remove people.</p>
        </div>
      )}

      {canManageTeam && (
        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="accountant@email.com"
                className="flex-1"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as InvitableRole)}
                className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
              >
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={isSending}>
                {isSending ? "Sending..." : "Invite"}
              </Button>
            </form>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            {notice && <p className="mt-2 text-sm text-[#00FF85]">{notice}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team members ({members.length}/5)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                    No team members yet.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-slate-200">{m.invited_email}</TableCell>
                    <TableCell>
                      <Badge variant="success">{ROLE_LABELS[m.role]}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {new Date(m.joined_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell>
                      {canManageTeam && (
                        <button
                          type="button"
                          onClick={() => handleRemove(m.id)}
                          disabled={busyId === m.id}
                          aria-label={`Remove ${m.invited_email}`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invited ({pendingInvites.length + members.length}/5)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                    No invites yet.
                  </TableCell>
                </TableRow>
              ) : (
                invites.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-slate-200">{i.invited_email}</TableCell>
                    <TableCell className="text-slate-400">{ROLE_LABELS[i.role]}</TableCell>
                    <TableCell>
                      <Badge variant={i.status === "accepted" ? "success" : i.status === "revoked" ? "destructive" : "warning"}>
                        {i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {new Date(i.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell>
                      {canManageTeam && i.status === "pending" && i.accept_url && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CopyLinkButton url={i.accept_url} />
                          <button
                            type="button"
                            onClick={() => handleResend(i.id)}
                            disabled={busyId === i.id}
                            aria-label={`Resend invite to ${i.invited_email}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-[#00FF85]/40 hover:text-[#00FF85] disabled:opacity-50"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevoke(i.id)}
                            disabled={busyId === i.id}
                            aria-label={`Revoke invite to ${i.invited_email}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                            Revoke
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
