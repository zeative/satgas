import { createFileRoute } from "@tanstack/react-router";
import { PipelinePage } from "@/features/pipeline/pipeline-page";

export const Route = createFileRoute("/_app/pipeline")({ component: PipelinePage });
