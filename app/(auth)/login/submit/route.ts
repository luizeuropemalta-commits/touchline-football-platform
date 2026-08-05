// The public login form submits here rather than to an API URL. The handler
// returns a normal HTTP redirect to the requested TouchLine page, which keeps
// Safari out of the API route and avoids its Server Action navigation failure.
export { POST } from "@/app/api/auth/login/route";
