import { httpJson, type HttpResult } from "../../platform/http";

const CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const PROJECTS_URL = "https://cloudresourcemanager.googleapis.com/v1/projects";
const USER_AGENT = "GeminiCLI/0.0.0 (windows; x64)";

export interface GeminiTier {
  id?: string;
  name?: string;
  cloudaicompanionProject?: string;
}

export interface GeminiCodeAssistResponse {
  currentTier?: GeminiTier | null;
  paidTier?: GeminiTier | null;
  cloudaicompanionProject?: string;
  [key: string]: unknown;
}

export interface GeminiQuotaBucket {
  modelId?: string;
  remainingFraction?: number;
  resetTime?: string;
  tokenType?: string;
}

export interface GeminiQuotaResponse {
  buckets?: GeminiQuotaBucket[];
  [key: string]: unknown;
}

export interface GoogleProject {
  projectId?: string;
  lifecycleState?: string;
  labels?: Record<string, string>;
}

export interface GoogleProjectsResponse {
  projects?: GoogleProject[];
}

function headers(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
}

export function fetchCodeAssist(accessToken: string): Promise<HttpResult<GeminiCodeAssistResponse>> {
  return httpJson<GeminiCodeAssistResponse>(CODE_ASSIST_URL, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify({
      metadata: {
        ideType: "IDE_UNSPECIFIED",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
        duetProject: "default",
      },
    }),
  });
}

export function fetchQuota(
  accessToken: string,
  projectId: string | null,
): Promise<HttpResult<GeminiQuotaResponse>> {
  return httpJson<GeminiQuotaResponse>(QUOTA_URL, {
    method: "POST",
    headers: headers(accessToken),
    body: JSON.stringify(projectId ? { project: projectId } : {}),
  });
}

export function fetchProjects(accessToken: string): Promise<HttpResult<GoogleProjectsResponse>> {
  return httpJson<GoogleProjectsResponse>(PROJECTS_URL, {
    method: "GET",
    headers: headers(accessToken),
  });
}

export function projectFromCodeAssist(response: GeminiCodeAssistResponse): string | null {
  return (
    response.cloudaicompanionProject ??
    response.currentTier?.cloudaicompanionProject ??
    response.paidTier?.cloudaicompanionProject ??
    null
  );
}

export function projectFromList(response: GoogleProjectsResponse): string | null {
  const projects = response.projects ?? [];
  const active = projects.filter((project) => !project.lifecycleState || project.lifecycleState === "ACTIVE");
  return (
    active.find((project) => project.projectId?.startsWith("gen-lang-client"))?.projectId ??
    active.find((project) => project.labels?.["generative-language"] !== undefined)?.projectId ??
    null
  );
}
