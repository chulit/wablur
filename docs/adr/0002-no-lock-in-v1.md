# No Lock in v1; a Lock is a separate module if it ever ships

The v1 promise is Visual Privacy against Screen Share and Shoulder Surfing (grill Q3, D1) — exposures a PIN gate does not improve, since the user is present and the screen is shared deliberately. A Lock also cannot be expressed in the pure, CSS-only `BlurEngine`; folding idle/PIN state into it would destroy the purity its depth and testability depend on (codebase-design comparison). We therefore ship v1 without a Lock, and if a Lock is ever built it will be a separate deep module with its own interface, consuming Settings like any other caller.

## Status update — 2026-10-21

Superseded in part by grill-decisions amendment #5: the Lock Screen shipped in v1.5.0 at the maintainer's explicit request, built exactly as this ADR prescribed — a separate deep module (`engine/lock.ts` + `LockStore` + overlay runtime) with its own interface, consuming storage like any other caller; `BlurEngine` purity untouched. The v1 exclusion above remains the correct record for v1.
