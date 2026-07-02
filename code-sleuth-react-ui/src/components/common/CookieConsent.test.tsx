import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import { CookieConsent } from "@/components/common/CookieConsent";

function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieConsent />
    </MemoryRouter>,
  );
}

describe("CookieConsent", () => {
  it("shows the notice when no prior consent is stored", async () => {
    renderBanner();
    expect(await screen.findByRole("dialog", { name: /cookie/i })).toBeInTheDocument();
  });

  it("dismisses and persists consent to localStorage", async () => {
    renderBanner();
    const button = await screen.findByRole("button");
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /cookie/i })).not.toBeInTheDocument();
    });
    expect(localStorage.getItem("codesimilar.cookieConsent")).toBe("1");
  });

  it("stays hidden when consent was already given", () => {
    localStorage.setItem("codesimilar.cookieConsent", "1");
    renderBanner();
    expect(screen.queryByRole("dialog", { name: /cookie/i })).not.toBeInTheDocument();
  });
});
