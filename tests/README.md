# CAMPUS-SAFE — Tests

This directory contains integration and end-to-end tests.

## Backend Tests

Backend unit/integration tests are located in `backend/tests/`.

```bash
cd backend
python -m pytest tests/ -v
```

## Frontend Tests

Frontend tests will be added in future phases.

## Test Philosophy

- Test actual behavior, not mocks.
- Don't fabricate passing tests.
- If a test requires external services (Supabase), document it clearly.
- Report actual test results honestly.
