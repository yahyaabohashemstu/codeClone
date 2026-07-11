import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, KeyRound, Loader2, LogOut, ShieldAlert, ShieldCheck, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { deleteAccount, exportAccountData } from "@/lib/accountApi";
import { Masthead, Panel, Field, Serial } from "@/components/dossier/Dossier";

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

  const [deletePassword, setDeletePassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const hasEmail = Boolean(user?.email);

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <Masthead
        kicker={t("settings.kicker", { defaultValue: "Account & Security" })}
        title={t("settings.title")}
        description={t("settings.subtitle")}
        meta={[
          { label: "USER", value: user?.username ?? "—" },
          {
            label: "2FA",
            value: twofaOn ? (
              <span className="text-success">ENABLED</span>
            ) : (
              <span className="text-warning">DISABLED</span>
            ),
          },
          { label: "ROLE", value: user?.is_admin ? "ADMIN" : "STANDARD" },
          {
            label: "EMAIL",
            value: !hasEmail ? (
              <span className="text-muted-foreground">NONE</span>
            ) : user?.email_verified ? (
              <span className="text-success">VERIFIED</span>
            ) : (
              <span className="text-warning">UNVERIFIED</span>
            ),
          },
        ]}
      />

      {/* Identity — read-only case attributes */}
      <Panel label={t("settings.identity", { defaultValue: "Identity" })} bodyClassName="px-5 py-0 sm:px-6">
        <Field label={t("settings.account", { defaultValue: "Account" })} align="center">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm font-semibold text-foreground" dir="ltr">
              {user?.username ?? "—"}
            </span>
            {user?.is_admin && <Serial tone="primary">ADM</Serial>}
          </div>
        </Field>
        <Field label={t("settings.email", { defaultValue: "Email" })} align="center">
          {hasEmail ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-sm text-foreground" dir="ltr">
                {user?.email}
              </span>
              <span className={user?.email_verified ? "badge-success" : "font-mono text-[11px] uppercase tracking-[0.14em] text-warning"}>
                {user?.email_verified
                  ? t("settings.verified", { defaultValue: "verified" })
                  : t("settings.unverified", { defaultValue: "unverified" })}
              </span>
            </div>
          ) : (
            <span className="font-mono text-sm text-muted-foreground">—</span>
          )}
        </Field>
        <Field label={t("settings.accessLevel", { defaultValue: "Access level" })} align="center">
          <span className="font-mono text-sm font-semibold text-foreground">
            {user?.is_admin
              ? t("settings.roleAdmin", { defaultValue: "Administrator" })
              : t("settings.roleStandard", { defaultValue: "Standard" })}
          </span>
        </Field>
      </Panel>

      {/* Two-factor authentication */}
      <Panel
        label={t("settings.twofa")}
        bodyClassName="p-0"
        actions={
          stage === "idle" ? (
            twofaOn ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStage("disabling");
                  setCode("");
                  setPassword("");
                }}
              >
                {t("settings.disable2fa")}
              </Button>
            ) : (
              <Button size="sm" onClick={beginEnroll} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {t("settings.enable2fa")}
              </Button>
            )
          ) : undefined
        }
      >
        <div className="px-5 sm:px-6">
          <Field label={t("settings.security")}>
            <div className="flex items-center gap-2.5">
              {twofaOn ? (
                <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
              ) : (
                <ShieldAlert className="h-5 w-5 shrink-0 text-warning" />
              )}
              <span className="font-mono text-sm font-semibold text-foreground">
                {twofaOn ? t("settings.twofaOn") : t("settings.twofaOff")}
              </span>
            </div>
            {stage === "idle" && <p className="mt-2 t-sm">{t("settings.twofaIntro")}</p>}
          </Field>
        </div>

        {stage === "enrolling" && (
          <div className="space-y-3 border-t border-border px-5 py-5 sm:px-6">
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
            <Input
              value={code}
              dir="ltr"
              inputMode="numeric"
              placeholder="123456"
              onChange={(e) => setCode(e.target.value)}
              className="h-10 text-center font-mono tracking-[0.3em]"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStage("idle")}>
                {t("settings.cancel")}
              </Button>
              <Button onClick={confirmEnable} disabled={busy || !code.trim()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("settings.confirmEnable")}
              </Button>
            </div>
          </div>
        )}

        {stage === "recovery" && (
          <div className="space-y-3 border-t border-border px-5 py-5 sm:px-6">
            <div className="t-label text-foreground">{t("settings.recoveryTitle")}</div>
            <p className="t-sm">{t("settings.recoveryIntro")}</p>
            {/* Recovery codes as a ruled evidence ledger, serial-numbered */}
            <ol className="overflow-hidden rounded-lg border border-border divide-y divide-border" dir="ltr">
              {recoveryCodes.map((c, i) => (
                <li key={c} className="flex items-center gap-3 px-3 py-2">
                  <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                  <span className="font-mono text-sm tabular-nums text-foreground">{c}</span>
                </li>
              ))}
            </ol>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copy(recoveryCodes.join("\n"))}>
                <Copy className="h-3.5 w-3.5" />
                {t("settings.copied")}
              </Button>
              <Button onClick={() => setStage("idle")}>{t("settings.done")}</Button>
            </div>
          </div>
        )}

        {stage === "disabling" && (
          <div className="space-y-3 border-t border-border px-5 py-5 sm:px-6">
            <p className="t-sm">{t("settings.disableIntro")}</p>
            <Input type="password" value={password} placeholder={t("settings.currentPassword")} onChange={(e) => setPassword(e.target.value)} className="h-10" />
            <Input value={code} dir="ltr" placeholder={t("settings.authCode")} onChange={(e) => setCode(e.target.value)} className="h-10 font-mono" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStage("idle")}>
                {t("settings.cancel")}
              </Button>
              <Button onClick={confirmDisable} disabled={busy || !password || !code.trim()} variant="destructive">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("settings.confirmDisable")}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* Access & data rights — margin-label control rows */}
      <Panel label={t("settings.accessData", { defaultValue: "Access & data" })} bodyClassName="px-5 py-0 sm:px-6">
        <Field label={t("settings.sessions")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="t-sm">{t("settings.logoutAllIntro")}</p>
            <Button variant="outline" size="sm" onClick={handleLogoutAll} disabled={busy} className="shrink-0 gap-2">
              <LogOut className="h-4 w-4" />
              {t("settings.logoutAll")}
            </Button>
          </div>
        </Field>

        <Field label={t("settings.apiKeys.title")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="t-sm">{t("settings.apiKeys.intro")}</p>
            <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => navigate("/api-keys")}>
              <KeyRound className="h-4 w-4" />
              {t("nav.apiKeys")}
            </Button>
          </div>
        </Field>

        <Field label={t("settings.privacy")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="t-sm">{t("settings.exportIntro")}</p>
            <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0 gap-2">
              <Download className="h-4 w-4" />
              {t("settings.exportData")}
            </Button>
          </div>
        </Field>
      </Panel>

      {/* Danger zone */}
      {!user?.is_admin && (
        <Panel
          label={<span className="text-destructive">{t("settings.dangerZone")}</span>}
          className="border-destructive/40"
          bodyClassName="px-5 py-0 sm:px-6"
        >
          <Field label={t("settings.deleteButton")}>
            <p className="t-sm">{t("settings.deleteIntro")}</p>
            {!confirmingDelete ? (
              <Button variant="destructive" size="sm" className="mt-3 gap-2" onClick={() => setConfirmingDelete(true)}>
                <Trash className="h-4 w-4" />
                {t("settings.deleteButton")}
              </Button>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="t-sm">{t("settings.deleteConfirm")}</p>
                <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} className="h-10" />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeletePassword("");
                    }}
                  >
                    {t("settings.cancel")}
                  </Button>
                  <Button variant="destructive" disabled={deleting || !deletePassword} onClick={handleDeleteAccount}>
                    {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash className="mr-2 h-4 w-4" />}
                    {t("settings.deleteButton")}
                  </Button>
                </div>
              </div>
            )}
          </Field>
        </Panel>
      )}
    </div>
  );
};

export default Settings;
