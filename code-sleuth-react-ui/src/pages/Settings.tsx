import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Copy, KeyRound, Loader2, LogOut, Plus, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyRow } from "@/lib/adminApi";
import { deleteAccount, exportAccountData } from "@/lib/accountApi";
import { Download, Trash } from "lucide-react";

type Stage = "idle" | "enrolling" | "recovery" | "disabling";

const Settings = () => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { user, setup2fa, enable2fa, disable2fa, logoutAll } = useAuth();

  const [stage, setStage] = useState<Stage>("idle");
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [freshToken, setFreshToken] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    listApiKeys().then(setKeys).catch(() => undefined);
  }, []);

  const twofaOn = Boolean(user?.twofa_enabled);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("settings.copied")),
      () => undefined,
    );
  };

  const beginEnroll = async () => {
    setBusy(true);
    try {
      const { secret: s, otpauthUri: uri } = await setup2fa();
      setSecret(s);
      setOtpauthUri(uri);
      setCode("");
      setStage("enrolling");
    } catch {
      toast.error(t("errors.generic", { defaultValue: "Something went wrong." }));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    setBusy(true);
    try {
      const codes = await enable2fa(code);
      setRecoveryCodes(codes);
      setStage("recovery");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    setBusy(true);
    try {
      await disable2fa(password, code);
      setStage("idle");
      setPassword("");
      setCode("");
      toast.success(t("settings.twofaOff"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleLogoutAll = async () => {
    setBusy(true);
    try {
      await logoutAll();
      navigate("/login", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateKey = async () => {
    setCreatingKey(true);
    try {
      const { token, item } = await createApiKey(newKeyName.trim());
      setKeys((prev) => [item, ...prev]);
      setFreshToken(token);
      setNewKeyName("");
    } catch {
      toast.error("Failed");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (id: number) => {
    try {
      await revokeApiKey(id);
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revoked: true } : k)));
    } catch {
      toast.error("Failed");
    }
  };

  const handleExport = async () => {
    try {
      await exportAccountData();
    } catch {
      toast.error("Failed");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      navigate("/login", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="t-h2">{t("settings.title")}</h1>
        <p className="mt-1 t-body">{t("settings.subtitle")}</p>
      </div>

      {/* Two-factor auth */}
      <section className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--card-shadow-rest)" }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {twofaOn ? <ShieldCheck className="h-5 w-5 text-success" /> : <ShieldAlert className="h-5 w-5 text-warning" />}
            <div>
              <div className="font-semibold text-foreground">{t("settings.twofa")}</div>
              <div className="t-sm">{twofaOn ? t("settings.twofaOn") : t("settings.twofaOff")}</div>
            </div>
          </div>
          {stage === "idle" && (
            twofaOn ? (
              <Button variant="outline" onClick={() => { setStage("disabling"); setCode(""); setPassword(""); }}>
                {t("settings.disable2fa")}
              </Button>
            ) : (
              <Button onClick={beginEnroll} disabled={busy} className="gap-2 text-white"
                style={{ background: "var(--gradient-brand)" }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {t("settings.enable2fa")}
              </Button>
            )
          )}
        </div>

        {stage === "idle" && <p className="mt-3 t-sm">{t("settings.twofaIntro")}</p>}

        {stage === "enrolling" && (
          <div className="mt-4 space-y-3">
            <p className="t-sm">{t("settings.scanOrEnter")}</p>
            {otpauthUri && (
              <div className="flex justify-center rounded-lg border border-border bg-white p-4">
                <QRCodeSVG value={otpauthUri} size={168} level="M" includeMargin={false} />
              </div>
            )}
            <p className="t-sm">{t("settings.manualEntry")}</p>
            <div className="flex items-center gap-2">
              <Input readOnly value={secret} dir="ltr" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" size="sm" className="gap-1.5" aria-label={t("settings.copySecret")} title={t("settings.copySecret")} onClick={() => copy(secret)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input value={code} dir="ltr" inputMode="numeric" placeholder="123456"
              onChange={(e) => setCode(e.target.value)} className="h-10 text-center tracking-[0.3em]" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStage("idle")}>{t("settings.cancel")}</Button>
              <Button onClick={confirmEnable} disabled={busy || !code.trim()} className="text-white" style={{ background: "var(--gradient-brand)" }}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("settings.confirmEnable")}
              </Button>
            </div>
          </div>
        )}

        {stage === "recovery" && (
          <div className="mt-4 space-y-3">
            <div className="font-semibold text-foreground">{t("settings.recoveryTitle")}</div>
            <p className="t-sm">{t("settings.recoveryIntro")}</p>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background/50 p-3 font-mono text-sm" dir="ltr">
              {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copy(recoveryCodes.join("\n"))}>
                <Copy className="h-3.5 w-3.5" />{t("settings.copied")}
              </Button>
              <Button onClick={() => setStage("idle")} className="text-white" style={{ background: "var(--gradient-brand)" }}>
                {t("settings.done")}
              </Button>
            </div>
          </div>
        )}

        {stage === "disabling" && (
          <div className="mt-4 space-y-3">
            <p className="t-sm">{t("settings.disableIntro")}</p>
            <Input type="password" value={password} placeholder={t("settings.currentPassword")}
              onChange={(e) => setPassword(e.target.value)} className="h-10" />
            <Input value={code} dir="ltr" placeholder={t("settings.authCode")}
              onChange={(e) => setCode(e.target.value)} className="h-10" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStage("idle")}>{t("settings.cancel")}</Button>
              <Button onClick={confirmDisable} disabled={busy || !password || !code.trim()} variant="destructive">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("settings.confirmDisable")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Sessions */}
      <section className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--card-shadow-rest)" }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-foreground">{t("settings.sessions")}</div>
            <p className="mt-1 t-sm">{t("settings.logoutAllIntro")}</p>
          </div>
          <Button variant="outline" onClick={handleLogoutAll} disabled={busy} className="gap-2 shrink-0">
            <LogOut className="h-4 w-4" />{t("settings.logoutAll")}
          </Button>
        </div>
      </section>

      {/* API keys */}
      <section className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--card-shadow-rest)" }}>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <div className="font-semibold text-foreground">{t("settings.apiKeys.title")}</div>
        </div>
        <p className="mt-1 t-sm">{t("settings.apiKeys.intro")}</p>

        {freshToken && (
          <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "hsl(var(--warning) / 0.3)", background: "hsl(var(--warning) / 0.08)" }}>
            <div className="mb-1 text-xs text-warning">{t("settings.apiKeys.tokenOnce")}</div>
            <div className="flex items-center gap-2">
              <Input readOnly value={freshToken} dir="ltr" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" size="sm" aria-label={t("settings.copyToken")} title={t("settings.copyToken")} onClick={() => copy(freshToken)}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Input value={newKeyName} placeholder={t("settings.apiKeys.nameHint")} onChange={(e) => setNewKeyName(e.target.value)} className="h-9" />
          <Button onClick={handleCreateKey} disabled={creatingKey} className="gap-1.5 text-white shrink-0" style={{ background: "var(--gradient-brand)" }}>
            {creatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t("settings.apiKeys.create")}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {keys.length === 0 && <p className="t-sm">{t("settings.apiKeys.noKeys")}</p>}
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-mono">{k.prefix}…</span>
                {k.name && <span className="ms-2 text-muted-foreground">{k.name}</span>}
                {k.revoked && <span className="ms-2 text-xs text-destructive">{t("settings.apiKeys.revoked")}</span>}
              </div>
              {!k.revoked && (
                <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={() => handleRevokeKey(k.id)}>
                  <Trash2 className="h-3.5 w-3.5" />{t("settings.apiKeys.revoke")}
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Privacy & data */}
      <section className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--card-shadow-rest)" }}>
        <div className="font-semibold text-foreground">{t("settings.privacy")}</div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="t-sm">{t("settings.exportIntro")}</p>
          <Button variant="outline" onClick={handleExport} className="gap-2 shrink-0">
            <Download className="h-4 w-4" />{t("settings.exportData")}
          </Button>
        </div>

        {!user?.is_admin && (
          <div className="mt-5 rounded-lg border p-4" style={{ borderColor: "hsl(var(--destructive) / 0.3)", background: "hsl(var(--destructive) / 0.05)" }}>
            <div className="font-semibold text-destructive">{t("settings.dangerZone")}</div>
            <p className="mt-1 t-sm">{t("settings.deleteIntro")}</p>
            {!confirmingDelete ? (
              <Button variant="destructive" className="mt-3 gap-2" onClick={() => setConfirmingDelete(true)}>
                <Trash className="h-4 w-4" />{t("settings.deleteButton")}
              </Button>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="t-sm">{t("settings.deleteConfirm")}</p>
                <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} className="h-10" />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => { setConfirmingDelete(false); setDeletePassword(""); }}>{t("settings.cancel")}</Button>
                  <Button variant="destructive" disabled={deleting || !deletePassword} onClick={handleDeleteAccount}>
                    {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash className="mr-2 h-4 w-4" />}
                    {t("settings.deleteButton")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default Settings;
