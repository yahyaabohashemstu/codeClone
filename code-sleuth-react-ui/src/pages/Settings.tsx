import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { deleteAccount, exportAccountData } from "@/lib/accountApi";
import { Masthead, Panel, Field } from "@/components/dossier/Dossier";
import { Tag } from "@/components/bench/Bench";
import { IconDownload } from "@/components/bench/icons";
import { cn } from "@/lib/utils";

type Stage = "idle" | "enrolling" | "recovery" | "disabling";

/**
 * Account: identity as a ruled field sheet, two-factor as a lamp with the
 * enrolment sequence beneath it, access & data rows, and the delete panel
 * set apart with the signal.
 */
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

  const emailTag = !hasEmail ? (
    <Tag tone="neutral">—</Tag>
  ) : user?.email_verified ? (
    <Tag tone="neutral">{t("settings.verified", { defaultValue: "verified" })}</Tag>
  ) : (
    <Tag tone="advisory">{t("settings.unverified", { defaultValue: "unverified" })}</Tag>
  );

  const stepNumber = (n: number) => <span aria-hidden className="mono-ordinal pt-1 text-txt-muted">{String(n).padStart(2, "0")}</span>;

  return (
    <div className="mx-auto max-w-3xl pt-7">
      <Masthead
        kicker={t("settings.account", { defaultValue: "Account" })}
        title={t("settings.title")}
        description={t("settings.subtitle")}
        meta={[
          { label: "USER", value: <span dir="ltr">{user?.username ?? "—"}</span> },
          { label: "2FA", value: <Tag tone={twofaOn ? "neutral" : "advisory"}>{twofaOn ? t("settings.twofaOn") : t("settings.twofaOff")}</Tag> },
          {
            label: "ROLE",
            value: user?.is_admin ? t("settings.roleAdmin", { defaultValue: "Administrator" }) : t("settings.roleStandard", { defaultValue: "Standard" }),
          },
          { label: "EMAIL", value: emailTag },
        ]}
      />

      <div className="mt-8 space-y-5">
        {/* Identity */}
        <Panel label={t("settings.identity", { defaultValue: "Identity" })} bodyClassName="px-5 py-0 sm:px-6">
          <Field label={t("settings.account", { defaultValue: "Account" })} align="center">
            <span className="mono-value block truncate text-txt-primary" dir="ltr">
              {user?.username ?? "—"}
            </span>
          </Field>
          <Field label={t("settings.email", { defaultValue: "Email" })} align="center">
            <div className="flex flex-wrap items-center gap-3">
              <span className="mono-value min-w-0 truncate text-txt-primary" dir="ltr">
                {hasEmail ? user?.email : "—"}
              </span>
              {hasEmail && emailTag}
            </div>
          </Field>
          <Field label={t("settings.accessLevel", { defaultValue: "Access level" })} align="center">
            <Tag tone="neutral">
              {user?.is_admin ? t("settings.roleAdmin", { defaultValue: "Administrator" }) : t("settings.roleStandard", { defaultValue: "Standard" })}
            </Tag>
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
                <Button size="sm" onClick={beginEnroll} disabled={busy}>
                  {t("settings.enable2fa")}
                </Button>
              )
            ) : undefined
          }
        >
          <div className="px-5 sm:px-6">
            <Field label={t("settings.security")}>
              <div className="flex h-6 items-center gap-2.5">
                <span aria-hidden className={cn("lamp", twofaOn && "is-on")} />
                <span className="body-compact text-txt-primary">{twofaOn ? t("settings.twofaOn") : t("settings.twofaOff")}</span>
                <span className="mono-meta text-txt-muted">TOTP</span>
                <span className="sr-only">{twofaOn ? "on" : "off"}</span>
              </div>
              {stage === "idle" && <p className="mt-2 text-[13px] leading-relaxed text-txt-secondary">{t("settings.twofaIntro")}</p>}
            </Field>
          </div>

          {stage === "enrolling" && (
            /* The enrolment procedure — a genuine sequence, so the steps are numbered. */
            <div className="border-t border-bench-hair px-5 py-5 sm:px-6">
              <ol className="space-y-6">
                <li className="grid grid-cols-[2.5rem_1fr] gap-x-3">
                  {stepNumber(1)}
                  <div>
                    <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.scanOrEnter")}</p>
                    {otpauthUri && (
                      <div className="plate mt-3 flex justify-center p-4">
                        <QRCodeSVG value={otpauthUri} size={168} level="M" includeMargin={false} bgColor="#f4f2ec" fgColor="#1b1b19" />
                      </div>
                    )}
                  </div>
                </li>
                <li className="grid grid-cols-[2.5rem_1fr] gap-x-3">
                  {stepNumber(2)}
                  <div>
                    <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.manualEntry")}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Input readOnly value={secret} dir="ltr" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                      <Button type="button" variant="outline" size="sm" aria-label={t("settings.copySecret")} title={t("settings.copySecret")} onClick={() => copy(secret)}>
                        <Copy strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                </li>
                <li className="grid grid-cols-[2.5rem_1fr] gap-x-3">
                  {stepNumber(3)}
                  <div>
                    <Input
                      value={code}
                      dir="ltr"
                      inputMode="numeric"
                      placeholder="123456"
                      aria-label={t("settings.authCode")}
                      onChange={(e) => setCode(e.target.value)}
                      className="h-10 text-center font-mono tracking-[0.3em]"
                    />
                    <div className="mt-3 flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setStage("idle")}>
                        {t("settings.cancel")}
                      </Button>
                      <Button onClick={confirmEnable} disabled={busy || !code.trim()}>
                        {t("settings.confirmEnable")}
                      </Button>
                    </div>
                  </div>
                </li>
              </ol>
            </div>
          )}

          {stage === "recovery" && (
            <div className="space-y-3 border-t border-bench-hair px-5 py-5 sm:px-6">
              <div className="label text-txt-primary">{t("settings.recoveryTitle")}</div>
              <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.recoveryIntro")}</p>
              {/* Recovery codes as a ruled, numbered list */}
              <ol className="divide-y divide-bench-hair border-y border-bench-hair" dir="ltr">
                {recoveryCodes.map((c, i) => (
                  <li key={c} className="flex h-9 items-center gap-4">
                    <span className="mono-ordinal w-6 text-txt-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="mono-value text-txt-primary">{c}</span>
                  </li>
                ))}
              </ol>
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="outline" size="sm" onClick={() => copy(recoveryCodes.join("\n"))}>
                  <Copy strokeWidth={1.5} />
                  {t("settings.copied")}
                </Button>
                <Button size="sm" onClick={() => setStage("idle")}>
                  {t("settings.done")}
                </Button>
              </div>
            </div>
          )}

          {stage === "disabling" && (
            <div className="space-y-3 border-t border-bench-hair px-5 py-5 sm:px-6">
              <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.disableIntro")}</p>
              <Input type="password" value={password} placeholder={t("settings.currentPassword")} aria-label={t("settings.currentPassword")} onChange={(e) => setPassword(e.target.value)} className="h-10" />
              <Input value={code} dir="ltr" placeholder={t("settings.authCode")} aria-label={t("settings.authCode")} onChange={(e) => setCode(e.target.value)} className="h-10 font-mono" />
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setStage("idle")}>
                  {t("settings.cancel")}
                </Button>
                <Button onClick={confirmDisable} disabled={busy || !password || !code.trim()} variant="destructive">
                  {t("settings.confirmDisable")}
                </Button>
              </div>
            </div>
          )}
        </Panel>

        {/* Access & data */}
        <Panel label={t("settings.accessData", { defaultValue: "Access & data" })} bodyClassName="px-5 py-0 sm:px-6">
          <Field label={t("settings.sessions")} align="center">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.logoutAllIntro")}</p>
              <Button variant="outline" size="sm" onClick={handleLogoutAll} disabled={busy} className="shrink-0">
                {t("settings.logoutAll")}
              </Button>
            </div>
          </Field>

          <Field label={t("settings.apiKeys.title")} align="center">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.apiKeys.intro")}</p>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate("/api-keys")}>
                {t("nav.apiKeys")}
              </Button>
            </div>
          </Field>

          <Field label={t("settings.privacy")} align="center">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.exportIntro")}</p>
              <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0">
                <IconDownload />
                {t("settings.exportData")}
              </Button>
            </div>
          </Field>
        </Panel>

        {/* Delete account — irreversible, set apart with the signal */}
        {!user?.is_admin && (
          <Panel label={<Tag tone="hot">{t("settings.dangerZone")}</Tag>} className="border-signal" bodyClassName="px-5 py-0 sm:px-6">
            <Field label={t("settings.deleteButton")}>
              <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.deleteIntro")}</p>
              {!confirmingDelete ? (
                <Button variant="destructive" size="sm" className="mt-3" onClick={() => setConfirmingDelete(true)}>
                  {t("settings.deleteButton")}
                </Button>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-[13px] leading-relaxed text-txt-secondary">{t("settings.deleteConfirm")}</p>
                  <Input type="password" value={deletePassword} aria-label={t("settings.currentPassword")} onChange={(e) => setDeletePassword(e.target.value)} className="h-10" />
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setConfirmingDelete(false);
                        setDeletePassword("");
                      }}
                    >
                      {t("settings.cancel")}
                    </Button>
                    <Button variant="destructive" disabled={deleting || !deletePassword} onClick={handleDeleteAccount}>
                      {deleting ? t("settings.deleting") : t("settings.deleteButton")}
                    </Button>
                  </div>
                </div>
              )}
            </Field>
          </Panel>
        )}
      </div>
    </div>
  );
};

export default Settings;
