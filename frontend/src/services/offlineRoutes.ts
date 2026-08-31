import { hasCachedClassRequest } from "./classService";

const matchPath = (pathname: string, pattern: RegExp) => pathname.match(pattern);

export const canAccessRouteOffline = (pathname: string) => {
  if (pathname === "/offline") return true;
  if (pathname === "/" || pathname.startsWith("/auth/")) return true;
  if (pathname === "/student/student_screen") return true;
  if (/^\/student\/student_screen\/(home|enrolled|settings|about)$/.test(pathname)) return true;
  if (pathname.startsWith("/teacher/teacher_screen")) return true;
  if (pathname === "/teacher/integrity-analytics" || pathname === "/teacher/analytics") {
    return true;
  }
  if (/^\/student\/activities\/[^/]+\/submit$/.test(pathname)) return true;
  if (/^\/student\/classes\/[^/]+\/activities\/[^/]+\/submit$/.test(pathname)) {
    return true;
  }
  if (/^\/teacher\/submissions\/[^/]+\/analysis$/.test(pathname)) return true;

  const activityMatch = matchPath(
    pathname,
    /^\/student\/classes\/[^/]+\/activities\/([^/]+)$/,
  );
  if (activityMatch) {
    return true;
  }

  const draftMatch = matchPath(pathname, /^\/documents\/draft\/([^/]+)$/);
  if (draftMatch) return true;

  const documentMatch = matchPath(
    pathname,
    /^\/documents\/(activity-attachment|submission)\/([^/]+)$/,
  );
  if (documentMatch) {
    return hasCachedClassRequest(`/documents/${documentMatch[1]}/${documentMatch[2]}`);
  }

  const submissionMatch = matchPath(pathname, /^\/teacher\/submissions\/([^/]+)$/);
  if (submissionMatch) {
    return true;
  }

  return false;
};
