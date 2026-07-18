import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { deleteAccount, exportAccountData } from "@/lib/accountApi";
import {
  Masthead,
  Panel,
  Field,
  FieldSheet,
  Serial,
  StatusTag,
  Tag,
  IndexRow,
  Notice,
  DocFrame,
  RailNav,
  RailReadings,
  DocSection,
} from "@/components/dossier/Dossier";

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
  const isAdmin = Boolean(user?.is_admin);

  // Case-file contents index — §NN entries for the margin rail. Danger zone is
  // only filed for non-admin accounts, so it only appears in the index for them.
  const contents: Array<{ n: string; id: string; label: string }> = [
    { n: "01", id: "sec-01", label: t("settings.identity", { defaultValue: "Identity" }) },
    { n: "02", id: "sec-02", label: t("settings.twofa") },
    { n: "03", id: "sec-03", label: t("settings.accessData", { defaultValue: "Access & data" }) },
    ...(!isAdmin ? [{ n: "04", id: "sec-04", label: t("settings.dangerZone") }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <Masthead
        kicker={t("settings.kicker", { defaultValue: "Account & Security" })}
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />

      {/* Instrument-document body — a §-numbered contents rail + live identity
          readings beside a wide main column of ruled §-sections. */}
      <DocFrame
        className="mt-6"
        rail={
          <>
            <RailNav
              ariaLabel={t("settings.contents", { defaultValue: "Case contents" })}
              label={t("settings.contents", { defaultValue: "Case contents" })}
              items={contents.map((c) => ({ n: c.n, label: c.label, href: `#${c.id}` }))}
            />
            {/* Live identity record — the vertical readout that replaces the stat strip. */}
            <RailReadings
              label={t("settings.record", { defaultValue: "Record" })}
              items={[
                {
                  label: t("settings.recordUser", { defaultValue: "User" }),
                  value: <span dir="ltr">{user?.username ?? "—"}</span>,
                },
                {
                  label: "2FA",
                  value: (
                    <StatusTag tone={twofaOn ? "success" : "warning"}>{twofaOn ? "ON" : "OFF"}</StatusTag>
                  ),
                },
                {
                  label: t("settings.recordRole", { defaultValue: "Role" }),
                  value: isAdmin
                    ? t("settings.roleAdmin", { defaultValue: "Administrator" })
                    : t("settings.roleStandard", { defaultValue: "Standard" }),
                  tone: isAdmin ? "primary" : "default",
                },
                {
                  label: t("settings.recordEmail", { defaultValue: "Email" }),
                  value: !hasEmail ? (
                    <StatusTag tone="muted">NONE</StatusTag>
                  ) : user?.email_verified ? (
                    <StatusTag tone="success">{t("settings.verified", { defaultValue: "verified" })}</StatusTag>
                  ) : (
                    <StatusTag tone="warning">{t("settings.unverified", { defaultValue: "unverified" })}</StatusTag>
                  ),
                },
              ]}
            />
          </>
        }
      >
        {/* §01 — Identity: read-only case attributes */}
        <DocSection n="01" id="sec-01" title={t("settings.identity", { defaultValue: "Identity" })}>
          <FieldSheet>
            <Field label={t("settings.account", { defaultValue: "Account" })} align="center">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-sm font-semibold text-foreground" dir="ltr">
                  {user?.username ?? "—"}
                </span>
                {isAdmin && <Tag tone="primary">ADMIN</Tag>}
              </div>
            </Field>
            <Field label={t("settings.email", { defaultValue: "Email" })} align="center">
              {hasEmail ? (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-sm text-foreground" dir="ltr">
                    {user?.email}
                  </span>
                  <StatusTag tone={user?.email_verified ? "success" : "warning"}>
                    {user?.email_verified
                      ? t("settings.verified", { defaultValue: "verified" })
                      : t("settings.unverified", { defaultValue: "unverified" })}
                  </StatusTag>
                </div>
              ) : (
                <span className="font-mono text-sm text-muted-foreground">—</span>
              )}
            </Field>
            <Field label={t("settings.accessLevel", { defaultValue: "Access level" })} align="center">
              <span className="font-mono text-sm font-semibold text-foreground">
                {isAdmin
                  ? t("settings.roleAdmin", { defaultValue: "Administrator" })
                  : t("settings.roleStandard", { defaultValue: "Standard" })}
              </span>
            </Field>
          </FieldSheet>
        </DocSection>

        {/* §02 — Two-factor authentication */}
        <DocSection n="02" id="sec-02" title={t("settings.twofa")}>
          <Panel bodyClassName="p-0">
            <div className="px-5 sm:px-6">
              <Field label={t("settings.security")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {twofaOn ? t("settings.twofaOn") : t("settings.twofaOff")}
                    </span>
                    <StatusTag tone={twofaOn ? "success" : "warning"}>
                      {twofaOn ? "ACTIVE" : "INACTIVE"}
                    </StatusTag>
                  </div>
                  {stage === "idle" &&
                    (twofaOn ? (
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
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t("settings.enable2fa")}
                      </Button>
                    ))}
                </div>
                {stage === "idle" && <p className="mt-2 t-sm">{t("settings.twofaIntro")}</p>}
              </Field>
            </div>

            {stage === "enrolling" && (
              <div className="border-t border-border p-5 sm:p-6">
                <p className="mb-4 t-sm">{t("settings.scanOrEnter")}</p>
                {/* Enrollment spec sheet — margin-labelled fields, left-anchored. */}
                <FieldSheet>
                  <Field label={t("settings.twofaQr", { defaultValue: "Provisioning QR" })}>
                    {otpauthUri && (
                      <figure className="w-fit">
                        {/* Provisioning exhibit — tick-framed, bordered, mono-captioned. */}
                        <div className="tick-frame relative inline-flex rounded-sm border border-border bg-white p-3">
                          <QRCodeSVG value={otpauthUri} size={156} level="M" includeMargin={false} />
                        </div>
                        <figcaption className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          OTPAUTH · TOTP
                        </figcaption>
                      </figure>
                    )}
                  </Field>
                  <Field label={t("settings.twofaSecret", { defaultValue: "Secret key" })}>
                    <p className="mb-2 t-sm">{t("settings.manualEntry")}</p>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={secret}
                        dir="ltr"
                        className="max-w-xs font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        aria-label={t("settings.copySecret")}
                        title={t("settings.copySecret")}
                        onClick={() => copy(secret)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Field>
                  <Field label={t("settings.twofaCode", { defaultValue: "Verification code" })}>
                    <Input
                      value={code}
                      dir="ltr"
                      inputMode="numeric"
                      placeholder="123456"
                      aria-label={t("settings.twofaCode", { defaultValue: "Verification code" })}
                      onChange={(e) => setCode(e.target.value)}
                      className="h-10 max-w-[12rem] text-center font-mono tracking-[0.3em]"
                    />
                  </Field>
                </FieldSheet>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setStage("idle")}>
                    {t("settings.cancel")}
                  </Button>
                  <Button onClick={confirmEnable} disabled={busy || !code.trim()}>
                    {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t("settings.confirmEnable")}
                  </Button>
                </div>
              </div>
            )}

            {stage === "recovery" && (
              <div className="space-y-3 border-t border-border p-5 sm:p-6">
                <div className="t-label text-foreground">{t("settings.recoveryTitle")}</div>
                <p className="t-sm">{t("settings.recoveryIntro")}</p>
                {/* Recovery codes as a ruled evidence ledger, serial-numbered */}
                <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border" dir="ltr">
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
                    {t("settings.copyAllCodes")}
                  </Button>
                  <Button onClick={() => setStage("idle")}>{t("settings.done")}</Button>
                </div>
              </div>
            )}

            {stage === "disabling" && (
              <div className="border-t border-border p-5 sm:p-6">
                <p className="mb-4 t-sm">{t("settings.disableIntro")}</p>
                {/* Revocation form — margin-labelled fields instead of a stacked column. */}
                <FieldSheet>
                  <Field label={t("settings.currentPassword")}>
                    <Input
                      type="password"
                      value={password}
                      aria-label={t("settings.currentPassword")}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-10 max-w-sm"
                    />
                  </Field>
                  <Field label={t("settings.authCode")}>
                    <Input
                      value={code}
                      dir="ltr"
                      aria-label={t("settings.authCode")}
                      onChange={(e) => setCode(e.target.value)}
                      className="h-10 max-w-[12rem] font-mono"
                    />
                  </Field>
                </FieldSheet>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setStage("idle")}>
                    {t("settings.cancel")}
                  </Button>
                  <Button onClick={confirmDisable} disabled={busy || !password || !code.trim()} variant="destructive">
                    {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t("settings.confirmDisable")}
                  </Button>
                </div>
              </div>
            )}
          </Panel>
        </DocSection>

        {/* §03 — Access & data: numbered index of account operations */}
        <DocSection n="03" id="sec-03" title={t("settings.accessData", { defaultValue: "Access & data" })}>
          <Panel bodyClassName="p-0">
            <ul className="divide-y divide-border">
              <li>
                <IndexRow
                  serial={<Serial>01</Serial>}
                  title={t("settings.sessions")}
                  meta={
                    <Button variant="outline" size="sm" onClick={handleLogoutAll} disabled={busy}>
                      {t("settings.logoutAll")}
                    </Button>
                  }
                >
                  {t("settings.logoutAllIntro")}
                </IndexRow>
              </li>
              <li>
                <IndexRow
                  serial={<Serial>02</Serial>}
                  title={t("settings.apiKeys.title")}
                  meta={
                    <Button variant="outline" size="sm" onClick={() => navigate("/api-keys")}>
                      {t("nav.apiKeys")}
                    </Button>
                  }
                >
                  {t("settings.apiKeys.intro")}
                </IndexRow>
              </li>
              <li>
                <IndexRow
                  serial={<Serial>03</Serial>}
                  title={t("settings.privacy")}
                  meta={
                    <Button variant="outline" size="sm" onClick={handleExport}>
                      {t("settings.exportData")}
                    </Button>
                  }
                >
                  {t("settings.exportIntro")}
                </IndexRow>
              </li>
            </ul>
          </Panel>
        </DocSection>

        {/* §04 — Danger zone */}
        {!isAdmin && (
          <DocSection
            n="04"
            id="sec-04"
            title={<span className="text-destructive">{t("settings.dangerZone")}</span>}
          >
            <div className="space-y-4">
              {/* Irreversible-action framing — the danger notice leads the section. */}
              <Notice tone="danger" label={t("settings.deleteButton")}>
                {t("settings.deleteIntro")}
              </Notice>
              {!confirmingDelete ? (
                <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)}>
                  {t("settings.deleteButton")}
                </Button>
              ) : (
                <FieldSheet className="border-destructive/40">
                  <Field label={t("settings.currentPassword")}>
                    <p className="t-sm font-medium text-foreground">{t("settings.deleteConfirm")}</p>
                    <Input
                      type="password"
                      value={deletePassword}
                      aria-label={t("settings.currentPassword")}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="mt-3 h-10 max-w-sm"
                    />
                    <div className="mt-3 flex justify-end gap-2">
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
                        {deleting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                        {t("settings.deleteButton")}
                      </Button>
                    </div>
                  </Field>
                </FieldSheet>
              )}
            </div>
          </DocSection>
        )}
      </DocFrame>
    </div>
  );
};

export default Settings;
