import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/features/config/about-page";

export const Route = createFileRoute("/_app/config/about")({ component: AboutPage });
