import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import {
  getAdminMetrics,
  getAdminUsers,
  setUserPlan,
  type AdminMetrics,
  type AdminUser,
} from "@/lib/adminApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PLANS = ["free", "pro", "team"];

const Admin = () => {
  const { t } = useTranslation("common");
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAdminMetrics(), getAdminUsers(1)])
      .then(([m, u]) => { setMetrics(m); setUsers(u.items); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const changePlan = async (userId: number, plan: string) => {
    try {
      await setUserPlan(userId, plan);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, plan } : u)));
      toast.success("Updated");
    } catch {
      toast.error("Failed");
    }
  };

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const stats = metrics ? [
    { label: t("admin.totalUsers"), value: metrics.totalUsers, icon: Users },
    { label: t("admin.totalAnalyses"), value: metrics.totalAnalyses, icon: Users },
    { label: t("admin.verified"), value: metrics.verifiedUsers, icon: ShieldCheck },
    { label: t("admin.twofa"), value: metrics.twofaUsers, icon: ShieldCheck },
  ] : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="t-h2">{t("admin.title")}</h1>
        <p className="mt-1 t-body">{t("admin.subtitle")}</p>
      </div>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border/70 bg-card p-5" style={{ boxShadow: "var(--card-shadow-rest)" }}>
            <div className="t-label">{s.label}</div>
            <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--card-shadow-rest)" }}>
        <h2 className="t-h3 mb-4">{t("admin.users")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left t-label">
                <th className="pb-2 pr-4">{t("admin.username")}</th>
                <th className="pb-2 pr-4">{t("admin.email")}</th>
                <th className="pb-2 pr-4">{t("admin.verified")}</th>
                <th className="pb-2 pr-4">{t("admin.twofa")}</th>
                <th className="pb-2 pr-4">{t("admin.plan")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium text-foreground">{u.username}{u.isAdmin && <span className="ms-1 text-xs text-primary">★</span>}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{u.email || "—"}</td>
                  <td className="py-2 pr-4">{u.emailVerified ? "✓" : "—"}</td>
                  <td className="py-2 pr-4">{u.twofaEnabled ? "✓" : "—"}</td>
                  <td className="py-2 pr-4">
                    <Select value={u.plan} onValueChange={(v) => changePlan(u.id, v)}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Admin;
