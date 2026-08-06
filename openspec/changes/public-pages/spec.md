# Delta Spec — public-pages

## Domains
All capabilities in this change are NEW (no existing openspec/specs/ files). Each domain gets a full spec.

---

# 1. RegisterSchema

## Requirements

### Requirement: Registration Input Validation

`RegisterSchema` MUST validate all fields required to create a new tenant and its first admin user.

| Field | Rule |
|-------|------|
| `orgName` | string, 1–100 chars, required |
| `fullName` | string, 1–100 chars, required |
| `email` | valid email, required |
| `password` | min 8 chars, required |
| `confirmPassword` | must equal `password`, required |
| `acceptTerms` | boolean, MUST be `true` |

The schema MUST be defined in `src/lib/schemas/index.ts` and exported as `RegisterSchema`.
`confirmPassword` validation MUST use `.superRefine` so the field-level error targets `confirmPassword`.
`acceptTerms` MUST use `.refine(v => v === true)` — `false` MUST produce a validation error.

#### Scenario: All fields valid

- GIVEN a payload with all fields present and conforming to every rule
- WHEN `RegisterSchema.safeParse(payload)` is called
- THEN `success` is `true` and data is returned with all fields

#### Scenario: Passwords do not match

- GIVEN a payload where `confirmPassword !== password`
- WHEN `RegisterSchema.safeParse(payload)` is called
- THEN `success` is `false` and errors include a `confirmPassword` path entry

#### Scenario: Terms not accepted

- GIVEN a payload with `acceptTerms: false`
- WHEN `RegisterSchema.safeParse(payload)` is called
- THEN `success` is `false` and errors include an `acceptTerms` path entry

#### Scenario: Missing required field

- GIVEN a payload missing `email`
- WHEN `RegisterSchema.safeParse(payload)` is called
- THEN `success` is `false` and errors include an `email` path entry

---

# 2. POST /api/auth/register

## Requirements

### Requirement: Public Registration Endpoint

The system MUST expose `POST /api/auth/register` as a public route (no JWT required).
On success it MUST return HTTP 201 with `{ token, user, tenant }` (same shape as `/api/auth/login`).
On any validation or business-logic error it MUST return `{ message: string }` flat — never nested.

**Slug derivation**: the server MUST derive slug from `orgName` (slugify → lowercase, spaces→hyphens, strip non-alphanumeric-hyphen, max 63 chars). On collision the server MUST append a 4-char random alphanumeric suffix. Deny-listed slugs (`master`, `admin`, `www`, `api`, `app`) MUST be treated as collisions.

**Tenant provision sequence** (MUST be followed in this order):
1. Validate body with `RegisterSchema` (server-side; `acceptTerms` field present in schema, irrelevant after validation).
2. Derive slug; check uniqueness in `master.tenants`.
3. Insert tenant row with `activo = false` (orphan marker).
4. Call `master.provision_tenant_schema($slug)` OUTSIDE any transaction.
5. Inside `sql.begin()`: flip `activo = true`, insert user row in `master.usuarios`, insert `usuario_roles` row with role `ADMIN`.
6. Issue JWT `{ sub: email, tenantId: slug, roles: ['ADMIN'] }`, 8 h expiry.
7. Return HTTP 201 `{ token, user: { id, email, fullName }, tenant: { slug, name } }`.

#### Scenario: Happy path registration

- GIVEN a valid body with unique email and org name, terms accepted
- WHEN `POST /api/auth/register` is called
- THEN response is 201 with `{ token, user, tenant }`
- AND `master.tenants` has a new row with `activo = true`
- AND `master.usuarios` has a new row linked to that tenant
- AND the JWT payload is `{ sub: email, tenantId: slug, roles: ['ADMIN'] }`

#### Scenario: Duplicate email

- GIVEN an email already present in `master.usuarios`
- WHEN `POST /api/auth/register` is called
- THEN response is 409 `{ message: "Email already registered" }`

#### Scenario: Slug collision with random suffix

- GIVEN `orgName` slugifies to a value already in `master.tenants`
- WHEN `POST /api/auth/register` is called
- THEN server retries with a 4-char suffix; if unique it proceeds normally
- AND response is 201

#### Scenario: Provision failure

- GIVEN `master.provision_tenant_schema` throws
- WHEN `POST /api/auth/register` is called
- THEN the orphan tenant row (activo=false) remains in `master.tenants` for cleanup
- AND response is 500 `{ message: "Tenant provisioning failed" }`
- AND no user row is inserted

#### Scenario: Schema validation failure

- GIVEN body is missing `password` or `acceptTerms` is false
- WHEN `POST /api/auth/register` is called
- THEN response is 400 `{ message: "..." }` describing the first validation error

#### Scenario: Deny-listed slug

- GIVEN `orgName` slugifies to `admin`
- WHEN `POST /api/auth/register` is called
- THEN slug collision path triggers; a suffix is appended and registration proceeds normally

---

# 3. Register Page /register

## Requirements

### Requirement: Self-Service Registration Form

The `/register` page MUST be publicly accessible (no auth required) and MUST render a form with six inputs: Org Name, Full Name, Email, Password, Confirm Password, and a terms acceptance checkbox.

The form MUST:
- Show inline validation errors without a page reload.
- Disable the submit button while submission is in flight.
- On success: write `sirva_session` cookie and `sirve_auth` localStorage key, then redirect to `/admin`.
- On API error: display `{ message }` from the response above the submit button.
- Include a link to `/login` ("Already have an account?").
- Include a link to `/terms` in the checkbox label.

#### Scenario: Successful registration

