import { createFileRoute } from "@tanstack/react-router";
import { EnglishGuardApp } from "@/components/english-guard-app";

export const Route = createFileRoute("/")({ component: EnglishGuardApp });
