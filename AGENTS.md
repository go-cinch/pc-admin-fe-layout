# Frontend Template Rules

## 1. Route API requests through a client for each service

- Each backend service has its own named request client and configurable `baseURL`, for example `authRequestClient` with `/api/auth` and `orderRequestClient` with `/api/order`.
- API functions pass only the path within that service: `authRequestClient.get('/info')` and `orderRequestClient.get('/list')`. Keep gateway prefixes and service origins in client configuration, outside API functions and page components.
- Reuse the shared request factory for token injection, language and scope headers, token refresh, response handling, and errors. Login and token refresh continue to use the Auth service; concurrent clients must share a refresh request for the same session.
- With the default empty backend `auth.path`, authentication endpoints use `/info`, `/pub/login`, `/pub/refresh`, etc. Resources such as `/user` and `/role` remain on the Auth service client. Frontend page routes such as `/auth/login` are independent.
- Adding a service requires its own configured base URL and gateway route. Add development proxy configuration when a local upstream is needed; declaring a client does not create a backend endpoint.

## Template source

Make source changes under `{{ .Project }}/<ui>`. Preserve existing local changes when synchronizing a generated demo, and validate the selected template's generated output.
