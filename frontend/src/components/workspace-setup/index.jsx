import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AppBrand from "../ui/AppBrand";
import SplashStage from "./SplashStage";
import WelcomeStage from "./WelcomeStage";
import SetupStage from "./SetupStage";
import {
  DEFAULT_APP_TITLE,
  DEFAULT_START_PAGE_SLUG,
} from "../../constants/defaults";
import { COMMON_TIMEZONES } from "../../constants/timezones";
import { getWelcomeMessage } from "../../constants/onboarding";
import { apiFetch } from "../../api/client";
import ROUTES from "../../api/routes";

export default function OnboardingFlow({
  stage,
  onStageChange,
  onLogin,
  onComplete,
  bootstrap,
}) {
  const fallbackTimezone = "America/Chicago";
  const [selectedTimezone, setSelectedTimezone] = useState(
    bootstrap.timezone || fallbackTimezone
  );
  const [timezoneSaved, setTimezoneSaved] = useState(
    Boolean(bootstrap.timezone)
  );
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [timezoneMessage, setTimezoneMessage] = useState("");
  const [timezoneTone, setTimezoneTone] = useState("info");
  const [appTitle, setAppTitle] = useState(
    bootstrap.appTitle || DEFAULT_APP_TITLE
  );
  const [appTitleSaved, setAppTitleSaved] = useState(
    Boolean(bootstrap.appTitle)
  );
  const [appIconPreview, setAppIconPreview] = useState(bootstrap.appIcon || "");
  const [iconMessage, setIconMessage] = useState("");
  const [iconBusy, setIconBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState(null);
  const autoSaveRef = useRef(false);

  useEffect(() => {
    setSelectedTimezone(bootstrap.timezone || fallbackTimezone);
    setTimezoneSaved(Boolean(bootstrap.timezone));
    setAppTitle(bootstrap.appTitle || DEFAULT_APP_TITLE);
    setAppTitleSaved(Boolean(bootstrap.appTitle));
    setAppIconPreview(bootstrap.appIcon || "");
  }, [
    bootstrap.timezone,
    bootstrap.appTitle,
    bootstrap.appIcon,
    fallbackTimezone,
  ]);

  const handleAppTitleInput = useCallback((value) => {
    setAppTitle(value);
  }, []);

  const handleSaveAppTitle = useCallback(
    async (value) => {
      const trimmed = (value || appTitle || "").trim();
      const title = trimmed || DEFAULT_APP_TITLE;
      if (!trimmed) {
        setAppTitle(title);
      }
      try {
        await apiFetch(ROUTES.bootstrapAppTitle, {
          method: "PUT",
          body: { appTitle: title },
        });
        setAppTitleSaved(true);
      } catch (err) {
        setAppTitleSaved(false);
      }
    },
    [appTitle]
  );

  const handleIconUpload = useCallback(async (file) => {
    if (!file) return;
    setIconMessage("");
    setIconBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiFetch(ROUTES.bootstrapAppIcon, {
        method: "POST",
        body: form,
      });
      setAppIconPreview(data?.url || "");
      setIconMessage("Icon saved");
    } catch (err) {
      setIconMessage(err.message || "Upload failed");
    } finally {
      setIconBusy(false);
    }
  }, []);

  const handleIconSelect = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      handleIconUpload(file);
      event.target.value = "";
    },
    [handleIconUpload]
  );

  const handleSaveTimezone = useCallback(
    async (value) => {
      const tzValue = (value || selectedTimezone || "").trim();
      if (!tzValue) {
        setTimezoneTone("danger");
        setTimezoneMessage("Choose a timezone before continuing.");
        return;
      }
      setSavingTimezone(true);
      setTimezoneMessage("");
      try {
        await apiFetch(ROUTES.bootstrapTimezone, {
          method: "PUT",
          body: { timezone: tzValue },
        });
        setTimezoneTone("info");
        setTimezoneMessage("");
        setTimezoneSaved(true);
      } catch (err) {
        setTimezoneTone("danger");
        setTimezoneMessage(err.message || "Unable to save timezone");
        setTimezoneSaved(false);
        autoSaveRef.current = false;
      } finally {
        setSavingTimezone(false);
      }
    },
    [selectedTimezone]
  );

  const handleTimezoneSelect = useCallback(
    (event) => {
      const value = event.target.value;
      setSelectedTimezone(value);
      setTimezoneMessage("");
      setTimezoneTone("info");
      setTimezoneSaved(false);
      handleSaveTimezone(value);
    },
    [handleSaveTimezone]
  );

  useEffect(() => {
    if (stage !== "setup") {
      autoSaveRef.current = false;
      return;
    }
    if (
      selectedTimezone &&
      !timezoneSaved &&
      !savingTimezone &&
      !autoSaveRef.current
    ) {
      autoSaveRef.current = true;
      setTimezoneSaved(true);
      handleSaveTimezone(selectedTimezone);
    }
  }, [
    stage,
    selectedTimezone,
    timezoneSaved,
    savingTimezone,
    handleSaveTimezone,
  ]);

  const finishSetup = useCallback(async () => {
    if (setupBusy) return;
    if (!timezoneSaved || !selectedTimezone) {
      setSetupError("Save a timezone before continuing.");
      return;
    }
    setSetupBusy(true);
    setSetupError(null);
    try {
      const userData = await apiFetch(ROUTES.setupFinish, { method: "POST" });
      const finalTitle = (appTitle || "").trim() || DEFAULT_APP_TITLE;
      if (!appTitleSaved || finalTitle !== (bootstrap.appTitle || "").trim()) {
        await handleSaveAppTitle(finalTitle);
      }
      const slug = DEFAULT_START_PAGE_SLUG;
      await apiFetch(ROUTES.document(encodeURIComponent(slug)), {
        method: "POST",
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
        body: getWelcomeMessage(finalTitle),
      });
      onLogin(userData);
      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      setSetupError(err.message || "Unable to finish setup");
    } finally {
      setSetupBusy(false);
    }
  }, [
    selectedTimezone,
    timezoneSaved,
    setupBusy,
    onLogin,
    onComplete,
    appTitle,
    appTitleSaved,
    bootstrap.appTitle,
    handleSaveAppTitle,
  ]);

  const steps = [
    { id: "splash", label: "Splash" },
    { id: "welcome", label: "Welcome" },
    { id: "setup", label: "Setup" },
  ];
  const brandTitle = (appTitle || "").trim() || DEFAULT_APP_TITLE;
  const brandIcon = appIconPreview || bootstrap.appIcon || "";
  const renderBreadcrumbs = () => {
    const breadcrumbSteps =
      stage === "splash" ? steps : steps.filter((step) => step.id !== "splash");
    return (
      <div className="start-breadcrumb-row">
        {breadcrumbSteps.map((item, index) => (
          <React.Fragment key={item.id}>
            <button
              type="button"
              className={`start-breadcrumb ${
                stage === item.id ? "start-breadcrumb-active" : ""
              }`}
              onClick={() => onStageChange(item.id)}
            >
              {item.label}
            </button>
            {index < breadcrumbSteps.length - 1 && (
              <span className="start-breadcrumb-sep">&gt;</span>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderStageContents = () => {
    switch (stage) {
      case "splash":
        return (
          <SplashStage
            brandTitle={brandTitle}
            brandIcon={brandIcon}
            onStageChange={onStageChange}
          />
        );
      case "welcome":
        return (
          <WelcomeStage brandTitle={brandTitle} onStageChange={onStageChange} />
        );
      case "setup":
        return (
          <SetupStage
            brandTitle={brandTitle}
            appTitle={appTitle}
            onAppTitleChange={handleAppTitleInput}
            appIconPreview={appIconPreview}
            iconBusy={iconBusy}
            iconMessage={iconMessage}
            onIconSelect={handleIconSelect}
            selectedTimezone={selectedTimezone}
            handleTimezoneSelect={handleTimezoneSelect}
            timezoneMessage={timezoneMessage}
            timezoneTone={timezoneTone}
            finishSetup={finishSetup}
            setupBusy={setupBusy}
            setupError={setupError}
            timezoneSaved={timezoneSaved}
          />
        );
      default:
        return null;
    }
  };

  const showTopbar = stage !== "splash";

  return (
    <div className="start-shell">
      <div className="start-inner">
        {showTopbar && (
          <div className="start-topbar">
            <div className="start-brand-header">
              <AppBrand
                title={brandTitle}
                subtitle="Shared knowledge base"
                iconSrc={brandIcon}
              />
              <div className="start-brand-sub">
                Welcome to your {brandTitle} workspace
              </div>
            </div>
            {renderBreadcrumbs()}
          </div>
        )}
        {renderStageContents()}
      </div>
    </div>
  );
}
