import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({ component: () => <AppShell><Users /></AppShell> });

interface UserRow { id: string; username: string; fullName: string; role: string; active: boolean }

function Users() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: qk.users, queryFn: () => api<UserRow[]>("/users") });
  const [u, setU] = useState({ username: "", password: "", fullName: "", role: "receptionist" });

  const create = useMutation({
    mutationFn: (b: any) => api("/users", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.users }); toast.success("User created"); setU({ username: "", password: "", fullName: "", role: "receptionist" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Users</h1>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(u); }} className="mb-6 flex flex-wrap items-end gap-2 rounded-md border bg-card p-3">
        <div><label className="text-xs text-muted-foreground">Username</label><Input value={u.username} onChange={e => setU({ ...u, username: e.target.value })} required className="h-8 w-40" /></div>
        <div><label className="text-xs text-muted-foreground">Full Name</label><Input value={u.fullName} onChange={e => setU({ ...u, fullName: e.target.value })} required className="h-8 w-48" /></div>
        <div><label className="text-xs text-muted-foreground">Password</label><Input type="password" value={u.password} onChange={e => setU({ ...u, password: e.target.value })} required className="h-8 w-40" /></div>
        <div><label className="text-xs text-muted-foreground">Role</label>
          <Select value={u.role} onValueChange={(v) => setU({ ...u, role: v })}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="receptionist">Receptionist</SelectItem>
              <SelectItem value="technician">Technician</SelectItem>
              <SelectItem value="doctor">Doctor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm">Create User</Button>
      </form>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Username</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2">Active</th></tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2 font-mono">{r.username}</td>
                <td className="px-3 py-2">{r.fullName}</td>
                <td className="px-3 py-2 uppercase text-xs">{r.role}</td>
                <td className="px-3 py-2 text-center">{r.active ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