- GIVEN user fills all fields validly and checks terms
- WHEN form is submitted
- THEN API call to `POST /api/auth/register` is made
- AND on 201 the client writes `sirva_session` cookie and `sirve_auth` localStorage
- AND user is redirected to `/admin`

#### Scenario: Terms not checked

- GIVEN user fills all fields but leaves terms checkbox unchecked
- WHEN form is submitted
- THEN client-side validation prevents submission
- AND an inline error is shown near the checkbox

#### Scenario: API returns 409

- GIVEN email is already registered
- WHEN form is submitted and API returns 409
- THEN the error message is shown inline above the submit button
- AND the form stays filled (no reset)

#### Scenario: Link to login

- GIVEN user is on `/register`
- WHEN user clicks "Already have an account?"
- THEN user is navigated to `/login`

---

# 4. Login Page Update

## Requirements

### Requirement: Register Link and Terms Notice on Login Page

The login page (`/login`) MUST be updated to include:
- A visible link to `/register` with text "Create an account" or equivalent.
- A brief terms-acceptance notice below the submit button referencing `/terms` and `/privacy`.

#### Scenario: Register link visible

- GIVEN an unauthenticated user on `/login`
- WHEN the page renders
- THEN a link to `/register` is visible on the page

#### Scenario: Terms notice visible

- GIVEN an unauthenticated user on `/login`
- WHEN the page renders
- THEN a brief text mentioning `/terms` and `/privacy` is visible

---

# 5. Terms Page /terms

## Requirements

### Requirement: Static Public Terms Page

The system MUST expose `/terms` as a static, publicly accessible page with no authentication requirement.
The page MUST render the Terms of Service content and include a footer link back to `/privacy`.

#### Scenario: Accessible without auth

- GIVEN an unauthenticated user
- WHEN they navigate to `/terms`
- THEN the page renders with HTTP 200 and no redirect to `/login`

#### Scenario: Contains legal content

- GIVEN an unauthenticated user on `/terms`
- WHEN the page renders
- THEN a heading "Terms of Service" (or equivalent) is visible
- AND a link to `/privacy` is present

---

# 6. Privacy Page /privacy

## Requirements

### Requirement: Static Public Privacy Page

The system MUST expose `/privacy` as a static, publicly accessible page with no authentication requirement.
The page MUST render the Privacy Policy content and include a footer link back to `/terms`.

#### Scenario: Accessible without auth

- GIVEN an unauthenticated user
- WHEN they navigate to `/privacy`
- THEN the page renders with HTTP 200 and no redirect to `/login`

#### Scenario: Contains legal content

- GIVEN an unauthenticated user on `/privacy`
- WHEN the page renders
- THEN a heading "Privacy Policy" (or equivalent) is visible
- AND a link to `/terms` is present

---

# 7. Middleware — Public Route Additions

## Requirements

### Requirement: Public Paths for New Pages and API Route

`PUBLIC_PAGE_PATHS` in `src/middleware.ts` MUST include `/register`, `/terms`, and `/privacy`.
`API_PUBLIC_PREFIXES` MUST include `/api/auth/register`.

The existing prefix-match logic (`pathname === p || pathname.startsWith(p + '/')`) means `/register/*` and `/terms/*` are also public — this is acceptable and consistent with `/setup`.

#### Scenario: /register bypasses auth

- GIVEN an unauthenticated request to `/register`
- WHEN middleware processes it
- THEN `NextResponse.next()` is returned (no redirect to `/login`)

#### Scenario: /api/auth/register bypasses JWT check

- GIVEN a request to `POST /api/auth/register` with no `Authorization` header
- WHEN middleware processes it
- THEN the request is forwarded with `x-tenant-slug: __master__` and no 401

#### Scenario: /terms and /privacy bypass auth

- GIVEN an unauthenticated request to `/terms` or `/privacy`
- WHEN middleware processes it
- THEN `NextResponse.next()` is returned (no redirect to `/login`)

---

# 8. Landing Page

## Requirements

### Requirement: Credible SaaS Entry Point

`src/app/page.tsx` MUST be redesigned to present Sirva as a self-service SaaS product.

Required sections (in order):
1. **Hero** — headline, subheadline, primary CTA button linking to `/register`
2. **Features** — key product features (min 3)
3. **Comparison** — differentiators vs. alternatives
4. **Trust strip** — social proof elements (logos, testimonials, or stat callouts)
5. **Pricing** — at least one plan clearly presented
6. **FAQ** — min 3 questions
7. **Final CTA** — repeat register call-to-action
8. **Footer** — links to `/terms` and `/privacy`; brand name "Sirva"

The page MUST fix the existing `lg:grid-cols-4` vs. 3-items grid bug (columns MUST match item count).
The brand name MUST read "Sirva" throughout (not "Sirve").
All CTA buttons linking to `/register` MUST use the design system `Button` primitive with design tokens only (no raw `slate-*` or `gray-*` color classes).

#### Scenario: Register CTA is present and linked

- GIVEN an unauthenticated visitor on `/`
- WHEN the page renders
- THEN at least two CTA elements linking to `/register` are visible (Hero + Final CTA)

#### Scenario: Footer legal links

- GIVEN a visitor on `/`
- WHEN the page renders
- THEN footer contains links to `/terms` and `/privacy`

#### Scenario: Grid column bug fixed

- GIVEN the features or any grid section with 3 items
- WHEN rendered on a large viewport
- THEN the grid MUST NOT declare 4 columns for 3 items (column count MUST equal item count)

#### Scenario: Brand name consistency

- GIVEN the landing page renders
- WHEN any heading or brand reference is visible
- THEN the text reads "Sirva" — never "Sirve"
