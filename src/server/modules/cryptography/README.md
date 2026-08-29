# Cryptography module

Server-only cryptographic primitives for versioned AES-256-GCM envelopes,
independent HMAC domains, high-entropy tokens/reference IDs, Argon2id password
verifiers, startup key validation, and the maintenance-only key-rotation port.

This module has no client entry point. Ordinary reads may decrypt retained key
versions but must never perform lazy re-encryption. The Phase 13 maintenance
implementation processes bounded, resumable batches under a separate database
credential and is not imported by an HTTP route.
