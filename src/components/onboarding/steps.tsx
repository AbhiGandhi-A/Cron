"use client";

import type { ReactNode } from "react";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
  hrefLabel?: string;
}

function Icon({ path }: { path: string }): ReactNode {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const CLOCK =
  "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z";
const GRID =
  "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z";
const PLUS_CIRCLE =
  "M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z";
const CALENDAR =
  "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5";
const CHECK_CIRCLE =
  "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
const BELL =
  "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0";
const LIGHTNING =
  "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z";
const EYE =
  "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z";
const LIST =
  "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z";
const LINK_ICON =
  "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244";
const SEND =
  "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5";
const GEAR =
  "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28zM15 12a3 3 0 11-6 0 3 3 0 016 0z";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to CronJob.io",
    description:
      "Automate your workflows with scheduled HTTP requests. Create cron jobs that hit your endpoints on a fixed schedule, verify the response, and get notified the moment something goes wrong.",
    icon: <Icon path={CLOCK} />,
    href: "/",
    hrefLabel: "Go to Dashboard",
  },
  {
    id: "dashboard",
    title: "Dashboard overview",
    description:
      "Your dashboard summarizes how everything is running: total runs, successes, failures, average response time, and your monthly execution budget for the free plan.",
    icon: <Icon path={GRID} />,
    href: "/",
    hrefLabel: "Open Dashboard",
  },
  {
    id: "create-job",
    title: "Create a cron job",
    description:
      "A cron job is one endpoint you want to call on a schedule. Give it a name, the URL, HTTP method, headers (like Authorization), and any query parameters or request body it needs.",
    icon: <Icon path={PLUS_CIRCLE} />,
    href: "/jobs/new",
    hrefLabel: "Create a job",
  },
  {
    id: "schedule",
    title: "Pick a schedule",
    description:
      "Run every 1, 5, 15, or 30 minutes, every hour, or daily — or write your own cron expression for full control. Set the timezone so schedules line up with your local clock.",
    icon: <Icon path={CALENDAR} />,
  },
  {
    id: "validation",
    title: "Verify the response",
    description:
      "Set an expected status code (for example 200) and/or a pattern to find in the response body. A run only counts as successful when it matches your checks — otherwise it is recorded as failed.",
    icon: <Icon path={CHECK_CIRCLE} />,
  },
  {
    id: "notifications",
    title: "Stay informed",
    description:
      "Send a webhook notification when a job fails, when it recovers, or after every single run. Set a failure threshold so you are only alerted when it really matters.",
    icon: <Icon path={BELL} />,
  },
  {
    id: "automatic-execution",
    title: "Save & automatic execution",
    description:
      "Save your job with Enabled turned on and it starts running automatically on its schedule — no manual steps. You can pause, edit, or delete any job at any time.",
    icon: <Icon path={LIGHTNING} />,
  },
  {
    id: "job-details",
    title: "Inspect a job",
    description:
      "Open any job to see its configuration, validation rules, upcoming runs, live success stats, and recent executions. Use Run Now to fire a job instantly.",
    icon: <Icon path={EYE} />,
    href: "/jobs",
    hrefLabel: "Open Cron Jobs",
  },
  {
    id: "logs",
    title: "Logs & execution history",
    description:
      "Every run is recorded with its full request and response. Filter by successful, failed, 4xx, 5xx, or timeout, and expand any entry to inspect bodies, headers, and error details.",
    icon: <Icon path={LIST} />,
  },
  {
    id: "test-urls",
    title: "Test URLs",
    description:
      "Register the endpoints you care about and watch them get checked. Capture responses for each URL to confirm behavior before wiring them into a job.",
    icon: <Icon path={LINK_ICON} />,
    href: "/test-urls",
    hrefLabel: "Open Test URLs",
  },
  {
    id: "api-tester",
    title: "API Tester",
    description:
      "A fast way to experiment. Pick a method, add headers, query parameters, and a body, then inspect the full response — status, timing, size, and headers.",
    icon: <Icon path={SEND} />,
    href: "/api-tester",
    hrefLabel: "Open API Tester",
  },
  {
    id: "settings",
    title: "Settings",
    description:
      "Review your plan, monthly execution budget, and account details. That is everything you need — time to build your first job!",
    icon: <Icon path={GEAR} />,
    href: "/settings",
    hrefLabel: "Open Settings",
  },
];