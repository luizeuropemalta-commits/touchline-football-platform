// Safari must never be left on an API URL.  The public form posts to
// /login/submit, but this narrow compatibility endpoint protects an older
// cached document or a browser extension that mistakenly prefixes /api/auth.
// The canonical handler returns a 303 to a real TouchLine page for native
// form posts and JSON for JavaScript requests.
export { POST } from "@/app/api/auth/login/route";
