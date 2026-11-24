# Vben-specific Rules

Shared frontend rules come from the template repository's root `AGENTS.md` and are included automatically in generated projects. Keep only Vben-specific additions here.

## Service client configuration

Configure Auth through `VITE_GLOB_AUTH_API_URL` (default `/api/auth`) and Order through `VITE_GLOB_ORDER_API_URL` (default `/api/order`). Create additional service clients with `createServiceRequestClient` in `src/api/request.ts` and a service-specific environment variable.

## Validation

Run the affected request and API unit tests, the application's type check, and its production build. This file's `src` paths refer to `apps/web-antd/src` in the Vben workspace.

## Account-scoped browser cache

Use `userCache` from `@vben/utils/cache` in the PC app and from `@vben-core/shared/cache` in lower-level packages. `userCache.current()` resolves the authenticated account or the anonymous user. Pass `'session'` for tab-lifetime data. Capture the bucket when opening an editor or scheduling a write. Use its `get`, `set`, `removeItem`, `keys`, and `clear` methods for personal data. `child(name)` limits enumeration and clearing to one feature.

Login-page account history uses the anonymous bucket. Device-scoped storage is for session bootstrap and the browser rate-limit identifier. Import legacy personal records only when their original owner can be verified.
